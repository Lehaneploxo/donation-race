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

  // 06.10.2026: Boxing Arena EN, Рыбалка и Fantasy Arena TV убраны с сайта (файлы в archive/),
  // их базы стёрты по просьбе пользователя. IF EXISTS — после первого запуска это пустые операции.
  await pool.query(`DROP TABLE IF EXISTS boxing_stolen_en, fishing_catches, fishing_daily_meta,
    fantasyarenatv_stolen, fantasyarenatv_weekly_kings, fantasyarenatv_weekly_meta`);

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

  // ── NEPLOXO STREET WARS (06.10.2026) — TikTok-игра по логике Street Fighters 1 в 3D-городе
  // из GTA-шки. Схема 1-в-1 как у streetfighter_stolen выше, СВОЯ таблица/архив/метка сброса.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetwars_stolen (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE streetwars_stolen ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE streetwars_stolen ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE streetwars_stolen ADD COLUMN IF NOT EXISTS lifetime_stolen INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`UPDATE streetwars_stolen SET lifetime_stolen = total_stolen WHERE lifetime_stolen = 0 AND total_stolen > 0`);
  await pool.query(`ALTER TABLE streetwars_stolen ADD COLUMN IF NOT EXISTS weekly_belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE streetwars_stolen ADD COLUMN IF NOT EXISTS weekly_king_wins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetwars_weekly_kings (
      id SERIAL PRIMARY KEY,
      week_start TIMESTAMPTZ NOT NULL,
      username TEXT NOT NULL,
      weekly_belt_seconds INTEGER NOT NULL,
      weekly_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS streetwars_weekly_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);

  // ── НОВОГОДНИЙ ПЕРЕПОЛОХ (25.10.2026) — сезонная игра ноябрь–январь. Схема 1-в-1 как у
  // streetwars_stolen выше: total_stolen = ⭐ за день (сброс в полночь по Киеву),
  // lifetime_stolen = ⭐ за всё время (уровень эльфа и топ сезона), СВОЯ таблица/архив/метка сброса.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newyear_stolen (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE newyear_stolen ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE newyear_stolen ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE newyear_stolen ADD COLUMN IF NOT EXISTS lifetime_stolen INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE newyear_stolen ADD COLUMN IF NOT EXISTS weekly_belt_seconds INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE newyear_stolen ADD COLUMN IF NOT EXISTS weekly_king_wins INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newyear_weekly_kings (
      id SERIAL PRIMARY KEY,
      week_start TIMESTAMPTZ NOT NULL,
      username TEXT NOT NULL,
      weekly_belt_seconds INTEGER NOT NULL,
      weekly_points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newyear_weekly_meta (
      id INTEGER PRIMARY KEY DEFAULT 1,
      last_reset_at TIMESTAMPTZ NOT NULL
    )
  `);

  // ── Снапшоты энергии/силы бойцов Street Fighter / Boxing Arena (2026-08-11) ──
  // Резервная копия в БД для восстановления после ПЕРЕЗАПУСКА СЕРВЕРА
  // (обычный ре-коннект/обновление страницы восстанавливается быстрее — из
  // памяти комнаты на сервере, см. Room._stateSnapshots в server.js). Пишется
  // редко (раз в минуту максимум на комнату+игру), payload маленький — не
  // нагружает БД. game: 'streetfighter'|'boxing'|'fantasyarena'|'streetwars', room — ник стримера.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS game_state_snapshots (
      game TEXT NOT NULL,
      room TEXT NOT NULL,
      players JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (game, room)
    )
  `);

  // снапшоты бойцов убранных игр (см. DROP TABLE выше)
  await pool.query(`DELETE FROM game_state_snapshots WHERE game IN ('boxing_en', 'fantasyarenatv')`);

  // Статистика эфиров (13.11.2026): одна строка на аккаунт за 10 минут, без ников.
  // bucket — начало 10-минутки (UTC). Подробности — Room._statsBucket в server.js
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_stats (
      account TEXT NOT NULL,
      bucket TIMESTAMPTZ NOT NULL,
      live_min INTEGER NOT NULL DEFAULT 0,
      game_open_min INTEGER NOT NULL DEFAULT 0,
      viewers_max INTEGER NOT NULL DEFAULT 0,
      viewers_avg INTEGER NOT NULL DEFAULT 0,
      joins INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      likers INTEGER NOT NULL DEFAULT 0,
      gifts INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      gifters INTEGER NOT NULL DEFAULT 0,
      chats INTEGER NOT NULL DEFAULT 0,
      chatters INTEGER NOT NULL DEFAULT 0,
      follows INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      stream_ends INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (account, bucket)
    )
  `);

  // Итоги эфиров (13.11.2026). Часть = отрезок эфира, записанный одним запуском
  // сервера (обычно у эфира одна часть). Склеиваются в getStreamSessions.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_parts (
      account TEXT NOT NULL,
      room_id TEXT NOT NULL,
      part_id TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      last_live_at TIMESTAMPTZ NOT NULL,
      live_min INTEGER NOT NULL DEFAULT 0,
      viewers_max INTEGER NOT NULL DEFAULT 0,
      viewers_sum BIGINT NOT NULL DEFAULT 0,
      viewers_n INTEGER NOT NULL DEFAULT 0,
      uniq_joined INTEGER NOT NULL DEFAULT 0,
      uniq_likers INTEGER NOT NULL DEFAULT 0,
      uniq_chatters INTEGER NOT NULL DEFAULT 0,
      uniq_gifters INTEGER NOT NULL DEFAULT 0,
      uniq_people INTEGER NOT NULL DEFAULT 0,
      new_people INTEGER NOT NULL DEFAULT 0,
      likes BIGINT NOT NULL DEFAULT 0,
      chats INTEGER NOT NULL DEFAULT 0,
      gifts INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      follows INTEGER NOT NULL DEFAULT 0,
      shares INTEGER NOT NULL DEFAULT 0,
      top1 INTEGER NOT NULL DEFAULT 0,
      top2 INTEGER NOT NULL DEFAULT 0,
      top3 INTEGER NOT NULL DEFAULT 0,
      end_kind TEXT,
      closed BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (account, room_id, part_id)
    )
  `);
  // люди (обезличенный номер, не ник) — когда впервые пришли на этот аккаунт: «новые / вернувшиеся»
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_people (
      account TEXT NOT NULL,
      person TEXT NOT NULL,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (account, person)
    )
  `);
  // события программы телефонов: пост опубликован, перезапуск (и почему)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stream_events (
      id SERIAL PRIMARY KEY,
      account TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind TEXT NOT NULL,
      details TEXT
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS stream_events_acc_at ON stream_events (account, at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS stream_people_acc_first ON stream_people (account, first_seen)`);

  console.log('[DB] Таблицы kills, boss_damage, race_donations, boxing_stolen, streetfighter_stolen, fantasyarena_stolen, streetwars_stolen, newyear_stolen и game_state_snapshots готовы');
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

// Фабрика boxing-функций, параметризованная именем таблицы — общая для всех
// игр с рейтингом отнятой энергии (бокс, Street Fighter, Fantasy Arena, Street Wars).
// `table` всегда захардкоженный литерал ниже, не приходит
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

// ── NEPLOXO STREET WARS: 1-в-1 логика Street Fighter выше (см. комментарии там),
// своя таблица/архив/метка сброса. ──
const streetWars = makeBoxingApi('streetwars_stolen');
const getTopStreetWarsStolen = streetWars.getTop;
const addStreetWarsKO = streetWars.addKO;
const resetStreetWarsRating = streetWars.reset;
const setStreetWarsStolen = streetWars.setStolen;
const deleteStreetWarsUser = streetWars.deleteUser;
const setStreetWarsWeeklyKingWins = streetWars.setWeeklyKingWins;

async function addStreetWarsStolen(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO streetwars_stolen (username, total_stolen, lifetime_stolen)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_stolen = streetwars_stolen.total_stolen + $2,
                  lifetime_stolen = streetwars_stolen.lifetime_stolen + $2
  `, [username, Math.floor(amount)]);
}

