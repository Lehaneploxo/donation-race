let pool = null;

try {
  const { Pool } = require('pg');
  if (process.env.DATABASE_URL) {
    const isInternal = process.env.DATABASE_URL.includes('.railway.internal');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isInternal ? false : { rejectUnauthorized: false },
    });
    console.log('[DB] PostgreSQL pool создан');
  } else {
    console.warn('[DB] DATABASE_URL не задан — убийства не сохраняются');
  }
} catch (e) {
  console.error('[DB] Ошибка инициализации pg:', e.message);
}

async function init() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kills (
      username TEXT PRIMARY KEY,
      total_kills INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boss_damage (
      username TEXT PRIMARY KEY,
      total_damage INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS race_donations (
      username TEXT PRIMARY KEY,
      total_coins INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxing_stolen (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE boxing_stolen ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boxing_stolen ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);

  // ── Недельный рейтинг "Пояс чемпиона" (2026-08-08, RU-версия бокса ТОЛЬКО,
  // EN не трогаем) — 1-в-1 схема Street Fighter, см. streetfighter_stolen ниже
  // для подробных комментариев по каждому полю.
  await pool.query(`ALTER TABLE boxing_stolen ADD COLUMN IF NOT EXISTS lifetime_stolen INTEGER NOT NULL DEFAULT 0`);
  // перенос уже накопленного total_stolen в lifetime_stolen один раз — у
  // реальных игроков уже много очков за всё время, уровень не должен сгореть
  await pool.query(`UPDATE boxing_stolen SET lifetime_stolen = total_stolen WHERE lifetime_stolen = 0 AND total_stolen > 0`);
  await pool.query(`ALTER TABLE boxing_stolen ADD COLUMN IF NOT EXISTS weekly_belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boxing_stolen ADD COLUMN IF NOT EXISTS weekly_king_wins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxing_weekly_kings (
      id SERIAL PRIMARY KEY,
      week_start TIMESTAMPTZ NOT NULL,
      username TEXT NOT NULL,
      weekly_belt_seconds INTEGER NOT NULL,
      weekly_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxing_weekly_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxing_stolen_en (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE boxing_stolen_en ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boxing_stolen_en ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetfighter_stolen (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  // выбор героя командой "skin1".."skin5" в чате — закрепляется за ником
  // навсегда (переживает рестарты стрима/сервера), NULL = скин случайный,
  // как раньше
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS chosen_skin INTEGER`);

  // ── Недельный рейтинг "Король улиц" (2026-08-04) ──
  // total_stolen теперь ЕЖЕНЕДЕЛЬНЫЙ показатель (обнуляется по понедельникам,
  // см. performStreetFighterWeeklyResetIfNeeded) — именно он двигает место в
  // топе и корону текущего чемпиона. lifetime_stolen — ОТДЕЛЬНЫЙ счётчик,
  // копится параллельно с каждым ударом и НИКОГДА не обнуляется — от него
  // считается уровень/ранг игрока (levelOf на клиенте), чтобы прогресс
  // уровня не сгорал при еженедельном сбросе очков.
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS lifetime_stolen INTEGER NOT NULL DEFAULT 0`);
  // при первом добавлении колонки переносим уже накопленное total_stolen в
  // lifetime_stolen один раз (иначе уровень всех игроков обнулился бы в
  // момент выката фичи) — условие lifetime_stolen=0 делает это безопасным
  // при повторных запусках init() (после первого переноса больше не сработает)
  await pool.query(`UPDATE streetfighter_stolen SET lifetime_stolen = total_stolen WHERE lifetime_stolen = 0 AND total_stolen > 0`);
  // weekly_belt_seconds — время с короной именно на текущей неделе (обнуляется
  // вместе с total_stolen), хранится для истории/статистики, но с 2026-08-08
  // больше НЕ решает победителя недели; weekly_king_wins — сколько раз игрок
  // ВЫИГРЫВАЛ неделю (у кого было больше total_stolen на момент сброса) —
  // это уже вечный счётчик, не обнуляется, показывается как "👑×N"
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS weekly_belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE streetfighter_stolen ADD COLUMN IF NOT EXISTS weekly_king_wins INTEGER NOT NULL DEFAULT 0`);
  // архив победителей недели — навсегда, не связан со сбрасываемыми полями выше
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetfighter_weekly_kings (
      id SERIAL PRIMARY KEY,
      week_start TIMESTAMPTZ NOT NULL,
      username TEXT NOT NULL,
      weekly_belt_seconds INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // 2026-08-08: победитель недели теперь определяется по очкам (weekly_points =
  // total_stolen на момент сброса), а не по времени с короной — weekly_belt_seconds
  // в архиве остаётся как было (для истории), просто больше не решает победителя
  await pool.query(`ALTER TABLE streetfighter_weekly_kings ADD COLUMN IF NOT EXISTS weekly_points INTEGER NOT NULL DEFAULT 0`);
  // единственная строка (id=1) — когда был выполнен последний еженедельный
  // сброс, чтобы не потерять момент сброса при перезапуске/падении сервера
  // (см. performStreetFighterWeeklyResetIfNeeded — при старте сервер сверяет
  // эту метку и, если понедельник уже прошёл, досчитывает сброс сразу)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetfighter_weekly_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);

  console.log('[DB] Таблицы kills, boss_damage, race_donations, boxing_stolen, boxing_stolen_en и streetfighter_stolen готовы');
}

async function addBossDamage(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO boss_damage (username, total_damage)
    VALUES ($1, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_damage = boss_damage.total_damage + $2
  `, [username, Math.floor(amount)]);
}

async function getTopBossDamage(limit = 10) {
  if (!pool) return [];
  const res = await pool.query(
    'SELECT username, total_damage FROM boss_damage ORDER BY total_damage DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

async function resetBossDamage() {
  if (!pool) return;
  await pool.query('DELETE FROM boss_damage');
}

async function getUserBossDamageRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_damage,
           RANK() OVER (ORDER BY total_damage DESC) AS rank
    FROM boss_damage
  `);
  const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
  return row ? { rank: Number(row.rank), total_damage: Number(row.total_damage) } : null;
}

async function addKill(username) {
  if (!pool || !username) return;
  await pool.query(`
    INSERT INTO kills (username, total_kills)
    VALUES ($1, 1)
    ON CONFLICT (username)
    DO UPDATE SET total_kills = kills.total_kills + 1
  `, [username]);
}

async function getTopKillers(limit = 10) {
  if (!pool) return [];
  const res = await pool.query(
    'SELECT username, total_kills FROM kills ORDER BY total_kills DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

async function getUserRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_kills,
           RANK() OVER (ORDER BY total_kills DESC) AS rank
    FROM kills
  `);
  const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
  return row ? { rank: Number(row.rank), total_kills: Number(row.total_kills) } : null;
}

async function addRaceCoins(username, coins) {
  if (!pool || !username || !coins) return;
  await pool.query(`
    INSERT INTO race_donations (username, total_coins)
    VALUES ($1, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_coins = race_donations.total_coins + $2
  `, [username, Math.floor(coins)]);
}

async function getTopRaceDonations(limit = 10) {
  if (!pool) return [];
  const res = await pool.query(
    'SELECT username, total_coins FROM race_donations ORDER BY total_coins DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

// Фабрика boxing-функций, параметризованная именем таблицы — используется
// и для RU-таблицы (boxing_stolen), и для EN-таблицы (boxing_stolen_en).
// `table` всегда один из двух захардкоженных литералов ниже, не приходит
// от пользователя — подставлять в SQL напрямую безопасно.
function makeBoxingApi(table) {
  return {
    async addStolen(username, amount) {
      if (!pool || !username || !amount) return;
      await pool.query(`
        INSERT INTO ${table} (username, total_stolen)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET total_stolen = ${table}.total_stolen + $2
      `, [username, Math.floor(amount)]);
    },

    async getTop(limit = 10) {
      if (!pool) return [];
      const res = await pool.query(
        `SELECT username, total_stolen FROM ${table} ORDER BY total_stolen DESC LIMIT $1`,
        [limit]
      );
      return res.rows;
    },

    async getAll() {
      if (!pool) return [];
      // ROW_NUMBER (не RANK) — строгая сквозная нумерация без повторов при
      // равных total_stolen, чтобы номер последней строки честно отражал
      // общее число игроков. Вторичная сортировка по username — чтобы
      // порядок среди "равных" не менялся случайно между обновлениями страницы.
      const res = await pool.query(`
        SELECT username, total_stolen, total_kos, belt_seconds,
               ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
        FROM ${table}
        ORDER BY total_stolen DESC, username ASC
      `);
      return res.rows.map(r => ({
        rank: Number(r.rank),
        username: r.username,
        total_stolen: Number(r.total_stolen),
        total_kos: Number(r.total_kos),
        belt_seconds: Number(r.belt_seconds),
      }));
    },

    async getUserRank(username) {
      if (!pool || !username) return null;
      const res = await pool.query(`
        SELECT username, total_stolen, total_kos, belt_seconds,
               RANK() OVER (ORDER BY total_stolen DESC) AS rank
        FROM ${table}
      `);
      const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
      return row ? {
        rank: Number(row.rank),
        total_stolen: Number(row.total_stolen),
        total_kos: Number(row.total_kos),
        belt_seconds: Number(row.belt_seconds),
      } : null;
    },

    async addKO(username) {
      if (!pool || !username) return;
      await pool.query(`
        INSERT INTO ${table} (username, total_kos)
        VALUES ($1, 1)
        ON CONFLICT (username)
        DO UPDATE SET total_kos = ${table}.total_kos + 1
      `, [username]);
    },

    async addBeltSeconds(username, seconds) {
      if (!pool || !username || !seconds) return;
      await pool.query(`
        INSERT INTO ${table} (username, belt_seconds)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET belt_seconds = ${table}.belt_seconds + $2
      `, [username, Math.floor(seconds)]);
    },

    async reset() {
      if (!pool) return;
      await pool.query(`DELETE FROM ${table}`);
    },

    async setStolen(username, value) {
      if (!pool || !username) return;
      await pool.query(`
        INSERT INTO ${table} (username, total_stolen)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET total_stolen = $2
      `, [username, Math.floor(value)]);
    },

    async deleteUser(username) {
      if (!pool || !username) return;
      await pool.query(`DELETE FROM ${table} WHERE username = $1`, [username]);
    },
  };
}

const boxingRu = makeBoxingApi('boxing_stolen');
const boxingEn = makeBoxingApi('boxing_stolen_en');
const streetFighter = makeBoxingApi('streetfighter_stolen');

// addStolen/addBeltSeconds/getUserRank/getAll У boxing_stolen (RU) СВОИ
// версии ниже (не из фабрики) — та же причина, что у Street Fighter:
// нужно писать сразу в недельную + вечную колонку за один запрос.
// addKO/getTop/reset/setStolen/deleteUser — как у всех, из фабрики без изменений.
const getTopBoxingStolen = boxingRu.getTop;
const addBoxingKO = boxingRu.addKO;
const resetBoxingRating = boxingRu.reset;
const setBoxingStolen = boxingRu.setStolen;
const deleteBoxingUser = boxingRu.deleteUser;

const addBoxingStolenEn = boxingEn.addStolen;
const getTopBoxingStolenEn = boxingEn.getTop;
const getAllBoxingStolenEn = boxingEn.getAll;
const getUserBoxingRankEn = boxingEn.getUserRank;
const addBoxingKOEn = boxingEn.addKO;
const addBoxingBeltSecondsEn = boxingEn.addBeltSeconds;
const resetBoxingRatingEn = boxingEn.reset;
const setBoxingStolenEn = boxingEn.setStolen;
const deleteBoxingUserEn = boxingEn.deleteUser;

// addStolen/addBeltSeconds/getUserRank/getAll У Street Fighter СВОИ версии
// (не из фабрики) — нужно писать сразу в 2 колонки (недельную +
// вечную) за один запрос. addKO/getTop/reset/setStolen/deleteUser — как у
// всех остальных игр, оставляем из фабрики без изменений.
const getTopStreetFighterStolen = streetFighter.getTop;
const addStreetFighterKO = streetFighter.addKO;
const resetStreetFighterRating = streetFighter.reset;
const setStreetFighterStolen = streetFighter.setStolen;
const deleteStreetFighterUser = streetFighter.deleteUser;

// очки удара — сразу и в недельный total_stolen (двигает топ/корону текущей
// недели), и в вечный lifetime_stolen (двигает уровень, никогда не обнуляется)
async function addStreetFighterStolen(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO streetfighter_stolen (username, total_stolen, lifetime_stolen)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_stolen = streetfighter_stolen.total_stolen + $2,
                  lifetime_stolen = streetfighter_stolen.lifetime_stolen + $2
  `, [username, Math.floor(amount)]);
}

// секунды с короной — сразу и в belt_seconds (вечный, как раньше, просто
// больше не показывается на карточке rating), и в weekly_belt_seconds
// (обнуляется по понедельникам — именно по нему выбирается "Король недели")
async function addStreetFighterBeltSeconds(username, seconds) {
  if (!pool || !username || !seconds) return;
  await pool.query(`
    INSERT INTO streetfighter_stolen (username, belt_seconds, weekly_belt_seconds)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET belt_seconds = streetfighter_stolen.belt_seconds + $2,
                  weekly_belt_seconds = streetfighter_stolen.weekly_belt_seconds + $2
  `, [username, Math.floor(seconds)]);
}

async function getUserStreetFighterRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           RANK() OVER (ORDER BY total_stolen DESC) AS rank
    FROM streetfighter_stolen
  `);
  const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
  return row ? {
    rank: Number(row.rank),
    total_stolen: Number(row.total_stolen),
    total_kos: Number(row.total_kos),
    belt_seconds: Number(row.belt_seconds),
    lifetime_stolen: Number(row.lifetime_stolen),
    weekly_king_wins: Number(row.weekly_king_wins),
    weekly_belt_seconds: Number(row.weekly_belt_seconds),
  } : null;
}

async function getAllStreetFighterStolen() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
    FROM streetfighter_stolen
    ORDER BY total_stolen DESC, username ASC
  `);
  return res.rows.map(r => ({
    rank: Number(r.rank),
    username: r.username,
    total_stolen: Number(r.total_stolen),
    total_kos: Number(r.total_kos),
    belt_seconds: Number(r.belt_seconds),
    lifetime_stolen: Number(r.lifetime_stolen),
    weekly_king_wins: Number(r.weekly_king_wins),
    weekly_belt_seconds: Number(r.weekly_belt_seconds),
  }));
}

// смещение таймзоны (в минутах, Киев впереди UTC) в конкретный момент —
// через Intl.DateTimeFormat, т.к. в Киеве, В ОТЛИЧИЕ ОТ МОСКВЫ, есть переход
// на летнее/зимнее время (EEST +3 летом / EET +2 зимой) — константный сдвиг
// тут был бы неверен половину года
function tzOffsetMinutes(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  const hour = o.hour === '24' ? '00' : o.hour; // некоторые локали отдают 24:00 вместо 00:00
  const asUTC = Date.UTC(Number(o.year), Number(o.month)-1, Number(o.day), Number(hour), Number(o.minute), Number(o.second));
  return Math.round((asUTC - utcMs) / 60000);
}

// ближайшая (текущая или прошлая) полночь понедельника по киевскому времени,
// возвращена как момент в UTC-миллисекундах. Смещение считается на момент
// `nowMs` и используется как есть для всей недели назад — раз в год (при
// самом переходе на летнее/зимнее время) граница может съехать на час,
// это не критично для недельного сброса
function mostRecentMondayKyivMs(nowMs) {
  const offsetMin = tzOffsetMinutes(nowMs, 'Europe/Kyiv');
  const kyivNow = new Date(nowMs + offsetMin*60000);
  const day = kyivNow.getUTCDay(); // 0=вс..6=сб (в уже сдвинутых на Киев координатах)
  const daysSinceMonday = (day + 6) % 7; // пн->0, вт->1, ..., вс->6
  const kyivMidnightAsUtcFields = Date.UTC(
    kyivNow.getUTCFullYear(), kyivNow.getUTCMonth(), kyivNow.getUTCDate() - daysSinceMonday, 0, 0, 0, 0
  );
  return kyivMidnightAsUtcFields - offsetMin*60000; // обратно в реальный момент UTC
}

// вызывается периодически (и один раз при старте сервера) — если с прошлого
// сброса прошёл понедельник 00:00 по Киеву, архивирует короля недели
// (у кого было больше total_stolen, т.е. очков за неделю) и обнуляет
// total_stolen + weekly_belt_seconds у всех. Безопасно при простое сервера в момент
// границы — при следующем запуске просто досчитает пропущенный сброс один
// раз (не пытается "проиграть" несколько пропущенных недель по отдельности).
async function performStreetFighterWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMondayKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM streetfighter_weekly_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    // самый первый запуск этой фичи — фиксируем текущую границу как точку
    // отсчёта, ничего не сбрасываем (прошлой недели с данными ещё не было)
    await pool.query(`INSERT INTO streetfighter_weekly_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null; // граница с прошлого раза ещё не наступила

  const winnerRes = await pool.query(`
    SELECT username, total_stolen, weekly_belt_seconds FROM streetfighter_stolen
    WHERE total_stolen > 0
    ORDER BY total_stolen DESC LIMIT 1
  `);
  let winner = null;
  if (winnerRes.rows.length) {
    winner = winnerRes.rows[0];
    await pool.query(`
      INSERT INTO streetfighter_weekly_kings (week_start, username, weekly_belt_seconds, weekly_points)
      VALUES ($1, $2, $3, $4)
    `, [lastReset, winner.username, winner.weekly_belt_seconds, winner.total_stolen]);
    await pool.query(`
      UPDATE streetfighter_stolen SET weekly_king_wins = weekly_king_wins + 1
      WHERE LOWER(username) = LOWER($1)
    `, [winner.username]);
  }

  await pool.query(`UPDATE streetfighter_stolen SET total_stolen = 0, weekly_belt_seconds = 0`);
  await pool.query(`UPDATE streetfighter_weekly_meta SET last_reset_at = $1 WHERE id=1`, [boundary]);

  console.log(`[STREETFIGHTER] Недельный сброс выполнен, граница=${boundary.toISOString()}, король недели: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

  return { winner: winner ? winner.username : null, weekStart: lastReset.toISOString() };
}

// выбор героя (skin1..skin5) — специфично для Street Fighter, не часть
// общей фабрики makeBoxingApi (у бокса такого понятия нет)
async function setStreetFighterSkin(username, skinIndex) {
  if (!pool || !username) return;
  await pool.query(`
    INSERT INTO streetfighter_stolen (username, chosen_skin)
    VALUES ($1, $2)
    ON CONFLICT (username)
    DO UPDATE SET chosen_skin = $2
  `, [username, skinIndex]);
}
async function getStreetFighterSkin(username) {
  if (!pool || !username) return null;
  const res = await pool.query(
    `SELECT chosen_skin FROM streetfighter_stolen WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  return res.rows.length ? res.rows[0].chosen_skin : null;
}

// чемпион ПРОШЛОЙ недели — последняя запись архива (или null, если ни разу
// ещё не было сброса/победителя, например в самую первую неделю фичи).
// Показывается на арене постоянно, пока не пройдёт следующий сброс.
async function getLastStreetFighterWeeklyChampion() {
  if (!pool) return null;
  const res = await pool.query(`
    SELECT username, weekly_points, week_start FROM streetfighter_weekly_kings
    ORDER BY week_start DESC LIMIT 1
  `);
  return res.rows.length ? {
    username: res.rows[0].username,
    weeklyPoints: Number(res.rows[0].weekly_points),
    weekStart: res.rows[0].week_start,
  } : null;
}

// ── Boxing Arena RU: тот же еженедельный "Пояс чемпиона" (2026-08-08) ──
// 1-в-1 логика Street Fighter выше, только своя таблица/архив/метка сброса.
// EN-версия бокса НЕ трогается — остаётся на старой all-time схеме (фабрика
// makeBoxingApi, boxingEn.* выше).

async function addBoxingStolen(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO boxing_stolen (username, total_stolen, lifetime_stolen)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_stolen = boxing_stolen.total_stolen + $2,
                  lifetime_stolen = boxing_stolen.lifetime_stolen + $2
  `, [username, Math.floor(amount)]);
}

async function addBoxingBeltSeconds(username, seconds) {
  if (!pool || !username || !seconds) return;
  await pool.query(`
    INSERT INTO boxing_stolen (username, belt_seconds, weekly_belt_seconds)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET belt_seconds = boxing_stolen.belt_seconds + $2,
                  weekly_belt_seconds = boxing_stolen.weekly_belt_seconds + $2
  `, [username, Math.floor(seconds)]);
}

async function getUserBoxingRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           RANK() OVER (ORDER BY total_stolen DESC) AS rank
    FROM boxing_stolen
  `);
  const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
  return row ? {
    rank: Number(row.rank),
    total_stolen: Number(row.total_stolen),
    total_kos: Number(row.total_kos),
    belt_seconds: Number(row.belt_seconds),
    lifetime_stolen: Number(row.lifetime_stolen),
    weekly_king_wins: Number(row.weekly_king_wins),
    weekly_belt_seconds: Number(row.weekly_belt_seconds),
  } : null;
}

async function getAllBoxingStolen() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
    FROM boxing_stolen
    ORDER BY total_stolen DESC, username ASC
  `);
  return res.rows.map(r => ({
    rank: Number(r.rank),
    username: r.username,
    total_stolen: Number(r.total_stolen),
    total_kos: Number(r.total_kos),
    belt_seconds: Number(r.belt_seconds),
    lifetime_stolen: Number(r.lifetime_stolen),
    weekly_king_wins: Number(r.weekly_king_wins),
    weekly_belt_seconds: Number(r.weekly_belt_seconds),
  }));
}

