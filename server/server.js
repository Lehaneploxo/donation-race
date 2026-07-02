const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const url       = require('url');

const PlayersManager      = require('./playersManager');
const { connectToTikTok } = require('./tiktokConnector');
const db                  = require('./db');

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

// ─── Rooms ───────────────────────────────────────────────────────────────────
const rooms = new Map();

class Room {
  constructor(username) {
    this.username   = username;
    this.players    = new PlayersManager();
    this.clients    = new Set();
    this.connection = null;
    this._totalLikes = 0;
    this._lastEventThreshold = 0;
    this._totalCoins = 0;
    this._raceEnded  = false;
    this._giftCount  = 0;
    this._lastGift   = null;
    this._connect();
  }

  _connect() {
    this.connection = connectToTikTok(
      this.username,
      // onGift — донат
      (data) => {
        // Always send to civilization regardless of race state
        this.broadcast({ type: 'civ_gift', username: data.username, uniqueId: data.userId, coins: data.coins });

        if (this._raceEnded) return; // не считаем во время перерыва
        this.players.addCoins(data.userId, data.username, data.avatarUrl, data.coins);
        this._totalCoins += (Number(data.coins) || 0);

        const giftLower = (data.giftName || '').toLowerCase();
        const isDonut   = giftLower.includes('donut') || giftLower.includes('doughnut');
        let   eventType = 'donation';
        if (isDonut) {
          const chaosTypes = ['tornado', 'tsunami', 'meteor', 'crash'];
          eventType = chaosTypes[Math.floor(Math.random() * chaosTypes.length)];
          console.log(`[Donut] ${data.username} → ${eventType}`);
        }

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

        // Arena game: any gift spawns/upgrades warrior with coin value
        this._giftCount++;
        this._lastGift = { username: data.username, coins: data.coins, gift: data.giftName, t: new Date().toISOString() };
        this.broadcast({ type: 'arena_gift', username: data.username, coins: data.coins, giftName: data.giftName });
        this.broadcast({ type: 'arena_member', username: data.username });

        // Проверяем цель — 1000 очков
        const racePoints = this.players.getTotalPoints();
        if (racePoints >= 1000 && !this._raceEnded) {
          this._raceEnded = true;
          const top = this.players.getTop10();
          const winner = top[0] || { username: 'Неизвестный' };
          console.log(`[Race End] Победитель: ${winner.username} | Очки: ${racePoints}`);
          this.broadcast({
            type:         'update',
            players:      top,
            totalPlayers: this.players.getTotalCount(),
            racePoints:   racePoints,
            totalLikes:   this._totalLikes,
            event:        { type: 'race_end', winner: winner.username }
          });
          // Сброс через 10 секунд
          setTimeout(() => {
            this._totalCoins         = 0;
            this._raceEnded          = false;
            this._lastEventThreshold = 0;
            this.players.reset();
            console.log('[Race] Новая гонка началась!');
            this.broadcast({
              type:         'update',
              players:      this.players.getTop10(),
              totalPlayers: this.players.getTotalCount(),
              racePoints:   0,
              totalLikes:   this._totalLikes,
              event:        { type: 'race_start' }
            });
          }, 10000);
          return;
        }

        this.broadcast({
          type:         'update',
          players:      this.players.getTop10(),
          totalPlayers: this.players.getTotalCount(),
          racePoints:   this.players.getTotalPoints(),
          totalLikes:   this._totalLikes,
          event:        { type: eventType, username: data.username, coins: data.coins }
        });
      },
      // onStatus — состояние подключения
      (status) => this.broadcast({ type: 'status', ...status }),
      // onMember — зритель зашёл в стрим
      (data) => {
        const cameBack = this.players.updatePresence(data.userId, data.username, data.avatarUrl);
        if (cameBack) {
          this.broadcast({
            type:         'update',
            players:      this.players.getTop10(),
            totalPlayers: this.players.getTotalCount(),
            racePoints:   this.players.getTotalPoints(),
            totalLikes:   this._totalLikes
          });
        }
        // Arena: viewer joins stream → spawn with 1 coin if slot available
        this.broadcast({ type: 'arena_member', username: data.username });
        this.broadcast({ type: 'arena_join',   username: data.username });
      },
      // onLike — лайки
      (data) => {
        // Always send to civilization
        this.broadcast({ type: 'civ_like', likes: data.likes || 1, username: data.username });
        // War game: broadcast raw like count regardless of race state
        this.broadcast({ type: 'war_like', likes: data.likes || 0, username: data.username });
        this.broadcast({ type: 'arena_like', likes: data.likes || 0, username: data.username });
        this.broadcast({ type: 'arena_member', username: data.username });

        if (this._raceEnded) return;
        this.players.addLikes(data.userId, data.username, data.avatarUrl, data.likes);
        this._totalLikes += (data.likes || 0);
        const threshold = Math.floor(this._totalLikes / 1000);
        let chaosEvent = null;
        if (threshold > this._lastEventThreshold) {
          this._lastEventThreshold = threshold;
          const types = ['tornado', 'tsunami', 'meteor', 'crash'];
          const picked = types[Math.floor(Math.random() * types.length)];
          chaosEvent = { type: picked, username: 'Лайк-шторм' };
          console.log(`[Chaos] ${picked} triggered at ${this._totalLikes} likes`);
        }
        this.broadcast({
          type:         'update',
          players:      this.players.getTop10(),
          totalPlayers: this.players.getTotalCount(),
          racePoints:   this.players.getTotalPoints(),
          totalLikes:   this._totalLikes,
          event:        chaosEvent || { type: 'like', username: data.username, likes: data.likes }
        });
      },
      // onChat — GO / blue / red из чата
      (data) => {
        const msg = (data.message || '').trim();
        const msgLower = msg.toLowerCase();

        // Civilization game: broadcast raw chat so client can react to keywords
        this.broadcast({ type: 'chat', uniqueId: data.userId, username: data.username, comment: msg });

        // War game: broadcast team command to all clients
        if (msg === 'blue' || msg === 'red') {
          this.broadcast({ type: 'war_chat', team: msg, username: data.username });
        }

        // Arena game: any chat → try spawn if not on arena
        this.broadcast({ type: 'arena_member', username: data.username });

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
        }

        // Race game: GO command
        if (msg === 'go' && !this._raceEnded) {
          this.players.addChatGo(data.userId, data.username, data.avatarUrl);
          this.broadcast({
            type:         'update',
            players:      this.players.getTop10(),
            totalPlayers: this.players.getTotalCount(),
            racePoints:   this.players.getTotalPoints(),
            totalLikes:   this._totalLikes,
            event:        { type: 'chatgo', username: data.username }
          });
        }
      }
    );