async function addStreetWarsBeltSeconds(username, seconds) {
  if (!pool || !username || !seconds) return;
  await pool.query(`
    INSERT INTO streetwars_stolen (username, belt_seconds, weekly_belt_seconds)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET belt_seconds = streetwars_stolen.belt_seconds + $2,
                  weekly_belt_seconds = streetwars_stolen.weekly_belt_seconds + $2
  `, [username, Math.floor(seconds)]);
}

async function getUserStreetWarsRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           RANK() OVER (ORDER BY total_stolen DESC) AS rank
    FROM streetwars_stolen
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

async function getAllStreetWarsStolen() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
    FROM streetwars_stolen
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

async function performStreetWarsWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM streetwars_weekly_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    await pool.query(`INSERT INTO streetwars_weekly_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null;

  const winnerRes = await pool.query(`
    SELECT username, total_stolen, weekly_belt_seconds FROM streetwars_stolen
    WHERE total_stolen > 0
    ORDER BY total_stolen DESC LIMIT 1
  `);
  let winner = null;
  if (winnerRes.rows.length) {
    winner = winnerRes.rows[0];
    await pool.query(`
      INSERT INTO streetwars_weekly_kings (week_start, username, weekly_belt_seconds, weekly_points)
      VALUES ($1, $2, $3, $4)
    `, [lastReset, winner.username, winner.weekly_belt_seconds, winner.total_stolen]);
    await pool.query(`
      UPDATE streetwars_stolen SET weekly_king_wins = weekly_king_wins + 1
      WHERE LOWER(username) = LOWER($1)
    `, [winner.username]);
  }

  await pool.query(`UPDATE streetwars_stolen SET total_stolen = 0, weekly_belt_seconds = 0`);
  await pool.query(`UPDATE streetwars_weekly_meta SET last_reset_at = $1 WHERE id=1`, [boundary]);

  console.log(`[STREETWARS] Дневной сброс выполнен, граница=${boundary.toISOString()}, король дня: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

  return { winner: winner ? winner.username : null, weekStart: lastReset.toISOString() };
}

