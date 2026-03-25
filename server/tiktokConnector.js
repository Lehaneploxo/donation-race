const { TikTokLive } = require('@tiktool/live');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

const API_KEY = process.env.TIKTOOL_API_KEY || '';

function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat) {
  const notify = onStatus || (() => {});
  const handle = { _tiktokMode: 'connecting' };

  if (username === 'demo') {
    handle._tiktokMode = 'demo';
    notify({ connected: false, mode: 'demo', message: 'Демо-режим' });
    _startDemo(onGift, handle, onLike, onChat, onMember);
    return handle;
  }

  let retryTimer = null;
  let reconnectTimer = null;
  let live = null;

  function scheduleRetry(delayMs) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(tryOnce, delayMs);
  }

  function tryOnce() {
    if (live) { try { live.disconnect(); } catch(e) {} live = null; }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

    console.log(`[TikTok][${username}] Попытка подключения…`);

    live = new TikTokLive({ uniqueId: username, apiKey: API_KEY });

    const seenGifts = new Set();
    live.on('gift', e => {
      const d = e.data || e;
      const user = d.user || {};
      const key = `${user.userId}_${d.giftId||d.giftName}_${Math.floor(Date.now()/2000)}`;
      if (seenGifts.has(key)) return;
      seenGifts.add(key); if (seenGifts.size > 500) seenGifts.clear();
      const coins = Math.max(1, Math.floor(d.diamondCount || d.giftDetails?.diamondCount || 1));
      onGift({
        userId: String(user.userId || user.uniqueId || 'u'),
        username: user.nickname || user.uniqueId || 'Unknown',
        avatarUrl: user.avatarUrl || user.profilePictureUrl || '',
        giftName: d.giftName || '',
        coins
      });
    });

    live.on('like', e => {
      if (!onLike) return;
      const d = e.data || e;
      const user = d.user || {};
      onLike({
        userId: String(user.userId || user.uniqueId || 'u'),
        username: user.nickname || user.uniqueId || 'Unknown',
        avatarUrl: user.avatarUrl || '',
        likes: d.likeCount || d.likes || 1
      });
    });

    live.on('chat', e => {
      if (!onChat) return;
      const d = e.data || e;
      const user = d.user || {};
      const msg = (d.comment || d.message || '').trim().toLowerCase();
      if (['go','blue','red','help','team','team2','rating','power','super power','bot','botmax'].includes(msg) || msg.startsWith('boost '))
        onChat({
          userId: String(user.userId || user.uniqueId || 'u'),
          username: user.nickname || user.uniqueId || 'Unknown',
          avatarUrl: user.avatarUrl || '',
          message: msg
        });
    });

    live.on('member', e => {
      if (!onMember) return;
      const d = e.data || e;
      const user = d.user || {};
      onMember({
        userId: String(user.userId || user.uniqueId || 'u'),
        username: user.nickname || user.uniqueId || 'Unknown',
        avatarUrl: user.avatarUrl || ''
      });
    });

    live.on('connected', () => {
      console.log(`[TikTok][${username}] ✅ Подключён!`);
      handle._tiktokMode = 'tiktok';
      _stopDemo(handle);
      notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
      // Sandbox: max 5 min session — переподключаемся каждые 4.5 мин
      reconnectTimer = setTimeout(() => {
        console.log(`[TikTok][${username}] ♻️ Переподключение (sandbox limit)…`);
        tryOnce();
      }, 4.5 * 60 * 1000);
    });

    live.on('disconnected', () => {
      console.log(`[TikTok][${username}] Отключился от стрима`);
      handle._tiktokMode = 'demo';
      notify({ connected: false, mode: 'demo', message: `@${username} вышел из эфира` });
      if (!handle._demoStarted) {
        handle._demoStarted = true;
        _startDemo(onGift, handle, onLike, onChat, onMember);
      }
      scheduleRetry(15000);
    });

    live.on('error', err => {
      console.error(`[TikTok][${username}] event error:`, (err && err.message) || err);
    });

    live.connect().catch(err => {
      console.error(`[TikTok][${username}] ❌ Ошибка: ${err.message || err} | retry через 30с`);
      handle._tiktokMode = 'demo';
      if (!handle._demoStarted) {
        handle._demoStarted = true;
        notify({ connected: false, mode: 'demo', message: `@${username} не в эфире, жду подключения…` });
        _startDemo(onGift, handle, onLike, onChat, onMember);
      }
      scheduleRetry(30000);
    });
  }

  tryOnce();
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
