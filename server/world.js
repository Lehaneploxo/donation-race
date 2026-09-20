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
const GROUND_MIN = 450, GROUND_MAX = 700;   // верхний предел ходьбы поднят с 500 до 450 (почти до стены)
const ZONE_TYPES = ['wild2', 'wild', 'safe', 'hub', 'safe', 'wild', 'wild2'];   // wild — ближний дикий, wild2 — самый дальний (жёстче)
const clamp  = (v, a, b) => Math.max(a, Math.min(b, v));
const zoneAt = x => clamp(Math.floor(x / ZONE_W), 0, N_ZONES - 1);

// ── КЛУБ 21: вход на улице (зона 6, по центру), внутри — отдельная комната на один экран (1280x720). ──
// Внутри драться нельзя, ботов нет, игроки видят только тех, кто внутри. Координаты — локальные (не карта мира).
const CLUB_DOOR_X = 6 * ZONE_W + ZONE_W / 2;
const CLUB_COMBAT_LOCK = 3;        // секунд после последнего удара ПО ИГРОКУ/ОТ ИГРОКА, когда войти в клуб нельзя (боты не мешают)
const CLUB = {
  x0: 34, x1: 1246, y0: 246, y1: 705, spawn: { x: 676, y: 668 }, exit: { x0: 590, x1: 772, y: 672 },
  stoolX: [126, 284, 482, 632, 814, 995], stoolY: 262,
  tables: [{ x: 1098, y: 330 }, { x: 908, y: 431 }, { x: 1122, y: 494 }, { x: 1019, y: 616 }],
};
// границы комнаты, столики и барные стулья — твёрдые (клиент считает так же, чтобы движение совпадало)
function clubConstrain(e) {
  e.x = clamp(e.x, CLUB.x0, CLUB.x1); e.y = clamp(e.y, CLUB.y0, CLUB.y1);
  for (const tb of CLUB.tables) { const dx = e.x - tb.x, dy = (e.y - tb.y) * 1.6, d = Math.hypot(dx, dy); if (d < 70) { e.x = tb.x + dx / (d || 1) * 70; e.y = tb.y + dy / (d || 1) * 70 / 1.6; } }
  for (const sx of CLUB.stoolX) { const dx = e.x - sx, dy = (e.y - CLUB.stoolY) * 2.2, d = Math.hypot(dx, dy); if (d < 34) { e.x = sx + dx / (d || 1) * 34; e.y = CLUB.stoolY + dy / (d || 1) * 34 / 2.2; } }
}

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
// super — «Суперсила» (бывший пинок): ровно ×2 от «Удара» (jab), заряжается SUPER_COOLDOWN_MS, ничего не отнимает
const ATK = { jab: { mult: 0.7, range: 125 }, punch: { mult: 1.0, range: 135 }, kick: { mult: 1.3, range: 145 }, super: { mult: 1.4, range: 145 } };
const SUPER_COOLDOWN_MS = 60000;
const POINTS_PER_LEVEL = 3, LEVEL_CAP = 100;
// Дебаг-режим баланса: только этому нику разрешено вручную выставлять себе статы
// (см. case 'debug_stat' в onMessage) — для теста кривой скорости/урона на живом сервере.
const DEBUG_OWNER_NICK = 'leha_neploxo';
const xpNeed   = lvl => Math.round(300 * Math.pow(lvl, 1.7));   // опыта до след. уровня: с 1-го 300, с 5-го ~4600, с 10-го ~15000, с 50-го ~232000
const maxHpOf  = e => e.kind === 'b' ? 40 + e.level * 8 : 70 + e.stats.hp * 10;
// скорость растёт с убывающей отдачей и упирается в потолок (~340 пикс/с при базовых ~240) — на высоких уровнях не «летают»
const speedOf  = e => 230 + 110 * (1 - Math.exp(-e.stats.spd / 35));
const baseDmg  = e => 6 + e.stats.str * 1.2;
const ZONE_XP_MULT = { safe: 1, wild: 1.6, wild2: 2.5 };   // опыт за урон по ботам
const REGEN_HUB = 15, REGEN_FIELD = 3, COMBAT_COOLDOWN = 6;   // хп/сек, секунд «в бою»
const RESPAWN_MS = 2000, BOT_RESPAWN_MS = 8000;
const DEATH_MONEY_PENALTY = 10;   // $ теряет игрок за свою смерть (ниже нуля не уходит)
const BOTS_BY_TYPE = { safe: 3, wild: 6, wild2: 10 };   // чем глубже, тем больше ботов (сила у всех одинаковая)
const PUNK_LEVEL = 5;                                       // уровень панка (один на всех)
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
    await q(`ALTER TABLE world_chars ADD COLUMN IF NOT EXISTS money INTEGER NOT NULL DEFAULT 0`);
    await q(`CREATE TABLE IF NOT EXISTS world_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    await this.initClans();
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
  async getChar(id) { const r = await this.pool.query('SELECT type,variant,level,xp,points,str,hp,spd,money FROM world_chars WHERE account_id=$1', [id]); return r.rows[0] || null; }
  async insertChar(id, c) {
    await this.pool.query('INSERT INTO world_chars(account_id,type,variant,level,xp,points,str,hp,spd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING',
      [id, c.type, c.variant, c.level, c.xp, c.points, c.str, c.hp, c.spd]);
  }
  async setFighter(id, type, variant) { await this.pool.query('UPDATE world_chars SET type=$2, variant=$3 WHERE account_id=$1', [id, type, variant]); }
  async saveChar(id, c) {
    await this.pool.query('UPDATE world_chars SET level=$2,xp=$3,points=$4,str=$5,hp=$6,spd=$7,money=$8,updated_at=now() WHERE account_id=$1',
      [id, c.level, c.xp, c.points, c.str, c.hp, c.spd, c.money | 0]);
  }
}
class FileStore {
  constructor(file) { this.file = file; this.d = { nextId: 1, accounts: [], chars: {}, meta: {} }; this.timer = null; }
  async init() { try { this.d = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (_) {} await this.initClans(); }
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
  async setFighter(id, type, variant) { if (this.d.chars[id]) { this.d.chars[id].type = type; this.d.chars[id].variant = variant; this._save(); } }
}

// ── кланы: хранилище (Postgres и локальный файл) ──
// world_clans: клан (название/тег уникальны без учёта регистра, leader_id — текущий лидер)
// world_clan_members: один аккаунт — максимум один клан
// world_clan_invites: приглашения ХРАНЯТСЯ без срока (можно принять хоть через неделю)
Object.assign(PgStore.prototype, {
  async initClans() {
    const q = s => this.pool.query(s);
    await q(`CREATE TABLE IF NOT EXISTS world_clans (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL UNIQUE,
      tag TEXT NOT NULL, tag_lower TEXT NOT NULL UNIQUE, leader_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS world_clan_members (
      account_id INTEGER PRIMARY KEY REFERENCES world_accounts(id) ON DELETE CASCADE,
      clan_id INTEGER NOT NULL REFERENCES world_clans(id) ON DELETE CASCADE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    await q(`CREATE TABLE IF NOT EXISTS world_clan_invites (
      id SERIAL PRIMARY KEY, clan_id INTEGER NOT NULL REFERENCES world_clans(id) ON DELETE CASCADE,
      to_id INTEGER NOT NULL REFERENCES world_accounts(id) ON DELETE CASCADE, from_id INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (clan_id, to_id))`);
  },
  async createClan(name, tag, leaderId) {
    let id;
    try {
      const r = await this.pool.query('INSERT INTO world_clans(name,name_lower,tag,tag_lower,leader_id) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [name, name.toLowerCase(), tag, tag.toLowerCase(), leaderId]);
      id = r.rows[0].id;
    } catch (e) {
      if (e.code === '23505') throw new Error(/tag/.test(e.constraint || e.detail || '') ? 'tag_taken' : 'name_taken');
      throw e;
    }
    await this.pool.query('INSERT INTO world_clan_members(account_id,clan_id) VALUES($1,$2)', [leaderId, id]);
    return id;
  },
  async getClanOf(accId) {
    const r = await this.pool.query('SELECT c.id, c.name, c.tag, c.leader_id FROM world_clan_members m JOIN world_clans c ON c.id = m.clan_id WHERE m.account_id = $1', [accId]);
    return r.rows[0] || null;
  },
  async getClanMembers(clanId) {
    const r = await this.pool.query(`SELECT m.account_id, a.nick, COALESCE(ch.level, 1) AS level, m.joined_at
      FROM world_clan_members m JOIN world_accounts a ON a.id = m.account_id LEFT JOIN world_chars ch ON ch.account_id = m.account_id
      WHERE m.clan_id = $1 ORDER BY m.joined_at ASC, m.account_id ASC`, [clanId]);
    return r.rows;
  },
  async joinClan(clanId, accId) {
    await this.pool.query('INSERT INTO world_clan_members(account_id,clan_id) VALUES($1,$2) ON CONFLICT (account_id) DO UPDATE SET clan_id = EXCLUDED.clan_id, joined_at = now()', [accId, clanId]);
  },
  // выйти из клана: если он опустел — клан удаляется; если ушёл лидер — лидером становится самый старый участник
  async leaveClan(accId) {
    const cur = await this.getClanOf(accId);
    if (!cur) return null;
    await this.pool.query('DELETE FROM world_clan_members WHERE account_id = $1', [accId]);
    const rest = await this.getClanMembers(cur.id);
    const res = { clanId: cur.id, deleted: false, newLeader: 0 };
    if (!rest.length) { await this.pool.query('DELETE FROM world_clans WHERE id = $1', [cur.id]); res.deleted = true; }
    else if (cur.leader_id === accId) { res.newLeader = rest[0].account_id; await this.pool.query('UPDATE world_clans SET leader_id = $2 WHERE id = $1', [cur.id, res.newLeader]); }
    return res;
  },
  async createInvite(clanId, toId, fromId) {
    const r = await this.pool.query('INSERT INTO world_clan_invites(clan_id,to_id,from_id) VALUES($1,$2,$3) ON CONFLICT (clan_id,to_id) DO UPDATE SET from_id = EXCLUDED.from_id RETURNING id', [clanId, toId, fromId]);
    return r.rows[0].id;
  },
  async getInvites(toId) {
    const r = await this.pool.query(`SELECT i.id, c.id AS clan_id, c.name, c.tag, a.nick AS from_nick
      FROM world_clan_invites i JOIN world_clans c ON c.id = i.clan_id LEFT JOIN world_accounts a ON a.id = i.from_id
      WHERE i.to_id = $1 ORDER BY i.created_at DESC LIMIT 50`, [toId]);
    return r.rows;
  },
  async getInvite(id) { const r = await this.pool.query('SELECT id, clan_id, to_id, from_id FROM world_clan_invites WHERE id = $1', [id]); return r.rows[0] || null; },
  async deleteInvite(id) { await this.pool.query('DELETE FROM world_clan_invites WHERE id = $1', [id]); },
});

Object.assign(FileStore.prototype, {
  async initClans() {
    const d = this.d;
    d.clans = d.clans || []; d.members = d.members || {}; d.invites = d.invites || [];
    d.nextClanId = d.nextClanId || 1; d.nextInviteId = d.nextInviteId || 1;
  },
  async createClan(name, tag, leaderId) {
    const d = this.d;
    if (d.clans.some(c => c.name_lower === name.toLowerCase())) throw new Error('name_taken');
    if (d.clans.some(c => c.tag_lower === tag.toLowerCase())) throw new Error('tag_taken');
    const id = d.nextClanId++;
    d.clans.push({ id, name, name_lower: name.toLowerCase(), tag, tag_lower: tag.toLowerCase(), leader_id: leaderId });
    d.members[leaderId] = { clan_id: id, joined_at: Date.now() };
    this._save(); return id;
  },
  async getClanOf(accId) {
    const m = this.d.members[accId]; if (!m) return null;
    const c = this.d.clans.find(x => x.id === m.clan_id);
    return c ? { id: c.id, name: c.name, tag: c.tag, leader_id: c.leader_id } : null;
  },
  async getClanMembers(clanId) {
    return Object.entries(this.d.members).filter(([, m]) => m.clan_id === clanId)
      .sort((a, b) => a[1].joined_at - b[1].joined_at || +a[0] - +b[0])
      .map(([acc, m]) => { const a = this.d.accounts.find(x => x.id === +acc); const ch = this.d.chars[acc];
        return { account_id: +acc, nick: a ? a.nick : '?', level: ch ? ch.level : 1, joined_at: m.joined_at }; });
  },
  async joinClan(clanId, accId) { this.d.members[accId] = { clan_id: clanId, joined_at: Date.now() }; this._save(); },
  async leaveClan(accId) {
    const cur = await this.getClanOf(accId); if (!cur) return null;
    delete this.d.members[accId];
    const rest = await this.getClanMembers(cur.id);
    const res = { clanId: cur.id, deleted: false, newLeader: 0 };
    if (!rest.length) { this.d.clans = this.d.clans.filter(c => c.id !== cur.id); this.d.invites = this.d.invites.filter(i => i.clan_id !== cur.id); res.deleted = true; }
    else if (cur.leader_id === accId) { const c = this.d.clans.find(x => x.id === cur.id); c.leader_id = rest[0].account_id; res.newLeader = c.leader_id; }
    this._save(); return res;
  },
  async createInvite(clanId, toId, fromId) {
    let inv = this.d.invites.find(i => i.clan_id === clanId && i.to_id === toId);
    if (inv) inv.from_id = fromId; else { inv = { id: this.d.nextInviteId++, clan_id: clanId, to_id: toId, from_id: fromId, created_at: Date.now() }; this.d.invites.push(inv); }
    this._save(); return inv.id;
  },
  async getInvites(toId) {
    return this.d.invites.filter(i => i.to_id === toId).sort((a, b) => b.created_at - a.created_at).slice(0, 50).map(i => {
      const c = this.d.clans.find(x => x.id === i.clan_id), a = this.d.accounts.find(x => x.id === i.from_id);
      return { id: i.id, clan_id: i.clan_id, name: c ? c.name : '?', tag: c ? c.tag : '?', from_nick: a ? a.nick : '' };
    });
  },
  async getInvite(id) { return this.d.invites.find(i => i.id === id) || null; },
  async deleteInvite(id) { this.d.invites = this.d.invites.filter(i => i.id !== id); this._save(); },
});

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
const evs = [];
const superReady = new Map();      // accountId → когда суперсила снова готова (живёт в памяти, перезаход заряд не сбрасывает)                  // события тика (цифры урона)
const rnd = (a, b) => a + Math.random() * (b - a);

const STATE = { idle: 0, walk: 1, jab: 2, punch: 3, kick: 4, hurt: 5, ko: 6, block: 7 };

function makeEntity(kind, name, type, variant, x, y) {
  return { id: nextId++, kind, name, type, variant, x, y, f: 1,
    inx: 0, iny: 0, run: 1, blk: false, moving: false,
    level: 1, xp: 0, points: 0, stats: { ...infoOf(type).stats }, hp: 0,
    atk: null, rest: 0, hurtT: 0, stagImm: 0, koT: 0, combatT: 999,
    room: '', pvpT: 999, hintCd: 0, clanId: 0, clanTag: '', clanLeader: false, knownClans: new Set(),
    // игрок:
    ws: null, accountId: 0, known: new Set(), dirty: false, msgs: 0, msgWindow: 0, killedRecently: new Map(), money: 0,
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
  p.level = ch.level; p.xp = ch.xp; p.points = ch.points; p.money = ch.money | 0;
  p.stats = { str: ch.str, hp: ch.hp, spd: ch.spd };
  p.hp = maxHpOf(p);
  ents.set(p.id, p); byAccount.set(accountId, p);
  return p;
}
async function savePlayer(p) {
  if (!store || !p.accountId) return;
  p.dirty = false;
  const int = v => Math.max(0, Math.floor(Number(v)) || 0);
  try { await store.saveChar(p.accountId, { level: int(p.level), xp: int(p.xp), points: int(p.points), str: int(p.stats.str), hp: int(p.stats.hp), spd: int(p.stats.spd), money: int(p.money) }); }
  catch (e) { console.error('[WORLD] save error:', e.message); p.dirty = true; }
}

// ── бой ──
function startAttack(e, kind) {
  if (e.atk || e.blk || e.koT > 0 || e.hurtT > 0 || e.rest > 0) return false;
  if (kind === 'super') {
    const now = Date.now(), ready = superReady.get(e.accountId) || 0;
    if (now < ready) { if (e.hintCd <= 0) { e.hintCd = 1.5; toast(e, 'super_wait', '#ffc933', [Math.ceil((ready - now) / 1000)]); } return false; }
    superReady.set(e.accountId, now + SUPER_COOLDOWN_MS);
  }
  const [n, fps] = infoOf(e.type).anim[kind === 'super' ? 'kick' : kind];
  e.atk = { kind, t: 0, dur: n / fps, hit: false };
  return true;
}
function canDamage(att, tgt) {
  if (att === tgt || tgt.koT > 0 || att.koT > 0) return false;
  if (att.room !== tgt.room || att.room) return false;   // внутри клуба драться нельзя, через комнаты не бьют
  if (att.kind === 'b' && tgt.kind === 'b') return false;
  if (att.kind === 'b' || tgt.kind === 'b') return true;
  const z = zoneAt(tgt.x);
  if (zoneAt(att.x) !== z) return false;
  const zt = ZONE_TYPES[z];
  if (att.clanId && att.clanId === tgt.clanId) return false;   // соклановцы друг друга не бьют
  return zt === 'wild' || zt === 'wild2';
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
    if (t === att || t.room !== att.room) continue;
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
    if (att.kind === 'p' && t.kind === 'p') { att.pvpT = 0; t.pvpT = 0; }   // драка с игроком (боты в клуб не мешают войти)
    evs.push([t.id, dmg, blocked ? 1 : 0]);
    if (t.kind === 'b') { t.target = att.id; t.f = -att.f; }
    if (att.kind === 'p' && t.kind === 'b') gainXp(att, botXp(att, dmg, t.zone));
    if (t.hp <= 0) killEntity(t, att);
  }
  if (!hitAny && ruleBlocked && att.hintCd <= 0) {
    att.hintCd = 3;
    toast(att, (ruleBlocked.clanId && ruleBlocked.clanId === att.clanId) ? 'clanmate' : 'no_fight', '#ffc933');
  }
}
function killEntity(t, killer) {
  t.hp = 0; t.koT = t.kind === 'b' ? 1.5 : RESPAWN_MS / 1000; t.atk = null; t.blk = false; t.inx = t.iny = 0;
  // ДЕНЬГИ: нокаут (бот или игрок) — тому, кто нанёс последний удар, столько $, каков уровень нокаутированного. Без ограничений.
  // За свою смерть игрок теряет $10 (ниже нуля не уходит).
  if (killer && killer.kind === 'p' && killer !== t) {
    const gain = Math.max(1, Math.floor(t.level)); killer.money += gain; killer.dirty = true;
    send(killer, { t: 'money', d: gain, id: t.id });
  }
  if (t.kind === 'p') {
    const lost = Math.min(DEATH_MONEY_PENALTY, t.money);
    if (lost > 0) { t.money -= lost; t.dirty = true; send(t, { t: 'money', d: -lost, id: t.id }); }
  }
  if (t.kind === 'p') {
    toast(t, 'ko_respawn', '#ff8a8a'); send(t, { t: 'ko' });
    // награда за победу над игроком (не чаще раза в 10 минут за одного и того же)
    if (killer && killer.kind === 'p') {
      const last = killer.killedRecently.get(t.accountId) || 0;
      if (Date.now() - last > 600000) { killer.killedRecently.set(t.accountId, Date.now()); gainXp(killer, 20 + t.level * 10); toast(killer, 'win_over', '#7dff9a', [t.name]); }
    }
  }
}

// ── кланы ──
// Клан постоянный (в БД). Соклановцы друг друга не бьют (см. canDamage). Создать клан может любой игрок.
// Приглашает только лидер; приглашения хранятся в БД без срока. Выход — в любой момент, без ограничений.
// Лидер вышел → лидером становится самый старый участник; вышел последний → клан удаляется.
const CLAN_NAME_RE = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_]+( [A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9_]+)*$/;
const CLAN_TAG_RE = /^[A-Za-zА-Яа-яЁёІіЇїЄєҐґ0-9]{2,4}$/;
const clanTags = new Map();   // clanId → тег (рассылается клиентам, чтобы рисовать [ТЕГ] над ником)
const clanErr = e => console.error('[WORLD] clan error:', e.message);

