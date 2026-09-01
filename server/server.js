const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const url       = require('url');

const { connectToTikTok } = require('./tiktokConnector');
const db                  = require('./db');
const tamagotchiConfig    = require('./tamagotchiConfig');

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

app.use(express.static(path.join(__dirname, '../client'), {
  index: false,
  etag: false,
  lastModified: false,
  setHeaders: (res, filePath) => {
    if (/\.(html|js)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
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

app.get('/',            serveHtml('launcher.html'));
app.get('/game',        serveHtml('index.html'));
app.get('/war',         serveHtml('war.html'));
app.get('/arena',       serveHtml('arena.html'));
app.get('/arena2',      serveHtml('arena2.html'));
app.get('/arena3',      serveHtml('arena3.html'));
app.get('/civilization',serveHtml('civilization.html'));
app.get('/boxing',      serveHtml('boxing_arena.html'));
app.get('/boxing-db',   serveHtml('boxing_db.html'));
app.get('/boxing-en',    serveHtml('boxing_arena_en.html'));
app.get('/boxing-db-en', serveHtml('boxing_db_en.html'));
app.get('/streetfighter',    serveHtml('streetfighter_arena.html'));
app.get('/streetfighter-db', serveHtml('streetfighter_db.html'));
app.get('/streetfighter2',   serveHtml('streetfighter_arena2.html'));
app.get('/fantasyarena',     serveHtml('fantasy_arena.html'));
app.get('/fantasyarena-db',  serveHtml('fantasy_arena_db.html'));
app.get('/fishing',    serveHtml('fishing.html'));
app.get('/fishing-db', serveHtml('fishing_db.html'));
app.get('/vzaimki',    serveHtml('vzaimki.html'));
app.get('/tamagotchi', serveHtml('tamagotchi.html'));
app.get('/razgon',     serveHtml('razgon.html'));
app.get('/avatarwar',  serveHtml('avatar_war.html'));

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

app.get('/api/boxing-db-en', async (req, res) => {
  try {
    const rows = await db.getAllBoxingStolenEn();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-boxing-rating-en', async (req, res) => {
  try {
    await db.resetBoxingRatingEn();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-boxing-stolen-en', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setBoxingStolenEn(username, value);
    console.log(`[ADMIN-SET-BOXING-STOLEN-EN] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-boxing-user-en', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteBoxingUserEn(username);
    console.log(`[ADMIN-DELETE-BOXING-USER-EN] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/top-boxing-en', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const top = await db.getTopBoxingStolenEn(limit);
    res.json({ ok: true, count: top.length, top });
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

app.get('/api/fishing-db', async (req, res) => {
  try {
    const rows = await db.getAllFishing();
    res.json({ ok: true, count: rows.length, rows });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// "ТОП ЗА СЕГОДНЯ" в самой игре — ежедневный (обнуляется в полночь по Киеву)
app.get('/top-fishing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const top = await db.getTopFishingDaily(limit);
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// "ТОП ВЧЕРА" — снапшот дневного топа, снятый перед полуночным сбросом,
// виден весь следующий день (см. db.performFishingDailyResetIfNeeded)
app.get('/top-fishing-yesterday', async (req, res) => {
  try {
    const top = await db.getYesterdayTopFishing();
    res.json({ ok: true, count: top.length, top });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/reset-fishing-rating', async (req, res) => {
  try {
    await db.resetFishingRating();
    res.json({ ok: true });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/set-fishing-total', async (req, res) => {
  try {
    const username = req.query.username || '';
    const value = parseInt(req.query.value);
    if (!username || Number.isNaN(value)) return res.json({ ok: false, error: 'username and value required' });
    await db.setFishingTotal(username, value);
    console.log(`[ADMIN-SET-FISHING-TOTAL] username="${username}" value=${value}`);
    res.json({ ok: true, username, value });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/admin/delete-fishing-user', async (req, res) => {
  try {
    const username = req.query.username || '';
    if (!username) return res.json({ ok: false, error: 'username required' });
    await db.deleteFishingUser(username);
    console.log(`[ADMIN-DELETE-FISHING-USER] username="${username}"`);
    res.json({ ok: true, username });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ручной запуск проверки дневного сброса (для теста, без ожидания полуночи)
app.get('/admin/fishing-daily-check', async (req, res) => {
  try {
    const result = await checkFishingDailyReset();
    res.json({ ok: true, result });
  } catch(e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── Rooms ───────────────────────────────────────────────────────────────────
const rooms = new Map();

// снапшоты боя Street Fighter / Boxing Arena — см. Room.saveStateSnapshot/
// sendStateSnapshot и обработку streetfighter_state_*/boxing_state_* ниже
const STATE_DB_SAVE_MIN_INTERVAL_MS = 60 * 1000;
const STATE_RESTORE_TYPE = {
  streetfighter: 'streetfighter_state_restore',
  boxing: 'boxing_state_restore',
  boxing_en: 'boxing_state_restore_en',
  fantasyarena: 'fantasyarena_state_restore',
};

// ─── Тамагочи-девушка ───────────────────────────────────────────────────────
// см. девушкатамагочи.txt (ТЗ) — единое непрерывное состояние на комнату,
// тикает раз в TAMAGOTCHI_TICK_MS, персистится в game_state_snapshots
// (game='tamagotchi'). Все константы ниже — единственное место, где крутить
// скорость процессов (п.9 ТЗ).
const TAMAGOTCHI_TICK_MS               = 5000;
const TAMAGOTCHI_MAX_OFFLINE_MS        = 6 * 60 * 60 * 1000; // не досчитывать голод/настроение дальше чем на 6ч простоя
const TAMAGOTCHI_HUNGER_PER_MIN        = 0.5;   // голод: 0→100% примерно за 3.3 часа без еды
const TAMAGOTCHI_MOOD_DECAY_PER_MIN    = 0.3;   // настроение: 100→0% примерно за 5.5 часов без внимания
const TAMAGOTCHI_WEIGHT_BASELINE       = 0.4;   // вес, к которому тело плавно дрейфует само по себе
const TAMAGOTCHI_WEIGHT_TRAIN_STEP     = 0.03;  // похудение за один тик (5с) активной тренировки
const TAMAGOTCHI_WEIGHT_IDLE_STEP      = 0.003; // лёгкий естественный дрейф веса к baseline за тик
const TAMAGOTCHI_OVERFEED_WEIGHT_STEP  = 0.03;  // прирост веса за лишний подарок-еду, когда уже сыта
const TAMAGOTCHI_MOOD_GIFT_AMOUNT      = 15;
const TAMAGOTCHI_TRAIN_DURATION_MS     = 20000; // сколько длится "тренируется" после подарка-тренировки
const TAMAGOTCHI_ACTION_DURATION_MS    = 4000;  // сколько длится одноразовая анимация (ест/радуется/переодевается)
const TAMAGOTCHI_STATE_DB_SAVE_MIN_INTERVAL_MS = 60 * 1000;

function clamp(min, max, v) { return Math.min(max, Math.max(min, v)); }
function clamp01(v) { return clamp(0, 1, v); }

class Room {
  constructor(username) {
    this.username   = username;
    this.clients    = new Set();
    this.connection = null;
    this._carMeters  = 0;   // общий пробег машины (метры), сбрасывается только при рестарте сервера
    this._giftCount  = 0;
    this._lastGift   = null;
    // Снапшоты энергии/силы бойцов Street Fighter / Boxing Arena (2026-08-11):
    // {streetfighter, boxing, boxing_en} → массив [{username,energyMax,energy,powerMax,power}].
    // Живёт в памяти комнаты, переживает обновление/переоткрытие страницы игры
    // (комната не уничтожается 5 минут после ухода последнего клиента, см.
    // removeClient). Резервная копия в БД — на случай перезапуска сервера,
    // см. _stateDbSavedAt/saveStateSnapshot ниже.
    this._stateSnapshots = {};
    this._stateDbSavedAt = {};
    // Тамагочи-девушка: null пока не загрузилась из БД (см. _loadTamagotchi).
    this._tamagotchi           = null;
    this._tamagotchiLoading    = false;
    this._tamagotchiDbSavedAt  = 0;
    this._tamagotchiTickIv     = null;
    this._loadTamagotchi();
    // Цивилизация: население/эпоха/донатеры — та же схема снапшота, что у
    // Тамагочи (game_state_snapshots), только без фонового тика — цифры не
    // должны "дрейфовать" сами по себе, пока никто не смотрит игру, поэтому
    // грузим лениво по первому запросу клиента (см. sendCivState).
    this._civ          = null;
    this._civLoading    = false;
    this._civDbSavedAt  = 0;
    this._connect();
  }

  _defaultTamagotchiState(now) {
    return {
      hunger: 30,
      weight: TAMAGOTCHI_WEIGHT_BASELINE,
      mood: 70,
      activity: 'idle',
      activityUntil: 0,
      clothing: { upper: 'tshirt', lower: 'jeans', shoes: 'sneakers', accessory: null, dress: null },
      updatedAt: now,
    };
  }

  // Досчитать пассивный дрейф (голод/настроение) за время, что комната была
  // без сервера (рестарт/redeploy) — capped, чтобы многодневный простой не
  // давал абсурдных значений. Вес за оффлайн-время не трогаем — он меняется
  // только от реальных подарков (еда/тренировка), а не сам по себе.
  _applyTamagotchiOfflineDrift(state, elapsedMs) {
    const minutes = Math.max(0, elapsedMs) / 60000;
    const s = { ...state, clothing: { ...(state.clothing || {}) } };
    s.hunger = clamp(0, 100, (typeof s.hunger === 'number' ? s.hunger : 30) + TAMAGOTCHI_HUNGER_PER_MIN * minutes);
    s.mood   = clamp(0, 100, (typeof s.mood === 'number' ? s.mood : 70) - TAMAGOTCHI_MOOD_DECAY_PER_MIN * minutes);
    if (typeof s.weight !== 'number') s.weight = TAMAGOTCHI_WEIGHT_BASELINE;
    s.activity = 'idle';
    s.activityUntil = 0;
    return s;
  }

  async _loadTamagotchi() {
    if (this._tamagotchi || this._tamagotchiLoading) return;
    this._tamagotchiLoading = true;
    let stored = null;
    try {
      stored = await db.getGameStateSnapshot('tamagotchi', this.username);
    } catch (e) {
      console.error('[DB] tamagotchi load error:', e.message);
    }
    const now = Date.now();
    let state;
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
      const elapsedMs = Math.min(now - (stored.updatedAt || now), TAMAGOTCHI_MAX_OFFLINE_MS);
      state = this._applyTamagotchiOfflineDrift(stored, elapsedMs);
    } else {
      state = this._defaultTamagotchiState(now);
    }
    state.updatedAt = now;
    this._tamagotchi = state;
    this._tamagotchiLoading = false;
    this._tamagotchiTickIv = setInterval(() => this._tickTamagotchi(), TAMAGOTCHI_TICK_MS);
    this.broadcast({ type: 'tamagotchi_state', ...state });
  }

  _tickTamagotchi() {
    const s = this._tamagotchi;
    if (!s) return;
    const now = Date.now();
    const minutes = TAMAGOTCHI_TICK_MS / 60000;

    s.hunger = clamp(0, 100, s.hunger + TAMAGOTCHI_HUNGER_PER_MIN * minutes);
    s.mood   = clamp(0, 100, s.mood - TAMAGOTCHI_MOOD_DECAY_PER_MIN * minutes);

    const isTraining = s.activity === 'training' && now < s.activityUntil;
    if (isTraining) {
      s.weight = clamp01(s.weight - TAMAGOTCHI_WEIGHT_TRAIN_STEP);
    } else if (s.weight > TAMAGOTCHI_WEIGHT_BASELINE) {
      s.weight = clamp01(s.weight - TAMAGOTCHI_WEIGHT_IDLE_STEP);
    }

    if (s.activity !== 'idle' && s.activityUntil && now >= s.activityUntil) {
      s.activity = 'idle';
      s.activityUntil = 0;
    }

    s.updatedAt = now;
    this.broadcast({ type: 'tamagotchi_state', ...s });
    this.saveTamagotchiState();
  }

  // Подарок TikTok → действие девушки, по server/tamagotchiConfig.js.
  // Реагирует и на demo-режим (см. вызов в onGift выше) — так фичу можно
  // проверить локально без реального TikTok-аккаунта.
  handleTamagotchiGift(giftName, username) {
    if (!this._tamagotchi) { this._loadTamagotchi(); return; }
    const nameLower = (giftName || '').trim().toLowerCase();
    if (!nameLower) return;
    const s = this._tamagotchi;
    const now = Date.now();

    const isFood     = tamagotchiConfig.FOOD.some(g => g.toLowerCase() === nameLower);
    const isTraining = tamagotchiConfig.TRAINING.some(g => g.toLowerCase() === nameLower);
    const isMood     = tamagotchiConfig.MOOD.some(g => g.toLowerCase() === nameLower);
    const clothingKey = Object.keys(tamagotchiConfig.CLOTHING)
      .find(g => g.toLowerCase() === nameLower);

    if (isFood) {
      // ЕДА → сначала убирает ГОЛОД → после полного насыщения доп. еда идёт в ВЕС
      if (s.hunger > 0) {
        s.hunger = 0;
      } else {
        s.weight = clamp01(s.weight + TAMAGOTCHI_OVERFEED_WEIGHT_STEP);
      }
      s.activity = 'eating';
      s.activityUntil = now + TAMAGOTCHI_ACTION_DURATION_MS;
      this.broadcast({ type: 'tamagotchi_action', action: 'eat', username: username || '' });
    } else if (isTraining) {
      s.activity = 'training';
      s.activityUntil = now + TAMAGOTCHI_TRAIN_DURATION_MS;
      this.broadcast({ type: 'tamagotchi_action', action: 'train', username: username || '' });
    } else if (isMood) {
      s.mood = clamp(0, 100, s.mood + TAMAGOTCHI_MOOD_GIFT_AMOUNT);
      s.activity = 'happy';
      s.activityUntil = now + TAMAGOTCHI_ACTION_DURATION_MS;
      this.broadcast({ type: 'tamagotchi_action', action: 'happy', username: username || '' });
    } else if (clothingKey) {
      const { slot, item } = tamagotchiConfig.CLOTHING[clothingKey];
      s.clothing = { ...s.clothing, [slot]: item };
      s.activity = 'dressing';
      s.activityUntil = now + TAMAGOTCHI_ACTION_DURATION_MS;
      this.broadcast({ type: 'tamagotchi_action', action: 'dress', slot, item, username: username || '' });
    } else {
      return; // подарок не сматчился ни на одно действие — игнор
    }

    s.updatedAt = now;
    this.broadcast({ type: 'tamagotchi_state', ...s });
    this.saveTamagotchiState();
  }

  saveTamagotchiState() {
    if (!this._tamagotchi) return;
    const now = Date.now();
    if (now - this._tamagotchiDbSavedAt < TAMAGOTCHI_STATE_DB_SAVE_MIN_INTERVAL_MS) return;
    this._tamagotchiDbSavedAt = now;
    db.saveGameStateSnapshot('tamagotchi', this.username, this._tamagotchi)
      .catch(e => console.error('[DB] tamagotchi_state save error:', e.message));
  }

  sendTamagotchiState(ws) {
    if (this._tamagotchi) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'tamagotchi_state_restore', ...this._tamagotchi }));
      }
      return;
    }
    this._loadTamagotchi().then(() => {
      if (this._tamagotchi && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'tamagotchi_state_restore', ...this._tamagotchi }));
      }
    });
  }

  // Цивилизация: сохранить снапшот {civPop, eraIdx, donors} — в память сразу
  // (клиент шлёт каждые ~15 сек, см. civilization.html), в БД не чаще раза в
  // минуту на комнату (резерв на случай рестарта сервера), та же схема
  // троттлинга, что у saveStateSnapshot/saveTamagotchiState выше.
  saveCivState(state) {
    if (!state || typeof state !== 'object') return;
    const donors = {};
    if (state.donors && typeof state.donors === 'object') {
      for (const [u, c] of Object.entries(state.donors)) {
        const n = Math.max(0, Math.floor(Number(c)) || 0);
        if (n > 0 && typeof u === 'string' && u) donors[u.slice(0, 100)] = n;
      }
    }
    const clean = {
      civPop: Math.max(0, Math.floor(Number(state.civPop)) || 0),
      eraIdx: Math.max(0, Math.floor(Number(state.eraIdx)) || 0),
      donors,
    };
    this._civ = clean;
    const now = Date.now();
    if (now - this._civDbSavedAt >= STATE_DB_SAVE_MIN_INTERVAL_MS) {
      this._civDbSavedAt = now;
      db.saveGameStateSnapshot('civilization', this.username, clean)
        .catch(e => console.error('[DB] civ_state error:', e.message));
    }
  }

  // отдать снапшот только что подключившемуся клиенту — сперва из памяти
  // комнаты, если её нет (сервер только что перезапустился) — из БД
  sendCivState(ws) {
    const send = (state) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'civ_state_restore', ...(state || { civPop: 0, eraIdx: 0, donors: {} }) }));
      }
    };
    if (this._civ) { send(this._civ); return; }
    if (this._civLoading) return;
    this._civLoading = true;
    db.getGameStateSnapshot('civilization', this.username)
      .then(state => {
        this._civLoading = false;
        if (state && typeof state === 'object') this._civ = state;
        send(this._civ);
      })
      .catch(() => { this._civLoading = false; send(null); });
  }

  // Полный сброс игры на ноль по кнопке в углу — сразу пишем в БД (не ждём
  // троттлинг saveCivState) и рассылаем всем открытым вкладкам комнаты, чтобы
  // сброс не "вернулся" при следующем сохранении с другого клиента.
  resetCivState() {
    this._civ = { civPop: 0, eraIdx: 0, donors: {} };
    this._civDbSavedAt = Date.now();
    db.saveGameStateSnapshot('civilization', this.username, this._civ).catch(() => {});
    this.broadcast({ type: 'civ_state_restore', civPop: 0, eraIdx: 0, donors: {}, reset: true });
  }

  _connect() {
    this.connection = connectToTikTok(
      this.username,
      // onGift — донат
      (data) => {
        // Civilization: только реальные донаты из TikTok, без исключений.
        // Если реальное подключение оборвалось/упало и сервер временно переключился
        // в демо-режим с ботами — эти фейковые донаты НЕ должны попадать в игру.
        if (this.connection?._tiktokMode === 'tiktok') {
          this.broadcast({ type: 'civ_gift', username: data.username, uniqueId: data.userId, coins: data.coins });
          // Взаимки: тот же принцип, что и civ_gift — только реальные донаты,
          // демо-боты не должны красить рейтинг подставными подарками
          this.broadcast({ type: 'vzaimki_gift', username: data.username, userId: data.userId, avatarUrl: data.avatarUrl, giftName: data.giftName, coins: data.coins });
        }

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

        // Avatar War: любой донат — юнит-аватарка донатера (команда/сумма
        // считаются на клиенте, тут просто пробрасываем сырое событие)
        this.broadcast({ type: 'avatarwar_gift', userId: data.userId, username: data.username, avatarUrl: data.avatarUrl, coins: data.coins });

        // Arena game: any gift spawns/upgrades warrior with coin value
        this._giftCount++;
        this._lastGift = { username: data.username, coins: data.coins, gift: data.giftName, t: new Date().toISOString() };
        this.broadcast({ type: 'arena_gift', username: data.username, coins: data.coins, giftName: data.giftName });
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

        // Тамагочи-девушка: реагирует на все подарки, включая demo-режим
        // (нужно, чтобы фичу можно было тестировать локально без реального
        // TikTok-аккаунта — так же, как arena_gift выше)
        this.handleTamagotchiGift(data.giftName, data.username);
      },
      // onStatus — состояние подключения
      (status) => this.broadcast({ type: 'status', ...status }),
      // onMember — зритель зашёл в стрим
      (data) => {
        // Arena: viewer joins stream → spawn with 1 coin if slot available
        this.broadcast({ type: 'arena_member', username: data.username });
        this.broadcast({ type: 'arena_join',   username: data.username });
        if (this.connection?._tiktokMode === 'tiktok') {
          this.broadcast({ type: 'vzaimki_member', username: data.username, userId: data.userId, avatarUrl: data.avatarUrl });
        }
      },
      // onLike — лайки
      (data) => {
        // Civilization: только реальные лайки из TikTok — демо-боты не должны
        // растить население (та же защита, что уже стоит на civ_gift выше).
        if (this.connection?._tiktokMode === 'tiktok') {
          this.broadcast({ type: 'civ_like', likes: data.likes || 1, username: data.username });
          this.broadcast({ type: 'vzaimki_like', likes: data.likes || 1, username: data.username, userId: data.userId, avatarUrl: data.avatarUrl });
          // Разнос: та же защита от демо-ботов — лайк засчитывается только в реальном эфире
          this.broadcast({ type: 'razgon_like', likes: data.likes || 1, username: data.username, userId: data.userId, avatarUrl: data.avatarUrl });
        }
        // War game: broadcast raw like count regardless of race state
        this.broadcast({ type: 'war_like', likes: data.likes || 0, username: data.username });
        this.broadcast({ type: 'arena_like', likes: data.likes || 0, username: data.username });
        // Avatar War: лайк разгоняет скорость команды лайкнувшего (если он
        // уже выбрал команду — считается на клиенте по userId)
        this.broadcast({ type: 'avatarwar_like', userId: data.userId, username: data.username, likes: data.likes || 1 });
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

        // Civilization game: broadcast raw chat so client can react to keywords
        this.broadcast({ type: 'chat', uniqueId: data.userId, username: data.username, comment: msg });

        // Разнос: команда "разнеси" — только из реального эфира, демо-боты
        // не должны наполнять очередь на разнос
        if (this.connection?._tiktokMode === 'tiktok') {
          this.broadcast({ type: 'razgon_chat', userId: data.userId, username: data.username, avatarUrl: data.avatarUrl, message: msg });
        }

        // War game: broadcast team command to all clients
        if (msg === 'blue' || msg === 'red') {
          this.broadcast({ type: 'war_chat', team: msg, username: data.username });
        }

        // Avatar War: "1"/"2" в чате — разовый выбор команды (залипает на
        // клиенте по userId, повторные цифры от того же зрителя игнорируются)
        if (msg === '1' || msg === '2') {
          this.broadcast({ type: 'avatarwar_chat', userId: data.userId, username: data.username, team: msg });
        }

        // Arena game: any chat → try spawn if not on arena
        this.broadcast({ type: 'arena_member', username: data.username });

        // Boxing Arena: любое сообщение в чате = как один лайк бойцу автора
        this.broadcast({ type: 'arena_boxing_chat', username: data.username });

        // Arena game: team commands
        if (msgLower === 'team') {
          this.broadcast({ type: 'arena_team', team: 1, username: data.username });
        }
        if (msgLower === 'team2') {
          this.broadcast({ type: 'arena_team', team: 2, username: data.username });
        }
        // Arena 3: "war" command — player also starts fighting other players, not just bosses
        if (msgLower === 'war') {
          this.broadcast({ type: 'arena_warmode', username: data.username });
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
        if (msgLower === 'rating') {
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
          // Boxing Arena EN: тот же топ, но по английской таблице —
          // рассылается всегда, EN-страница слушает только свой тип, RU игнорирует
          db.getUserBoxingRankEn(data.username)
            .then(rank => {
              this.broadcast({
                type: 'arena_boxing_rating_en',
                username: data.username,
                rank: rank ? rank.rank : null,
                stolen: rank ? rank.total_stolen : 0,
                kos: rank ? rank.total_kos : 0,
                beltSeconds: rank ? rank.belt_seconds : 0,
              });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_boxing_rating_en', username: data.username, rank: null, stolen: 0, kos: 0, beltSeconds: 0 });
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
          // Рыбалка: место в дневном топе + вечный счёт рыбок
          db.getUserFishingRank(data.username)
            .then(rank => {
              this.broadcast({ type: 'arena_fishing_rating', username: data.username, rank: rank ? rank.rank : null, totalFish: rank ? rank.total_fish : 0, dailyFish: rank ? rank.daily_fish : 0 });
            })
            .catch(() => {
              this.broadcast({ type: 'arena_fishing_rating', username: data.username, rank: null, totalFish: 0, dailyFish: 0 });
            });
        }

      },
      // onFollow — реальная подписка (отдельно от простого захода зрителя),
      // нужна только "Взаимкам"; остальные игры этот колбэк не используют
      (data) => {
        if (this.connection?._tiktokMode === 'tiktok') {
          this.broadcast({ type: 'vzaimki_follow', username: data.username, userId: data.userId, avatarUrl: data.avatarUrl });
          this.broadcast({ type: 'razgon_follow', username: data.username, userId: data.userId, avatarUrl: data.avatarUrl });
        }
      }
    );
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

    clearInterval(this._tamagotchiTickIv);
    if (this._tamagotchi) {
      db.saveGameStateSnapshot('tamagotchi', this.username, this._tamagotchi).catch(() => {});
    }
    if (this._civ) {
      db.saveGameStateSnapshot('civilization', this.username, this._civ).catch(() => {});
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
      if (msg.type === 'boxing_stolen_en' && msg.username && msg.amount) {
        db.addBoxingStolenEn(msg.username, msg.amount)
          .then(() => db.getTopBoxingStolenEn(5))
          .then(top => {
            room.broadcast({ type: 'top_boxing_en', data: top });
          })
          .catch(e => console.error('[DB] boxing_stolen_en error:', e.message));
      }
      if (msg.type === 'boxing_ko_en' && msg.username) {
        db.addBoxingKOEn(msg.username).catch(e => console.error('[DB] boxing_ko_en error:', e.message));
      }
      if (msg.type === 'boxing_belt_en' && msg.username && msg.seconds) {
        db.addBoxingBeltSecondsEn(msg.username, msg.seconds).catch(e => console.error('[DB] boxing_belt_en error:', e.message));
      }
      if (msg.type === 'boxing_tier_request_en' && msg.username) {
        db.getUserBoxingRankEn(msg.username)
          .then(rank => {
            room.broadcast({ type: 'boxing_tier_info_en', username: msg.username, total_stolen: rank ? rank.total_stolen : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'boxing_tier_info_en', username: msg.username, total_stolen: 0 });
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
      if (msg.type === 'avatarwar_stolen' && msg.username && msg.amount) {
        db.addAvatarWarStolen(msg.username, msg.amount)
          .then(() => db.getTopAvatarWarStolen(5))
          .then(top => {
            room.broadcast({ type: 'top_avatarwar', data: top });
          })
          .catch(e => console.error('[DB] avatarwar_stolen error:', e.message));
      }
      if (msg.type === 'avatarwar_ko' && msg.username) {
        db.addAvatarWarKO(msg.username).catch(e => console.error('[DB] avatarwar_ko error:', e.message));
      }
      if (msg.type === 'avatarwar_tier_request' && msg.username) {
        db.getUserAvatarWarRank(msg.username)
          .then(rank => {
            room.broadcast({ type: 'avatarwar_tier_info', username: msg.username, lifetimeStolen: rank ? rank.lifetime_stolen : 0 });
          })
          .catch(() => {
            room.broadcast({ type: 'avatarwar_tier_info', username: msg.username, lifetimeStolen: 0 });
          });
      }
      if (msg.type === 'fantasyarena_state_save') {
        room.saveStateSnapshot('fantasyarena', msg.players);
      }
      if (msg.type === 'fantasyarena_state_request') {
        room.sendStateSnapshot(ws, 'fantasyarena');
      }
      if (msg.type === 'tamagotchi_state_request') {
        room.sendTamagotchiState(ws);
      }
      if (msg.type === 'civ_state_save' && msg.state) {
        room.saveCivState(msg.state);
      }
      if (msg.type === 'civ_state_request') {
        room.sendCivState(ws);
      }
      if (msg.type === 'civ_reset') {
        room.resetCivState();
      }
      if (msg.type === 'fishing_catch' && msg.username && msg.fish) {
        db.addFishingCatch(msg.username, msg.fish)
          .then(() => db.getTopFishingDaily(10))
          .then(top => {
            room.broadcast({ type: 'top_fishing', data: top });
          })
          .catch(e => console.error('[DB] fishing_catch error:', e.message));
      }
      // Street Fighter / Boxing Arena (RU/EN): автосейв энергии/силы бойцов и
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
      if (msg.type === 'boxing_state_save_en') {
        room.saveStateSnapshot('boxing_en', msg.players);
      }
      if (msg.type === 'boxing_state_request_en') {
        room.sendStateSnapshot(ws, 'boxing_en');
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

// ─── Avatar War: ЕЖЕДНЕВНЫЙ сброс рейтинга (полночь по Киеву) ─────
// 1-в-1 паттерн Street Fighter/Fantasy Arena выше (см. комментарий там).
async function checkAvatarWarWeeklyReset() {
  const result = await db.performAvatarWarWeeklyResetIfNeeded();
  if (result) {
    console.log('[AVATARWAR] Рассылаю обновлённый топ и нового командира дня во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopAvatarWarStolen(5)
        .then(top => room.broadcast({ type: 'top_avatarwar', data: top }))
        .catch(e => console.error('[AVATARWAR] Ошибка рассылки топа после сброса:', e.message));
      db.getLastAvatarWarWeeklyChampion()
        .then(champion => room.broadcast({ type: 'avatarwar_weekly_champion', champion }))
        .catch(e => console.error('[AVATARWAR] Ошибка рассылки чемпиона после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkAvatarWarWeeklyReset().catch(e => console.error('[AVATARWAR] weekly-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkAvatarWarWeeklyReset().catch(e => console.error('[AVATARWAR] weekly-check (startup) error:', e.message)); }, 15*1000);

// ─── Рыбалка: ежедневный сброс "ТОП ЗА СЕГОДНЯ" (полночь по Киеву) ─────
async function checkFishingDailyReset() {
  const result = await db.performFishingDailyResetIfNeeded();
  if (result) {
    console.log('[FISHING] Рассылаю обновлённый (пустой) дневной топ и топ вчера во все активные комнаты после сброса');
    for (const room of rooms.values()) {
      db.getTopFishingDaily(10)
        .then(top => room.broadcast({ type: 'top_fishing', data: top }))
        .catch(e => console.error('[FISHING] Ошибка рассылки топа после сброса:', e.message));
      db.getYesterdayTopFishing()
        .then(top => room.broadcast({ type: 'top_fishing_yesterday', data: top }))
        .catch(e => console.error('[FISHING] Ошибка рассылки топа вчера после сброса:', e.message));
    }
  }
  return result;
}
setInterval(() => { checkFishingDailyReset().catch(e => console.error('[FISHING] daily-check error:', e.message)); }, 10*60*1000);
setTimeout(() => { checkFishingDailyReset().catch(e => console.error('[FISHING] daily-check (startup) error:', e.message)); }, 15*1000);

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