async function getLastStreetWarsWeeklyChampion() {
  if (!pool) return null;
  const res = await pool.query(`
    SELECT username, weekly_points, week_start FROM streetwars_weekly_kings
    ORDER BY week_start DESC LIMIT 1
  `);
  return res.rows.length ? {
    username: res.rows[0].username,
    weeklyPoints: Number(res.rows[0].weekly_points),
    weekStart: res.rows[0].week_start,
  } : null;
}

async function getStreetWarsWeeklyHistory() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, weekly_points, weekly_belt_seconds, week_start, created_at
    FROM streetwars_weekly_kings ORDER BY week_start ASC
  `);
  return res.rows.map(r => ({
    username: r.username,
    weeklyPoints: Number(r.weekly_points),
    weekStart: r.week_start,
    createdAt: r.created_at,
  }));
}

// ── НОВОГОДНИЙ ПЕРЕПОЛОХ: 1-в-1 логика Street Wars выше, своя таблица/архив/метка сброса. ──
const newYear = makeBoxingApi('newyear_stolen');
const getTopNewYearStolen = newYear.getTop;
const addNewYearKO = newYear.addKO;
const resetNewYearRating = newYear.reset;
const setNewYearStolen = newYear.setStolen;
const deleteNewYearUser = newYear.deleteUser;
const setNewYearWeeklyKingWins = newYear.setWeeklyKingWins;

async function addNewYearStolen(username, amount) {
  if (!pool || !username || !amount) return;
  await pool.query(`
    INSERT INTO newyear_stolen (username, total_stolen, lifetime_stolen)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET total_stolen = newyear_stolen.total_stolen + $2,
                  lifetime_stolen = newyear_stolen.lifetime_stolen + $2
  `, [username, Math.floor(amount)]);
}

async function addNewYearBeltSeconds(username, seconds) {
  if (!pool || !username || !seconds) return;
  await pool.query(`
    INSERT INTO newyear_stolen (username, belt_seconds, weekly_belt_seconds)
    VALUES ($1, $2, $2)
    ON CONFLICT (username)
    DO UPDATE SET belt_seconds = newyear_stolen.belt_seconds + $2,
                  weekly_belt_seconds = newyear_stolen.weekly_belt_seconds + $2
  `, [username, Math.floor(seconds)]);
}

async function getUserNewYearRank(username) {
  if (!pool || !username) return null;
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           RANK() OVER (ORDER BY total_stolen DESC) AS rank
    FROM newyear_stolen
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

async function getAllNewYearStolen() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, total_stolen, total_kos, belt_seconds, lifetime_stolen, weekly_king_wins, weekly_belt_seconds,
           ROW_NUMBER() OVER (ORDER BY total_stolen DESC, username ASC) AS rank
    FROM newyear_stolen
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

async function performNewYearWeeklyResetIfNeeded() {
  if (!pool) return null;
  const boundaryMs = mostRecentMidnightKyivMs(Date.now());
  const boundary = new Date(boundaryMs);

  const metaRes = await pool.query(`SELECT last_reset_at FROM newyear_weekly_meta WHERE id=1`);
  if (metaRes.rows.length === 0) {
    await pool.query(`INSERT INTO newyear_weekly_meta (id, last_reset_at) VALUES (1, $1)`, [boundary]);
    return null;
  }

  const lastReset = metaRes.rows[0].last_reset_at;
  if (boundary <= lastReset) return null;

  const winnerRes = await pool.query(`
    SELECT username, total_stolen, weekly_belt_seconds FROM newyear_stolen
    WHERE total_stolen > 0
    ORDER BY total_stolen DESC LIMIT 1
  `);
  let winner = null;
  if (winnerRes.rows.length) {
    winner = winnerRes.rows[0];
    await pool.query(`
      INSERT INTO newyear_weekly_kings (week_start, username, weekly_belt_seconds, weekly_points)
      VALUES ($1, $2, $3, $4)
    `, [lastReset, winner.username, winner.weekly_belt_seconds, winner.total_stolen]);
    await pool.query(`
      UPDATE newyear_stolen SET weekly_king_wins = weekly_king_wins + 1
      WHERE LOWER(username) = LOWER($1)
    `, [winner.username]);
  }

  await pool.query(`UPDATE newyear_stolen SET total_stolen = 0, weekly_belt_seconds = 0`);
  await pool.query(`UPDATE newyear_weekly_meta SET last_reset_at = $1 WHERE id=1`, [boundary]);

  console.log(`[NEWYEAR] Дневной сброс выполнен, граница=${boundary.toISOString()}, король дня: ${winner ? winner.username + ' (' + winner.total_stolen + ' очков)' : 'нет (очков никто не набрал)'}`);

  return { winner: winner ? winner.username : null, weekStart: lastReset.toISOString() };
}

async function getLastNewYearWeeklyChampion() {
  if (!pool) return null;
  const res = await pool.query(`
    SELECT username, weekly_points, week_start FROM newyear_weekly_kings
    ORDER BY week_start DESC LIMIT 1
  `);
  return res.rows.length ? {
    username: res.rows[0].username,
    weeklyPoints: Number(res.rows[0].weekly_points),
    weekStart: res.rows[0].week_start,
  } : null;
}

async function getNewYearWeeklyHistory() {
  if (!pool) return [];
  const res = await pool.query(`
    SELECT username, weekly_points, weekly_belt_seconds, week_start, created_at
    FROM newyear_weekly_kings ORDER BY week_start ASC
  `);
  return res.rows.map(r => ({
    username: r.username,
    weeklyPoints: Number(r.weekly_points),
    weekStart: r.week_start,
    createdAt: r.created_at,
  }));
}

// топ сезона (ноябрь–январь) — по ⭐ за всё время
async function getTopNewYearSeason(limit = 5) {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT username, lifetime_stolen FROM newyear_stolen WHERE lifetime_stolen > 0 ORDER BY lifetime_stolen DESC LIMIT $1`,
    [limit]
  );
  return res.rows.map(r => ({ username: r.username, lifetime_stolen: Number(r.lifetime_stolen) }));
}

