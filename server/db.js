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

  // ── Fantasy Arena (2026-08-18) — 1-в-1 схема Street Fighter выше (см.
  // комментарии там для каждого поля), отдельная таблица/архив/метка сброса.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fantasyarena_stolen (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  // выбор героя командой "hero1".."hero4" в чате (см. Street Fighter chosen_skin
  // выше — тот же смысл, другое имя команды, чтобы не путать с Street Fighter)
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS chosen_skin INTEGER`);
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS lifetime_stolen INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`UPDATE fantasyarena_stolen SET lifetime_stolen = total_stolen WHERE lifetime_stolen = 0 AND total_stolen > 0`);
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS weekly_belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE fantasyarena_stolen ADD COLUMN IF NOT EXISTS weekly_king_wins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fantasyarena_weekly_kings (
      id SERIAL PRIMARY KEY,
      week_start TIMESTAMPTZ NOT NULL,
      username TEXT NOT NULL,
      weekly_belt_seconds INTEGER NOT NULL,
      weekly_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fantasyarena_weekly_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);

  // ── Рыбалка (2026-08-10) — рейтинг строится на количестве "рыбок", не
  // донатов: 1 монета/100 лайков = 1 рыбка, total_fish копится вечно (по
  // нему db-страница), daily_fish — ЕЖЕДНЕВНЫЙ (обнуляется в полночь по
  // Киеву, см. performFishingDailyResetIfNeeded) — по нему "ТОП ЗА СЕГОДНЯ"
  // прямо в игре.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fishing_catches (
      username TEXT PRIMARY KEY,
      total_fish BIGINT NOT NULL DEFAULT 0,
      daily_fish INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS fishing_daily_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);
  // yesterday_top — снапшот топа дня, снятый прямо перед обнулением daily_fish
  // (см. performFishingDailyResetIfNeeded), чтобы "ТОП ЗА СЕГОДНЯ" не пропадал
  // бесследно в полночь, а был виден весь следующий день как "ТОП ВЧЕРА"
  await pool.query(`ALTER TABLE fishing_daily_meta ADD COLUMN IF NOT EXISTS yesterday_top JSONB NOT NULL DEFAULT '[]'`);

  // ── Снапшоты энергии/силы бойцов Street Fighter / Boxing Arena (2026-08-11) ──
  // Резервная копия в БД для восстановления после ПЕРЕЗАПУСКА СЕРВЕРА
  // (обычный ре-коннект/обновление страницы восстанавливается быстрее — из
  // памяти комнаты на сервере, см. Room._stateSnapshots в server.js). Пишется
  // редко (раз в минуту максимум на комнату+игру), payload маленький — не
  // нагружает БД. game: 'streetfighter'|'boxing'|'boxing_en', room — ник стримера.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_state_snapshots (
      game TEXT NOT NULL,
      room TEXT NOT NULL,
      players JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (game, room)
    )
  `);

  console.log('[DB] Таблицы kills, boss_damage, race_donations, boxing_stolen, boxing_stolen_en, streetfighter_stolen, fishing_catches и game_state_snapshots готовы');
}

// снапшот текущей энергии/силы реальных бойцов на ринге — бэкап на случай
// перезапуска сервера (Railway redeploy), чтобы бойцы не начинали с нуля.
// Основной источник восстановления — память комнаты (быстрее), это резерв.
async function saveGameStateSnapshot(game, room, players) {
  if (!pool || !game || !room) return;
  await pool.query(`
    INSERT INTO game_state_snapshots (game, room, players, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (game, room)
    DO UPDATE SET players = $3, updated_at = now()
  `, [game, room, JSON.stringify(players || [])]);
}