// перечитывает клан игрока из БД (роль лидера/тег) и отправляет ему актуальное состояние: клан, участники, приглашения
async function sendClanInfo(p) {
  const c = await store.getClanOf(p.accountId);
  p.clanId = c ? c.id : 0; p.clanTag = c ? c.tag : ''; p.clanLeader = !!(c && c.leader_id === p.accountId);
  if (c) clanTags.set(c.id, c.tag);
  let clan = null;
  if (c) {
    const ms = await store.getClanMembers(c.id);
    clan = { id: c.id, name: c.name, tag: c.tag, leader: p.clanLeader,
      members: ms.map(m => ({ acc: m.account_id, nick: m.nick, lvl: m.level, on: byAccount.has(m.account_id), lead: m.account_id === c.leader_id })) };
  }
  const inv = await store.getInvites(p.accountId);
  send(p, { t: 'clan', clan, invites: inv.map(i => ({ id: i.id, name: i.name, tag: i.tag, from: i.from_nick || '' })) });
}
function refreshClanMembers(clanId) {
  for (const q of byAccount.values()) if (q.clanId === clanId) sendClanInfo(q).catch(clanErr);
}
async function clanCreate(p, name, tag) {
  if (p.clanId) return toast(p, 'clan_in_clan', '#ffc933');
  name = String(name || '').trim().replace(/\s+/g, ' '); tag = String(tag || '').trim();
  if (name.length < 3 || name.length > 20 || !CLAN_NAME_RE.test(name) || RESERVED.includes(name.toLowerCase())) return send(p, { t: 'clan_err', code: 'clan_name_bad' });
  if (!CLAN_TAG_RE.test(tag) || RESERVED.includes(tag.toLowerCase())) return send(p, { t: 'clan_err', code: 'clan_tag_bad' });
  tag = tag.toUpperCase();
  try { await store.createClan(name, tag, p.accountId); }
  catch (e) { if (e.message === 'name_taken' || e.message === 'tag_taken') return send(p, { t: 'clan_err', code: 'clan_' + e.message }); throw e; }
  await sendClanInfo(p);
  toast(p, 'clan_created', '#7dff9a', [tag]);
  send(p, { t: 'clan_ok' });
}
async function clanInvite(p, toId) {
  if (!p.clanId || !p.clanLeader) return toast(p, 'clan_not_leader', '#ffc933');
  const t = ents.get(toId);
  if (!t || t.kind !== 'p' || t === p || t.room !== p.room || Math.abs(t.x - p.x) > 900) return;
  if (t.clanId === p.clanId) return toast(p, 'clan_already_member', '#ffc933', [t.name]);
  await store.createInvite(p.clanId, t.accountId, p.accountId);
  toast(p, 'clan_invite_sent', '#ffc933', [t.name]);
  toast(t, 'clan_invited', '#7dc8ff', [p.clanTag, p.name]);
  sendClanInfo(t).catch(clanErr);           // у приглашённого появляется пометка о приглашении
}
async function clanAccept(p, invId) {
  if (!Number.isInteger(invId)) return;
  const inv = await store.getInvite(invId);
  if (!inv || inv.to_id !== p.accountId) return;
  if (p.clanId === inv.clan_id) { await store.deleteInvite(invId); return sendClanInfo(p); }
  const left = await store.leaveClan(p.accountId);       // если был в другом клане — выходим оттуда (без ограничений)
  await store.joinClan(inv.clan_id, p.accountId);
  await store.deleteInvite(invId);
  await sendClanInfo(p);
  toast(p, 'clan_joined', '#7dff9a', [p.clanTag]);
  refreshClanMembers(inv.clan_id);
  if (left && !left.deleted) refreshClanMembers(left.clanId);
}
async function clanDecline(p, invId) {
  if (!Number.isInteger(invId)) return;
  const inv = await store.getInvite(invId);
  if (inv && inv.to_id === p.accountId) await store.deleteInvite(invId);
  await sendClanInfo(p);
}
async function clanLeave(p) {
  const left = await store.leaveClan(p.accountId);
  await sendClanInfo(p);
  if (left) toast(p, 'clan_left', '#ffc933');
  if (left && !left.deleted) refreshClanMembers(left.clanId);
}
async function clanKick(p, acc) {
  if (!p.clanId || !p.clanLeader || !Number.isInteger(acc) || acc === p.accountId) return;
  const mate = await store.getClanOf(acc);
  if (!mate || mate.id !== p.clanId) return;
  await store.leaveClan(acc);
  const q = byAccount.get(acc);
  if (q) { toast(q, 'clan_kicked', '#ff8a8a', [p.clanTag]); sendClanInfo(q).catch(clanErr); }
  refreshClanMembers(p.clanId);
}