// ── Boxing Arena RU: тот же еженедельный "Пояс чемпиона" (2026-08-08) ──
// 1-в-1 логика Street Fighter выше, только своя таблица/архив/метка сброса.

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

// ближайшая (текущая или прошлая) полночь по киевскому времени — общая для
// ежедневных сбросов всех игр
function mostRecentMidnightKyivMs(nowMs) {
  const offsetMin = tzOffsetMinutes(nowMs, 'Europe/Kyiv');
  const kyivNow = new Date(nowMs + offsetMin*60000);
  const kyivMidnightAsUtcFields = Date.UTC(
    kyivNow.getUTCFullYear(), kyivNow.getUTCMonth(), kyivNow.getUTCDate(), 0, 0, 0, 0
  );
  return kyivMidnightAsUtcFields - offsetMin*60000;
}

// ── Статистика эфиров ────────────────────────────────────────────────────────
// Если корзина уже есть (сервер перезапустился посреди 10 минут) — складываем.
async function saveStreamStats(r) {
  if (!pool) return;
  await pool.query(`
    INSERT INTO stream_stats (account, bucket, live_min, game_open_min, viewers_max, viewers_avg,
      joins, likes, likers, gifts, coins, gifters, chats, chatters, follows, shares, stream_ends)
    VALUES ($1, to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (account, bucket) DO UPDATE SET
      live_min = LEAST(10, stream_stats.live_min + EXCLUDED.live_min),
      game_open_min = LEAST(10, stream_stats.game_open_min + EXCLUDED.game_open_min),
      viewers_max = GREATEST(stream_stats.viewers_max, EXCLUDED.viewers_max),
      viewers_avg = GREATEST(stream_stats.viewers_avg, EXCLUDED.viewers_avg),
      joins = stream_stats.joins + EXCLUDED.joins, likes = stream_stats.likes + EXCLUDED.likes,
      likers = stream_stats.likers + EXCLUDED.likers, gifts = stream_stats.gifts + EXCLUDED.gifts,
      coins = stream_stats.coins + EXCLUDED.coins, gifters = stream_stats.gifters + EXCLUDED.gifters,
      chats = stream_stats.chats + EXCLUDED.chats, chatters = stream_stats.chatters + EXCLUDED.chatters,
      follows = stream_stats.follows + EXCLUDED.follows, shares = stream_stats.shares + EXCLUDED.shares,
      stream_ends = stream_stats.stream_ends + EXCLUDED.stream_ends
  `, [r.account, r.bucket, r.liveMin, r.openMin, r.viewersMax, r.viewersAvg, r.joins, r.likes, r.likers,
      r.gifts, r.coins, r.gifters, r.chats, r.chatters, r.follows, r.shares, r.streamEnds]);
}