async function getGameStateSnapshot(game, room) {
  if (!pool || !game || !room) return null;
  const res = await pool.query(
    `SELECT players FROM game_state_snapshots WHERE game=$1 AND room=$2`,
    [game, room]
  );
  return res.rows.length ? res.rows[0].players : null;
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

    // ручная точечная правка "побед дня" (было "побед недели") — используется
    // для разового зачёта прошлых недельных чемпионов при переходе на
    // ежедневный сброс 2026-08-13 (см. [[project_street_fighter_weekly_rating]])
    async setWeeklyKingWins(username, value) {
      if (!pool || !username) return;
      await pool.query(`
        INSERT INTO ${table} (username, weekly_king_wins)
        VALUES ($1, $2)
        ON CONFLICT (username)
        DO UPDATE SET weekly_king_wins = $2
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
const setBoxingWeeklyKingWins = boxingRu.setWeeklyKingWins;

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
const setStreetFighterWeeklyKingWins = streetFighter.setWeeklyKingWins;

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

// 2026-08-13: сброс переведён с еженедельного на ЕЖЕДНЕВНЫЙ (по прямой
// просьбе пользователя) — таблицы/поля/функции ниже сохранили старые имена
// ("weekly"/"неделя" в коде и в БД), чтобы не делать рискованную миграцию
// схемы, но по смыслу теперь это "период" = один день, не неделя. Только
// пользовательский текст (диктор/UI) переименован в "день".
// Граница считается через общую mostRecentMidnightKyivMs (см. ниже, в разделе
// Fishing) — раньше здесь была своя mostRecentMondayKyivMs со сдвигом на
// день недели, теперь сдвиг не нужен.

// вызывается периодически (и один раз при старте сервера) — если с прошлого
// сброса прошла полночь по Киеву, архивирует короля дня (у кого было больше
// total_stolen, т.е. очков за день) и обнуляет total_stolen + weekly_belt_seconds
// у всех. Безопасно при простое сервера в момент границы — при следующем
// запуске просто досчитает пропущенный сброс один раз (не пытается
// "проиграть" несколько пропущенных дней по отдельности).
async function performStreetFighterWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
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

  console.log(`[STREETFIGHTER] Дневной сброс выполнен, граница=${boundary.toISOString()}, король дня: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

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

// весь архив прошлых чемпионов недели/дня, от первого к последнему —
// временно нужно, чтобы сверить, кто был чемпионом в САМУЮ первую неделю
// (2026-08-13, разовая проверка, UI для истории по-прежнему не сделан)
async function getStreetFighterWeeklyHistory() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, weekly_points, weekly_belt_seconds, week_start, created_at
    FROM streetfighter_weekly_kings ORDER BY week_start ASC
  `);
  return res.rows.map(r => ({
    username: r.username,
    weeklyPoints: Number(r.weekly_points),
    weekStart: r.week_start,
    createdAt: r.created_at,
  }));
}

// ── Fantasy Arena: 1-в-1 логика Street Fighter выше (см. комментарии там),
// своя таблица/архив/метка сброса. ──
const fantasyArena = makeBoxingApi('fantasyarena_stolen');
const getTopFantasyArenaStolen = fantasyArena.getTop;
const addFantasyArenaKO = fantasyArena.addKO;
const resetFantasyArenaRating = fantasyArena.reset;
const setFantasyArenaStolen = fantasyArena.setStolen;
const deleteFantasyArenaUser = fantasyArena.deleteUser;
const setFantasyArenaWeeklyKingWins = fantasyArena.setWeeklyKingWins;

async function addFantasyArenaStolen(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO fantasyarena_stolen (username, total_stolen, lifetime_stolen)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_stolen = fantasyarena_stolen.total_stolen + $2,
                  lifetime_stolen = fantasyarena_stolen.lifetime_stolen + $2
  `, [username, Math.floor(amount)]);
}

async function addFantasyArenaBeltSeconds(username, seconds) {
  if (!pool || !username || !seconds) return;
  await pool.query(`
    INSERT INTO fantasyarena_stolen (username, belt_seconds, weekly_belt_seconds)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET belt_seconds = fantasyarena_stolen.belt_seconds + $2,
                  weekly_belt_seconds = fantasyarena_stolen.weekly_belt_seconds + $2
  `, [username, Math.floor(seconds)]);
}

async function getUserFantasyArenaRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           RANK() OVER (ORDER BY total_stolen DESC) AS rank
    FROM fantasyarena_stolen
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

async function getAllFantasyArenaStolen() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
    FROM fantasyarena_stolen
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

async function performFantasyArenaWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM fantasyarena_weekly_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    await pool.query(`INSERT INTO fantasyarena_weekly_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null;

  const winnerRes = await pool.query(`
    SELECT username, total_stolen, weekly_belt_seconds FROM fantasyarena_stolen
    WHERE total_stolen > 0
    ORDER BY total_stolen DESC LIMIT 1
  `);
  let winner = null;
  if (winnerRes.rows.length) {
    winner = winnerRes.rows[0];
    await pool.query(`
      INSERT INTO fantasyarena_weekly_kings (week_start, username, weekly_belt_seconds, weekly_points)
      VALUES ($1, $2, $3, $4)
    `, [lastReset, winner.username, winner.weekly_belt_seconds, winner.total_stolen]);
    await pool.query(`
      UPDATE fantasyarena_stolen SET weekly_king_wins = weekly_king_wins + 1
      WHERE LOWER(username) = LOWER($1)
    `, [winner.username]);
  }

  await pool.query(`UPDATE fantasyarena_stolen SET total_stolen = 0, weekly_belt_seconds = 0`);
  await pool.query(`UPDATE fantasyarena_weekly_meta SET last_reset_at = $1 WHERE id=1`, [boundary]);

  console.log(`[FANTASYARENA] Дневной сброс выполнен, граница=${boundary.toISOString()}, король дня: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

  return { winner: winner ? winner.username : null, weekStart: lastReset.toISOString() };
}

// выбор героя (hero1..hero4) — специфично для Fantasy Arena, не часть
// общей фабрики makeBoxingApi
async function setFantasyArenaSkin(username, skinIndex) {
  if (!pool || !username) return;
  await pool.query(`
    INSERT INTO fantasyarena_stolen (username, chosen_skin)
    VALUES ($1, $2)
    ON CONFLICT (username)
    DO UPDATE SET chosen_skin = $2
  `, [username, skinIndex]);
}
async function getFantasyArenaSkin(username) {
  if (!pool || !username) return null;
  const res = await pool.query(
    `SELECT chosen_skin FROM fantasyarena_stolen WHERE LOWER(username) = LOWER($1)`,
    [username]
  );
  return res.rows.length ? res.rows[0].chosen_skin : null;
}

async function getLastFantasyArenaWeeklyChampion() {
  if (!pool) return null;
  const res = await pool.query(`
    SELECT username, weekly_points, week_start FROM fantasyarena_weekly_kings
    ORDER BY week_start DESC LIMIT 1
  `);
  return res.rows.length ? {
    username: res.rows[0].username,
    weeklyPoints: Number(res.rows[0].weekly_points),
    weekStart: res.rows[0].week_start,
  } : null;
}

async function getFantasyArenaWeeklyHistory() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, weekly_points, weekly_belt_seconds, week_start, created_at
    FROM fantasyarena_weekly_kings ORDER BY week_start ASC
  `);
  return res.rows.map(r => ({
    username: r.username,
    weeklyPoints: Number(r.weekly_points),
    weekStart: r.week_start,
    createdAt: r.created_at,
  }));
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
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
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

  console.log(`[BOXING] Дневной сброс выполнен, граница=${boundary.toISOString()}, чемпион дня: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

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

// см. getStreetFighterWeeklyHistory выше — тот же смысл, для бокса
async function getBoxingWeeklyHistory() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, weekly_points, weekly_belt_seconds, week_start, created_at
    FROM boxing_weekly_kings ORDER BY week_start ASC
  `);
  return res.rows.map(r => ({
    username: r.username,
    weeklyPoints: Number(r.weekly_points),
    weekStart: r.week_start,
    createdAt: r.created_at,
  }));
}

// ── Рыбалка ── 1 монета/лайк-порог = 1 рыбка, пишем сразу в оба счётчика:
// total_fish (вечный, для db-страницы) и daily_fish (для "ТОП ЗА СЕГОДНЯ")
async function addFishingCatch(username, fish) {
  if (!pool || !username || !fish) return;
  // total_fish (BIGINT) и daily_fish (INTEGER) — разные типы колонок, поэтому
  // $2 без явного каста в обоих местах ловит ошибку Postgres "inconsistent
  // types deduced for parameter $2" (обнаружено 2026-08-11: ни одна рыбка ни
  // разу не записалась в БД с момента запуска игры). Явные касты убирают
  // неоднозначность для каждого использования параметра по отдельности.
  await pool.query(`
    INSERT INTO fishing_catches (username, total_fish, daily_fish, updated_at)
    VALUES ($1, $2::bigint, $2::integer, now())
    ON CONFLICT (username)
    DO UPDATE SET total_fish = fishing_catches.total_fish + $2::bigint,
                  daily_fish = fishing_catches.daily_fish + $2::integer,
                  updated_at = now()
  `, [username, Math.floor(fish)]);
}

async function getTopFishingDaily(limit = 10) {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT username, daily_fish FROM fishing_catches WHERE daily_fish > 0 ORDER BY daily_fish DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map(r => ({ username: r.username, daily_fish: Number(r.daily_fish) }));
}

async function getAllFishing() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_fish, daily_fish,
           ROW_NUMBER() OVER (ORDER BY total_fish DESC, username ASC) AS rank
    FROM fishing_catches
    ORDER BY total_fish DESC, username ASC
  `);
  return res.rows.map(r => ({
    rank: Number(r.rank),
    username: r.username,
    total_fish: Number(r.total_fish),
    daily_fish: Number(r.daily_fish),
  }));
}

