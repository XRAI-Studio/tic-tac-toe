// Cube3 — Node.js + Express + MySQL backend
// Hostinger Business compatible (LiteSpeed NodeJS / Passenger friendly).
// Every /api/* endpoint matches the original FastAPI implementation 1:1.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { pool } from './db.js';

const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

const originRegex = new RegExp(process.env.CORS_ORIGIN_REGEX || '.*');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);          // curl, server-to-server
    return cb(null, originRegex.test(origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

const EMERGENT_AUTH_URL = 'https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data';
const SESSION_DAYS = 7;
const SECURE_COOKIES = (process.env.INSECURE_COOKIES || 'false') !== 'true';

// ---------- helpers ----------
function shortId(prefix = '', bytes = 6) {
  return `${prefix}${uuidv4().replace(/-/g, '').slice(0, bytes * 2)}`;
}
function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function plusDaysSql(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}
async function getCurrentUser(req) {
  let token = req.cookies?.session_token;
  if (!token) {
    const header = req.headers.authorization;
    if (header?.toLowerCase().startsWith('bearer ')) token = header.slice(7).trim();
  }
  if (!token) return null;
  const [[session]] = await pool.query(
    'SELECT user_id, expires_at FROM user_sessions WHERE session_token = ? LIMIT 1',
    [token]
  );
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;
  const [[user]] = await pool.query(
    'SELECT user_id, email, name, picture FROM users WHERE user_id = ? LIMIT 1',
    [session.user_id]
  );
  return user || null;
}
function requireUser(handler) {
  return async (req, res, next) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ detail: 'Not authenticated' });
      req.user = user;
      return handler(req, res, next);
    } catch (err) { next(err); }
  };
}

// ---------- routes ----------
app.get('/api/', (_req, res) => res.json({ message: 'Cube3 Tic-Tac-Toe API' }));

// ----- Auth -----
app.post('/api/auth/session', async (req, res, next) => {
  try {
    const sessionId = req.body?.session_id;
    if (!sessionId) return res.status(400).json({ detail: 'session_id required' });

    let data;
    try {
      const r = await axios.get(EMERGENT_AUTH_URL, {
        headers: { 'X-Session-ID': sessionId }, timeout: 20000,
      });
      data = r.data;
    } catch {
      return res.status(401).json({ detail: 'Invalid session_id' });
    }

    const { email, name, picture, session_token } = data;
    const safeName = name || email;

    const [[existing]] = await pool.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [email]);
    let userId;
    if (existing) {
      userId = existing.user_id;
      await pool.query('UPDATE users SET name = ?, picture = ? WHERE user_id = ?', [safeName, picture, userId]);
    } else {
      userId = shortId('user_');
      await pool.query(
        'INSERT INTO users (user_id, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?)',
        [userId, email, safeName, picture, nowSql()]
      );
    }

    await pool.query(
      'INSERT INTO user_sessions (session_token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      [session_token, userId, plusDaysSql(SESSION_DAYS), nowSql()]
    );

    res.cookie('session_token', session_token, {
      maxAge: SESSION_DAYS * 86400_000,
      httpOnly: true,
      secure: SECURE_COOKIES,
      sameSite: SECURE_COOKIES ? 'none' : 'lax',
      path: '/',
    });

    res.json({ user_id: userId, email, name: safeName, picture, session_token });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', requireUser(async (req, res) => {
  const { user_id, email, name, picture } = req.user;
  res.json({ user_id, email, name, picture });
}));

app.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.session_token
    || (req.headers.authorization?.toLowerCase().startsWith('bearer ')
      ? req.headers.authorization.slice(7).trim() : null);
  if (token) await pool.query('DELETE FROM user_sessions WHERE session_token = ?', [token]);
  res.clearCookie('session_token', { path: '/' });
  res.json({ ok: true });
});

