'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  МИР (gameleha.xyz/world) — онлайн-игра, полностью отдельная от TikTok-игр.
//  • свои аккаунты (ник + пароль, без почты) и своя БД (таблицы world_*)
//  • сервер сам считает движение, удары, урон, опыт (клиент только шлёт ввод)
//  • один общий мир: 7 районов в линию, площадь в центре
//  Подключается из server.js тремя строками: attach(app), init(), handleConnection().
// ═══════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');
const url    = require('url');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

// ── геометрия мира (те же числа, что у клиента) ──
const ZONE_W = 1800, N_ZONES = 7, WORLD_W = ZONE_W * N_ZONES, HUB = 3;
const GROUND_MIN = 500, GROUND_MAX = 700;
const ZONE_TYPES = ['danger', 'consent', 'safe', 'hub', 'safe', 'consent', 'danger'];
const clamp  = (v, a, b) => Math.max(a, Math.min(b, v));
const zoneAt = x => clamp(Math.floor(x / ZONE_W), 0, N_ZONES - 1);

// ── бойцы: стартовые характеристики (шкала 1-10) и длительность ударов (кадры/fps) ──
const FIGHTERS = {
  brute_arms:   { name: 'Качок',           stats: { str: 8, hp: 8, spd: 4 }, anim: { jab: [7, 14], punch: [5, 16], kick: [8, 16] } },
  bancho:       { name: 'Хулиган',         stats: { str: 7, hp: 6, spd: 5 }, anim: { jab: [9, 18], punch: [7, 18], kick: [8, 18] } },
  batting_girl: { name: 'Девушка с битой', stats: { str: 9, hp: 4, spd: 5 }, anim: { jab: [5, 18], punch: [8, 18], kick: [11, 20] } },
  brawler_girl: { name: 'Уличная боец',    stats: { str: 5, hp: 5, spd: 7 }, anim: { jab: [3, 16], punch: [3, 16], kick: [5, 16] } },
};
const FIGHTER_KEYS = Object.keys(FIGHTERS);
// боты — только панки (для выбора игроками не доступны)
const BOT_TYPES = { enemy_punk: { name: 'Панк', stats: { str: 6, hp: 5, spd: 4 }, anim: { punch: [3, 16] } } };
const infoOf = type => FIGHTERS[type] || BOT_TYPES[type];
const VARIANTS = 3;   // цветов на бойца

// ── правила боя (черновые числа — крутятся здесь) ──
const ATK = { jab: { mult: 0.7, range: 125 }, punch: { mult: 1.0, range: 135 }, kick: { mult: 1.3, range: 145 } };
const POINTS_PER_LEVEL = 3, LEVEL_CAP = 100;
const xpNeed   = lvl => Math.round(300 * Math.pow(lvl, 1.7));   // опыта до след. уровня: с 1-го 300, с 5-го ~4600, с 10-го ~15000, с 50-го ~232000
const maxHpOf  = e => e.kind === 'b' ? 40 + e.level * 8 : 70 + e.stats.hp * 10;
// скорость растёт с убывающей отдачей и упирается в потолок (~340 пикс/с при базовых ~240) — на высоких уровнях не «летают»
const speedOf  = e => 230 + 110 * (1 - Math.exp(-e.stats.spd / 35));
const baseDmg  = e => 6 + e.stats.str * 1.2;
const ZONE_XP_MULT = { safe: 1, consent: 1.6, danger: 2.5 };   // опыт за урон по ботам
const REGEN_HUB = 15, REGEN_FIELD = 3, COMBAT_COOLDOWN = 6;   // хп/сек, секунд «в бою»
const RESPAWN_MS = 2000, BOT_RESPAWN_MS = 8000;
const BOTS_BY_TYPE = { safe: 3, consent: 6, danger: 10 };   // чем глубже, тем больше ботов (сила у всех одинаковая)
const PUNK_LEVEL = 5;                                       // уровень панка (один на всех)
const DUEL_INVITE_SEC = 10, DUEL_MAX_SEC = 300;
const TICK_MS = 50, VIEW_RANGE = 1500;

