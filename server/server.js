const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const path      = require('path');
const url       = require('url');

const PlayersManager      = require('./playersManager');
const { connectToTikTok } = require('./tiktokConnector');

const PORT     = process.env.PORT || 3000;
const DEFAULT_USERNAME = (process.argv[2] || process.env.TIKTOK_USERNAME || 'demo')
  .replace(/^@/, '').trim();

console.log(`\n[Server] Никнейм: @${DEFAULT_USERNAME}`);

// ─── Express ─────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, '../client')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/launcher.html'));
});

app.get('/game', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
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
    this._connect();
  }

  _connect() {
    this.connection = connectToTikTok(
      this.username,
      // onGift — донат
      (data) => {
        this.players.addCoins(data.userId, data.username, data.avatarUrl, data.coins);
        const giftLower = (data.giftName || '').toLowerCase();
        const isDonut   = giftLower.includes('donut') || giftLower.includes('doughnut');
        let   eventType = 'donation';
        if (isDonut) {
          const chaosTypes = ['tornado', 'tsunami', 'meteor', 'crash'];
          eventType = chaosTypes[Math.floor(Math.random() * chaosTypes.length)];
          console.log(`[Donut] ${data.username} → ${eventType}`);
        }
        this.broadcast({
          type:         'update',
          players:      this.players.getTop10(),
          totalPlayers: this.players.getTotalCount(),
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
            totalLikes:   this._totalLikes
          });
        }
      },
      // onLike — лайки
      (data) => {
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
          totalLikes:   this._totalLikes,
          event:        chaosEvent || { type: 'like', username: data.username, likes: data.likes }
        });
      },
      // onChat — GO сообщения в чате
      (data) => {
        this.players.addChatGo(data.userId, data.username, data.avatarUrl);
        this.broadcast({
          type:         'update',
          players:      this.players.getTop10(),
          totalPlayers: this.players.getTotalCount(),
          totalLikes:   this._totalLikes,
          event:        { type: 'chatgo', username: data.username }
        });
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
          totalLikes:   this._totalLikes
        });
      }
    }, 60 * 1000);
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.send(JSON.stringify({
      type:         'init',
      players:      this.players.getTop10(),
      totalPlayers: this.players.getTotalCount(),
      totalLikes:   this._totalLikes,
      username:     this.username,
      tiktokMode:   this.connection?._tiktokMode || 'connecting'
    }));
  }

  removeClient(ws) { this.clients.delete(ws); }

  broadcast(data) {
    const msg = JSON.stringify(data);
    this.clients.forEach(ws => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

function getOrCreateRoom(username) {
  const key = username.toLowerCase();
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
  room.addClient(ws);
  console.log(`[WS] +клиент @${username} (всего: ${room.clients.size})`);

  ws.on('close', () => {
    room.removeClient(ws);
    console.log(`[WS] -клиент @${username} (всего: ${room.clients.size})`);
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

server.listen(PORT, () => {
  console.log(`[Server] Запущен: http://localhost:${PORT}/game?username=${DEFAULT_USERNAME}`);
  console.log(`[Server] Для TikTok: http://localhost:${PORT}/game?username=ВАШ_НИК`);
});