async function getUserFishingRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_fish, daily_fish,
           RANK() OVER (ORDER BY total_fish DESC) AS rank
    FROM fishing_catches
  `);
  const row = res.rows.find(r => r.username.toLowerCase() === username.toLowerCase());
  return row ? {
    rank: Number(row.rank),
    total_fish: Number(row.total_fish),
    daily_fish: Number(row.daily_fish),
  } : null;
}

async function resetFishingRating() {
  if (!pool) return;
  await pool.query('DELETE FROM fishing_catches');
}

async function setFishingTotal(username, value) {
  if (!pool || !username) return;
  // тот же каст, что и в addFishingCatch выше — total_fish/daily_fish разных
  // типов, $2 без явного каста в обоих местах ловит ошибку Postgres
  await pool.query(`
    INSERT INTO fishing_catches (username, total_fish, daily_fish, updated_at)
    VALUES ($1, $2::bigint, $2::integer, now())
    ON CONFLICT (username)
    DO UPDATE SET total_fish = $2::bigint, updated_at = now()
  `, [username, Math.floor(value)]);
}

async function deleteFishingUser(username) {
  if (!pool || !username) return;
  await pool.query(`DELETE FROM fishing_catches WHERE username = $1`, [username]);
}

// ближайшая (текущая или прошлая) полночь по киевскому времени — общая для
// Fishing, а с 2026-08-13 и для Street Fighter/Boxing (все три сброса теперь
// ежедневные)
function mostRecentMidnightKyivMs(nowMs) {
  const offsetMin = tzOffsetMinutes(nowMs, 'Europe/Kyiv');
  const kyivNow = new Date(nowMs + offsetMin*60000);
  const kyivMidnightAsUtcFields = Date.UTC(
    kyivNow.getUTCFullYear(), kyivNow.getUTCMonth(), kyivNow.getUTCDate(), 0, 0, 0, 0
  );
  return kyivMidnightAsUtcFields - offsetMin*60000;
}

// вызывается периодически (и раз при старте) — если с прошлого сброса
// прошла полночь по Киеву, обнуляет daily_fish у всех. total_fish (вечный)
// не трогается. Тот же безопасный при простое сервера паттерн, что и у
// еженедельных сбросов выше (досчитывает пропущенный сброс при рестарте).
async function performFishingDailyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM fishing_daily_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    await pool.query(`INSERT INTO fishing_daily_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null;

  // снимаем топ дня ДО обнуления — он и станет "ТОП ВЧЕРА" на весь следующий день
  const topRes = await pool.query(
    `SELECT username, daily_fish FROM fishing_catches WHERE daily_fish > 0 ORDER BY daily_fish DESC LIMIT 10`
  );
  const yesterdayTop = topRes.rows.map(r => ({ username: r.username, daily_fish: Number(r.daily_fish) }));

  await pool.query(`UPDATE fishing_catches SET daily_fish = 0`);
  await pool.query(
    `UPDATE fishing_daily_meta SET last_reset_at = $1, yesterday_top = $2::jsonb WHERE id=1`,
    [boundary, JSON.stringify(yesterdayTop)]
  );

  console.log(`[FISHING] Дневной сброс выполнен, граница=${boundary.toISOString()}, топ вчера сохранён (${yesterdayTop.length} строк)`);

  return { reset: true, day: boundary.toISOString() };
}

