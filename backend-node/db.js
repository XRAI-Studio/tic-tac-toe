// Singleton MySQL connection pool for the Cube3 backend.
// All other modules `import { pool } from './db.js'`.
import 'dotenv/config';
import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  dateStrings: false,
  timezone: 'Z',
});

// Fire-and-forget sanity check so mis-configured DBs surface in logs early.
pool.query('SELECT 1')
  .then(() => console.log('[db] MySQL connected'))
  .catch((err) => console.error('[db] MySQL connection failed:', err.message));