// ── боты ──
function botAI(b, dt) {
  if (b.koT > 0) { b.inx = b.iny = 0; return; }
  let tgt = b.target ? ents.get(b.target) : null;
  if (tgt && (tgt.koT > 0 || tgt.room || zoneAt(tgt.x) !== b.zone || Math.abs(tgt.x - b.x) > 700)) { tgt = null; b.target = 0; }
  if (!tgt) {
    let best = 1e9;
    for (const p of ents.values()) {
      if (p.kind !== 'p' || p.koT > 0 || p.room || zoneAt(p.x) !== b.zone) continue;
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
    e.combatT += dt; e.pvpT += dt;

    // движение
    let dx = e.inx, dy = e.iny; const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    const locked = e.koT > 0 || e.hurtT > 0;
    const slow = locked ? 0 : e.atk ? 0.15 : e.blk ? 0.35 : 1;
    const sp = speedOf(e) * clamp(e.run, 0.5, 1.6) * slow;
    const minX = 60, maxX = WORLD_W - 60;
    if (e.room === 'club') { e.x += dx * sp * dt; e.y += dy * sp * 0.6 * dt; clubConstrain(e); }
    else { e.x = clamp(e.x + dx * sp * dt, minX, maxX); e.y = clamp(e.y + dy * sp * 0.6 * dt, GROUND_MIN, GROUND_MAX); }
    // автовход в клуб: упёрся в дверь снизу (идёшь вверх у самой стены по центру двери) — заходишь сам; клавиша E и кнопка тоже работают
    if (e.kind === 'p' && !e.room && e.koT <= 0 && e.iny < -0.3 && Math.abs(e.x - CLUB_DOOR_X) < 75 && e.y <= GROUND_MIN + 14) enterClub(e);   // только если идёшь вверх В дверь (не пробегаешь вдоль стены)
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
      if (e.hp < max) e.hp = Math.min(max, e.hp + (e.kind === 'b' ? 8 : (e.room || ZONE_TYPES[zoneAt(e.x)] === 'hub') ? REGEN_HUB : REGEN_FIELD) * dt);
    }
    // нокаут → возрождение
    if (e.koT > 0) {
      e.koT -= dt;
      if (e.koT <= 0) {
        if (e.kind === 'p') {
          e.room = ''; e.x = HUB * ZONE_W + ZONE_W / 2 + rnd(-300, 300); e.y = rnd(GROUND_MIN + 40, GROUND_MAX - 40);
          e.hp = maxHpOf(e); e.combatT = 999; e.hurtT = 0; e.atk = null;
        } else { ents.delete(e.id); botRespawns.push({ zone: e.zone, at: now + BOT_RESPAWN_MS }); }
      }
    }
  }
  for (let i = botRespawns.length - 1; i >= 0; i--) if (botRespawns[i].at <= now) { spawnBot(botRespawns[i].zone); botRespawns.splice(i, 1); }

  broadcast();

  if (now - lastSave > 10000) { lastSave = now; for (const p of byAccount.values()) if (p.dirty) savePlayer(p); }
}

