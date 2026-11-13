const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const url       = require('url');

const { connectToTikTok } = require('./tiktokConnector');
const db                  = require('./db');
// 30.09.2026: онлайн-мир (./world.js, /world, /world-api, /world-ws) выключен — на корне домена
// теперь GTA-шка. Код мира и его таблицы в БД оставлены как есть, вернуть можно из git-истории.

const PORT     = process.env.PORT || 3000;
const DEFAULT_USERNAME = (process.argv[2] || process.env.TIKTOK_USERNAME || 'demo')
  .replace(/^@/, '').trim();

console.log(`\n[Server] Никнейм: @${DEFAULT_USERNAME}`);

// ─── Express ─────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.disable('etag');

// No-cache headers for all HTML pages (both /arena2 style and /arena2.html style)
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 13.10.2026: картинки/звук/видео кэшируются на сутки. Раньше no-store стоял на всём, и браузер
// (и OBS) заново качал спрайты для каждого нового бойца — ~3 ГБ трафика в день на Railway.
// HTML/JS по-прежнему без кэша, чтобы правки игр появлялись сразу.
app.use(express.static(path.join(__dirname, '../client'), {
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
    }
  }
}));

const NO_CACHE = { etag: false, lastModified: false };
const DEPLOY_VER = Date.now();

function serveHtml(file) {
  return (req, res) => {
    if (!req.query._v) {
      const sep = req.url.includes('?') ? '&' : '?';
      return res.redirect(302, req.url + sep + '_v=' + DEPLOY_VER);
    }
    res.sendFile(path.join(__dirname, '../client', file), NO_CACHE);
  };
}

// 21.09.2026: перенос хостинга — Мир теперь главная игра на корне домена, список ТикТок-игр
// переехал на /games (сама страница та же launcher.html, просто другой адрес). Адреса ОТДЕЛЬНЫХ
// ТикТок-игр (/boxing, /streetfighter и т.д. ниже) НЕ трогаем — они вбиты в сценах OBS на стриме.
// 30.09.2026: на корне домена — GTA-шка LEHA NEPLOXO WORLD (репо neon-bay). Её файлы берём
// с GitHub Pages и отдаём под /gta/, так что обновления игры выходят обычным пушем в neon-bay,
// здесь ничего менять не надо. <base href="/gta/"> в начале страницы направляет её относительные
// адреса (js/…, img/…, version.txt) в /gta/ и не даёт им пересечься с файлами ТикТок-игр.
const GTA_ORIGIN   = 'https://lehaneploxo.github.io/neon-bay/';
const GTA_CACHE_MS = 60 * 1000;
const gtaCache     = new Map();   // файл → { t, status, type, body }

async function gtaFile(file) {
  const hit = gtaCache.get(file);
  if (hit && Date.now() - hit.t < GTA_CACHE_MS) return hit;
  const r = await fetch(GTA_ORIGIN + file);
  const entry = {
    t:      Date.now(),
    status: r.status,
    type:   r.headers.get('content-type') || 'application/octet-stream',
    body:   Buffer.from(await r.arrayBuffer()),
  };
  if (r.ok) gtaCache.set(file, entry);
  return entry;
}

app.get('/', async (req, res) => {
  try {
    const f = await gtaFile('index.html');
    if (f.status !== 200) return res.status(502).send('Игра временно недоступна');
    res.type('html').send('<base href="/gta/">\n' + f.body.toString('utf8'));
  } catch (e) {
    console.error('[GTA]', e.message);
    res.status(502).send('Игра временно недоступна');
  }
});

app.get('/gta/*', async (req, res) => {
  const file = req.params[0];
  if (!file || file.includes('..')) return res.status(404).end();
  try {
    const f = await gtaFile(file);
    if (f.status !== 200) return res.status(f.status === 404 ? 404 : 502).end();
    // Скрипты с ?v= меняют адрес на каждом выпуске — их кэшируем надолго, остальное на сутки.
    // version.txt не кэшируем никогда: по нему страница узнаёт о новой версии.
    if (file !== 'version.txt') {
      res.setHeader('Cache-Control', req.query.v ? 'public, max-age=31536000, immutable' : 'public, max-age=86400');
      res.removeHeader('Pragma');
      res.removeHeader('Expires');
    }
    res.type(f.type).send(f.body);
  } catch (e) {
    console.error('[GTA]', e.message);
    res.status(502).end();
  }
});

app.get('/world', (req, res) => res.redirect(302, '/'));
app.get('/games',        serveHtml('launcher.html'));
app.get('/game',        serveHtml('index.html'));
app.get('/arena',       serveHtml('arena.html'));
app.get('/arena2',      serveHtml('arena2.html'));
app.get('/boxing',      serveHtml('boxing_arena.html'));
app.get('/boxing-db',   serveHtml('boxing_db.html'));
app.get('/streetfighter',    serveHtml('streetfighter_arena.html'));
app.get('/streetfighter-db', serveHtml('streetfighter_db.html'));
app.get('/streetfighter2',   serveHtml('streetfighter_arena2.html'));
app.get('/fantasyarena',     serveHtml('fantasy_arena.html'));
app.get('/fantasyarena-db',  serveHtml('fantasy_arena_db.html'));
// NEPLOXO STREET WARS (06.10.2026) — логика Street Fighters 1 в 3D-городе из GTA-шки,
// своя база (таблицы streetwars_*). Город — копия файлов игры в client/streetwars/nb/
app.get('/streetwars',    serveHtml('streetwars/streetwars.html'));
app.get('/streetwars-db', serveHtml('streetwars/streetwars_db.html'));
// 12.10.2026: NEPLOXO KART — гонка на картах, без базы данных (вся логика в client/kart.html)
app.get('/kart',          serveHtml('kart.html'));
// 25.10.2026: НОВОГОДНИЙ ПЕРЕПОЛОХ — сезонная игра ноябрь–январь (снежная битва эльфов у ёлки),
// своя база (таблицы newyear_*), логика в client/newyear.html
app.get('/newyear',       serveHtml('newyear.html'));
app.get('/newyear-db',    serveHtml('newyear_db.html'));
// 06.10.2026: Boxing Arena EN, Рыбалка, Fantasy Arena TV, Взаимки и Цивилизация убраны
// с сайта — файлы лежат в archive/ (вне client/, поэтому не раздаются), базы EN/Рыбалки/TV стёрты

// Локальный no-op сервис подписи — возвращает URL без изменений
// Библиотека tiktok-live-connector использует его вместо eulerstream
app.get('/webcast/sign_url', (req, res) => {
  const originalUrl = req.query.url || '';
  res.json({
    signedUrl: originalUrl,
    msToken: '',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
    _signature: '',
    'X-Bogus': ''
  });
});

app.get('/status', (req, res) => {
  const roomList = [];
  rooms.forEach((room, key) => {
    roomList.push({
      username: key,
      clients: room.clients.size,
      mode: room.connection?._tiktokMode || 'unknown',
      lastError: room.connection?._lastError || null,
      gifts: room._giftCount,
      lastGift: room._lastGift,
    });
  });
  res.json({ ok: true, rooms: roomList });
});

// Активность эфиров для автопилота телефонов (Desktop/пульт-телефонов): реальные
// лайки/подарки/заходы/чат по каждому аккаунту за 5/10/20/60 минут, без ников
app.get('/activity', (req, res) => {
  const out = {};
  rooms.forEach((room, key) => {
    out[key] = { mode: room.connection?._tiktokMode || 'unknown', clients: room.clients.size, ...room.activity() };
  });
  res.json({ ok: true, t: new Date().toISOString(), rooms: out });
});

