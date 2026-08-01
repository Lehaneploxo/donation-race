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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS boxing_stolen_en (
      username TEXT PRIMARY KEY,
      total_stolen INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE boxing_stolen_en ADD COLUMN IF NOT EXISTS total_kos INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE boxing_stolen_en ADD COLUMN IF NOT EXISTS belt_seconds INTEGER NOT NULL DEFAULT 0`);
  console.log('[DB] Таблицы kills, boss_damage, race_donations, boxing_stolen и boxing_stolen_en готовы');
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

const addBoxingStolen = boxingRu.addStolen;
const getTopBoxingStolen = boxingRu.getTop;
const getAllBoxingStolen = boxingRu.getAll;
const getUserBoxingRank = boxingRu.getUserRank;
const addBoxingKO = boxingRu.addKO;
const addBoxingBeltSeconds = boxingRu.addBeltSeconds;
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

function isConnected() { return pool !== null; }

module.exports = {
  init, addKill, getTopKillers, getUserRank, addBossDamage, getTopBossDamage,
  resetBossDamage, getUserBossDamageRank, addRaceCoins, getTopRaceDonations,
  addBoxingStolen, getTopBoxingStolen, getUserBoxingRank, addBoxingKO,
  addBoxingBeltSeconds, resetBoxingRating, setBoxingStolen, deleteBoxingUser,
  getAllBoxingStolen,
  addBoxingStolenEn, getTopBoxingStolenEn, getUserBoxingRankEn, addBoxingKOEn,
  addBoxingBeltSecondsEn, resetBoxingRatingEn, setBoxingStolenEn, deleteBoxingUserEn,
  getAllBoxingStolenEn,
  isConnected,
};