    // Каждую минуту скрываем игроков, которые не активны 30+ минут
    this._inactiveCheck = setInterval(() => {
      const changed = this.players.checkInactive();
      if (changed > 0) {
        this.broadcast({
          type:         'update',
          players:      this.players.getTop10(),
          totalPlayers: this.players.getTotalCount(),
          racePoints:   this.players.getTotalPoints(),
          totalLikes:   this._totalLikes
        });
      }
    }, 60 * 1000);
  }

  addClient(ws) {
    const wasEmpty = this.clients.size === 0;
    this.clients.add(ws);
    if (this._destroyTimer) { clearTimeout(this._destroyTimer); this._destroyTimer = null; }
    // Возобновляем TikTok-подключение когда приходит первый зритель
    if (wasEmpty && this.connection && this.connection._stopped) {
      this.connection.restart();
    }
    db.getTopKillers(5).then(top => {
      ws.send(JSON.stringify({
        type:         'init',
        players:      this.players.getTop10(),
        totalPlayers: this.players.getTotalCount(),
        racePoints:   this.players.getTotalPoints(),
        totalLikes:   this._totalLikes,
        username:     this.username,
        tiktokMode:   this.connection?._tiktokMode || 'connecting',
        topKillers:   top,
      }));
    }).catch(() => {
      ws.send(JSON.stringify({
        type:         'init',
        players:      this.players.getTop10(),
        totalPlayers: this.players.getTotalCount(),
        racePoints:   this.players.getTotalPoints(),
        totalLikes:   this._totalLikes,
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
    clearInterval(this._inactiveCheck);
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
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

const ALLOWED_STREAMERS = new Set(['lehaneploxo', 'utilizator11123', 'riki_game0', 'demo']);

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