function stateCode(e) {
  if (e.koT > 0) return STATE.ko;
  if (e.hurtT > 0) return STATE.hurt;
  if (e.atk) return STATE[e.atk.kind === 'super' ? 'kick' : e.atk.kind];
  if (e.blk) return STATE.block;
  return e.moving ? STATE.walk : STATE.idle;
}
let mmTick = 0;
function broadcast() {
  const list = [...ents.values()];
  // мини-карта: раз в 0.5 с каждому игроку шлём положение всех остальных ИГРОКОВ (боты не показываются): [x, 1 если соклановец]
  const sendMm = (++mmTick % 10) === 0, allPlayers = sendMm ? [...byAccount.values()] : null;
  const rows = new Map();
  for (const e of list) rows.set(e.id, [e.id, Math.round(e.x), Math.round(e.y), e.f, stateCode(e), Math.ceil(e.hp), maxHpOf(e), e.level, e.combatT < COMBAT_COOLDOWN ? 1 : 0, e.clanId || 0]);
  for (const p of byAccount.values()) {
    if (!p.ws || p.ws.readyState !== 1) continue;
    const vis = new Set(), a = [], add = [];
    for (const e of list) {
      if (e.room !== p.room || (!p.room && Math.abs(e.x - p.x) > VIEW_RANGE)) continue;   // видим только свою комнату
      vis.add(e.id); a.push(rows.get(e.id));
      if (!p.known.has(e.id)) { p.known.add(e.id); add.push({ id: e.id, n: e.name, ty: e.type, v: e.variant, k: e.kind }); }
    }
    if (sendMm) send(p, { t: 'mm', p: allPlayers.filter(q => q !== p).map(q => [Math.round(q.room ? CLUB_DOOR_X : q.x), (p.clanId && q.clanId === p.clanId) ? 1 : 0]) });
    const newClans = {};
    for (const r of a) { const cid = r[9]; if (cid && !p.knownClans.has(cid)) { p.knownClans.add(cid); newClans[cid] = clanTags.get(cid) || ''; } }
    if (Object.keys(newClans).length) send(p, { t: 'clans', m: newClans });
    const rm = [];
    for (const id of p.known) if (!vis.has(id)) { rm.push(id); p.known.delete(id); }
    if (add.length) send(p, { t: 'add', e: add });
    const ev = evs.filter(v => vis.has(v[0]));
    send(p, { t: 's', a, rm, ev, me: { mo: p.money, rm: p.room, su: Math.max(0, Math.ceil(((superReady.get(p.accountId) || 0) - Date.now()) / 1000)), sp: Math.round(speedOf(p)), xp: p.xp, need: xpNeed(p.level), pt: p.points, st: p.stats } });
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
    ents.delete(old.id); byAccount.delete(old.accountId);
    await savePlayer(old);
    try { old.ws.close(4004, 'kicked'); } catch (_) {}
  }
  const ch = await store.getChar(acc.id);
  // защита: если у аккаунта боец, которого больше нет в игре (например, убранный боксёр) — выдаём Хулигана, чтобы аккаунт заходил
  if (ch && !FIGHTERS[ch.type]) { console.log('[WORLD] боец «' + ch.type + '» убран из игры — аккаунт ' + acc.nick + ' получает Хулигана'); ch.type = 'bancho'; ch.variant = 0; await store.setFighter(acc.id, ch.type, ch.variant); }
  if (!ch) { ws.send(JSON.stringify({ t: 'no_char' })); ws.close(4002, 'no char'); return; }

  const p = loadPlayer(acc.id, acc.nick, ch, ws);
  console.log(`[WORLD] +${acc.nick} (онлайн: ${byAccount.size})`);
  send(p, { t: 'hello', id: p.id, zones: ZONE_TYPES, zoneW: ZONE_W, ground: [GROUND_MIN, GROUND_MAX], world: WORLD_W, x: p.x, y: p.y, club: CLUB, doorX: CLUB_DOOR_X });
  sendClanInfo(p).catch(clanErr);     // клан и приглашения игрока

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => { try { onMessage(p, JSON.parse(raw)); } catch (_) {} });
  ws.on('close', () => { if (byAccount.get(acc.id) === p) { removePlayer(p, false); console.log(`[WORLD] -${acc.nick} (онлайн: ${byAccount.size})`); } });
  ws.on('error', () => {});
}
function removePlayer(p, keepSocket) {
  ents.delete(p.id); if (byAccount.get(p.accountId) === p) byAccount.delete(p.accountId);
  savePlayer(p);
}
function onMessage(p, m) {
  const now = Date.now();
  if (now - p.msgWindow > 1000) { p.msgWindow = now; p.msgs = 0; }
  if (++p.msgs > 60) return;               // защита от флуда
  if (p.koT > 0 && m.t !== 'in' && !String(m.t).startsWith('clan_')) return;
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
    case 'atk': if (m.k === 'jab') startAttack(p, 'jab'); else if (m.k === 'super' || m.k === 'kick') startAttack(p, 'super'); break;
    case 'spend':
      if (p.points > 0 && (m.stat === 'str' || m.stat === 'hp' || m.stat === 'spd')) {
        p.points--; p.stats[m.stat]++; p.dirty = true;
        if (m.stat === 'hp') p.hp += 10;
      }
      break;
    case 'debug_stat': {
      if ((p.name || '').toLowerCase() !== DEBUG_OWNER_NICK) break;
      if ((m.stat === 'str' || m.stat === 'hp' || m.stat === 'spd') && Number.isFinite(m.delta)) {
        p.stats[m.stat] = clamp(p.stats[m.stat] + Math.round(m.delta), 1, 999);
        if (m.stat === 'hp') p.hp = maxHpOf(p);   // сразу видно эффект на здоровье
        p.dirty = true;
      }
      break;
    }
    case 'inspect': {
      const t = ents.get(m.id);
      if (t && t.room === p.room && Math.abs(t.x - p.x) < 900) send(p, { t: 'card', id: t.id, name: t.name, kind: t.kind, ty: t.type, level: t.level, hp: Math.ceil(t.hp), max: maxHpOf(t), st: t.stats, tag: t.clanTag || '', ally: !!(p.clanId && p.clanId === t.clanId), canInvite: !!(p.clanLeader && t.kind === 'p' && t.clanId !== p.clanId), inClan: !!p.clanId });
      break;
    }
    case 'enter': if (m.b === 'club') enterClub(p); break;
    case 'leave': leaveClub(p); break;
    case 'clan_info': sendClanInfo(p).catch(clanErr); break;
    case 'clan_create': clanCreate(p, m.name, m.tag).catch(clanErr); break;
    case 'clan_invite': clanInvite(p, m.to).catch(clanErr); break;
    case 'clan_accept': clanAccept(p, m.id).catch(clanErr); break;
    case 'clan_decline': clanDecline(p, m.id).catch(clanErr); break;
    case 'clan_leave': clanLeave(p).catch(clanErr); break;
    case 'clan_kick': clanKick(p, m.acc).catch(clanErr); break;
  }
}

function enterClub(p) {
  if (p.room || p.koT > 0) return;
  if (Math.abs(p.x - CLUB_DOOR_X) > 140 || p.y > 570) return;          // только вплотную к двери
  if (p.pvpT < CLUB_COMBAT_LOCK) { if (p.hintCd <= 0) { p.hintCd = 2; toast(p, 'no_enter_combat', '#ffc933'); } return; }   // из боя в клуб не убежать (первые секунды после удара)
  p.room = 'club'; p.x = CLUB.spawn.x; p.y = CLUB.spawn.y; p.inx = p.iny = 0; p.atk = null; p.blk = false; p.hurtT = 0;
}
function leaveClub(p) {
  if (p.room !== 'club' || p.koT > 0) return;
  if (p.y < CLUB.exit.y || p.x < CLUB.exit.x0 || p.x > CLUB.exit.x1) return;   // только у выхода внизу
  p.room = ''; p.x = CLUB_DOOR_X; p.y = 520; p.inx = p.iny = 0;
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
