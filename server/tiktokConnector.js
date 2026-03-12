const { WebcastPushConnection } = require('tiktok-live-connector');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

/**
 * Connect to a TikTok Live stream.
 * @param {string}   username   TikTok username (with or without @)
 * @param {Function} onGift     called with { userId, username, avatarUrl, coins }
 * @param {Function} onStatus   called with { connected: bool, mode: 'tiktok'|'demo', message: string }
 * @param {Function} onMember   called with { userId, username, avatarUrl } when viewer joins
 * @returns {object} connection
 */
function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat) {
  const notify = onStatus || (() => {});
  const conn   = new WebcastPushConnection(username);
  conn._tiktokMode = 'connecting';

  // Если username = demo — сразу запускаем демо без попыток подключения
  if (username === 'demo') {
    conn._tiktokMode = 'demo';
    console.log(`[TikTok] Демо-режим запущен`);
    notify({ connected: false, mode: 'demo', message: 'Демо-режим' });
    _startDemo(onGift, conn, onLike, onChat);
    return conn;
  }

  conn.connect()
    .then(s => {
      conn._tiktokMode = 'tiktok';
      console.log(`[TikTok][${username}] Подключён, room: ${s.roomId}`);
      notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
    })
    .catch(err => {
      conn._tiktokMode = 'demo';
      const msg = err.message || String(err);
      console.error(`[TikTok][${username}] Ошибка: ${msg}`);
      notify({ connected: false, mode: 'demo', message: `Не удалось подключить @${username}: ${msg}` });
      _startDemo(onGift, conn, onLike, onChat);
    });

  conn.on('gift', data => {
    // Accept: non-streakable gifts (giftType !== 2) OR end of a streak (repeatEnd)
    // Skip: intermediate events of an ongoing streak (giftType === 2 && !repeatEnd)
    if (data.giftType !== 2 || data.repeatEnd) {
      const perGift  = data.diamondCount ?? data.giftDetails?.diamondCount ?? 1;
      const coins    = Math.max(1, perGift) * (data.repeatCount || 1);
      const giftName = data.giftName || data.giftDetails?.giftName || '';
      console.log(`[Gift] ${data.nickname || data.uniqueId} → ${coins} coins | gift="${giftName}" (type=${data.giftType})`);
      onGift({
        userId:    String(data.userId),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
        giftName,
        coins
      });
    }
  });

  // Лайки
  conn.on('like', data => {
    if (!onLike) return;
    // likeCount = likes in THIS batch; totalLikeCount is cumulative — use likeCount only
    const count = data.likeCount || 1;
    console.log(`[Like] ${data.nickname || data.uniqueId} → +${count} likes`);
    onLike({
      userId:    String(data.userId),
      username:  data.nickname || data.uniqueId || 'Unknown',
      avatarUrl: data.profilePictureUrl || '',
      likes:     count
    });
  });

  conn.on('chat', data => {
    if (!onChat) return;
    const msg = (data.comment || '').trim().toLowerCase();
    if (msg === 'go' || msg === 'blue' || msg === 'red') {
      console.log(`[Chat ${msg.toUpperCase()}] ` + (data.nickname || data.uniqueId));
      onChat({
        userId:    String(data.userId),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
        message:   msg
      });
    }
  });

  // Зритель зашёл в стрим → обновить присутствие
  conn.on('member', data => {
    onMember?.({
      userId:    String(data.userId),
      username:  data.nickname || data.uniqueId || 'Unknown',
      avatarUrl: data.profilePictureUrl || ''
    });
  });

  conn.on('error', err => console.error(`[TikTok][${username}] Ошибка:`, err.message || err));
  conn.on('disconnected', () => {
    console.log(`[TikTok][${username}] Отключён`);
    notify({ connected: false, mode: 'demo', message: `@${username} отключился от TikTok` });
  });

  return conn;
}

function _startDemo(onGift, conn, onLike, onChat) {
  const iv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (Math.random() < 0.4 && onLike) {
      // 40% chance — лайки (5–50 за раз)
      const likes = (Math.floor(Math.random() * 10) + 1) * 5;
      onLike({ userId: u.id, username: u.name, avatarUrl: '', likes });
    } else {
      const coins = Math.floor(Math.random() * 50) + 1;
      onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: '', coins });
    }
  }, 800);

  // Demo: tornado every ~50 seconds so the effect can be tested
  const tornadoIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    console.log(`[Demo] Tornado triggered by ${u.name}`);
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: 'Donut', coins: 30 });
  }, 50000);

  const goIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'go' });
  }, 4000);

  // Demo war units — blue/red chat every 2.5s
  const warIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const team = Math.random() < 0.5 ? 'blue' : 'red';
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: team });
  }, 2500);

  // Attach cleanup to the connection object so the room can clear it
  conn._demoInterval  = iv;
  conn._demoTornadoIv = tornadoIv;
  conn._demoGoIv      = goIv;
  conn._demoWarIv     = warIv;
}

module.exports = { connectToTikTok };
