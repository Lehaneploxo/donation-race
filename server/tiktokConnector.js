const { WebcastPushConnection } = require('tiktok-live-connector');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

const SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
const PORT       = process.env.PORT || 3000;

function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat) {
  const notify = onStatus || (() => {});
  const handle = { _tiktokMode: 'connecting' };

  if (username === 'demo') {
    handle._tiktokMode = 'demo';
    notify({ connected: false, mode: 'demo', message: 'Демо-режим' });
    _startDemo(onGift, handle, onLike, onChat, onMember);
    return handle;
  }

  let connection = null;
  let retryTimer = null;

  function scheduleRetry(delayMs) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(tryOnce, delayMs);
  }

  handle.stop = function() {
    handle._stopped = true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (connection) { try { connection.disconnect(); } catch(e) {} connection = null; }
    handle._tiktokMode = 'demo';
    console.log(`[TikTok][${username}] ⏸ Пауза (нет зрителей)`);
  };

  handle.restart = function() {
    if (handle._stopped) {
      handle._stopped = false;
      console.log(`[TikTok][${username}] ▶️ Возобновление (зритель вошёл)`);
      tryOnce();
    }
  };

  function tryOnce() {
    if (handle._stopped) return;
    if (connection) { try { connection.disconnect(); } catch(e) {} connection = null; }

    console.log(`[TikTok][${username}] Попытка подключения…`);

    connection = new WebcastPushConnection(username, {
      sessionId: SESSION_ID,
      fetchRoomInfoOnConnect: false,
      signProviderOptions: {
        signProviderHost: `http://localhost:${PORT}`,
        enabled: true,
      },
    });

    connection.on('gift', (data) => {
      const coins = Math.max(1, Math.floor(data.diamondCount || 1));
      onGift({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
        giftName:  data.giftName || '',
        coins,
      });
    });

    connection.on('like', (data) => {
      if (!onLike) return;
      onLike({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
        likes:     data.likeCount || 1,
      });
    });

    connection.on('chat', (data) => {
      if (!onChat) return;
      const msg = (data.comment || '').trim().toLowerCase();
      if (['go','blue','red','help','team','team2','rating','power','super power','bot','botmax'].includes(msg) || msg.startsWith('boost '))
        onChat({
          userId:    String(data.userId || data.uniqueId || 'u'),
          username:  data.nickname || data.uniqueId || 'Unknown',
          avatarUrl: data.profilePictureUrl || '',
          message:   msg,
        });
    });

    connection.on('member', (data) => {
      console.log(`[TikTok] member raw: ${JSON.stringify(data).slice(0,200)}`);
      if (!onMember) return;
      onMember({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
      });
    });

    connection.on('follow', (data) => {
      if (!onMember) return;
      onMember({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  data.nickname || data.uniqueId || 'Unknown',
        avatarUrl: data.profilePictureUrl || '',
      });
    });

    connection.on('gift', (data) => {
      console.log(`[TikTok] gift raw: ${JSON.stringify(data).slice(0,200)}`);
    });

    connection.on('disconnected', () => {
      console.log(`[TikTok][${username}] Отключился`);
      connection = null;
      handle._tiktokMode = 'demo';
      notify({ connected: false, mode: 'demo', message: `@${username} вышел из эфира` });
      if (!handle._demoStarted) {
        handle._demoStarted = true;
        _startDemo(onGift, handle, onLike, onChat, onMember);
      }
      if (!handle._stopped) scheduleRetry(30000);
    });

    connection.on('error', (err) => {
      console.error(`[TikTok][${username}] ❌ ${err.message || err}`);
    });

    // Логируем ВСЕ события чтобы понять что приходит
    const _origEmit = connection.emit.bind(connection);
    connection.emit = function(event, ...args) {
      if (!['connected','disconnected','error','rawData'].includes(event)) {
        console.log(`[TikTok] event="${event}" data=${JSON.stringify(args[0]||{}).slice(0,150)}`);
      }
      return _origEmit(event, ...args);
    };

    connection.connect()
      .then(() => {
        console.log(`[TikTok][${username}] ✅ Подключён!`);
        handle._tiktokMode = 'tiktok';
        _stopDemo(handle);
        notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
      })
      .catch((err) => {
        console.error(`[TikTok][${username}] ❌ Ошибка подключения: ${err.message || err}`);
        connection = null;
        handle._tiktokMode = 'demo';
        if (!handle._demoStarted) {
          handle._demoStarted = true;
          notify({ connected: false, mode: 'demo', message: `@${username} не в эфире, жду…` });
          _startDemo(onGift, handle, onLike, onChat, onMember);
        }
        if (!handle._stopped) scheduleRetry(60000);
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
