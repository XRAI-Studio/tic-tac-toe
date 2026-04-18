// Seed 6 demo users + ~12 games each so the leaderboard isn't empty on first load.
import 'dotenv/config';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db.js';

const DEMO_USERS = [
  { name: 'Nova',  email: 'nova@cube3.app',  picture: 'https://images.pexels.com/photos/7047671/pexels-photo-7047671.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200&w=200' },
  { name: 'Orion', email: 'orion@cube3.app', picture: 'https://images.pexels.com/photos/7046708/pexels-photo-7046708.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200&w=200' },
  { name: 'Zen',   email: 'zen@cube3.app',   picture: null },
  { name: 'Lyra',  email: 'lyra@cube3.app',  picture: null },
  { name: 'Axel',  email: 'axel@cube3.app',  picture: null },
  { name: 'Kai',   email: 'kai@cube3.app',   picture: null },
];
const MODES = ['ai_easy', 'ai_medium', 'ai_hard', 'local_2p', 'local_3p'];
const RESULTS = ['win', 'win', 'win', 'loss', 'loss', 'draw'];
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sql = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');

await pool.query('DELETE FROM games WHERE is_seed = 1');

for (const u of DEMO_USERS) {
  const [[existing]] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [u.email]);
  let userId;
  if (existing) {
    userId = existing.user_id;
    await pool.query('UPDATE users SET name = ?, picture = ? WHERE user_id = ?', [u.name, u.picture, userId]);
  } else {
    userId = `user_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    await pool.query(
      'INSERT INTO users (user_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, u.email, u.name, u.picture, sql(Date.now())]
    );
  }

  const count = 8 + Math.floor(Math.random() * 9);
  for (let i = 0; i < count; i++) {
    const createdAt = sql(Date.now() - Math.floor(Math.random() * 30) * 86400000);
    await pool.query(
      `INSERT INTO games (game_id, user_id, user_name, user_picture, board_size, mode, result, moves, duration_ms, created_at, is_seed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [`game_${uuidv4().replace(/-/g, '').slice(0, 12)}`, userId, u.name, u.picture,
        rand([3, 3, 3, 4]), rand(MODES), rand(RESULTS),
        6 + Math.floor(Math.random() * 25), 30000 + Math.floor(Math.random() * 570000), createdAt]
    );
  }
}

console.log(`[seed] ${DEMO_USERS.length} demo users and games inserted`);
await pool.end();