// group: '10min' | 'hour' | 'day' (часы/дни — по Киеву). При группировке
// «чел» (лайкали/дарили/писали/зашло) — сумма по 10-минуткам, т.е. один
// и тот же человек в разных 10-минутках считается несколько раз.
async function getStreamStats(days, group, account) {
  if (!pool) return [];
  const per = group === 'day'  ? `to_char(date_trunc('day',  bucket AT TIME ZONE 'Europe/Kyiv'), 'YYYY-MM-DD')`
            : group === 'hour' ? `to_char(date_trunc('hour', bucket AT TIME ZONE 'Europe/Kyiv'), 'YYYY-MM-DD HH24:MI')`
            :                    `to_char(bucket AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD HH24:MI')`;
  const { rows } = await pool.query(`
    SELECT ${per} AS period, account,
      SUM(live_min)::int AS live_min, SUM(game_open_min)::int AS game_open_min,
      MAX(viewers_max)::int AS viewers_max,
      COALESCE(ROUND(AVG(NULLIF(viewers_avg, 0))), 0)::int AS viewers_avg,
      SUM(joins)::int AS joins, SUM(likes)::int AS likes, SUM(likers)::int AS likers,
      SUM(gifts)::int AS gifts, SUM(coins)::int AS coins, SUM(gifters)::int AS gifters,
      SUM(chats)::int AS chats, SUM(chatters)::int AS chatters,
      SUM(follows)::int AS follows, SUM(shares)::int AS shares, SUM(stream_ends)::int AS stream_ends
    FROM stream_stats
    WHERE bucket >= now() - make_interval(days => $1) AND ($2::text IS NULL OR account = $2)
    GROUP BY 1, 2 ORDER BY 1, 2
  `, [days, account]);
  return rows;
}