// ----- Games -----
app.post('/api/games/record', requireUser(async (req, res) => {
  const { board_size, mode, result, moves, duration_ms } = req.body || {};
  const gameId = shortId('game_');
  await pool.query(
    `INSERT INTO games
      (game_id, user_id, user_name, user_picture, board_size, mode, result, moves, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [gameId, req.user.user_id, req.user.name, req.user.picture,
      board_size, mode, result, moves, duration_ms ?? null, nowSql()]
  );
  res.json({ game_id: gameId });
}));

app.get('/api/games/history/:user_id', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const [rows] = await pool.query(
      `SELECT game_id, user_id, user_name, user_picture, board_size, mode, result, moves, duration_ms, created_at
         FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [req.params.user_id, limit]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ----- Saved games (auto-resume) -----
app.post('/api/games/saved', requireUser(async (req, res) => {
  const { board_size, mode, moves } = req.body || {};
  await pool.query(
    `INSERT INTO saved_games (user_id, board_size, mode, moves, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE board_size = VALUES(board_size), mode = VALUES(mode),
                             moves = VALUES(moves), updated_at = VALUES(updated_at)`,
    [req.user.user_id, board_size, mode, JSON.stringify(moves || []), nowSql()]
  );
  res.json({ ok: true });
}));

app.get('/api/games/saved', requireUser(async (req, res) => {
  const [[row]] = await pool.query(
    'SELECT user_id, board_size, mode, moves, updated_at FROM saved_games WHERE user_id = ? LIMIT 1',
    [req.user.user_id]
  );
  if (!row) return res.json(null);
  // MySQL JSON columns already return parsed; guard for mysql2 string mode.
  if (typeof row.moves === 'string') { try { row.moves = JSON.parse(row.moves); } catch { row.moves = []; } }
  res.json(row);
}));

app.delete('/api/games/saved', requireUser(async (req, res) => {
  await pool.query('DELETE FROM saved_games WHERE user_id = ?', [req.user.user_id]);
  res.json({ ok: true });
}));

// ----- Stats & leaderboard -----
app.get('/api/users/stats/:user_id', async (req, res, next) => {
  try {
    const [[user]] = await pool.query(
      'SELECT user_id, name, picture FROM users WHERE user_id = ? LIMIT 1', [req.params.user_id]);
    if (!user) return res.status(404).json({ detail: 'User not found' });

    const [rows] = await pool.query(
      'SELECT board_size, mode, result FROM games WHERE user_id = ?', [req.params.user_id]);

    // Defensive: mirror Python's RESULT_TO_KEY map so a future `result` value
    // (e.g., "forfeit") can't silently get dropped or typo'd into an unused key.
    const RESULT_TO_KEY = { win: 'wins', loss: 'losses', draw: 'draws' };

    const total = rows.length;
    const wins   = rows.filter(g => g.result === 'win').length;
    const losses = rows.filter(g => g.result === 'loss').length;
    const draws  = rows.filter(g => g.result === 'draw').length;
    const win_rate = total ? Math.round((wins / total) * 1000) / 10 : 0;

    const byBoard = { 3: {games:0,wins:0,losses:0,draws:0}, 4: {games:0,wins:0,losses:0,draws:0} };
    const byMode  = {};
    for (const g of rows) {
      const b = g.board_size;
      const bucket = RESULT_TO_KEY[g.result];
      if (byBoard[b]) {
        byBoard[b].games++;
        if (bucket) byBoard[b][bucket]++;
      }
      if (!byMode[g.mode]) byMode[g.mode] = {games:0,wins:0,losses:0,draws:0};
      byMode[g.mode].games++;
      if (bucket) byMode[g.mode][bucket]++;
    }

    res.json({
      user_id: user.user_id, name: user.name, picture: user.picture,
      games_played: total, wins, losses, draws, win_rate,
      by_board: { '3': byBoard[3], '4': byBoard[4] }, by_mode: byMode,
    });
  } catch (err) { next(err); }
});

app.get('/api/leaderboard', async (req, res, next) => {
  try {
    const { board_size, mode, period = 'all' } = req.query;
    const where = [];
    const params = [];
    if (board_size)               { where.push('board_size = ?'); params.push(Number(board_size)); }
    if (mode === 'ai')            { where.push("mode IN ('ai_easy','ai_medium','ai_hard')"); }
    else if (mode === 'local')    { where.push("mode IN ('local_2p','local_3p')"); }
    if (period === 'weekly')      { where.push('created_at >= (NOW() - INTERVAL 7 DAY)'); }
    else if (period === 'monthly'){ where.push('created_at >= (NOW() - INTERVAL 30 DAY)'); }

    const sql = `SELECT user_id, user_name, user_picture, result, board_size, mode
                   FROM games ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const [rows] = await pool.query(sql, params);

    // Defensive: mirror Python's RESULT_TO_KEY map.
    const RESULT_TO_KEY = { win: 'wins', loss: 'losses', draw: 'draws' };

    const agg = new Map();
    for (const g of rows) {
      if (!agg.has(g.user_id)) agg.set(g.user_id, {
        user_id: g.user_id, name: g.user_name, picture: g.user_picture,
        games_played: 0, wins: 0, losses: 0, draws: 0,
      });
      const a = agg.get(g.user_id);
      a.games_played++;
      const bucket = RESULT_TO_KEY[g.result];
      if (bucket) a[bucket]++;
    }
    const result = [...agg.values()].map(a => {
      const wr = a.games_played ? (a.wins / a.games_played) * 100 : 0;
      return { ...a, win_rate: Math.round(wr * 10) / 10, score: a.wins * 3 + a.draws + Math.trunc(wr) };
    }).sort((x, y) => y.score - x.score || y.wins - x.wins || y.win_rate - x.win_rate);

    res.json(result.slice(0, Math.min(Number(req.query.limit) || 50, 200)));
  } catch (err) { next(err); }
});

// ----- Replays -----
app.post('/api/replays', async (req, res, next) => {
  try {
    const user = await getCurrentUser(req);
    const { board_size, mode, moves, winner = null, result = null, player_name } = req.body || {};
    const replayId = uuidv4().replace(/-/g, '').slice(0, 10);
    await pool.query(
      `INSERT INTO replays
        (replay_id, board_size, mode, moves, winner, result, player_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [replayId, board_size, mode, JSON.stringify(moves || []),
       winner, result, user?.name || player_name || 'Guest', nowSql()]
    );
    res.json({ replay_id: replayId });
  } catch (err) { next(err); }
});

app.get('/api/replays/:id', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      `SELECT replay_id, board_size, mode, moves, winner, result, player_name, created_at
         FROM replays WHERE replay_id = ? LIMIT 1`, [req.params.id]);
    if (!row) return res.status(404).json({ detail: 'Replay not found' });
    if (typeof row.moves === 'string') { try { row.moves = JSON.parse(row.moves); } catch { row.moves = []; } }
    res.json(row);
  } catch (err) { next(err); }
});

// ----- Error handler -----
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ detail: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 8001;
app.listen(PORT, '0.0.0.0', () => console.log(`[server] listening on :${PORT}`));

export default app;