// ═════════════════════════ ХРАНИЛИЩЕ ═════════════════════════
// Postgres (боевой) или JSON-файл (локальная разработка без DATABASE_URL).
class PgStore {
  constructor(pool) { this.pool = pool; }
  async init() {
    const q = s => this.pool.query(s);
    await q(`CREATE TABLE IF NOT EXISTS world_accounts (
      id SERIAL PRIMARY KEY, nick TEXT NOT NULL, nick_lower TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL, nick_changed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS world_chars (
      account_id INTEGER PRIMARY KEY REFERENCES world_accounts(id) ON DELETE CASCADE,
      type TEXT NOT NULL, variant INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1, xp INTEGER NOT NULL DEFAULT 0, points INTEGER NOT NULL DEFAULT 0,
      str INTEGER NOT NULL, hp INTEGER NOT NULL, spd INTEGER NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS world_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  }
  async getMeta(k) { const r = await this.pool.query('SELECT value FROM world_meta WHERE key=$1', [k]); return r.rows[0] ? r.rows[0].value : null; }
  async setMeta(k, v) { await this.pool.query('INSERT INTO world_meta(key,value) VALUES($1,$2) ON CONFLICT (key) DO NOTHING', [k, v]); }
  async findByNick(lower) { const r = await this.pool.query('SELECT id,nick,pass_hash FROM world_accounts WHERE nick_lower=$1', [lower]); return r.rows[0] || null; }
  async findById(id) { const r = await this.pool.query('SELECT id,nick FROM world_accounts WHERE id=$1', [id]); return r.rows[0] || null; }
  async createAccount(nick, lower, hash) {
    try {
      const r = await this.pool.query('INSERT INTO world_accounts(nick,nick_lower,pass_hash) VALUES($1,$2,$3) RETURNING id', [nick, lower, hash]);
      return r.rows[0].id;
    } catch (e) { if (e.code === '23505') throw new Error('taken'); throw e; }
  }
  async getChar(id) { const r = await this.pool.query('SELECT type,variant,level,xp,points,str,hp,spd FROM world_chars WHERE account_id=$1', [id]); return r.rows[0] || null; }
  async insertChar(id, c) {
    await this.pool.query('INSERT INTO world_chars(account_id,type,variant,level,xp,points,str,hp,spd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',
      [id, c.type, c.variant, c.level, c.xp, c.points, c.str, c.hp, c.spd]);
  }
  async saveChar(id, c) {
    await this.pool.query('UPDATE world_chars SET level=$2,xp=$3,points=$4,str=$5,hp=$6,spd=$7,updated_at=now() WHERE account_id=$1',
      [id, c.level, c.xp, c.points, c.str, c.hp, c.spd]);
  }
}
class FileStore {
  constructor(file) { this.file = file; this.d = { nextId: 1, accounts: [], chars: {}, meta: {} }; this.timer = null; }
  async init() { try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {} }
  _save() { if (this.timer) return; this.timer = setTimeout(() => { this.timer = null; try { fs.writeFileSync(this.file, JSON.stringify(this.d)); } catch (_) {} }, 300); }
  async getMeta(k) { return this.d.meta[k] || null; }
  async setMeta(k, v) { if (!this.d.meta[k]) { this.d.meta[k] = v; this._save(); } }
  async findByNick(lower) { return this.d.accounts.find(a => a.nick_lower === lower) || null; }
  async findById(id) { return this.d.accounts.find(a => a.id === id) || null; }
  async createAccount(nick, lower, hash) {
    if (this.d.accounts.some(a => a.nick_lower === lower)) throw new Error('taken');
    const id = this.d.nextId++; this.d.accounts.push({ id, nick, nick_lower: lower, pass_hash: hash }); this._save(); return id;
  }
  async getChar(id) { return this.d.chars[id] || null; }
  async insertChar(id, c) { if (!this.d.chars[id]) { this.d.chars[id] = { ...c }; this._save(); } }
  async saveChar(id, c) { if (this.d.chars[id]) { Object.assign(this.d.chars[id], c); this._save(); } }
}

let store = null, secret = null, ready = false;

// ═════════════════════════ АККАУНТЫ ═════════════════════════
const NICK_RE = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_]{3,16}$/;
const RESERVED = ['admin', 'administrator', 'moderator', 'support', 'system', 'bot', 'gm', 'админ', 'модератор', 'поддержка', 'бот'];
const TOKEN_TTL_MS = 90 * 24 * 3600 * 1000;   // «долгая сессия» — 90 дней

async function hashPass(pw) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(pw, salt, 32);
  return salt.toString('hex') + ':' + h.toString('hex');
}
async function checkPass(pw, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const h = await scrypt(pw, Buffer.from(saltHex, 'hex'), 32);
  const want = Buffer.from(hashHex, 'hex');
  return h.length === want.length && crypto.timingSafeEqual(h, want);
}
function signToken(accountId) {
  const payload = accountId + '.' + (Date.now() + TOKEN_TTL_MS);
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const payload = parts[0] + '.' + parts[1];
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  if (+parts[1] < Date.now()) return null;
  return +parts[0] || null;
}
function validateNick(nick) {
  if (typeof nick !== 'string' || !NICK_RE.test(nick)) return ['nick_bad', 'Ник: 3–16 символов, только буквы, цифры и _'];
  if (RESERVED.includes(nick.toLowerCase())) return ['nick_reserved', 'Этот ник зарезервирован'];
  return null;
}

// простая защита от перебора паролей: не больше N запросов с одного IP в минуту
const rate = new Map();
function rateLimited(ip, limit) {
  const now = Date.now();
  const arr = (rate.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now); rate.set(ip, arr);
  return arr.length > limit;
}
setInterval(() => { const now = Date.now(); for (const [ip, a] of rate) if (!a.some(t => now - t < 60000)) rate.delete(ip); }, 120000).unref();
const ipOf = req => String((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '')).split(',')[0].trim();

function attach(app) {
  const express = require('express');
  const json = express.json({ limit: '4kb' });
  const guard = (req, res, next) => ready ? next() : res.status(503).json({ code: 'unavailable', error: 'Мир временно недоступен, попробуй через минуту' });
  const auth = async (req, res, next) => {
    const id = verifyToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!id) return res.status(401).json({ code: 'need_login', error: 'Нужно войти заново' });
    const acc = await store.findById(id);
    if (!acc) return res.status(401).json({ code: 'need_login', error: 'Нужно войти заново' });
    req.acc = acc; next();
  };
  const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error('[WORLD] api error:', e.message); res.status(500).json({ code: 'server_error', error: 'Ошибка сервера' }); });

  app.get('/world-api/config', (req, res) => {
    res.json({ variants: VARIANTS, fighters: FIGHTER_KEYS.map(k => ({ type: k, name: FIGHTERS[k].name, stats: FIGHTERS[k].stats })) });
  });
  app.post('/world-api/register', json, guard, wrap(async (req, res) => {
    if (rateLimited(ipOf(req), 15)) return res.status(429).json({ code: 'too_many', error: 'Слишком много попыток, подожди минуту' });
    const { nick, pass } = req.body || {};
    const bad = validateNick(nick);
    if (bad) return res.status(400).json({ code: bad[0], error: bad[1] });
    if (typeof pass !== 'string' || pass.length < 6 || pass.length > 64) return res.status(400).json({ code: 'pass_bad', error: 'Пароль: от 6 до 64 символов' });
    let id;
    try { id = await store.createAccount(nick, nick.toLowerCase(), await hashPass(pass)); }
    catch (e) { if (e.message === 'taken') return res.status(409).json({ code: 'nick_taken', error: 'Этот ник уже занят' }); throw e; }
    res.json({ token: signToken(id), nick, hasChar: false });
  }));
  app.post('/world-api/login', json, guard, wrap(async (req, res) => {
    if (rateLimited(ipOf(req), 30)) return res.status(429).json({ code: 'too_many', error: 'Слишком много попыток, подожди минуту' });
    const { nick, pass } = req.body || {};
    const acc = (typeof nick === 'string' && typeof pass === 'string') ? await store.findByNick(nick.toLowerCase()) : null;
    if (!acc || !(await checkPass(pass, acc.pass_hash))) return res.status(401).json({ code: 'bad_creds', error: 'Неверный ник или пароль' });
    res.json({ token: signToken(acc.id), nick: acc.nick, hasChar: !!(await store.getChar(acc.id)) });
  }));
  app.get('/world-api/me', guard, auth, wrap(async (req, res) => {
    const c = await store.getChar(req.acc.id);
    res.json({ nick: req.acc.nick, char: c ? { type: c.type, variant: c.variant, level: c.level } : null });
  }));
  app.post('/world-api/create', json, guard, auth, wrap(async (req, res) => {
    const { type, variant } = req.body || {};
    if (!FIGHTERS[type] || !Number.isInteger(variant) || variant < 0 || variant >= VARIANTS) return res.status(400).json({ code: 'bad_fighter', error: 'Неверный выбор бойца' });
    if (await store.getChar(req.acc.id)) return res.status(409).json({ code: 'char_exists', error: 'Персонаж уже создан' });
    const s = FIGHTERS[type].stats;
    await store.insertChar(req.acc.id, { type, variant, level: 1, xp: 0, points: 0, str: s.str, hp: s.hp, spd: s.spd });
    res.json({ ok: true });
  }));
}

// ═════════════════════════ СИМУЛЯЦИЯ ═════════════════════════
let nextId = 1;
const ents = new Map();          // id → сущность (игрок или бот)
const byAccount = new Map();     // accountId → игрок
const botRespawns = [];          // { zone, at }
const evs = [];                  // события тика (цифры урона)
const rnd = (a, b) => a + Math.random() * (b - a);

const STATE = { idle: 0, walk: 1, jab: 2, punch: 3, kick: 4, hurt: 5, ko: 6, block: 7 };

function makeEntity(kind, name, type, variant, x, y) {
  return { id: nextId++, kind, name, type, variant, x, y, f: 1,
    inx: 0, iny: 0, run: 1, blk: false, moving: false,
    level: 1, xp: 0, points: 0, stats: { ...infoOf(type).stats }, hp: 0,
    atk: null, rest: 0, hurtT: 0, stagImm: 0, koT: 0, combatT: 999,
    duel: 0, hintCd: 0,
    // игрок:
    ws: null, accountId: 0, known: new Set(), dirty: false, msgs: 0, msgWindow: 0, killedRecently: new Map(),
    // бот:
    zone: 0, target: 0, wait: 0, tx: x, ty: y, cd: 0 };
}
function send(p, obj) { if (p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(obj)); } catch (_) {} } }
function toast(p, k, color, a) { send(p, { t: 'toast', k, a: a || [], color }); }

function spawnBot(zone) {
  const type = 'enemy_punk';
  const b = makeEntity('b', BOT_TYPES[type].name, type, Math.floor(Math.random() * VARIANTS),
    zone * ZONE_W + rnd(250, ZONE_W - 250), rnd(GROUND_MIN, GROUND_MAX));
  b.zone = zone; b.level = PUNK_LEVEL;      // одинаковые характеристики везде
  b.hp = maxHpOf(b); b.run = 0.75; b.wait = rnd(0, 3);
  ents.set(b.id, b);
}
function spawnAllBots() {
  for (let z = 0; z < N_ZONES; z++) for (let i = 0; i < (BOTS_BY_TYPE[ZONE_TYPES[z]] || 0); i++) spawnBot(z);
}
// опыт за урон по боту: чем выше игрок над уровнем панка, тем меньше отдача (не фармят одних панков вечно)
function botXp(att, dmg, zone) {
  const decay = clamp(1 - (att.level - PUNK_LEVEL) * 0.05, 0.25, 1);
  return Math.max(1, Math.round(dmg * ZONE_XP_MULT[ZONE_TYPES[zone]] * decay));
}

function loadPlayer(accountId, nick, ch, ws) {
  const p = makeEntity('p', nick, ch.type, ch.variant, HUB * ZONE_W + ZONE_W / 2 + rnd(-300, 300), rnd(GROUND_MIN + 40, GROUND_MAX - 40));
  p.accountId = accountId; p.ws = ws;
  p.level = ch.level; p.xp = ch.xp; p.points = ch.points;
  p.stats = { str: ch.str, hp: ch.hp, spd: ch.spd };
  p.hp = maxHpOf(p);
  ents.set(p.id, p); byAccount.set(accountId, p);
  return p;
}
async function savePlayer(p) {
  if (!store || !p.accountId) return;
  p.dirty = false;
  const int = v => Math.max(0, Math.floor(Number(v)) || 0);
  try { await store.saveChar(p.accountId, { level: int(p.level), xp: int(p.xp), points: int(p.points), str: int(p.stats.str), hp: int(p.stats.hp), spd: int(p.stats.spd) }); }
  catch (e) { console.error('[WORLD] save error:', e.message); p.dirty = true; }
}

// ── бой ──
function startAttack(e, kind) {
  if (e.atk || e.blk || e.koT > 0 || e.hurtT > 0 || e.rest > 0) return false;
  const [n, fps] = infoOf(e.type).anim[kind];
  e.atk = { kind, t: 0, dur: n / fps, hit: false };
  return true;
}
function canDamage(att, tgt) {
  if (att === tgt || tgt.koT > 0 || att.koT > 0) return false;
  if (att.kind === 'b' && tgt.kind === 'b') return false;
  if (att.kind === 'b' || tgt.kind === 'b') return true;
  const z = zoneAt(tgt.x);
  if (zoneAt(att.x) !== z) return false;
  const zt = ZONE_TYPES[z];
  if (zt === 'danger') return true;
  if (zt === 'consent') return att.duel === tgt.id && tgt.duel === att.id;
  return false;
}
function gainXp(p, n) {
  if (p.level >= LEVEL_CAP) return;
  p.xp = Math.floor(p.xp + n); p.dirty = true;
  let leveled = false;
  while (p.level < LEVEL_CAP && p.xp >= xpNeed(p.level)) {
    p.xp -= xpNeed(p.level); p.level++; p.points += POINTS_PER_LEVEL; leveled = true;
    // небольшой автоматический рост в сильной стороне бойца — каждый второй уровень
    if (p.level % 2 === 0) {
      const base = FIGHTERS[p.type].stats;
      const top = Object.keys(base).sort((a, b) => base[b] - base[a])[0];
      p.stats[top]++;
    }
    p.hp = maxHpOf(p);
  }
  if (leveled) { send(p, { t: 'lvl', level: p.level, points: POINTS_PER_LEVEL }); savePlayer(p); }
}
function resolveAttack(att) {
  const cfg = ATK[att.atk.kind];
  let hitAny = false, ruleBlocked = null;
  for (const t of ents.values()) {
    if (t === att) continue;
    const ddx = (t.x - att.x) * att.f;
    if (ddx <= 0 || ddx > cfg.range || Math.abs(t.y - att.y) > 45 || t.koT > 0) continue;
    if (!canDamage(att, t)) { if (att.kind === 'p' && t.kind === 'p') ruleBlocked = t; continue; }
    hitAny = true;
    let dmg = baseDmg(att) * cfg.mult * (0.9 + Math.random() * 0.2) * (att.kind === 'b' ? 0.6 : 1);
    const blocked = t.blk && t.f === -att.f;
    if (blocked) dmg *= 0.2;
    else if (t.stagImm <= 0) { t.hurtT = 0.35; t.stagImm = 0.9; t.atk = null; }
    dmg = Math.max(1, Math.round(dmg));
    t.hp -= dmg; t.combatT = 0; att.combatT = 0;
    evs.push([t.id, dmg, blocked ? 1 : 0]);
    if (t.kind === 'b') { t.target = att.id; t.f = -att.f; }
    if (att.kind === 'p' && t.kind === 'b') gainXp(att, botXp(att, dmg, t.zone));
    if (t.hp <= 0) killEntity(t, att);
  }
  if (!hitAny && ruleBlocked && att.hintCd <= 0) {
    att.hintCd = 3;
    toast(att, ZONE_TYPES[zoneAt(att.x)] === 'consent' ? 'consent_only' : 'no_fight', '#ffc933');
  }
}
function killEntity(t, killer) {
  t.hp = 0; t.koT = t.kind === 'b' ? 1.5 : RESPAWN_MS / 1000; t.atk = null; t.blk = false; t.inx = t.iny = 0;
  if (t.kind === 'p') {
    toast(t, 'ko_respawn', '#ff8a8a'); send(t, { t: 'ko' });
    endDuel(t, null);
    // награда за победу над игроком (не чаще раза в 10 минут за одного и того же)
    if (killer && killer.kind === 'p') {
      const last = killer.killedRecently.get(t.accountId) || 0;
      if (Date.now() - last > 600000) { killer.killedRecently.set(t.accountId, Date.now()); gainXp(killer, 20 + t.level * 10); toast(killer, 'win_over', '#7dff9a', [t.name]); }
    }
  }
}

// ── дуэли ──
const invites = new Map();   // targetId → { from, until }
function endDuel(p, reason) {
  if (!p.duel) return;
  const o = ents.get(p.duel);
  p.duel = 0;
  if (o) { o.duel = 0; send(o, { t: 'duel_end' }); if (reason) toast(o, reason, '#ffc933'); }
  send(p, { t: 'duel_end' }); if (reason) toast(p, reason, '#ffc933');
}
function handleDuelRequest(p, toId) {
  const t = ents.get(toId);
  if (!t || t.kind !== 'p' || t === p) return;
  const z = zoneAt(p.x);
  if (ZONE_TYPES[z] !== 'consent') return toast(p, 'duel_only_consent', '#ffc933');
  if (zoneAt(t.x) !== z) return toast(p, 'other_zone', '#ffc933');
  if (p.duel || t.duel) return toast(p, 'already_dueling', '#ffc933');
  if (p.koT > 0 || t.koT > 0) return;
  if (invites.has(t.id) && invites.get(t.id).until > Date.now()) return toast(p, 'already_invited', '#ffc933');
  invites.set(t.id, { from: p.id, until: Date.now() + DUEL_INVITE_SEC * 1000 });
  send(t, { t: 'duel_inv', from: p.id, name: p.name, sec: DUEL_INVITE_SEC });
  toast(p, 'invite_sent', '#ffc933', [t.name]);
}
function handleDuelAnswer(p, fromId, ok) {
  const inv = invites.get(p.id);
  if (!inv || inv.from !== fromId || inv.until < Date.now()) return;
  invites.delete(p.id);
  const a = ents.get(fromId);
  if (!a) return;
  if (!ok) return toast(a, 'declined', '#ffc933', [p.name]);
  if (ZONE_TYPES[zoneAt(p.x)] !== 'consent' || zoneAt(a.x) !== zoneAt(p.x) || a.duel || p.duel || a.koT > 0 || p.koT > 0) return;
  a.duel = p.id; p.duel = a.id; a.duelStart = p.duelStart = Date.now();
  send(a, { t: 'duel_start', with: p.id, name: p.name }); send(p, { t: 'duel_start', with: a.id, name: a.name });
}

// ── боты ──
function botAI(b, dt) {
  if (b.koT > 0) { b.inx = b.iny = 0; return; }
  let tgt = b.target ? ents.get(b.target) : null;
  if (tgt && (tgt.koT > 0 || zoneAt(tgt.x) !== b.zone || Math.abs(tgt.x - b.x) > 700)) { tgt = null; b.target = 0; }
  if (!tgt) {
    let best = 1e9;
    for (const p of ents.values()) {
      if (p.kind !== 'p' || p.koT > 0 || zoneAt(p.x) !== b.zone) continue;
      const dx = Math.abs(p.x - b.x), dy = Math.abs(p.y - b.y);
      if (dx < 260 && dy < 140 && dx < best) { best = dx; tgt = p; }
    }
    if (tgt) b.target = tgt.id;
  }
  if (tgt) {
    const dx = tgt.x - b.x, dy = tgt.y - b.y;
    if (!b.atk) b.f = dx >= 0 ? 1 : -1;
    if (Math.abs(dx) > 95 || Math.abs(dy) > 28) { const d = Math.hypot(dx, dy) || 1; b.inx = dx / d; b.iny = dy / d; }
    else {
      b.inx = b.iny = 0;
      if (b.cd <= 0 && startAttack(b, 'punch')) b.cd = rnd(1.4, 2.3);
    }
    return;
  }
  if (b.wait > 0) { b.wait -= dt; b.inx = b.iny = 0; return; }
  const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy);
  if (d < 8) {
    b.wait = rnd(0.8, 3);
    b.tx = clamp(b.x + rnd(-500, 500), b.zone * ZONE_W + 150, (b.zone + 1) * ZONE_W - 150);
    b.ty = rnd(GROUND_MIN, GROUND_MAX);
    b.inx = b.iny = 0;
  } else { b.inx = dx / d; b.iny = dy / d; }
}

// ── тик ──
let lastTick = Date.now(), lastSave = Date.now();
function tick() {
  const now = Date.now(), dt = Math.min(0.1, (now - lastTick) / 1000); lastTick = now;
  evs.length = 0;

  for (const e of ents.values()) {
    if (e.kind === 'b') botAI(e, dt);
    if (e.cd > 0) e.cd -= dt;
    if (e.rest > 0) e.rest -= dt;
    if (e.hurtT > 0) e.hurtT -= dt;
    if (e.stagImm > 0) e.stagImm -= dt;
    if (e.hintCd > 0) e.hintCd -= dt;
    e.combatT += dt;

    // движение
    let dx = e.inx, dy = e.iny; const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const locked = e.koT > 0 || e.hurtT > 0;
    const slow = locked ? 0 : e.atk ? 0.15 : e.blk ? 0.35 : 1;
    const sp = speedOf(e) * clamp(e.run, 0.5, 1.6) * slow;
    const minX = 60, maxX = WORLD_W - 60;
    e.x = clamp(e.x + dx * sp * dt, minX, maxX);
    e.y = clamp(e.y + dy * sp * 0.6 * dt, GROUND_MIN, GROUND_MAX);
    e.moving = !locked && (Math.abs(dx) + Math.abs(dy)) > 0.05;
    if (dx !== 0 && !locked && !e.atk) e.f = dx > 0 ? 1 : -1;

    // удар
    if (e.atk) {
      e.atk.t += dt;
      if (!e.atk.hit && e.atk.t >= e.atk.dur * 0.45) { e.atk.hit = true; resolveAttack(e); }
      if (e.atk && e.atk.t >= e.atk.dur) { e.atk = null; e.rest = 0.08; }
    }
    // восстановление здоровья вне боя (на площади быстрее)
    if (e.koT <= 0 && e.combatT > COMBAT_COOLDOWN) {
      const max = maxHpOf(e);
      if (e.hp < max) e.hp = Math.min(max, e.hp + (e.kind === 'b' ? 8 : ZONE_TYPES[zoneAt(e.x)] === 'hub' ? REGEN_HUB : REGEN_FIELD) * dt);
    }
    // нокаут → возрождение
    if (e.koT > 0) {
      e.koT -= dt;
      if (e.koT <= 0) {
        if (e.kind === 'p') {
          e.x = HUB * ZONE_W + ZONE_W / 2 + rnd(-300, 300); e.y = rnd(GROUND_MIN + 40, GROUND_MAX - 40);
          e.hp = maxHpOf(e); e.combatT = 999; e.hurtT = 0; e.atk = null;
        } else { ents.delete(e.id); botRespawns.push({ zone: e.zone, at: now + BOT_RESPAWN_MS }); }
      }
    }
    // выход из района/затянувшаяся дуэль
    if (e.duel) {
      const o = ents.get(e.duel);
      if (!o || zoneAt(o.x) !== zoneAt(e.x) || ZONE_TYPES[zoneAt(e.x)] !== 'consent') endDuel(e, 'duel_interrupted');
      else if (now - e.duelStart > DUEL_MAX_SEC * 1000) endDuel(e, 'duel_timeout');
    }
  }
  for (let i = botRespawns.length - 1; i >= 0; i--) if (botRespawns[i].at <= now) { spawnBot(botRespawns[i].zone); botRespawns.splice(i, 1); }
  for (const [k, v] of invites) if (v.until < now) invites.delete(k);

  broadcast();

  if (now - lastSave > 10000) { lastSave = now; for (const p of byAccount.values()) if (p.dirty) savePlayer(p); }
}

function stateCode(e) {
  if (e.koT > 0) return STATE.ko;
  if (e.hurtT > 0) return STATE.hurt;
  if (e.atk) return STATE[e.atk.kind];
  if (e.blk) return STATE.block;
  return e.moving ? STATE.walk : STATE.idle;
}
function broadcast() {
  const list = [...ents.values()];
  const rows = new Map();
  for (const e of list) rows.set(e.id, [e.id, Math.round(e.x), Math.round(e.y), e.f, stateCode(e), Math.ceil(e.hp), maxHpOf(e), e.level, e.combatT < COMBAT_COOLDOWN ? 1 : 0]);
  for (const p of byAccount.values()) {
    if (!p.ws || p.ws.readyState !== 1) continue;
    const vis = new Set(), a = [], add = [];
    for (const e of list) {
      if (Math.abs(e.x - p.x) > VIEW_RANGE) continue;
      vis.add(e.id); a.push(rows.get(e.id));
      if (!p.known.has(e.id)) { p.known.add(e.id); add.push({ id: e.id, n: e.name, ty: e.type, v: e.variant, k: e.kind }); }
    }
    const rm = [];
    for (const id of p.known) if (!vis.has(id)) { rm.push(id); p.known.delete(id); }
    if (add.length) send(p, { t: 'add', e: add });
    const ev = evs.filter(v => vis.has(v[0]));
    send(p, { t: 's', a, rm, ev, me: { sp: Math.round(speedOf(p)), xp: p.xp, need: xpNeed(p.level), pt: p.points, st: p.stats, duel: p.duel } });
  }
}

// ═════════════════════════ ПОДКЛЮЧЕНИЯ ═════════════════════════
async function handleConnection(ws, req) {
  if (!ready) { ws.close(4003, 'not ready'); return; }
  const token = url.parse(req.url, true).query.token;
  const accId = verifyToken(token);
  const acc = accId ? await store.findById(accId) : null;
  if (!acc) { ws.send(JSON.stringify({ t: 'auth_fail' })); ws.close(4001, 'auth'); return; }

  // если аккаунт уже в игре (закрытая вкладка ещё не отвалилась) — сначала дожидаемся сохранения его прогресса,
  // и только потом читаем персонажа из базы, иначе можно получить устаревший уровень и затереть свежий
  const old = byAccount.get(acc.id);
  if (old) {
    send(old, { t: 'kicked' });
    endDuel(old, null); ents.delete(old.id); byAccount.delete(old.accountId);
    await savePlayer(old);
    try { old.ws.close(4004, 'kicked'); } catch (_) {}
  }
  const ch = await store.getChar(acc.id);
  if (!ch) { ws.send(JSON.stringify({ t: 'no_char' })); ws.close(4002, 'no char'); return; }

  const p = loadPlayer(acc.id, acc.nick, ch, ws);
  console.log(`[WORLD] +${acc.nick} (онлайн: ${byAccount.size})`);
  send(p, { t: 'hello', id: p.id, zones: ZONE_TYPES, zoneW: ZONE_W, ground: [GROUND_MIN, GROUND_MAX], world: WORLD_W, x: p.x, y: p.y });

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => { try { onMessage(p, JSON.parse(raw)); } catch (_) {} });
  ws.on('close', () => { if (byAccount.get(acc.id) === p) { removePlayer(p, false); console.log(`[WORLD] -${acc.nick} (онлайн: ${byAccount.size})`); } });
  ws.on('error', () => {});
}
function removePlayer(p, keepSocket) {
  endDuel(p, null);
  ents.delete(p.id); if (byAccount.get(p.accountId) === p) byAccount.delete(p.accountId);
  savePlayer(p);
}
function onMessage(p, m) {
  const now = Date.now();
  if (now - p.msgWindow > 1000) { p.msgWindow = now; p.msgs = 0; }
  if (++p.msgs > 60) return;               // защита от флуда
  if (p.koT > 0 && m.t !== 'in') return;
  switch (m.t) {
    case 'in': {
      const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
      p.inx = clamp(num(m.dx), -1, 1); p.iny = clamp(num(m.dy), -1, 1);
      p.run = clamp(num(m.run) || 1, 1, 1.6);
      const wantBlock = !!m.blk && !p.atk && p.hurtT <= 0 && p.koT <= 0;
      p.blk = wantBlock;
      if (p.koT > 0) { p.inx = p.iny = 0; }
      break;
    }
    case 'atk': if (m.k === 'jab' || m.k === 'kick') startAttack(p, m.k); break;
    case 'spend':
      if (p.points > 0 && (m.stat === 'str' || m.stat === 'hp' || m.stat === 'spd')) {
        p.points--; p.stats[m.stat]++; p.dirty = true;
        if (m.stat === 'hp') p.hp += 10;
      }
      break;
    case 'inspect': {
      const t = ents.get(m.id);
      if (t && Math.abs(t.x - p.x) < 900) send(p, { t: 'card', id: t.id, name: t.name, kind: t.kind, ty: t.type, level: t.level, hp: Math.ceil(t.hp), max: maxHpOf(t), st: t.stats });
      break;
    }
    case 'duel': handleDuelRequest(p, m.to); break;
    case 'duel_ans': handleDuelAnswer(p, m.from, !!m.ok); break;
  }
}

async function init() {
  try {
    if (process.env.DATABASE_URL) {
      const { Pool } = require('pg');
      const isInternal = process.env.DATABASE_URL.includes('.railway.internal');
      store = new PgStore(new Pool({ connectionString: process.env.DATABASE_URL, ssl: isInternal ? false : { rejectUnauthorized: false }, max: 5 }));
    } else {
      store = new FileStore(path.join(__dirname, '.world_dev.json'));
      console.warn('[WORLD] DATABASE_URL не задан — аккаунты хранятся в server/.world_dev.json (только для разработки)');
    }
    await store.init();
    // секрет для подписи токенов: один раз создаётся и хранится в БД (сессии переживают перезапуски)
    await store.setMeta('secret', process.env.WORLD_SECRET || crypto.randomBytes(32).toString('hex'));
    secret = (await store.getMeta('secret'));
    if (process.env.WORLD_NO_BOTS !== '1') spawnAllBots();   // WORLD_NO_BOTS=1 — только для отладки PvP
    setInterval(tick, TICK_MS);
    setInterval(() => {
      for (const p of byAccount.values()) {
        if (p.ws.isAlive === false) { try { p.ws.terminate(); } catch (_) {} continue; }
        p.ws.isAlive = false; try { p.ws.ping(); } catch (_) {}
      }
    }, 30000).unref();
    const flushAll = async sig => { console.log('[WORLD] ' + sig + ': сохраняю ' + byAccount.size + ' игроков'); await Promise.allSettled([...byAccount.values()].map(savePlayer)); process.exit(0); };
    process.once('SIGTERM', () => flushAll('SIGTERM'));
    process.once('SIGINT', () => flushAll('SIGINT'));
    ready = true;
    console.log('[WORLD] готов: ' + ents.size + ' ботов, район-площадь №' + HUB);
  } catch (e) {
    console.error('[WORLD] не запустился:', e.message);
  }
}

module.exports = { attach, init, handleConnection };