// сначала люди: кто впервые на этом аккаунте — тот «новый» (возвращает, сколько новых)
async function saveStreamPart(r, people) {
  if (!pool) return 0;
  let added = 0;
  if (people && people.length) {
    const { rows } = await pool.query(`
      INSERT INTO stream_people (account, person) SELECT $1, unnest($2::text[])
      ON CONFLICT (account, person) DO UPDATE SET last_seen = now()
      RETURNING (xmax = 0) AS inserted
    `, [r.account, people]);
    added = rows.filter(x => x.inserted).length;
  }
  await pool.query(`
    INSERT INTO stream_parts (account, room_id, part_id, started_at, last_live_at, live_min, viewers_max, viewers_sum, viewers_n,
      uniq_joined, uniq_likers, uniq_chatters, uniq_gifters, uniq_people, likes, chats, gifts, coins, follows, shares,
      top1, top2, top3, end_kind, closed, new_people)
    VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0), $6, $7, $8, $9, $10, $11, $12, $13, $14,
      $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
    ON CONFLICT (account, room_id, part_id) DO UPDATE SET
      last_live_at = EXCLUDED.last_live_at, live_min = EXCLUDED.live_min, viewers_max = EXCLUDED.viewers_max,
      viewers_sum = EXCLUDED.viewers_sum, viewers_n = EXCLUDED.viewers_n, uniq_joined = EXCLUDED.uniq_joined,
      uniq_likers = EXCLUDED.uniq_likers, uniq_chatters = EXCLUDED.uniq_chatters, uniq_gifters = EXCLUDED.uniq_gifters,
      uniq_people = EXCLUDED.uniq_people, likes = EXCLUDED.likes, chats = EXCLUDED.chats, gifts = EXCLUDED.gifts,
      coins = EXCLUDED.coins, follows = EXCLUDED.follows, shares = EXCLUDED.shares, top1 = EXCLUDED.top1,
      top2 = EXCLUDED.top2, top3 = EXCLUDED.top3, end_kind = EXCLUDED.end_kind, closed = EXCLUDED.closed,
      new_people = stream_parts.new_people + EXCLUDED.new_people
  `, [r.account, r.roomId, r.partId, r.startedAt, r.lastLiveAt, r.liveMin, r.viewersMax, r.viewersSum, r.viewersN,
      r.uniqJoined, r.uniqLikers, r.uniqChatters, r.uniqGifters, r.uniqPeople, r.likes, r.chats, r.gifts, r.coins,
      r.follows, r.shares, r.top1, r.top2, r.top3, r.endKind, r.closed, added]);
  return added;
}

async function saveStreamEvent(account, kind, details) {
  if (!pool) return;
  await pool.query(`INSERT INTO stream_events (account, kind, details) VALUES ($1, $2, $3)`, [account, kind, details]);
}

