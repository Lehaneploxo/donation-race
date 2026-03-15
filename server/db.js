const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kills (
      username TEXT PRIMARY KEY,
      total_kills INTEGER NOT NULL DEFAULT 0
    )
  `);
  console.log('[DB] Таблица kills готова');
}

async function addKill(username) {
  if (!username) return;
  await pool.query(`
    INSERT INTO kills (username, total_kills)
    VALUES ($1, 1)
    ON CONFLICT (username)
    DO UPDATE SET total_kills = kills.total_kills + 1
  `, [username]);
}

async function getTopKillers(limit = 10) {
  const res = await pool.query(
    'SELECT username, total_kills FROM kills ORDER BY total_kills DESC LIMIT $1',
    [limit]
  );
  return res.rows;
}

module.exports = { init, addKill, getTopKillers };
