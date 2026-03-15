const { WebcastPushConnection } = require('tiktok-live-connector');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat) {
  const notify = onStatus || (() => {});
  const handle = { _tiktokMode: 'connecting' };

  if (username === 'demo') {
    handle._tiktokMode = 'demo';
    notify({ connected: false, mode: 'demo', message: 'Демо-режим' });
    _startDemo(onGift, handle, onLike, onChat, onMember);
    return handle;
  }

  let connecting = false;  // защита от параллельных попыток

  function tryOnce() {
    if (connecting) return;  // уже пытаемся — ждём
    connecting = true;
    console.log(`[TikTok][${username}] Попытка подключения…`);

    const conn = new WebcastPushConnection(username);

    // ── Обработчики TikTok событий ──
    const seenGifts = new Set();
    conn.on('gift', data => {
      const key = `${data.userId}_${data.giftId||data.giftName}_${data.repeatCount}_${Math.floor(Date.now()/2000)}`;
      if (seenGifts.has(key)) return;
      seenGifts.add(key); if (seenGifts.size > 500) seenGifts.clear();
      const coins = Math.max(1, Math.floor(data.diamondCount || data.giftDetails?.diamondCount || 1));
      const giftName = data.giftName || data.giftDetails?.giftName || '';
      onGift({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', giftName, coins });
    });
    conn.on('like', data => {
      if (!onLike) return;
      onLike({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', likes: data.likeCount || 1 });
    });
    conn.on('chat', data => {
      if (!onChat) return;
      const msg = (data.comment || '').trim().toLowerCase();
      if (['go','blue','red','help','team','team2'].includes(msg))
        onChat({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '', message: msg });
    });
    conn.on('member', data => {
      onMember?.({ userId: String(data.userId), username: data.nickname || data.uniqueId || 'Unknown', avatarUrl: data.profilePictureUrl || '' });
    });
    conn.on('error', err => console.error(`[TikTok][${username}] event error:`, err.message || err));
    conn.on('disconnected', () => {
      console.log(`[TikTok][${username}] Отключился от стрима`);
      handle._tiktokMode = 'demo';
      notify({ connected: false, mode: 'demo', message: `@${username} вышел из эфира` });
      connecting = false;
      // демо уже запущено, просто ждём следующего retry
    });

    conn.connect()
      .then(s => {
        console.log(`[TikTok][${username}] ✅ Подключён! room: ${s.roomId}`);
        handle._tiktokMode = 'tiktok';
        // Останавливаем демо если работало
        _stopDemo(handle);
        notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
        connecting = false;
      })
      .catch(err => {
        console.error(`[TikTok][${username}] ❌ Ошибка: ${err.message || err}`);
        handle._tiktokMode = 'demo';
        if (!handle._demoStarted) {
          handle._demoStarted = true;
          notify({ connected: false, mode: 'demo', message: `Демо-режим (@${username} не в эфире или ошибка сети)` });
          _startDemo(onGift, handle, onLike, onChat, onMember);
        }
        connecting = false;
      });
  }

  // Первая попытка сразу
  tryOnce();

  // Повтор каждые 10 секунд — до победного
  setInterval(tryOnce, 10000);

  return handle;
}

function _stopDemo(handle) {
  if (!handle._demoStarted) return;
  const keys = ['_demoInterval','_demoTornadoIv','_demoGoIv','_demoWarIv',
                 '_demoWarGiftIv','_demoArenaGiftIv','_demoArenaHelpIv','_demoMemberIv'];
  keys.forEach(k => { clearInterval(handle[k]); handle[k] = null; });
  handle._demoStarted = false;
  console.log('[TikTok] Демо остановлен — подключён к стриму');
}

function _startDemo(onGift, handle, onLike, onChat, onMember) {
  handle._demoMemberIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onMember) onMember({ userId: u.id, username: u.name, avatarUrl: '' });
  }, 8000);

  handle._demoInterval = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (Math.random() < 0.4 && onLike) {
      onLike({ userId: u.id, username: u.name, avatarUrl: '', likes: (Math.floor(Math.random()*10)+1)*5 });
    } else {
      onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: '', coins: Math.floor(Math.random()*50)+1 });
    }
  }, 800);

  handle._demoTornadoIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: 'Donut', coins: 30 });
  }, 50000);

  handle._demoGoIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'go' });
  }, 4000);

  handle._demoWarIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: Math.random()<0.5?'blue':'red' });
  }, 2500);

  handle._demoArenaGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const coins = [1,1,5,10,25,50,100][Math.floor(Math.random()*7)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName: ['Rose','Finger Heart','TikTok','Ice Cream','Galaxy'][Math.floor(Math.random()*5)], coins });
  }, 6000);

  handle._demoArenaHelpIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'help' });
  }, 12000);

  handle._demoWarGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const giftName = ['TikTok','Rose','Crown','Heart Me'][Math.floor(Math.random()*4)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins: (giftName==='Crown'||giftName==='Heart Me')?100:1 });
  }, 18000);
}

module.exports = { connectToTikTok };