// Статистика эфиров (13.11.2026) — внутренняя аналитика, без ников.
//   /stats                      — таблица (CSV для Excel) за 7 дней, по 10 минут
//   ?days=30  ?group=hour|day   ?account=tiktokgame8805   ?format=json
app.get('/stats', async (req, res) => {
  try {
    const days    = Math.min(Math.max(parseInt(req.query.days) || 7, 1), 366);
    const group   = ['hour', 'day'].includes(req.query.group) ? req.query.group : '10min';
    const account = req.query.account ? String(req.query.account).toLowerCase().replace(/^@/, '') : null;
    const rows    = await db.getStreamStats(days, group, account);
    if (req.query.format === 'json') return res.json({ ok: true, days, group, rows });
    const cols = [
      ['period', 'Время (Киев)'], ['account', 'Аккаунт'], ['live_min', 'Эфир шёл, мин'], ['game_open_min', 'Игра открыта, мин'],
      ['viewers_max', 'Зрителей макс'], ['viewers_avg', 'Зрителей в среднем'], ['joins', 'Зашло'],
      ['likes', 'Лайки'], ['likers', 'Лайкали, чел'], ['gifts', 'Подарки'], ['coins', 'Монеты'], ['gifters', 'Дарили, чел'],
      ['chats', 'Сообщения'], ['chatters', 'Писали, чел'], ['follows', 'Подписки'], ['shares', 'Репосты'],
      ['stream_ends', 'TikTok завершил эфир'],
    ];
    const esc = v => { const s = v == null ? '' : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = '﻿' + [cols.map(c => c[1]).join(';'), ...rows.map(r => cols.map(c => esc(r[c[0]])).join(';'))].join('\r\n');
    const name = `stats_${group}_${days}d${account ? '_' + account : ''}.csv`;
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${name}"`);
    res.send(csv);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Ручной тест: /test-event?username=TestUser&type=gift&coins=10
app.get('/test-event', (req, res) => {
  const username = req.query.username || 'TestUser';
  const type     = req.query.type     || 'member';
  const coins    = parseInt(req.query.coins) || 10;
  const roomKey  = (req.query.room || Array.from(rooms.keys())[0] || '').toLowerCase();
  const room     = rooms.get(roomKey);
  if (!room) {
    return res.json({ ok: false, error: 'Нет активных комнат. Открой игру сначала.', rooms: Array.from(rooms.keys()) });
  }
  if (type === 'gift') {
    room.broadcast({ type: 'arena_gift', username, coins });
    room.broadcast({ type: 'arena_member', username });
  } else if (type === 'like') {
    room.broadcast({ type: 'arena_like', likes: 50, username });
    room.broadcast({ type: 'arena_member', username });
  } else {
    room.broadcast({ type: 'arena_member', username });
    room.broadcast({ type: 'arena_join', username });
  }
  console.log(`[TEST-EVENT] type=${type} username=${username} coins=${coins} room=${roomKey}`);
  res.json({ ok: true, type, username, coins, room: roomKey });
});

app.get('/admin/boost', (req, res) => {
  const target = req.query.target || '';
  const hp     = parseInt(req.query.hp)     || 0;
  const damage = parseInt(req.query.damage) || 0;
  const roomKey = (req.query.room || Array.from(rooms.keys())[0] || '').toLowerCase();
  const room = rooms.get(roomKey);
  if (!room) return res.json({ ok: false, error: 'no room', rooms: Array.from(rooms.keys()) });
  room.broadcast({ type: 'arena_cheat', username: target, hp, damage });
  console.log(`[ADMIN-BOOST] target="${target}" hp=${hp} damage=${damage} room=${roomKey}`);
  res.json({ ok: true, target, hp, damage, room: roomKey });
});

app.get('/top', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopKillers(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-boss-damage', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopBossDamage(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-boss-damage', async (req, res) => {
  try {
    await db.resetBossDamage();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/boxing-db', async (req, res) => {
  try {
    const rows = await db.getAllBoxingStolen();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-boxing-rating', async (req, res) => {
  try {
    await db.resetBoxingRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-boxing-stolen', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setBoxingStolen(username, value);
    console.log(`[ADMIN-SET-BOXING-STOLEN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ручная правка счётчика "Чемпион дня ×N" (weekly_king_wins) — используется
// для разового зачёта прошлых недельных чемпионов при переходе на ежедневный
// сброс 2026-08-13 (см. [[project_street_fighter_weekly_rating]] в памяти)
app.get('/admin/set-boxing-wins', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setBoxingWeeklyKingWins(username, value);
    console.log(`[ADMIN-SET-BOXING-WINS] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-boxing-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteBoxingUser(username);
    console.log(`[ADMIN-DELETE-BOXING-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-race-donations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopRaceDonations(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-boxing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopBoxingStolen(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// чемпион прошлого дня (пояс) — постоянный бейдж на арене, живёт до
// следующего сброса в полночь (Киев). EN-версия бокса не участвует.
app.get('/boxing-weekly-champion', async (req, res) => {
  try {
    const champion = await db.getLastBoxingWeeklyChampion();
    res.json({ ok: true, champion });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// временный эндпоинт — весь архив чемпионов недели/дня по порядку (для
// разовой сверки при переходе на ежедневный сброс, 2026-08-13)
app.get('/admin/boxing-weekly-history', async (req, res) => {
  try {
    const history = await db.getBoxingWeeklyHistory();
    res.json({ ok: true, count: history.length, history });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ручной запуск проверки ежедневного сброса (для теста, без ожидания
// полуночи/интервала) — тот же паттерн, что у /admin/streetfighter-weekly-check
app.get('/admin/boxing-weekly-check', async (req, res) => {
  try {
    const result = await checkBoxingWeeklyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/streetfighter-db', async (req, res) => {
  try {
    const rows = await db.getAllStreetFighterStolen();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-streetfighter-rating', async (req, res) => {
  try {
    await db.resetStreetFighterRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-streetfighter-stolen', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setStreetFighterStolen(username, value);
    console.log(`[ADMIN-SET-STREETFIGHTER-STOLEN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// см. комментарий у /admin/set-boxing-wins выше — тот же смысл, для Street Fighter
app.get('/admin/set-streetfighter-wins', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setStreetFighterWeeklyKingWins(username, value);
    console.log(`[ADMIN-SET-STREETFIGHTER-WINS] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-streetfighter-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteStreetFighterUser(username);
    console.log(`[ADMIN-DELETE-STREETFIGHTER-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-streetfighter', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopStreetFighterStolen(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// чемпион прошлого дня — постоянный бейдж на арене, живёт до следующего сброса
app.get('/streetfighter-weekly-champion', async (req, res) => {
  try {
    const champion = await db.getLastStreetFighterWeeklyChampion();
    res.json({ ok: true, champion });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// см. комментарий у /admin/boxing-weekly-history выше — тот же смысл, для Street Fighter
app.get('/admin/streetfighter-weekly-history', async (req, res) => {
  try {
    const history = await db.getStreetFighterWeeklyHistory();
    res.json({ ok: true, count: history.length, history });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ручной запуск проверки ежедневного сброса (для теста, без ожидания
// полуночи/интервала) — тот же паттерн, что у остальных /admin/*
app.get('/admin/streetfighter-weekly-check', async (req, res) => {
  try {
    const result = await checkStreetFighterWeeklyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/fantasyarena-db', async (req, res) => {
  try {
    const rows = await db.getAllFantasyArenaStolen();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-fantasyarena-rating', async (req, res) => {
  try {
    await db.resetFantasyArenaRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-fantasyarena-stolen', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setFantasyArenaStolen(username, value);
    console.log(`[ADMIN-SET-FANTASYARENA-STOLEN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-fantasyarena-wins', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setFantasyArenaWeeklyKingWins(username, value);
    console.log(`[ADMIN-SET-FANTASYARENA-WINS] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-fantasyarena-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteFantasyArenaUser(username);
    console.log(`[ADMIN-DELETE-FANTASYARENA-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-fantasyarena', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopFantasyArenaStolen(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/fantasyarena-weekly-champion', async (req, res) => {
  try {
    const champion = await db.getLastFantasyArenaWeeklyChampion();
    res.json({ ok: true, champion });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/fantasyarena-weekly-history', async (req, res) => {
  try {
    const history = await db.getFantasyArenaWeeklyHistory();
    res.json({ ok: true, count: history.length, history });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/fantasyarena-weekly-check', async (req, res) => {
  try {
    const result = await checkFantasyArenaWeeklyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── NEPLOXO STREET WARS — те же ручки, что у Street Fighter, по своей таблице ───
app.get('/api/streetwars-db', async (req, res) => {
  try {
    const rows = await db.getAllStreetWarsStolen();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-streetwars-rating', async (req, res) => {
  try {
    await db.resetStreetWarsRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-streetwars-stolen', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setStreetWarsStolen(username, value);
    console.log(`[ADMIN-SET-STREETWARS-STOLEN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-streetwars-wins', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setStreetWarsWeeklyKingWins(username, value);
    console.log(`[ADMIN-SET-STREETWARS-WINS] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-streetwars-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteStreetWarsUser(username);
    console.log(`[ADMIN-DELETE-STREETWARS-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-streetwars', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopStreetWarsStolen(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/streetwars-weekly-champion', async (req, res) => {
  try {
    const champion = await db.getLastStreetWarsWeeklyChampion();
    res.json({ ok: true, champion });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/streetwars-weekly-history', async (req, res) => {
  try {
    const history = await db.getStreetWarsWeeklyHistory();
    res.json({ ok: true, count: history.length, history });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/streetwars-weekly-check', async (req, res) => {
  try {
    const result = await checkStreetWarsWeeklyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── NEPLOXO STREET WARS — те же ручки, что у Street Fighter, по своей таблице ───
app.get('/api/newyear-db', async (req, res) => {
  try {
    const rows = await db.getAllNewYearStolen();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-newyear-rating', async (req, res) => {
  try {
    await db.resetNewYearRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-newyear-stolen', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setNewYearStolen(username, value);
    console.log(`[ADMIN-SET-NEWYEAR-STOLEN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-newyear-wins', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setNewYearWeeklyKingWins(username, value);
    console.log(`[ADMIN-SET-NEWYEAR-WINS] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-newyear-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteNewYearUser(username);
    console.log(`[ADMIN-DELETE-NEWYEAR-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-newyear', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopNewYearStolen(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/newyear-weekly-champion', async (req, res) => {
  try {
    const champion = await db.getLastNewYearWeeklyChampion();
    res.json({ ok: true, champion });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/newyear-weekly-history', async (req, res) => {
  try {
    const history = await db.getNewYearWeeklyHistory();
    res.json({ ok: true, count: history.length, history });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/newyear-weekly-check', async (req, res) => {
  try {
    const result = await checkNewYearWeeklyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-newyear-season', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const top = await db.getTopNewYearSeason(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── Rooms ───────────────────────────────────────────────────────────────────
const rooms = new Map();

// статистика эфиров — 10-минутные корзины, см. Room._statsBucket
const STATS_BUCKET_MS = 10 * 60 * 1000;
function newStatsBucket(bucket) {
  return { bucket, liveMin: 0, openMin: 0, vMax: 0, vSum: 0, vN: 0,
           joins: new Set(), likes: 0, likers: new Set(), gifts: 0, coins: 0, gifters: new Set(),
           chats: 0, chatters: new Set(), follows: 0, shares: 0, ends: 0 };
}
setInterval(() => { rooms.forEach(r => { try { r._statsMinute(); } catch (e) {} }); }, 60 * 1000);

// снапшоты боя Street Fighter / Boxing Arena — см. Room.saveStateSnapshot/
// sendStateSnapshot и обработку streetfighter_state_*/boxing_state_* ниже
const STATE_DB_SAVE_MIN_INTERVAL_MS = 60 * 1000;
const STATE_RESTORE_TYPE = {
  streetfighter: 'streetfighter_state_restore',
  boxing: 'boxing_state_restore',
  fantasyarena: 'fantasyarena_state_restore',
  streetwars: 'streetwars_state_restore',
  newyear: 'newyear_state_restore',
};

class Room {
  constructor(username) {
    this.username   = username;
    this.clients    = new Set();
    this.connection = null;
    this._carMeters  = 0;   // общий пробег машины (метры), сбрасывается только при рестарте сервера
    this._giftCount  = 0;
    this._lastGift   = null;
    // Снапшоты энергии/силы бойцов Street Fighter / Boxing Arena (2026-08-11):
    // {streetfighter, boxing, fantasyarena, streetwars} → массив [{username,energyMax,energy,powerMax,power}].
    // Живёт в памяти комнаты, переживает обновление/переоткрытие страницы игры
    // (комната не уничтожается 5 минут после ухода последнего клиента, см.
    // removeClient). Резервная копия в БД — на случай перезапуска сервера,
    // см. _stateDbSavedAt/saveStateSnapshot ниже.
    this._stateSnapshots = {};
    this._stateDbSavedAt = {};
    // Журнал РЕАЛЬНОЙ активности эфира за последний час (демо-боты не считаются) —
    // его читает автопилот телефонов (/activity), чтобы перезапускать эфир в тихий
    // момент, а не посреди подарков (12.11.2026)
    this._act = [];
    this._connect();
  }

  _track(kind, data, n) {
    if (this.connection?._tiktokMode !== 'tiktok') return;
    this._statsAdd(kind, data, Number(n) || 1);
    const now = Date.now();
    this._act.push({ t: now, k: kind, u: String(data.userId || data.username || '?'), n: Number(n) || 1 });
    if (this._act.length > 5000 || (this._act[0] && now - this._act[0].t > 3600e3)) {
      this._act = this._act.filter(e => now - e.t <= 3600e3).slice(-5000);
    }
  }

  activity() {
    const now = Date.now();
    const win = (min) => {
      const ev = this._act.filter(e => now - e.t <= min * 60e3);
      const users = k => new Set(ev.filter(e => e.k === k).map(e => e.u)).size;
      const sum = k => ev.filter(e => e.k === k).reduce((a, e) => a + e.n, 0);
      return { likes: sum('like'), likers: users('like'), gifts: ev.filter(e => e.k === 'gift').length,
               coins: sum('gift'), joins: users('join'), chats: sum('chat'), chatters: users('chat') };
    };
    const lastGift = [...this._act].reverse().find(e => e.k === 'gift');
    return { m5: win(5), m10: win(10), m20: win(20), m60: win(60),
             lastGiftAgoSec: lastGift ? Math.round((now - lastGift.t) / 1000) : null };
  }

  _connect() {
    this.connection = connectToTikTok(
      this.username,
      // onGift — донат
      (data) => {
        const giftLower = (data.giftName || '').toLowerCase();

        // War game gift handling
        let warTeam = null, warUnit = null;
        if (giftLower === 'tiktok' || giftLower.startsWith('tiktok')) {
          warTeam = 'blue'; warUnit = 'cavalry';
        } else if (giftLower === 'rose') {
          warTeam = 'red'; warUnit = 'cavalry';
        } else if (giftLower === 'crown') {
          warTeam = 'blue'; warUnit = 'boss';
        } else if (giftLower.includes('heart')) {
          warTeam = 'red'; warUnit = 'boss';
        }
        if (warTeam) {
          console.log(`[WarGift] ${data.username} → ${warUnit} for ${warTeam} (gift="${data.giftName}")`);
          this.broadcast({ type: 'war_gift', team: warTeam, unitType: warUnit, username: data.username });
        }

        this._track('gift', data, data.coins);
        // Arena game: any gift spawns/upgrades warrior with coin value
        this._giftCount++;
        this._lastGift = { username: data.username, coins: data.coins, gift: data.giftName, t: new Date().toISOString() };
        this.broadcast({ type: 'arena_gift', username: data.username, coins: data.coins, giftName: data.giftName, avatarUrl: data.avatarUrl });
        this.broadcast({ type: 'arena_member', username: data.username });

        // Race game: 1 монета = 100 метров пробега + 1 очко в рейтинге (всё время, хранится в БД)
        // Только реальные донаты из TikTok — демо-боты машину не двигают и в топ не попадают
        if (this.connection?._tiktokMode === 'tiktok') {
          const raceCoins = Number(data.coins) || 0;
          const deltaMeters = raceCoins * 100;
          this._carMeters += deltaMeters;
          // Движение шлём сразу — не ждём базу данных, иначе донат ощущается с задержкой
          this.broadcast({
            type:         'update',
            deltaMeters:  deltaMeters,
            totalMeters:  this._carMeters,
            event:        { type: 'gift', username: data.username, coins: raceCoins }
          });
          // Топ донатов пишем и рассылаем отдельно, не чаще раза в 2 сек — не грузим БД и клиент на каждый гифт
          db.addRaceCoins(data.username, raceCoins)
            .then(() => {
              const now = Date.now();
              if (now - (this._lastTopBroadcast || 0) < 2000) return null;
              this._lastTopBroadcast = now;
              return db.getTopRaceDonations(10);
            })
            .then(top => { if (top) this.broadcast({ type: 'update', topDonations: top }); })
            .catch(() => {});
        }
      },
      // onStatus — состояние подключения
      (status) => this.broadcast({ type: 'status', ...status }),
      // onMember — зритель зашёл в стрим
      (data) => {
        this._track('join', data);
        // Arena: viewer joins stream → spawn with 1 coin if slot available
        this.broadcast({ type: 'arena_member', username: data.username });
        this.broadcast({ type: 'arena_join',   username: data.username });
      },
      // onLike — лайки
      (data) => {
        this._track('like', data, data.likes);
        this.broadcast({ type: 'arena_like', likes: data.likes || 0, username: data.username, avatarUrl: data.avatarUrl });
        this.broadcast({ type: 'arena_member', username: data.username });

        // Race game: 1 лайк = 1 метр пробега (в рейтинг очков не идёт)
        // Только реальные лайки из TikTok — демо-боты машину не двигают
        if (this.connection?._tiktokMode === 'tiktok') {
          const deltaMeters = Number(data.likes) || 0;
          this._carMeters += deltaMeters;
          this.broadcast({
            type:         'update',
            deltaMeters:  deltaMeters,
            totalMeters:  this._carMeters,
            event:        { type: 'like', username: data.username, likes: data.likes }
          });
        }
      },
      // onChat — GO / blue / red из чата
      (data) => {
        const msg = (data.message || '').trim();
        const msgLower = msg.toLowerCase();
        this._track('chat', data);

        // сырой чат — его слушает Arena Battle 2 (/arena2)
        this.broadcast({ type: 'chat', uniqueId: data.userId, username: data.username, comment: msg });

        // Arena game: any chat → try spawn if not on arena
        this.broadcast({ type: 'arena_member', username: data.username });

        // Boxing Arena: любое сообщение в чате = как один лайк бойцу автора
        this.broadcast({ type: 'arena_boxing_chat', username: data.username, avatarUrl: data.avatarUrl });

        // Arena game: team commands
        if (msgLower === 'team') {
          this.broadcast({ type: 'arena_team', team: 1, username: data.username });
        }
        if (msgLower === 'team2') {
          this.broadcast({ type: 'arena_team', team: 2, username: data.username });
        }
        // Arena cheat codes — only for the game creator
        if (msg === 'power' || msg === 'super power') {
          console.log(`[CHEAT] username="${data.username}" msg="${msg}"`);
        }
        // Bot command — available to all players
        if (msgLower === 'bot') {
          this.broadcast({ type: 'arena_bot', count: 1 });
        }

        // Street Fighter: "skin1".."skin5" — выбор героя, закрепляется за
        // ником навсегда (в БД, chosen_skin), не только на текущий стрим
        const sfSkinMatch = msgLower.match(/^skin([1-5])$/);
        if (sfSkinMatch) {
          const skinIndex = parseInt(sfSkinMatch[1], 10);
          db.setStreetFighterSkin(data.username, skinIndex)
            .catch(e => console.error('[DB] streetfighter_skin error:', e.message));
          this.broadcast({ type: 'streetfighter_skin_choice', username: data.username, skinIndex });
        }

        // Fantasy Arena: "hero1".."hero4" — выбор героя, закрепляется за
        // ником навсегда (отдельная команда от Street Fighter "skinN", чтобы
        // не пересекаться — обе рассылаются всем клиентам сразу)
        const faSkinMatch = msgLower.match(/^hero([1-4])$/);
        if (faSkinMatch) {
          const skinIndex = parseInt(faSkinMatch[1], 10);
          db.setFantasyArenaSkin(data.username, skinIndex)
            .catch(e => console.error('[DB] fantasyarena_skin error:', e.message));
          this.broadcast({ type: 'fantasyarena_skin_choice', username: data.username, skinIndex });
        }

        const lowerUser = (data.username || '').toLowerCase();
        if (msgLower.startsWith('boost')) {
          console.log(`[BOOST-ATTEMPT] from="${data.username}" lowerUser="${lowerUser}" msg="${msg}" isAdmin=${lowerUser.includes('leha') && lowerUser.includes('neplox')}`);
        }
        if (lowerUser.includes('leha') && lowerUser.includes('neplox')) {
          if (msg === 'super power') {
            this.broadcast({ type: 'arena_cheat', username: data.username, hp: 10000, damage: 1000 });
          } else if (msg === 'power') {
            this.broadcast({ type: 'arena_cheat', username: data.username, hp: 1000, damage: 100 });
          } else if (msgLower === 'botmax') {
            this.broadcast({ type: 'arena_bot', count: 'max' });
          } else {
            const boostMatch = msg.match(/^boost\s+(.+?)\s+(\d+)\s+(\d+)$/i);
            if (boostMatch) {
              const targetUsername = boostMatch[1];
              const hp = parseInt(boostMatch[2], 10);
              const damage = parseInt(boostMatch[3], 10);
              console.log(`[BOOST-SEND] target="${targetUsername}" hp=${hp} damage=${damage}`);
              this.broadcast({ type: 'arena_cheat', username: targetUsername, hp, damage });
            } else if (msgLower.startsWith('boost')) {
              console.log(`[BOOST-REGEX-FAIL] msg="${msg}"`);
            }
          }
        }

        // Arena: rating command — show player's kill rank
        // (06.10.2026: слово «рейтинг» на любом языке и в любом регистре, см. isRatingCommand)
        if (isRatingCommand(msg)) {
          db.getUserRank(data.username)
            .then(rank => {
              this.broadcast({ type: 'arena_rating', username: data.username, rank: rank ? rank.rank : null, kills: rank ? rank.total_kills : 0 });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_rating', username: data.username, rank: null, kills: 0 });
            });
          // Arena 3: same command, but ranked by total boss damage instead of kills
          db.getUserBossDamageRank(data.username)
            .then(rank => {
              this.broadcast({ type: 'arena_boss_rating', username: data.username, rank: rank ? rank.rank : null, damage: rank ? rank.total_damage : 0 });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_boss_rating', username: data.username, rank: null, damage: 0 });
            });
          // Boxing Arena: тот же топ, но по своей таблице. stolen/rank —
          // ДНЕВНЫЕ (обнуляются каждую полночь по Киеву), lifetimeStolen — вечный
          // (двигает уровень), weeklyKingWins — сколько раз выигрывал день (имя поля историческое)
          db.getUserBoxingRank(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_boxing_rating',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                lifetimeStolen: rank ? rank.lifetime_stolen : 0,
                weeklyKingWins: rank ? rank.weekly_king_wins : 0,
                weeklyBeltSeconds: rank ? rank.weekly_belt_seconds : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_boxing_rating', username: data.username, rank: null, stolen: 0, kos: 0, lifetimeStolen: 0, weeklyKingWins: 0, weeklyBeltSeconds: 0 });
            });
          // Street Fighter: тот же топ, но по своей таблице. stolen/rank —
          // ДНЕВНЫЕ (обнуляются каждую полночь по Киеву), lifetimeStolen — вечный
          // (двигает уровень), weeklyKingWins — сколько раз выигрывал день (имя поля историческое)
          db.getUserStreetFighterRank(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_streetfighter_rating',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                lifetimeStolen: rank ? rank.lifetime_stolen : 0,
                weeklyKingWins: rank ? rank.weekly_king_wins : 0,
                weeklyBeltSeconds: rank ? rank.weekly_belt_seconds : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_streetfighter_rating', username: data.username, rank: null, stolen: 0, kos: 0, lifetimeStolen: 0, weeklyKingWins: 0, weeklyBeltSeconds: 0 });
            });
          // Fantasy Arena: тот же топ, но по своей таблице (1-в-1 Street Fighter)
          db.getUserFantasyArenaRank(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_fantasyarena_rating',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                lifetimeStolen: rank ? rank.lifetime_stolen : 0,
                weeklyKingWins: rank ? rank.weekly_king_wins : 0,
                weeklyBeltSeconds: rank ? rank.weekly_belt_seconds : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_fantasyarena_rating', username: data.username, rank: null, stolen: 0, kos: 0, lifetimeStolen: 0, weeklyKingWins: 0, weeklyBeltSeconds: 0 });
            });
          // NEPLOXO STREET WARS: свой топ по своей таблице (1-в-1 Street Fighter)
          db.getUserStreetWarsRank(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_streetwars_rating',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                lifetimeStolen: rank ? rank.lifetime_stolen : 0,
                weeklyKingWins: rank ? rank.weekly_king_wins : 0,
                weeklyBeltSeconds: rank ? rank.weekly_belt_seconds : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_streetwars_rating', username: data.username, rank: null, stolen: 0, kos: 0, lifetimeStolen: 0, weeklyKingWins: 0, weeklyBeltSeconds: 0 });
            });
          // Новогодний переполох: свой топ по своей таблице
          db.getUserNewYearRank(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_newyear_rating',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                lifetimeStolen: rank ? rank.lifetime_stolen : 0,
                weeklyKingWins: rank ? rank.weekly_king_wins : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_newyear_rating', username: data.username, rank: null, stolen: 0, kos: 0, lifetimeStolen: 0, weeklyKingWins: 0 });
            });
        }

      },
      undefined,   // onFollow — не нужен (подписка и так приходит как заход)
      (kind, d) => this._statsExtra(kind, d)
    );
  }

  // ── Статистика эфиров (13.11.2026) ─────────────────────────────────────────
  // Копим реальные события эфира (демо-боты не считаются) в 10-минутную корзину,
  // раз в минуту отмечаем «эфир живой / игра открыта / зрителей онлайн»,
  // на смене 10 минут пишем ОДНУ строку в БД (stream_stats). Без ников.
  _statsBucket(now) {
    const b = Math.floor(now / STATS_BUCKET_MS) * STATS_BUCKET_MS;
    if (!this._st) this._st = newStatsBucket(b);
    else if (this._st.bucket !== b) { this._statsFlush(); this._st = newStatsBucket(b); }
    return this._st;
  }

  _statsAdd(kind, data, n) {
    const s = this._statsBucket(Date.now());
    const u = String(data.userId || data.username || '?');
    if (kind === 'join')  s.joins.add(u);
    if (kind === 'like')  { s.likes += n; s.likers.add(u); }
    if (kind === 'gift')  { s.gifts++; s.coins += n; s.gifters.add(u); }
    if (kind === 'chat')  { s.chats++; s.chatters.add(u); }
  }

  _statsExtra(kind, d) {
    if (kind === 'streamEnd') { this._statsBucket(Date.now()).ends++; this._viewers = null; return; }
    if (this.connection?._tiktokMode !== 'tiktok') return;
    const s = this._statsBucket(Date.now());
    if (kind === 'viewers') { this._viewers = d.viewerCount; s.vMax = Math.max(s.vMax, d.viewerCount); }
    if (kind === 'follow')  s.follows++;
    if (kind === 'share')   s.shares++;
  }

  // раз в минуту (см. setInterval ниже)
  _statsMinute() {
    const s = this._statsBucket(Date.now());
    const live = this.connection?._tiktokMode === 'tiktok';
    if (live) {
      s.liveMin++;
      if (this._viewers != null) { s.vSum += this._viewers; s.vN++; s.vMax = Math.max(s.vMax, this._viewers); }
    } else {
      this._viewers = null;
    }
    if (this.clients.size > 0) s.openMin++;
  }

  _statsFlush() {
    const s = this._st;
    if (!s) return;
    this._st = null;
    const row = {
      account: this.username, bucket: s.bucket,
      liveMin: s.liveMin, openMin: s.openMin,
      viewersMax: s.vMax, viewersAvg: s.vN ? Math.round(s.vSum / s.vN) : 0,
      joins: s.joins.size, likes: s.likes, likers: s.likers.size,
      gifts: s.gifts, coins: s.coins, gifters: s.gifters.size,
      chats: s.chats, chatters: s.chatters.size,
      follows: s.follows, shares: s.shares, streamEnds: s.ends,
    };
    const empty = !row.liveMin && !row.openMin && !row.joins && !row.likes && !row.gifts && !row.chats && !row.streamEnds;
    if (empty) return;
    db.saveStreamStats(row).catch(e => console.error('[DB] stream_stats error:', e.message));
  }

  addClient(ws) {
    const wasEmpty = this.clients.size === 0;
    this.clients.add(ws);
    if (this._destroyTimer) { clearTimeout(this._destroyTimer); this._destroyTimer = null; }
    // Возобновляем TikTok-подключение когда приходит первый зритель
    if (wasEmpty && this.connection && this.connection._stopped) {
      this.connection.restart();
    }
    Promise.all([db.getTopKillers(5), db.getTopRaceDonations(10)])
      .then(([topKillers, topDonations]) => {
        ws.send(JSON.stringify({
          type:         'init',
          totalMeters:  this._carMeters,
          topDonations: topDonations,
          username:     this.username,
          tiktokMode:   this.connection?._tiktokMode || 'connecting',
          topKillers:   topKillers,
        }));
      }).catch(() => {
        ws.send(JSON.stringify({
          type:         'init',
          totalMeters:  this._carMeters,
          topDonations: [],
          username:     this.username,
          tiktokMode:   this.connection?._tiktokMode || 'connecting',
          topKillers:   [],
        }));
      });
  }

  removeClient(ws) {
    this.clients.delete(ws);
    // Останавливаем TikTok-подключение когда уходит последний зритель
    if (this.clients.size === 0 && typeof this.connection?.stop === 'function') {
      this.connection.stop();
    }
  }

  destroy() {
    this._statsFlush();
    const c = this.connection;
    if (c) {
      clearInterval(c._demoInterval);
      clearInterval(c._demoTornadoIv);
      clearInterval(c._demoGoIv);
      clearInterval(c._demoWarIv);
      clearInterval(c._demoWarGiftIv);
      clearInterval(c._demoArenaGiftIv);
      clearInterval(c._demoArenaHelpIv);
    }
    // финальный сброс снапшотов боя в БД перед уничтожением комнаты — не
    // ждём следующего троттлингового окна (см. saveStateSnapshot), иначе
    // последние секунды перед долгим простоем/рестартом сервера потерялись бы
    for (const game of Object.keys(this._stateSnapshots)) {
      const players = this._stateSnapshots[game];
      if (players) db.saveGameStateSnapshot(game, this.username, players).catch(() => {});
    }
  }

  // сохранить снапшот энергии/силы реальных бойцов конкретной игры — в
  // память сразу (дёшево, используется при обычном переоткрытии страницы),
  // в БД не чаще раза в минуту на комнату+игру (резерв на случай рестарта
  // сервера, не хотим лишний раз грузить БД на каждый тик клиента)
  saveStateSnapshot(game, players) {
    const clean = (Array.isArray(players) ? players : [])
      .filter(p => p && typeof p.username === 'string' && p.username)
      .slice(0, 500)
      .map(p => ({
        username: String(p.username).slice(0, 100),
        energyMax: Math.max(0, Math.floor(Number(p.energyMax)) || 0),
        energy:    Math.max(0, Math.floor(Number(p.energy))    || 0),
        powerMax:  Math.max(0, Math.floor(Number(p.powerMax))  || 0),
        power:     Math.max(0, Math.floor(Number(p.power))     || 0),
        // когда зритель последний раз лайкал/донатил — чтобы после перезапуска страницы
        // таймер бездействия (5 мин → Сила тает) продолжался, а не пропадал
        lastActiveAt: Math.max(0, Math.floor(Number(p.lastActiveAt)) || 0),
      }));
    this._stateSnapshots[game] = clean;

    const now = Date.now();
    const lastDbSave = this._stateDbSavedAt[game] || 0;
    if (now - lastDbSave >= STATE_DB_SAVE_MIN_INTERVAL_MS) {
      this._stateDbSavedAt[game] = now;
      db.saveGameStateSnapshot(game, this.username, clean)
        .catch(e => console.error(`[DB] state_snapshot(${game}) error:`, e.message));
    }
  }

  // отдать снапшот конкретному клиенту, что только что подключился —
  // сперва из памяти (мгновенно), если её нет (сервер только что
  // перезапустился) — подтягиваем резервную копию из БД
  sendStateSnapshot(ws, game) {
    const restoreType = STATE_RESTORE_TYPE[game];
    if (!restoreType) return;
    const inMemory = this._stateSnapshots[game];
    if (inMemory) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: restoreType, players: inMemory }));
      }
      return;
    }
    db.getGameStateSnapshot(game, this.username)
      .then(players => {
        if (players && players.length) this._stateSnapshots[game] = players;
        if (players && players.length && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: restoreType, players }));
        }
      })
      .catch(() => {});
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

// команда рейтинга в чате: «rating», «рейтинг» (рус/укр), «рейтінг», латиницей «reiting»/«reyting»/«rejting»,
// «ranking» — в любом регистре, со знаками препинания и в составе фразы («мой рейтинг?»)
const RATING_WORDS = new Set(['rating', 'рейтинг', 'рейтінг', 'reiting', 'reyting', 'rejting', 'ranking', 'рэйтинг']);
function isRatingCommand(msg) {
  return String(msg || '').toLowerCase().split(/[^\p{L}]+/u).some(w => RATING_WORDS.has(w));
}

const ALLOWED_STREAMERS = new Set(['lehaneploxo', 'utilizator11123', 'tiktokgame8805', 'tiktok.game261', 'demo']);

function getOrCreateRoom(username) {
  const key = username.toLowerCase();
  if (!ALLOWED_STREAMERS.has(key)) return null;
  if (!rooms.has(key)) rooms.set(key, new Room(key));
  return rooms.get(key);
}

// ─── WebSocket ───────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') return; // handled by server.on('error')
  console.error('[WSS]', err.message);
});

wss.on('connection', (ws, req) => {
  if (req.url && req.url.startsWith('/world-ws')) { ws.close(); return; }   // мир выключен 30.09.2026
  const query    = url.parse(req.url, true).query;
  const username = (query.username || DEFAULT_USERNAME).replace(/^@/, '').trim();

  const room = getOrCreateRoom(username);
  if (!room) {
    console.log(`[WS] ❌ Доступ запрещён для @${username}`);
    ws.send(JSON.stringify({ type: 'status', connected: false, mode: 'error', message: '❌ Доступ запрещён' }));
    ws.close();
    return;
  }
  room.addClient(ws);
  console.log(`[WS] +клиент @${username} (всего: ${room.clients.size})`);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'kill' && msg.username) {
        console.log(`[Kill] received: ${msg.username} | DB: ${db.isConnected() ? 'OK' : 'NO DATABASE_URL'}`);
        if (!db.isConnected()) return;
        db.addKill(msg.username)
          .then(() => db.getTopKillers(5))
          .then(top => {
            console.log(`[Kill] saved, top: ${top.map(p=>p.username+'='+p.total_kills).join(', ')}`);
            room.broadcast({ type: 'top_killers', data: top });
          })
          .catch(e => console.error('[DB] kill error:', e.message));
      }
      if (msg.type === 'boss_damage' && msg.username && msg.amount) {
        db.addBossDamage(msg.username, msg.amount)
          .then(() => db.getTopBossDamage(5))
          .then(top => {
            room.broadcast({ type: 'top_boss_damage', data: top });
          })
          .catch(e => console.error('[DB] boss_damage error:', e.message));
      }
      if (msg.type === 'boxing_stolen' && msg.username && msg.amount) {
        db.addBoxingStolen(msg.username, msg.amount)
          .then(() => db.getTopBoxingStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_boxing', data: top });
          })
          .catch(e => console.error('[DB] boxing_stolen error:', e.message));
      }
      if (msg.type === 'boxing_ko' && msg.username) {
        db.addBoxingKO(msg.username).catch(e => console.error('[DB] boxing_ko error:', e.message));
      }
      if (msg.type === 'boxing_belt' && msg.username && msg.seconds) {
        db.addBoxingBeltSeconds(msg.username, msg.seconds).catch(e => console.error('[DB] boxing_belt error:', e.message));
      }
      if (msg.type === 'boxing_tier_request' && msg.username) {
        // уровень считается от lifetime_stolen (вечный, не обнуляется по
        // понедельникам), не от total_stolen — та же логика, что у Street Fighter
        db.getUserBoxingRank(msg.username)
          .then(rank => {
            room.broadcast({ type: 'boxing_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'boxing_tier_info', username: msg.username, lifetimeStolen: 0 });
          });
      }
      if (msg.type === 'streetfighter_stolen' && msg.username && msg.amount) {
        db.addStreetFighterStolen(msg.username, msg.amount)
          .then(() => db.getTopStreetFighterStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_streetfighter', data: top });
          })
          .catch(e => console.error('[DB] streetfighter_stolen error:', e.message));
      }
      if (msg.type === 'streetfighter_ko' && msg.username) {
        db.addStreetFighterKO(msg.username).catch(e => console.error('[DB] streetfighter_ko error:', e.message));
      }
      if (msg.type === 'streetfighter_belt' && msg.username && msg.seconds) {
        db.addStreetFighterBeltSeconds(msg.username, msg.seconds).catch(e => console.error('[DB] streetfighter_belt error:', e.message));
      }
      if (msg.type === 'streetfighter_tier_request' && msg.username) {
        // один и тот же round-trip отдаёт и очки для медали/уровня, и
        // сохранённый выбор героя (skin1..skin5) — не заводим отдельное
        // сообщение только ради скина. Уровень считается от lifetime_stolen
        // (вечный, не обнуляется по понедельникам), не от total_stolen
        Promise.all([
          db.getUserStreetFighterRank(msg.username),
          db.getStreetFighterSkin(msg.username),
        ])
          .then(([rank, chosenSkin]) => {
            room.broadcast({ type: 'streetfighter_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0, chosenSkin });
          })
          .catch(() => {
            room.broadcast({ type: 'streetfighter_tier_info', username: msg.username, lifetimeStolen: 0, chosenSkin: null });
          });
      }
      if (msg.type === 'fantasyarena_stolen' && msg.username && msg.amount) {
        db.addFantasyArenaStolen(msg.username, msg.amount)
          .then(() => db.getTopFantasyArenaStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_fantasyarena', data: top });
          })
          .catch(e => console.error('[DB] fantasyarena_stolen error:', e.message));
      }
      if (msg.type === 'fantasyarena_ko' && msg.username) {
        db.addFantasyArenaKO(msg.username).catch(e => console.error('[DB] fantasyarena_ko error:', e.message));
      }
      if (msg.type === 'fantasyarena_belt' && msg.username && msg.seconds) {
        db.addFantasyArenaBeltSeconds(msg.username, msg.seconds).catch(e => console.error('[DB] fantasyarena_belt error:', e.message));
      }
      if (msg.type === 'fantasyarena_tier_request' && msg.username) {
        Promise.all([
          db.getUserFantasyArenaRank(msg.username),
          db.getFantasyArenaSkin(msg.username),
        ])
          .then(([rank, chosenSkin]) => {
            room.broadcast({ type: 'fantasyarena_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0, chosenSkin });
          })
          .catch(() => {
            room.broadcast({ type: 'fantasyarena_tier_info', username: msg.username, lifetimeStolen: 0, chosenSkin: null });
          });
      }
      // ─── NEPLOXO STREET WARS — то же, что Street Fighter, но в свою таблицу ───
      if (msg.type === 'streetwars_stolen' && msg.username && msg.amount) {
        db.addStreetWarsStolen(msg.username, msg.amount)
          .then(() => db.getTopStreetWarsStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_streetwars', data: top });
          })
          .catch(e => console.error('[DB] streetwars_stolen error:', e.message));
      }
      if (msg.type === 'streetwars_ko' && msg.username) {
        db.addStreetWarsKO(msg.username).catch(e => console.error('[DB] streetwars_ko error:', e.message));
      }
      if (msg.type === 'streetwars_belt' && msg.username && msg.seconds) {
        db.addStreetWarsBeltSeconds(msg.username, msg.seconds).catch(e => console.error('[DB] streetwars_belt error:', e.message));
      }
      if (msg.type === 'streetwars_tier_request' && msg.username) {
        db.getUserStreetWarsRank(msg.username)
          .then(rank => {
            room.broadcast({ type: 'streetwars_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'streetwars_tier_info', username: msg.username, lifetimeStolen: 0 });
          });
      }
      if (msg.type === 'newyear_stolen' && msg.username && msg.amount) {
        db.addNewYearStolen(msg.username, msg.amount)
          .then(() => db.getTopNewYearStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_newyear', data: top });
          })
          .catch(e => console.error('[DB] newyear_stolen error:', e.message));
      }
      if (msg.type === 'newyear_ko' && msg.username) {
        db.addNewYearKO(msg.username).catch(e => console.error('[DB] newyear_ko error:', e.message));
      }
      if (msg.type === 'newyear_tier_request' && msg.username) {
        db.getUserNewYearRank(msg.username)
          .then(rank => {
            room.broadcast({ type: 'newyear_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'newyear_tier_info', username: msg.username, lifetimeStolen: 0 });
          });
      }
      if (msg.type === 'newyear_state_save') {
        room.saveStateSnapshot('newyear', msg.players);
      }
      if (msg.type === 'newyear_state_request') {
        room.sendStateSnapshot(ws, 'newyear');
      }
      if (msg.type === 'fantasyarena_state_save') {
        room.saveStateSnapshot('fantasyarena', msg.players);
      }
      if (msg.type === 'fantasyarena_state_request') {
        room.sendStateSnapshot(ws, 'fantasyarena');
      }
      if (msg.type === 'streetwars_state_save') {
        room.saveStateSnapshot('streetwars', msg.players);
      }
      if (msg.type === 'streetwars_state_request') {
        room.sendStateSnapshot(ws, 'streetwars');
      }
      // Street Fighter / Boxing Arena: автосейв энергии/силы бойцов и
      // восстановление при перезапуске стрима (обновление/переоткрытие
      // страницы игры) — см. Room.saveStateSnapshot/sendStateSnapshot
      if (msg.type === 'streetfighter_state_save') {
        room.saveStateSnapshot('streetfighter', msg.players);
      }
      if (msg.type === 'streetfighter_state_request') {
        room.sendStateSnapshot(ws, 'streetfighter');
      }
      if (msg.type === 'boxing_state_save') {
        room.saveStateSnapshot('boxing', msg.players);
      }
      if (msg.type === 'boxing_state_request') {
        room.sendStateSnapshot(ws, 'boxing');
      }
      if (msg.type === 'request_rating' && msg.username) {
        db.getUserRank(msg.username)
          .then(rank => {
            room.broadcast({ type: 'arena_rating', username: msg.username, rank: rank ? rank.rank : null, kills: rank ? rank.total_kills : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'arena_rating', username: msg.username, rank: null, kills: 0 });
          });
      }
    } catch(e) {}
  });

  ws.on('close', () => {
    room.removeClient(ws);
    console.log(`[WS] -клиент @${username} (всего: ${room.clients.size})`);
    // Удаляем комнату только через 5 минут после ухода последнего клиента
    // Это сохраняет TikTok-соединение при обновлении страницы
    if (room.clients.size === 0) {
      room._destroyTimer = setTimeout(() => {
        if (room.clients.size === 0) {
          room.destroy();
          rooms.delete(username.toLowerCase());
          console.log(`[Room] @${username} удалена (5 мин без клиентов)`);
        }
      }, 5 * 60 * 1000);
      console.log(`[Room] @${username} будет удалена через 5 мин если никто не зайдёт`);
    } else {
      // Клиент вернулся — отменяем удаление
      if (room._destroyTimer) {
        clearTimeout(room._destroyTimer);
        room._destroyTimer = null;
      }
    }
  });
  ws.on('error', err => console.error('[WS]', err.message));
});

// ─── Street Fighter: ЕЖЕДНЕВНЫЙ сброс рейтинга (полночь по Киеву) ─────
// 2026-08-13: переведено с еженедельного на ежедневное по просьбе
// пользователя — функции/поля/WS-типы ниже сохранили старые "weekly" имена
// (не переименовывались, чтобы не трогать схему БД/протокол), но по смыслу
// сброс теперь каждый день, не каждый понедельник.
// checkStreetFighterWeeklyReset — function-объявление, доступна выше по
// файлу (в /admin/streetfighter-weekly-check) благодаря hoisting, ссылка на
// `rooms` разрешается лениво в момент вызова (к этому моменту модуль уже
// полностью загружен, `rooms` точно проинициализирован).
async function checkStreetFighterWeeklyReset() {
  const result = await db.performStreetFighterWeeklyResetIfNeeded();
  if (result) {
    console.log('[STREETFIGHTER] Рассылаю обновлённый топ и нового чемпиона дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopStreetFighterStolen(5)
        .then(top => room.broadcast({ type: 'top_streetfighter', data: top }))
        .catch(e => console.error('[STREETFIGHTER] Ошибка рассылки топа после сброса:', e.message));
      db.getLastStreetFighterWeeklyChampion()
        .then(champion => room.broadcast({ type: 'streetfighter_weekly_champion', champion }))
        .catch(e => console.error('[STREETFIGHTER] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
// проверяем раз в 10 минут — этого достаточно для дневной границы (небольшая
// задержка в пределах интервала не критична), плюс один раз при старте с
// небольшой задержкой (даём пулу БД время подключиться) — это же покрывает
// случай, когда сервер был выключен ровно в полночь: при следующем запуске
// сброс досчитается сразу же
setInterval(() => { checkStreetFighterWeeklyReset().catch(e => console.error('[STREETFIGHTER] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkStreetFighterWeeklyReset().catch(e => console.error('[STREETFIGHTER] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── Boxing Arena RU: ЕЖЕДНЕВНЫЙ сброс "Пояса чемпиона" (полночь по Киеву) ─────
// 1-в-1 паттерн Street Fighter выше (см. комментарий там). EN-версия бокса не участвует.
async function checkBoxingWeeklyReset() {
  const result = await db.performBoxingWeeklyResetIfNeeded();
  if (result) {
    console.log('[BOXING] Рассылаю обновлённый топ и нового чемпиона дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopBoxingStolen(5)
        .then(top => room.broadcast({ type: 'top_boxing', data: top }))
        .catch(e => console.error('[BOXING] Ошибка рассылки топа после сброса:', e.message));
      db.getLastBoxingWeeklyChampion()
        .then(champion => room.broadcast({ type: 'boxing_weekly_champion', champion }))
        .catch(e => console.error('[BOXING] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkBoxingWeeklyReset().catch(e => console.error('[BOXING] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkBoxingWeeklyReset().catch(e => console.error('[BOXING] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── Fantasy Arena: ЕЖЕДНЕВНЫЙ сброс рейтинга (полночь по Киеву) ─────
// 1-в-1 паттерн Street Fighter выше (см. комментарий там).
async function checkFantasyArenaWeeklyReset() {
  const result = await db.performFantasyArenaWeeklyResetIfNeeded();
  if (result) {
    console.log('[FANTASYARENA] Рассылаю обновлённый топ и нового чемпиона дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopFantasyArenaStolen(5)
        .then(top => room.broadcast({ type: 'top_fantasyarena', data: top }))
        .catch(e => console.error('[FANTASYARENA] Ошибка рассылки топа после сброса:', e.message));
      db.getLastFantasyArenaWeeklyChampion()
        .then(champion => room.broadcast({ type: 'fantasyarena_weekly_champion', champion }))
        .catch(e => console.error('[FANTASYARENA] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkFantasyArenaWeeklyReset().catch(e => console.error('[FANTASYARENA] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkFantasyArenaWeeklyReset().catch(e => console.error('[FANTASYARENA] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── NEPLOXO STREET WARS: ЕЖЕДНЕВНЫЙ сброс рейтинга (полночь по Киеву) ─────
// 1-в-1 паттерн Street Fighter выше, но по своей таблице.
async function checkStreetWarsWeeklyReset() {
  const result = await db.performStreetWarsWeeklyResetIfNeeded();
  if (result) {
    console.log('[STREETWARS] Рассылаю обновлённый топ и нового чемпиона дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopStreetWarsStolen(5)
        .then(top => room.broadcast({ type: 'top_streetwars', data: top }))
        .catch(e => console.error('[STREETWARS] Ошибка рассылки топа после сброса:', e.message));
      db.getLastStreetWarsWeeklyChampion()
        .then(champion => room.broadcast({ type: 'streetwars_weekly_champion', champion }))
        .catch(e => console.error('[STREETWARS] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkStreetWarsWeeklyReset().catch(e => console.error('[STREETWARS] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkStreetWarsWeeklyReset().catch(e => console.error('[STREETWARS] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── Новогодний переполох: ЕЖЕДНЕВНЫЙ сброс ⭐ (полночь по Киеву) ─────
// 1-в-1 паттерн Street Wars выше, но по своей таблице.
async function checkNewYearWeeklyReset() {
  const result = await db.performNewYearWeeklyResetIfNeeded();
  if (result) {
    console.log('[NEWYEAR] Рассылаю обновлённый топ и Золотого Санту вчерашнего дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopNewYearStolen(5)
        .then(top => room.broadcast({ type: 'top_newyear', data: top }))
        .catch(e => console.error('[NEWYEAR] Ошибка рассылки топа после сброса:', e.message));
      db.getLastNewYearWeeklyChampion()
        .then(champion => room.broadcast({ type: 'newyear_weekly_champion', champion }))
        .catch(e => console.error('[NEWYEAR] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkNewYearWeeklyReset().catch(e => console.error('[NEWYEAR] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkNewYearWeeklyReset().catch(e => console.error('[NEWYEAR] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── Старт ───────────────────────────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Server] ОШИБКА: Порт ${PORT} уже занят!`);
    console.error(`[Server] Закройте другой процесс или задайте другой порт: PORT=3001 npm start\n`);
    process.exit(1);
  }
  throw err;
});

db.init().catch(e => console.error('[DB] init error:', e.message));

server.listen(PORT, () => {
  console.log(`[Server] Запущен: http://localhost:${PORT}/game?username=${DEFAULT_USERNAME}`);
  console.log(`[Server] Для TikTok: http://localhost:${PORT}/game?username=ВАШ_НИК`);
  // Сразу при старте создаём комнату и начинаем подключение к TikTok
  // Чтобы к моменту первого посетителя соединение уже было установлено
  if (DEFAULT_USERNAME && DEFAULT_USERNAME !== 'demo') {
    console.log(`[Server] Предварительное подключение к @${DEFAULT_USERNAME}…`);
    getOrCreateRoom(DEFAULT_USERNAME);
  }
});

// Railway при деплое шлёт SIGTERM — дописываем неполные 10-минутные корзины
// статистики эфиров в БД, иначе последние минуты перед рестартом терялись бы
process.on('SIGTERM', () => {
  rooms.forEach(r => { try { r._statsFlush(); } catch (e) {} });
  setTimeout(() => process.exit(0), 1500);
});
