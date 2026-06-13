const { WebcastPushConnection, signatureProvider } = require('tiktok-live-connector');

signatureProvider.signEvents.on('signSuccess', d => {
  console.log(`[TikTok-sign] ✅ OK host=${d.signHost} msToken=${d.cookieJar&&d.cookieJar.getCookieByName('msToken')?'set':'missing'}`);
});
signatureProvider.signEvents.on('signError', d => {
  console.log(`[TikTok-sign] ❌ FAIL host=${d.signHost} err=${d.error&&d.error.message}`);
});

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

const SESSION_ID = process.env.TIKTOK_SESSION_ID || '';

if (SESSION_ID) {
  console.log('[TikTok] sessionId найден — используем для polling');
} else {
  console.log('[TikTok] sessionId НЕ задан — только WebSocket (может не работать)');
}

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

    console.log(`[TikTok][${username}] Попытка подключения… sessionId=${SESSION_ID ? 'есть' : 'НЕТ'}`);

    connection = new WebcastPushConnection(username, {
      sessionId:              SESSION_ID || undefined,
      fetchRoomInfoOnConnect: false,
      enableRequestPolling:   true,
      processInitialData:     false,   // не обрабатываем буфер — только живые события
    });

    connection.on('gift', (data) => {
      const nick  = data.nickname || data.uniqueId || 'Unknown';
      const coins = Math.max(1, Math.floor(data.diamondCount || 1));
      console.log(`[TikTok] 🎁 ${nick} gift="${data.giftName||''}" coins=${coins}`);
      onGift({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
        giftName:  data.giftName || '',
        coins,
      });
    });

    connection.on('like', (data) => {
      if (!onLike) return;
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] ❤️ ${nick} likes=${data.likeCount||1}`);
      onLike({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
        likes:     data.likeCount || 1,
      });
    });

    connection.on('chat', (data) => {
      if (!onChat) return;
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] 💬 ${nick}: "${data.comment||''}"`);
      onChat({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
        message:   data.comment || '',
      });
    });

    connection.on('member', (data) => {
      if (!onMember) return;
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] 👤 ${nick} joined`);
      onMember({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
      });
    });

    connection.on('follow', (data) => {
      if (!onMember) return;
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] ➕ ${nick} followed`);
      onMember({
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
      });
    });

    connection.on('disconnected', () => {
      console.log(`[TikTok][${username}] Отключился — retry через 30с`);
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
      const msg = err && (err.info || err.message || String(err));
      console.error(`[TikTok][${username}] ❌ ${msg}`);
    });

    connection.connect()
      .then(() => {
        console.log(`[TikTok][${username}] ✅ Подключён!`);
        handle._tiktokMode = 'tiktok';
        _stopDemo(handle);
        notify({ connected: true, mode: 'tiktok', message: `Подключён к @${username}` });
      })
      .catch((err) => {
        const errMsg = err.message || String(err);
        console.error(`[TikTok][${username}] ❌ Ошибка: ${errMsg}`);
        handle._lastError = errMsg;
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
  const keys = ['_demoInterval','_demoTornadoIv','_demoGoIv','_demoWarIv',
                 '_demoWarGiftIv','_demoArenaGiftIv','_demoArenaHelpIv','_demoMemberIv','_demoRatingIv'];
  keys.forEach(k => { if (handle[k]) { clearInterval(handle[k]); handle[k] = null; } });
  if (handle._demoStarted) {
    handle._demoStarted = false;
    console.log('[TikTok] Демо остановлен — подключён к стриму');
  }
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

  handle._demoRatingIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    if (onChat) onChat({ userId: u.id, username: u.name, avatarUrl: '', message: 'rating' });
  }, 6000);

  handle._demoWarGiftIv = setInterval(() => {
    const u = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
    const giftName = ['TikTok','Rose','Crown','Heart Me'][Math.floor(Math.random()*4)];
    onGift({ userId: u.id, username: u.name, avatarUrl: '', giftName, coins: (giftName==='Crown'||giftName==='Heart Me')?100:1 });
  }, 18000);
}

module.exports = { connectToTikTok };
