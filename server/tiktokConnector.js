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
    _startDemo(onGift, conn, onLike, onChat, onMember);
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
      _startDemo(onGift, conn, onLike, onChat, onMember);
    });

  const _seenGifts = new Set();
  conn.on('gift', data => {
    // Accept: non-streakable gifts (giftType !== 2) OR end of a streak (repeatEnd)
    // Skip: intermediate events of an ongoing streak (giftType === 2 && !repeatEnd)
    if (data.giftType !== 2 || data.repeatEnd) {
      // Dedup: skip duplicate events (TikTok sometimes sends the same gift twice)
      const dedupKey = `${data.userId}_${data.giftId || data.giftName}_${Math.floor(Date.now()/2000)}`;
      if (_seenGifts.has(dedupKey)) return;
      _seenGifts.add(dedupKey);
      if (_seenGifts.size > 500) _seenGifts.clear();

      // Only use diamondCount (cost per single gift) — avoid coinCount/giftValue
      // which may already include repeatCount and would cause double-multiplication
      const perGift  = data.diamondCount
                    || data.giftDetails?.diamondCount
                    || 1;
      const repeat   = data.repeatCount || 1;
      const coins    = Math.max(1, Math.floor(perGift)) * repeat;
      const giftName = data.giftName || data.giftDetails?.giftName || '';
      console.log(`[Gift] ${data.nickname || data.uniqueId} → ${coins} coins (perGift=${perGift} x${repeat}) | gift="${giftName}" (type=${data.giftType})`);
      console.log(`[Gift RAW] diamondCount=${data.diamondCount} giftDetails.diamondCount=${data.giftDetails?.diamondCount} coinCount=${data.coinCount} repeatCount=${data.repeatCount} giftType=${data.giftType} repeatEnd=${data.repeatEnd}`);
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
    if (msg === 'go' || msg === 'blue' || msg === 'red' || msg === 'help') {
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
    const username = data.nickname || data.uniqueId || 'Unknown';
    console.log(`[Member] ${username} joined the stream`);
    onMember?.({
      userId:    String(data.userId),
      username,
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

function _startDemo(onGift, conn, onLike, onChat, onMember) {
  // Demo member joins — viewer enters stream every 8s
  const memberIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onMember) onMember({ userId: u.id, username: u.name, avatarUrl: '' });
  }, 8000);
  conn._demoMemberIv = memberIv;
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

  // Demo arena gifts — various viewers with various coin amounts every 6s
  const arenaGiftNames = ['Rose','Finger Heart','TikTok','Ice Cream','Galaxy'];
  const arenaGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const coins = [1,1,5,10,25,50,100][Math.floor(Math.random()*7)];
    const giftName = arenaGiftNames[Math.floor(Math.random()*arenaGiftNames.length)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins });
  }, 6000);

  // Demo arena help — random warrior writes "help" every 12s
  const arenaHelpIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'help' });
  }, 12000);

  // Demo war gifts — TikTok/Rose/Crown/Heart every ~18s
  const warGiftNames = ['TikTok', 'Rose', 'Crown', 'Heart Me'];
  const warGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const giftName = warGiftNames[Math.floor(Math.random() * warGiftNames.length)];
    const coins = (giftName === 'Crown' || giftName === 'Heart Me') ? 100 : 1;
    console.log(`[Demo WarGift] ${u.name} → ${giftName}`);
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins });
  }, 18000);

  // Attach cleanup to the connection object so the room can clear it
  conn._demoInterval    = iv;
  conn._demoTornadoIv   = tornadoIv;
  conn._demoGoIv        = goIv;
  conn._demoWarIv       = warIv;
  conn._demoWarGiftIv   = warGiftIv;
  conn._demoArenaGiftIv = arenaGiftIv;
  conn._demoArenaHelpIv = arenaHelpIv;
}

module.exports = { connectToTikTok };