async function performBoxingWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMondayKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM boxing_weekly_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    await pool.query(`INSERT INTO boxing_weekly_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null;

  const winnerRes = await pool.query(`
    SELECT username, total_stolen, weekly_belt_seconds FROM boxing_stolen
    WHERE total_stolen > 0
    ORDER BY total_stolen DESC LIMIT 1
  `);
  let winner = null;
  if (winnerRes.rows.length) {
    winner = winnerRes.rows[0];
    await pool.query(`
      INSERT INTO boxing_weekly_kings (week_start, username, weekly_belt_seconds, weekly_points)
      VALUES ($1, $2, $3, $4)
    `, [lastReset, winner.username, winner.weekly_belt_seconds, winner.total_stolen]);
    await pool.query(`
      UPDATE boxing_stolen SET weekly_king_wins = weekly_king_wins + 1
      WHERE LOWER(username) = LOWER($1)
    `, [winner.username]);
  }

  await pool.query(`UPDATE boxing_stolen SET total_stolen = 0, weekly_belt_seconds = 0`);
  await pool.query(`UPDATE boxing_weekly_meta SET last_reset_at = $1 WHERE id=1`, [boundary]);

  console.log(`[BOXING] Недельный сброс выполнен, граница=${boundary.toISOString()}, чемпион недели: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

  return { winner: winner ? winner.username : null, weekStart: lastReset.toISOString() };
}