// Итоги эфиров (Киевское время). «Новые» = впервые замечены на этом аккаунте
// во время этого эфира (считается при записи, см. saveStreamPart). Если эфир записан несколькими частями (сервер
// перезапускался) — «разных людей» берётся по самой большой части (занижено).
async function getStreamSessions(days, account) {
  if (!pool) return [];
  const { rows } = await pool.query(`
    WITH s AS (
      SELECT account, room_id, MIN(started_at) AS st, MAX(last_live_at) AS en, SUM(live_min)::int AS live_min,
        MAX(viewers_max)::int AS viewers_max,
        COALESCE(ROUND(SUM(viewers_sum)::numeric / NULLIF(SUM(viewers_n), 0)), 0)::int AS viewers_avg,
        MAX(uniq_people)::int AS uniq_people, MAX(uniq_joined)::int AS uniq_joined, MAX(uniq_likers)::int AS uniq_likers,
        MAX(uniq_chatters)::int AS uniq_chatters, MAX(uniq_gifters)::int AS uniq_gifters,
        SUM(likes)::bigint AS likes, SUM(chats)::int AS chats, SUM(gifts)::int AS gifts, SUM(coins)::int AS coins,
        SUM(follows)::int AS follows, SUM(shares)::int AS shares,
        SUM(new_people)::int AS new_people, MAX(top1)::int AS top1, MAX(top2)::int AS top2, MAX(top3)::int AS top3,
        MAX(end_kind) AS end_kind, BOOL_OR(closed) AS closed, COUNT(*)::int AS parts
      FROM stream_parts
      WHERE started_at >= now() - make_interval(days => $1) AND ($2::text IS NULL OR account = $2)
      GROUP BY account, room_id
    )
    SELECT s.*,
      to_char(s.st AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD HH24:MI') AS started,
      to_char(s.en AT TIME ZONE 'Europe/Kyiv', 'YYYY-MM-DD HH24:MI') AS ended,
      (SELECT CASE WHEN COUNT(*) > 0 THEN 'да' ELSE '' END FROM stream_events e WHERE e.account = s.account
         AND e.kind = 'post' AND e.at BETWEEN s.st - interval '40 minutes' AND s.st + interval '5 minutes') AS post_before,
      (SELECT e.details FROM stream_events e WHERE e.account = s.account AND e.kind = 'restart'
         AND e.at BETWEEN s.en - interval '5 minutes' AND s.en + interval '25 minutes' ORDER BY e.at LIMIT 1) AS restart_reason
    FROM s ORDER BY s.st
  `, [days, account]);
  for (const r of rows) {
    r.new_people = Math.min(r.new_people, r.uniq_people);
    r.returning_people = Math.max(0, r.uniq_people - r.new_people);
    r.end_reason = r.restart_reason ? 'перезапуск: ' + r.restart_reason : (r.end_kind || (r.closed ? '' : 'идёт сейчас'));
    r.note = r.parts > 1 ? 'сервер перезапускался во время эфира — «разных людей» занижено' : '';
    delete r.st; delete r.en; delete r.restart_reason;
  }
  return rows;
}

function isConnected() { return pool !== null; }

module.exports = {
  init, saveStreamStats, getStreamStats, saveStreamPart, saveStreamEvent, getStreamSessions, addKill, getTopKillers, getUserRank, addBossDamage, getTopBossDamage,
  resetBossDamage, getUserBossDamageRank, addRaceCoins, getTopRaceDonations,
  addBoxingStolen, getTopBoxingStolen, getUserBoxingRank, addBoxingKO,
  addBoxingBeltSeconds, resetBoxingRating, setBoxingStolen, deleteBoxingUser,
  getAllBoxingStolen, performBoxingWeeklyResetIfNeeded, getLastBoxingWeeklyChampion,
  setBoxingWeeklyKingWins, getBoxingWeeklyHistory,
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
  addStreetWarsStolen, getTopStreetWarsStolen, getUserStreetWarsRank,
  addStreetWarsKO, addStreetWarsBeltSeconds, resetStreetWarsRating,
  setStreetWarsStolen, deleteStreetWarsUser, getAllStreetWarsStolen,
  performStreetWarsWeeklyResetIfNeeded, getLastStreetWarsWeeklyChampion,
  setStreetWarsWeeklyKingWins, getStreetWarsWeeklyHistory,
  addNewYearStolen, getTopNewYearStolen, getUserNewYearRank,
  addNewYearKO, resetNewYearRating,
  setNewYearStolen, deleteNewYearUser, getAllNewYearStolen,
  performNewYearWeeklyResetIfNeeded, getLastNewYearWeeklyChampion,
  setNewYearWeeklyKingWins, getNewYearWeeklyHistory, getTopNewYearSeason,
  saveGameStateSnapshot, getGameStateSnapshot,
  isConnected,
};
