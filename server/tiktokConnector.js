const { WebcastPushConnection } = require('tiktok-live-connector');

const SIGN_API_KEY = process.env.SIGN_API_KEY || '';
if (SIGN_API_KEY) console.log('[TikTok-sign] SIGN_API_KEY задан — eulerstream подпись включена');
else              console.log('[TikTok-sign] SIGN_API_KEY НЕ задан — eulerstream без ключа (free tier)');

const DEMO_USERS = [
  { id: 'd1', name: 'SuperFan_Anya' }, { id: 'd2', name: 'TikTokKing99' },
  { id: 'd3', name: 'Donator_Pro' },   { id: 'd4', name: 'StreamQueen' },
  { id: 'd5', name: 'BigSpender' },    { id: 'd6', name: 'LuckyViewer' },
  { id: 'd7', name: 'TopFan2024' },    { id: 'd8', name: 'CoolDude88' },
  { id: 'd9', name: 'PurpleStar' },    { id: 'd10', name: 'NightOwl' },
  { id: 'd11', name: 'SpeedRunner' },  { id: 'd12', name: 'GoldRush' },
];

const SESSION_ID = process.env.TIKTOK_SESSION_ID || '';
const MS_TOKEN   = process.env.TIKTOK_MS_TOKEN   || '';
const TARGET_IDC = process.env.TIKTOK_TARGET_IDC || 'alisg';

if (SESSION_ID) console.log(`[TikTok] sessionId найден, target-idc=${TARGET_IDC}`);
else            console.log('[TikTok] sessionId НЕ задан');
if (MS_TOKEN)   console.log('[TikTok] msToken найден');
else            console.log('[TikTok] msToken НЕ задан');

function connectToTikTok(username, onGift, onStatus, onMember, onLike, onChat, onFollow) {
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
  // Счётчик подряд идущих обрывов живого соединения — растягиваем паузу перед
  // retry экспоненциально, если рвётся раз за разом (флаппинг), чтобы не
  // долбить eulerstream/TikTok на каждую попытку и не словить rate_limit.
  // Сбрасывается, если соединение продержалось стабильно минуту.
  let disconnectStreak = 0;
  let stableTimer = null;

  function scheduleRetry(delayMs) {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(tryOnce, delayMs);
  }

  handle.stop = function() {
    handle._stopped = true;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
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
      ttTargetIdc:            SESSION_ID ? TARGET_IDC : undefined,
      fetchRoomInfoOnConnect: false,
      enableRequestPolling:   true,
      processInitialData:     false,
      webClientHeaders:       MS_TOKEN ? { Cookie: `msToken=${MS_TOKEN}` } : {},
    });

    connection.on('gift', (data) => {
      // giftType===1 — комбируемый подарок (можно слать стриком). Пока стрик
      // идёт (repeatEnd=false), repeatCount — это НАРАСТАЮЩИЙ счётчик текущего
      // стрика (не "+1 новый подарок"), и событие фигачит на каждый тик. Если
      // засчитывать каждое такое промежуточное событие как diamondCount монет,
      // часть быстрого комбо теряется (учитываются не все промежуточные тики).
      // Официальная рекомендация библиотеки — ждать финальное событие
      // (repeatEnd=true) и брать diamondCount * repeatCount как итог стрика.
      if (data.giftType === 1 && !data.repeatEnd) return;
      const nick  = data.nickname || data.uniqueId || 'Unknown';
      const repeatCount = Math.max(1, Math.floor(data.repeatCount || 1));
      const coins = Math.max(1, Math.floor((data.diamondCount || 1) * repeatCount));
      console.log(`[TikTok] 🎁 ${nick} gift="${data.giftName||''}" x${repeatCount} coins=${coins}`);
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
      console.log(`[TikTok] ❤️ ${nick} likes=${data.likeCount||1} followRole=${data.followRole}`);
      onLike({
        userId:     String(data.userId || data.uniqueId || 'u'),
        username:   nick,
        avatarUrl:  data.profilePictureUrl || '',
        likes:      data.likeCount || 1,
        // followRole: 0=не подписан, 1=подписан, 2=взаимно (друзья) — актуальный
        // статус подписки ПРЯМО СЕЙЧАС, а не только "только что подписался".
        // Нужен для «Разноса»: иначе зрители, подписанные ДО начала эфира,
        // никогда не проходили бы проверку (событие 'follow' у них не всплывает).
        followRole: data.followRole,
      });
    });

    connection.on('chat', (data) => {
      if (!onChat) return;
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] 💬 ${nick}: "${data.comment||''}" followRole=${data.followRole}`);
      onChat({
        userId:     String(data.userId || data.uniqueId || 'u'),
        username:   nick,
        avatarUrl:  data.profilePictureUrl || '',
        message:    data.comment || '',
        followRole: data.followRole,
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
      const nick = data.nickname || data.uniqueId || 'Unknown';
      console.log(`[TikTok] ➕ ${nick} followed`);
      const payload = {
        userId:    String(data.userId || data.uniqueId || 'u'),
        username:  nick,
        avatarUrl: data.profilePictureUrl || '',
      };
      // follow остаётся видимым как обычный member (не менять — на нём завязан
      // спавн бойцов в Arena-играх), onFollow — отдельный необязательный колбэк
      // для "Взаимок", где нужно отличать реальную подписку от простого захода
      if (onMember) onMember(payload);
      if (onFollow) onFollow(payload);
    });

    connection.on('disconnected', (info) => {
      // диагностика: код/причина закрытия WebSocket помогают понять, кто
      // рвёт соединение — TikTok (код с их стороны) или сеть/таймаут
      const code = info && info.code, reason = info && info.reason;
      // Это разрыв УЖЕ ЖИВОГО соединения (стрим шёл, зрители могли донатить
      // в любой момент) — раньше ждали 30с до retry, и любой донат, отправленный
      // в это окно, терялся навсегда (TikTok не повторяет пропущенные события).
      // Библиотека уже переподключается быстро (WS + heartbeat), так что держим
      // паузу перед retry минимальной — но растягиваем её экспоненциально при
      // повторных обрывах подряд (флаппинг), чтобы не долбить eulerstream/TikTok.
      if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
      disconnectStreak++;
      const retryDelay = Math.min(3000 * Math.pow(2, disconnectStreak - 1), 60000);
      console.log(`[TikTok][${username}] Отключился (code=${code}, reason=${reason||'—'}) — retry через ${Math.round(retryDelay/1000)}с (обрыв #${disconnectStreak} подряд)`);
      connection = null;
      handle._tiktokMode = 'demo';
      notify({ connected: false, mode: 'demo', message: `@${username} вышел из эфира` });
      if (!handle._demoStarted) {
        handle._demoStarted = true;
        _startDemo(onGift, handle, onLike, onChat, onMember);
      }
      if (!handle._stopped) scheduleRetry(retryDelay);
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
        // продержались минуту без обрыва — считаем флаппинг закончившимся,
        // следующий одиночный обрыв снова получит быстрый retry (3с)
        if (stableTimer) clearTimeout(stableTimer);
        stableTimer = setTimeout(() => { disconnectStreak = 0; }, 60000);
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
        // при rate_limit от сервиса подписи (eulerstream) обычный ретрай раз в
        // 60с только продлевает блокировку — каждая попытка внутри лимита
        // засчитывается заново. Отступаем намного дольше (15 мин), чтобы дать
        // окну лимита реально закрыться, а не долбить его бесконечно.
        const isRateLimited = /rate_limit|rate limited/i.test(errMsg);
        if (!handle._stopped) scheduleRetry(isRateLimited ? 15 * 60000 : 60000);
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
