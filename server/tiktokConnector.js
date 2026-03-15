const { WebcastPushConnection } = require('tiktok-live-connector');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

const RETRY_DELAY = 30000; // 30с между попытками

function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat) {
  const notify = onStatus || (() => {});

  // Стабильный handle — на него ссылается Room
  const handle = { _tiktokMode: 'connecting' };

  // Демо-режим сразу если username = demo
  if (username === 'demo') {
    handle._tiktokMode = 'demo';
    console.log(`[TikTok] Демо-режим запущен`);
    notify({ connected: false, mode: 'demo', message: 'Демо-режим' });
    _startDemo(onGift, handle, onLike, onChat, onMember);
    return handle;
  }

  let demoStarted = false;
  let retryTimer = null;

  function stopDemo() {
    clearInterval(handle._demoInterval);
    clearInterval(handle._demoTornadoIv);
    clearInterval(handle._demoGoIv);
    clearInterval(handle._demoWarIv);
    clearInterval(handle._demoWarGiftIv);
    clearInterval(handle._demoArenaGiftIv);
    clearInterval(handle._demoArenaHelpIv);
    clearInterval(handle._demoMemberIv);
    demoStarted = false;
    console.log(`[TikTok][${username}] Демо остановлен`);
  }

  function attempt() {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }

    console.log(`[TikTok][${username}] Попытка подключения…`);

    // НОВЫЙ объект для каждой попытки — ключевое исправление
    const conn = new WebcastPushConnection(username);
    const _seenGifts = new Set();

    conn.on('gift', data => {
      const dedupKey = `${data.userId}_${data.giftId || data.giftName}_${data.repeatCount}_${Math.floor(Date.now()/2000)}`;
      if (_seenGifts.has(dedupKey)) return;
      _seenGifts.add(dedupKey);
      if (_seenGifts.size > 500) _seenGifts.clear();
      const perGift = data.diamondCount || data.giftDetails?.diamondCount || 1;
      const coins   = Math.max(1, Math.floor(perGift));
      const giftName = data.giftName || data.giftDetails?.giftName || '';
      console.log(`[Gift] ${data.nickname || data.uniqueId} → ${coins} coins | gift="${giftName}"`);
      onGift({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', giftName, coins });
    });

    conn.on('like', data => {
      if (!onLike) return;
      const count = data.likeCount || 1;
      onLike({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', likes: count });
    });

    conn.on('chat', data => {
      if (!onChat) return;
      const msg = (data.comment || '').trim().toLowerCase();
      if (msg === 'go' || msg === 'blue' || msg === 'red' || msg === 'help' || msg === 'team' || msg === 'team2') {
        console.log(`[Chat ${msg.toUpperCase()}] ` + (data.nickname || data.uniqueId));
        onChat({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', message: msg });
      }
    });

    conn.on('member', data => {
      const uname = data.nickname || data.uniqueId || 'Unknown';
      onMember?.({ userId: String(data.userId), username: uname, avatarUrl: data.profilePictureUrl || '' });
    });

    conn.on('error', err => console.error(`[TikTok][${username}] Ошибка события:`, err.message || err));

    conn.on('disconnected', () => {
      console.log(`[TikTok][${username}] Отключён, повтор через ${RETRY_DELAY/1000}с`);
      handle._tiktokMode = 'demo';
      notify({ connected: false, mode: 'demo', message: `@${username} отключился, повтор через ${RETRY_DELAY/1000}с…` });
      if (!demoStarted) { demoStarted = true; _startDemo(onGift, handle, onLike, onChat, onMember); }
      retryTimer = setTimeout(attempt, RETRY_DELAY);
    });

    conn.connect()
      .then(s => {
        handle._tiktokMode = 'tiktok';
        if (demoStarted) stopDemo();
        console.log(`[TikTok][${username}] Подключён, room: ${s.roomId}`);
        notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
      })
      .catch(err => {
        const msg = err.message || String(err);
        console.error(`[TikTok][${username}] Не удалось подключиться: ${msg}`);
        handle._tiktokMode = 'demo';
        if (!demoStarted) {
          demoStarted = true;
          notify({ connected: false, mode: 'demo', message: `Демо-режим, повтор через ${RETRY_DELAY/1000}с…` });
          _startDemo(onGift, handle, onLike, onChat, onMember);
        } else {
          notify({ connected: false, mode: 'demo', message: `Повтор через ${RETRY_DELAY/1000}с…` });
        }
        retryTimer = setTimeout(attempt, RETRY_DELAY);
      });
  }

  attempt();
  return handle;
}

function _startDemo(onGift, handle, onLike, onChat, onMember) {
  const memberIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onMember) onMember({ userId: u.id, username: u.name, avatarUrl: '' });
  }, 8000);
  handle._demoMemberIv = memberIv;

  const iv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (Math.random() < 0.4 && onLike) {
      const likes = (Math.floor(Math.random() * 10) + 1) * 5;
      onLike({ userId: u.id, username: u.name, avatarUrl: '', likes });
    } else {
      const coins = Math.floor(Math.random() * 50) + 1;
      onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: '', coins });
    }
  }, 800);
  handle._demoInterval = iv;

  const tornadoIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: 'Donut', coins: 30 });
  }, 50000);
  handle._demoTornadoIv = tornadoIv;

  const goIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'go' });
  }, 4000);
  handle._demoGoIv = goIv;

  const warIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const team = Math.random() < 0.5 ? 'blue' : 'red';
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: team });
  }, 2500);
  handle._demoWarIv = warIv;

  const arenaGiftNames = ['Rose','Finger Heart','TikTok','Ice Cream','Galaxy'];
  const arenaGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const coins = [1,1,5,10,25,50,100][Math.floor(Math.random()*7)];
    const giftName = arenaGiftNames[Math.floor(Math.random()*arenaGiftNames.length)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins });
  }, 6000);
  handle._demoArenaGiftIv = arenaGiftIv;

  const arenaHelpIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'help' });
  }, 12000);
  handle._demoArenaHelpIv = arenaHelpIv;

  const warGiftNames = ['TikTok', 'Rose', 'Crown', 'Heart Me'];
  const warGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const giftName = warGiftNames[Math.floor(Math.random() * warGiftNames.length)];
    const coins = (giftName === 'Crown' || giftName === 'Heart Me') ? 100 : 1;
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins });
  }, 18000);
  handle._demoWarGiftIv = warGiftIv;
}

module.exports = { connectToTikTok };
