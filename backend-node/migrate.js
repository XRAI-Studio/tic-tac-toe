// Applies /app/backend-node/schema.sql to the configured MySQL database.
// Run once after creating the DB in hPanel: `node migrate.js`
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import mysql from 'mysql2/promise';

const __dirname = dirname(fileURLToPath(import.meta.url));

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  multipleStatements: true,
});

const sql = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8');
await conn.query(sql);
console.log('[migrate] schema applied');
await conn.end();