// чемпион ПРОШЛОЙ недели (пояс) — последняя запись архива, или null если
// сброса ещё ни разу не было
async function getLastBoxingWeeklyChampion() {
  if (!pool) return null;
  const res = await pool.query(`
    SELECT username, weekly_points, week_start FROM boxing_weekly_kings
    ORDER BY week_start DESC LIMIT 1
  `);
  return res.rows.length ? {
    username: res.rows[0].username,
    weeklyPoints: Number(res.rows[0].weekly_points),
    weekStart: res.rows[0].week_start,
  } : null;
}

function isConnected() { return pool !== null; }

module.exports = {
  init, addKill, getTopKillers, getUserRank, addBossDamage, getTopBossDamage,
  resetBossDamage, getUserBossDamageRank, addRaceCoins, getTopRaceDonations,
  addBoxingStolen, getTopBoxingStolen, getUserBoxingRank, addBoxingKO,
  addBoxingBeltSeconds, resetBoxingRating, setBoxingStolen, deleteBoxingUser,
  getAllBoxingStolen, performBoxingWeeklyResetIfNeeded, getLastBoxingWeeklyChampion,
  addBoxingStolenEn, getTopBoxingStolenEn, getUserBoxingRankEn, addBoxingKOEn,
  addBoxingBeltSecondsEn, resetBoxingRatingEn, setBoxingStolenEn, deleteBoxingUserEn,
  getAllBoxingStolenEn,
  addStreetFighterStolen, getTopStreetFighterStolen, getUserStreetFighterRank,
  addStreetFighterKO, addStreetFighterBeltSeconds, resetStreetFighterRating,
  setStreetFighterStolen, deleteStreetFighterUser, getAllStreetFighterStolen,
  setStreetFighterSkin, getStreetFighterSkin,
  performStreetFighterWeeklyResetIfNeeded, getLastStreetFighterWeeklyChampion,
  isConnected,
};
