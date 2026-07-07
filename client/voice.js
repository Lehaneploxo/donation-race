// ─── Voice Announcer — Street Race ────────────────────────────────────────────
// По мотивам диктора из Arena Battle 3 (arena3.html): очередь фраз через
// speechSynthesis, с теми же обходами для мобильных браузеров.
(function () {
  if (!window.speechSynthesis) {
    window.Voice = { gift: () => {}, disaster: () => {}, newWorld: () => {}, lapComplete: () => {}, newTopDonor: () => {} };
    return;
  }

  function filterNick(n) { return (n || '').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, '').trim(); }
  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function tpl(s, nick) { return s.replace(/\[НИК\]/g, nick); }

  const FILLER = [
    'Машина стоит на месте. Кинь монету — и она поедет!',
    'Тишина на трассе... даже двигатель заскучал.',
    '1 монета — это 100 метров пути. Не жалей!',
    'Лайкай — машина тоже едет от лайков, по метру за штуку.',
    'Наша машина никуда не торопится... потому что некуда — донатов нет.',
    'Кто-то смотрит и не кидает монеты. Мы всё видим.',
    'Дорога ждёт. Машина ждёт. Донат — не ждёт, кидай уже.',
    'Без доната далеко не уедем. Помоги общей машине!',
  ];
  const GIFT = [
    '[НИК] закинул монеты — машина рвётся вперёд!',
    '[НИК] жмёт на газ! Общими усилиями едем дальше!',
    'Ух ты! [НИК] разогнал нашу машину!',
    '[НИК] — двигатель доволен! Едем!',
    'Спасибо, [НИК]! Ещё немного — и следующая карта ближе!',
    '[НИК] не пожалел монет — красота!',
  ];
  const DISASTER = {
    tornado: ['Торнадо на трассе! Держитесь!', 'Внимание — торнадо!'],
    tsunami: ['Цунами накрывает дорогу!', 'Волна идёт — приготовьтесь!'],
    meteor:  ['Метеоритный дождь! Ложись!', 'С неба падают метеориты!'],
    nitro:   ['Нитро-ускорение! Полетели!', 'Кто-то нажал на турбо!'],
    flood:   ['Наводнение заливает дорогу!', 'Вода поднимается — потоп!'],
    ufo:     ['НЛО над трассой! Не паникуем!', 'Инопланетяне решили заглянуть!'],
    crash:   ['Авария на дороге!', 'Массовая авария! Осторожно!'],
  };
  const NEW_WORLD = [
    'Впереди новая локация — [МЕСТО]!',
    'Въезжаем в [МЕСТО]!',
    'Добро пожаловать в [МЕСТО]!',
  ];
  const LAP_COMPLETE = [
    'Круг пройден! Общий пробег — [КМ] километров!',
    'Отличная работа! Проехали ещё один полный круг — [КМ] км на счётчике!',
  ];
  const NEW_TOP_DONOR = [
    '[НИК] — новый лидер всех донатов! Уважение!',
    'У нас новый король топа — [НИК]!',
    '[НИК] обошёл всех по донатам за всё время!',
  ];

  let queue = [], speaking = false, quietPool = [], rulesTimer = null, started = false;
  let _cachedVoice = null;

  function getVoice() {
    if (_cachedVoice) return _cachedVoice;
    const voices = window.speechSynthesis.getVoices();
    _cachedVoice = voices.find(v => /pavel/i.test(v.name))
      || voices.find(v => /ru/i.test(v.lang) && /male/i.test(v.name))
      || voices.find(v => /ru[-_]/i.test(v.lang))
      || voices.find(v => /ru/i.test(v.lang))
      || voices.find(v => v.default)
      || voices[0]
      || null;
    return _cachedVoice;
  }

  let _speechUnlocked = false;
  function _unlockSpeech() {
    if (_speechUnlocked) return;
    _speechUnlocked = true;
    try { const s = new SpeechSynthesisUtterance(''); s.volume = 0; window.speechSynthesis.speak(s); } catch (e) {}
  }
  // iOS Safari усыпляет speechSynthesis без событий — периодически будим.
  setInterval(() => {
    try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch (e) {}
  }, 4000);

  function speakText(text, onDone) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU'; u.rate = 1.12; u.volume = 1;
    const v = getVoice(); if (v) u.voice = v;
    let done = false;
    const finish = () => { if (done) return; done = true; onDone(); };
    u.onend = u.onerror = finish;
    setTimeout(finish, 8000);
    try { window.speechSynthesis.speak(u); } catch (e) { finish(); }
  }

  function speakNext() {
    if (speaking || queue.length === 0) { if (!speaking) scheduleFiller(); return; }
    clearTimeout(rulesTimer);
    speaking = true;
    speakText(queue.shift(), () => { speaking = false; setTimeout(speakNext, 700); });
  }

  function enqueue(text, urgent) {
    if (urgent) { window.speechSynthesis.cancel(); speaking = false; queue.unshift(text); }
    else queue.push(text);
    if (queue.length > 6) queue.length = 6; // при шквале донатов не копим бесконечную очередь
    clearTimeout(rulesTimer);
    speakNext();
  }

  function nextFiller() {
    if (quietPool.length === 0) quietPool = [...FILLER].sort(() => Math.random() - 0.5);
    return quietPool.shift();
  }

  function scheduleFiller() {
    clearTimeout(rulesTimer);
    rulesTimer = setTimeout(() => {
      if (speaking || queue.length > 0) return;
      speaking = true;
      speakText(nextFiller(), () => {
        speaking = false;
        setTimeout(() => { queue.length > 0 ? speakNext() : scheduleFiller(); }, 1200);
      });
    }, 22000);
  }

  window.Voice = {
    gift: function (nick, coins) {
      const n = filterNick(nick); if (!n) return;
      if ((Number(coins) || 0) < 5) return; // мелкие донаты — только звук, без озвучки (иначе спам)
      enqueue(tpl(rnd(GIFT), n), true);
    },
    disaster: function (type) {
      const pool = DISASTER[type]; if (!pool) return;
      enqueue(rnd(pool), false);
    },
    newWorld: function (placeName) {
      enqueue(rnd(NEW_WORLD).replace(/\[МЕСТО\]/g, placeName || 'новую зону'), false);
    },
    lapComplete: function (km) {
      enqueue(rnd(LAP_COMPLETE).replace(/\[КМ\]/g, km), false);
    },
    newTopDonor: function (nick) {
      const n = filterNick(nick); if (!n) return;
      enqueue(tpl(rnd(NEW_TOP_DONOR), n), false);
    },
  };

  window.speechSynthesis.onvoiceschanged = () => { _cachedVoice = null; getVoice(); };

  function start() { if (started) return; started = true; _unlockSpeech(); scheduleFiller(); }
  window._voiceStart = start;
  start();
})();