async function getYesterdayTopFishing() {
  if (!pool) return [];
  const res = await pool.query(`SELECT yesterday_top FROM fishing_daily_meta WHERE id=1`);
  if (!res.rows.length) return [];
  return res.rows[0].yesterday_top || [];
}

function isConnected() { return pool !== null; }

module.exports = {
  init, addKill, getTopKillers, getUserRank, addBossDamage, getTopBossDamage,
  resetBossDamage, getUserBossDamageRank, addRaceCoins, getTopRaceDonations,
  addBoxingStolen, getTopBoxingStolen, getUserBoxingRank, addBoxingKO,
  addBoxingBeltSeconds, resetBoxingRating, setBoxingStolen, deleteBoxingUser,
  getAllBoxingStolen, performBoxingWeeklyResetIfNeeded, getLastBoxingWeeklyChampion,
  setBoxingWeeklyKingWins, getBoxingWeeklyHistory,
  addBoxingStolenEn, getTopBoxingStolenEn, getUserBoxingRankEn, addBoxingKOEn,
  addBoxingBeltSecondsEn, resetBoxingRatingEn, setBoxingStolenEn, deleteBoxingUserEn,
  getAllBoxingStolenEn,
  addStreetFighterStolen, getTopStreetFighterStolen, getUserStreetFighterRank,
  addStreetFighterKO, addStreetFighterBeltSeconds, resetStreetFighterRating,
  setStreetFighterStolen, deleteStreetFighterUser, getAllStreetFighterStolen,
  setStreetFighterSkin, getStreetFighterSkin,
  performStreetFighterWeeklyResetIfNeeded, getLastStreetFighterWeeklyChampion,
  setStreetFighterWeeklyKingWins, getStreetFighterWeeklyHistory,
  addFantasyArenaStolen, getTopFantasyArenaStolen, getUserFantasyArenaRank,
  addFantasyArenaKO, addFantasyArenaBeltSeconds, resetFantasyArenaRating,
  setFantasyArenaStolen, deleteFantasyArenaUser, getAllFantasyArenaStolen,
  setFantasyArenaSkin, getFantasyArenaSkin,
  performFantasyArenaWeeklyResetIfNeeded, getLastFantasyArenaWeeklyChampion,
  setFantasyArenaWeeklyKingWins, getFantasyArenaWeeklyHistory,
  addFishingCatch, getTopFishingDaily, getAllFishing, getUserFishingRank,
  resetFishingRating, setFishingTotal, deleteFishingUser,
  performFishingDailyResetIfNeeded, getYesterdayTopFishing,
  saveGameStateSnapshot, getGameStateSnapshot,
  isConnected,
};
