// Cube3 — Express app factory (testable; no side effects on import).
// `createApp({ pool, fetchEmergentSession })` returns the configured app.
// server.js wires in the real MySQL pool + Emergent fetcher and calls listen().
// Every /api/* endpoint matches the original FastAPI implementation (backend/server.py) 1:1.
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

const SESSION_DAYS = 7;
const MAX_NAME_LEN = 40;          // cap user-controlled player_name before it hits HTML/SVG
const DAILY_MOVES_MAX = 200;      // sanity bound for daily submissions

// ---------- Daily Cube constants (mirror backend/server.py) ----------
// Day #1 = the day Phase 6 launched (UTC).
const DAILY_EPOCH_MS = Date.UTC(2026, 1, 19); // month is 0-based: 1 => February
const OPENING_HUMAN_CHOICES = [13, 4, 22, 12, 14, 10, 16];
const OPENING_AI_CHOICES = [0, 2, 6, 8, 18, 20, 24, 26];
const DAILY_PAR = 9;

// ---------- OG card palette (mirror backend/server.py) ----------
const PLAYER_HEX = ['#2B4FFF', '#FF1744', '#00E676'];
const PLAYER_LABELS = ['Blue', 'Red', 'Green'];

// ---------- small pure helpers ----------
function shortId(prefix = '', bytes = 6) {
  return `${prefix}${uuidv4().replace(/-/g, '').slice(0, bytes * 2)}`;
}
function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function plusDaysSql(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}
function todayUtcIso() {
  return new Date().toISOString().slice(0, 10); // yyyy-mm-dd (UTC)
}
function seededRand(seedStr) {
  // Mirror Python: int(md5(seed).hexdigest()[:8], 16)
  const hex = crypto.createHash('md5').update(seedStr).digest('hex').slice(0, 8);
  return parseInt(hex, 16);
}
export function escapeXml(value) {
  // Safe for both HTML text/attributes and SVG text/attributes.
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function cleanName(name) {
  return String(name ?? 'Guest').slice(0, MAX_NAME_LEN);
}

// Deterministic daily challenge config from an ISO date string (yyyy-mm-dd, UTC).
export function dailyConfig(dateIso) {
  const dayNumber = Math.floor((Date.parse(dateIso + 'T00:00:00Z') - DAILY_EPOCH_MS) / 86400000) + 1;
  const seed = seededRand(dateIso + ':opening');
  const hMove = OPENING_HUMAN_CHOICES[seed % OPENING_HUMAN_CHOICES.length];
  const aiMove = OPENING_AI_CHOICES[(seed >> 8) % OPENING_AI_CHOICES.length];
  return {
    day_number: dayNumber,
    date: dateIso,
    board_size: 3,
    ai_difficulty: 'hard',
    starting_moves: [
      { player: 0, flat: hMove },
      { player: 1, flat: aiMove },
    ],
    par: DAILY_PAR,
  };
}

// ---------- OG SVG (mirror backend/server.py _build_og_svg) ----------
function replayToBoard(replay) {
  const N = Number(replay.board_size || 3);
  const board = new Array(N * N * N).fill(null);
  for (const m of replay.moves || []) {
    const flat = m?.flat;
    if (flat != null && flat >= 0 && flat < board.length) board[flat] = m.player;
  }
  return { N, board };
}
function outcomeLabel(replay) {
  if (replay.result === 'draw') return 'Drew the match';
  const w = replay.winner;
  if (w == null) return 'Match in progress';
  const name = w >= 0 && w < PLAYER_LABELS.length ? PLAYER_LABELS[w] : 'Player';
  return `${name} wins`;
}
function outcomeAccent(replay) {
  if (replay.result === 'draw') return '#94A3B8';
  const w = replay.winner;
  if (w != null && w >= 0 && w < PLAYER_HEX.length) return PLAYER_HEX[w];
  return '#2B4FFF';
}
function svgHeader(N, movesCount, outcome, accent, playerName) {
  const o = escapeXml(outcome);
  const p = escapeXml(playerName);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">' +
    '<defs><radialGradient id="bgGrad" cx="50%" cy="50%" r="60%">' +
    '<stop offset="0%" stop-color="#0A1A4F" stop-opacity="0.6"/>' +
    '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>' +
    '</radialGradient></defs>' +
    '<rect width="1200" height="630" fill="#000000"/>' +
    '<rect width="1200" height="630" fill="url(#bgGrad)"/>' +
    '<text x="60" y="80" font-family="Inter, sans-serif" font-weight="900" font-size="44" ' +
    'fill="#ffffff" letter-spacing="6">CUBE<tspan fill="#2B4FFF">3</tspan></text>' +
    `<text x="60" y="115" font-family="Inter, sans-serif" font-weight="600" font-size="20" ` +
    `fill="#94A3B8" letter-spacing="3">${N}×${N}×${N} · ${movesCount} moves</text>` +
    `<text x="1140" y="80" text-anchor="end" font-family="Inter, sans-serif" font-weight="900" ` +
    `font-size="44" fill="${accent}">${o}</text>` +
    `<text x="1140" y="115" text-anchor="end" font-family="Inter, sans-serif" font-weight="500" ` +
    `font-size="20" fill="#94A3B8">by ${p}</text>`
  );
}
function svgMark(value, midx, midy, sz) {
  const color = PLAYER_HEX[value];
  if (value === 0) {
    return (
      `<line x1="${midx - sz}" y1="${midy - sz}" x2="${midx + sz}" y2="${midy + sz}" ` +
      `stroke="${color}" stroke-width="6" stroke-linecap="round"/>` +
      `<line x1="${midx + sz}" y1="${midy - sz}" x2="${midx - sz}" y2="${midy + sz}" ` +
      `stroke="${color}" stroke-width="6" stroke-linecap="round"/>`
    );
  }
  if (value === 1) {
    return `<circle cx="${midx}" cy="${midy}" r="${sz}" fill="none" stroke="${color}" stroke-width="6"/>`;
  }
  const h = sz * 1.05;
  return (
    `<polygon points="${midx},${midy - h} ${midx + sz},${midy + h * 0.7} ${midx - sz},${midy + h * 0.7}" ` +
    `fill="none" stroke="${color}" stroke-width="6" stroke-linejoin="round"/>`
  );
}
function svgLevelGrid(L, gx, gridY, gridW, cellSize, N, board) {
  const parts = [
    `<text x="${gx + gridW / 2}" y="${gridY - 14}" text-anchor="middle" ` +
    `font-family="Inter, sans-serif" font-weight="700" font-size="16" fill="#2B4FFF" ` +
    `letter-spacing="3">L${L + 1}</text>`,
  ];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const fi = L * N * N + r * N + c;
      const cx = gx + c * cellSize;
      const cy = gridY + r * cellSize;
      const v = board[fi];
      const fill = v == null ? '#0A1428' : PLAYER_HEX[v] + '20';
      const stroke = v == null ? '#2B4FFF40' : PLAYER_HEX[v];
      parts.push(
        `<rect x="${cx + 4}" y="${cy + 4}" width="${cellSize - 8}" height="${cellSize - 8}" ` +
        `rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
      );
      if (v != null) parts.push(svgMark(v, cx + cellSize / 2, cy + cellSize / 2, cellSize * 0.32));
    }
  }
  return parts.join('');
}
export function buildOgSvg(replay) {
  const { N, board } = replayToBoard(replay);
  const movesCount = (replay.moves || []).length;
  const outcome = outcomeLabel(replay);
  const accent = outcomeAccent(replay);
  const playerName = cleanName(replay.player_name || 'Guest');

  const pad = 60;
  const titleH = 130;
  const availW = 1200 - 2 * pad;
  const availH = 630 - titleH - pad - 60;
  const gridW = (availW - 60 * (N - 1)) / N;
  const cellSize = gridW / N;
  const gridsH = cellSize * N;
  const gridY = titleH + (availH - gridsH) / 2 + 20;

  const parts = [svgHeader(N, movesCount, outcome, accent, playerName)];
  for (let L = 0; L < N; L++) {
    parts.push(svgLevelGrid(L, pad + L * (gridW + 60), gridY, gridW, cellSize, N, board));
  }
  parts.push(
    '<text x="600" y="600" text-anchor="middle" font-family="Inter, sans-serif" ' +
    'font-weight="500" font-size="18" fill="#475569">3D Tic-Tac-Toe · play.cube3</text></svg>'
  );
  return parts.join('');
}

// ---------- the factory ----------
export function createApp({ pool, fetchEmergentSession }) {
  const isProd = process.env.NODE_ENV === 'production';

  // CORS: prefer an EXACT-origin allowlist (most secure with credentials). A regex is
  // a dev-only convenience — an unanchored/`.*` regex would let hostile origins through.
  const allowList = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const originRegex = process.env.CORS_ORIGIN_REGEX ? new RegExp(process.env.CORS_ORIGIN_REGEX) : null;

  // Validate PUBLIC_BASE_URL into a canonical bare origin (used for absolute share/OG links).
  let publicBaseOrigin = null;
  if (process.env.PUBLIC_BASE_URL) {
    let u;
    try { u = new URL(process.env.PUBLIC_BASE_URL); }
    catch { throw new Error('PUBLIC_BASE_URL is not a valid URL.'); }
    if (isProd && u.protocol !== 'https:') throw new Error('PUBLIC_BASE_URL must use https in production.');
    if (u.pathname !== '/' || u.search || u.hash) throw new Error('PUBLIC_BASE_URL must be a bare origin (no path/query/hash).');
    publicBaseOrigin = u.origin;
  }

  // Fail-closed in production.
  if (isProd && allowList.length === 0) {
    throw new Error('CORS_ALLOWED_ORIGINS must list exact allowed origins in production (no wildcard CORS with credentials).');
  }
  if (isProd && !publicBaseOrigin) {
    throw new Error('PUBLIC_BASE_URL must be set in production (used for absolute share/OG URLs).');
  }

  const SECURE_COOKIES = (process.env.INSECURE_COOKIES || 'false') !== 'true';

  function isAllowedOrigin(origin) {
    if (allowList.length) return allowList.includes(origin);   // exact match (prod)
    if (originRegex) return originRegex.test(origin);          // dev convenience
    return true;                                               // no config (dev) → allow all
  }

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);   // curl / server-to-server
      return cb(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }));

  // Absolute origin for share/OG. Validated PUBLIC_BASE_URL wins (mandatory in prod);
  // proxy-header fallback is for local dev / tests only (never trusted in prod).
  function publicOrigin(req) {
    if (publicBaseOrigin) return publicBaseOrigin;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  async function getCurrentUser(req) {
    let token = req.cookies?.session_token;
    if (!token) {
      const header = req.headers.authorization;
      if (header?.toLowerCase().startsWith('bearer ')) token = header.slice(7).trim();
    }
    if (!token) return null;
    const [[session]] = await pool.query(
      'SELECT user_id, expires_at FROM user_sessions WHERE session_token = ? LIMIT 1', [token]);
    if (!session) return null;
    if (new Date(session.expires_at).getTime() < Date.now()) return null;
    const [[user]] = await pool.query(
      'SELECT user_id, email, name, picture FROM users WHERE user_id = ? LIMIT 1', [session.user_id]);
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

  // Health check with DB ping (used by smoke tests / uptime monitors).
  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', db: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down' });
    }
  });

  // ----- Auth -----
  app.post('/api/auth/session', async (req, res, next) => {
    try {
      const sessionId = req.body?.session_id;
      if (!sessionId) return res.status(400).json({ detail: 'session_id required' });

      let data;
      try {
        data = await fetchEmergentSession(sessionId);
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
          [userId, email, safeName, picture, nowSql()]);
      }

      // Re-auth with the same Emergent session_id returns the same session_token, so a
      // refresh / double-submit must be idempotent (session_token is the PK). No VALUES()
      // (deprecated on MySQL 8.0.20+, and we target MariaDB too): re-pass params.
      const sessionExpires = plusDaysSql(SESSION_DAYS);
      const sessionCreated = nowSql();
      await pool.query(
        `INSERT INTO user_sessions (session_token, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = ?, expires_at = ?, created_at = ?`,
        [session_token, userId, sessionExpires, sessionCreated, userId, sessionExpires, sessionCreated]);

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
        board_size, mode, result, moves, duration_ms ?? null, nowSql()]);
    res.json({ game_id: gameId });
  }));

  app.get('/api/games/history/:user_id', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const [rows] = await pool.query(
        `SELECT game_id, user_id, user_name, user_picture, board_size, mode, result, moves, duration_ms, created_at
           FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
        [req.params.user_id, limit]);
      res.json(rows);
    } catch (err) { next(err); }
  });

  // ----- Saved games (auto-resume) -----
  app.post('/api/games/saved', requireUser(async (req, res) => {
    const { board_size, mode, moves } = req.body || {};
    const movesJson = JSON.stringify(moves || []);
    const ts = nowSql();
    // No VALUES() (deprecated on MySQL 8.0.20+, and we target MariaDB too): re-pass params.
    await pool.query(
      `INSERT INTO saved_games (user_id, board_size, mode, moves, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE board_size = ?, mode = ?, moves = ?, updated_at = ?`,
      [req.user.user_id, board_size, mode, movesJson, ts, board_size, mode, movesJson, ts]);
    res.json({ ok: true });
  }));

  app.get('/api/games/saved', requireUser(async (req, res) => {
    const [[row]] = await pool.query(
      'SELECT user_id, board_size, mode, moves, updated_at FROM saved_games WHERE user_id = ? LIMIT 1',
      [req.user.user_id]);
    if (!row) return res.json(null);
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

      const RESULT_TO_KEY = { win: 'wins', loss: 'losses', draw: 'draws' };
      const total = rows.length;
      const wins = rows.filter(g => g.result === 'win').length;
      const losses = rows.filter(g => g.result === 'loss').length;
      const draws = rows.filter(g => g.result === 'draw').length;
      const win_rate = total ? Math.round((wins / total) * 1000) / 10 : 0;

      const byBoard = { 3: { games: 0, wins: 0, losses: 0, draws: 0 }, 4: { games: 0, wins: 0, losses: 0, draws: 0 } };
      const byMode = {};
      for (const g of rows) {
        const b = g.board_size;
        const bucket = RESULT_TO_KEY[g.result];
        if (byBoard[b]) { byBoard[b].games++; if (bucket) byBoard[b][bucket]++; }
        if (!byMode[g.mode]) byMode[g.mode] = { games: 0, wins: 0, losses: 0, draws: 0 };
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
      if (board_size) { where.push('board_size = ?'); params.push(Number(board_size)); }
      if (mode === 'ai') { where.push("mode IN ('ai_easy','ai_medium','ai_hard')"); }
      else if (mode === 'local') { where.push("mode IN ('local_2p','local_3p')"); }
      if (period === 'weekly') { where.push('created_at >= (NOW() - INTERVAL 7 DAY)'); }
      else if (period === 'monthly') { where.push('created_at >= (NOW() - INTERVAL 30 DAY)'); }

      const sql = `SELECT user_id, user_name, user_picture, result, board_size, mode
                     FROM games ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
      const [rows] = await pool.query(sql, params);

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
  // Validate untrusted replay input so OG/SVG rendering can't be abused (huge boards,
  // out-of-range cells, bogus player ids).
  function validReplayInput(body) {
    const { board_size, moves, winner = null, result = null } = body || {};
    const N = Number(board_size);
    if (![3, 4].includes(N)) return false;
    if (!Array.isArray(moves) || moves.length > 200) return false;
    const cells = N * N * N;
    for (const m of moves) {
      if (!m || !Number.isInteger(m.flat) || m.flat < 0 || m.flat >= cells) return false;
      if (![0, 1, 2].includes(m.player)) return false;
    }
    if (winner !== null && ![0, 1, 2].includes(winner)) return false;
    if (result !== null && !['win', 'loss', 'draw'].includes(result)) return false;
    return true;
  }

  app.post('/api/replays', async (req, res, next) => {
    try {
      if (!validReplayInput(req.body)) return res.status(400).json({ detail: 'invalid replay' });
      const user = await getCurrentUser(req);
      const { board_size, mode, moves, winner = null, result = null, player_name } = req.body || {};
      const replayId = uuidv4().replace(/-/g, '').slice(0, 10);
      await pool.query(
        `INSERT INTO replays
          (replay_id, board_size, mode, moves, winner, result, player_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [replayId, board_size, mode, JSON.stringify(moves || []),
          winner, result, cleanName(user?.name || player_name || 'Guest'), nowSql()]);
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

  // Load a replay and normalize its moves JSON. Returns null if not found.
  async function loadReplay(id) {
    const [[row]] = await pool.query(
      `SELECT replay_id, board_size, mode, moves, winner, result, player_name, created_at
         FROM replays WHERE replay_id = ? LIMIT 1`, [id]);
    if (!row) return null;
    if (typeof row.moves === 'string') { try { row.moves = JSON.parse(row.moves); } catch { row.moves = []; } }
    return row;
  }

  // ----- Share / OG (social unfurl) -----
  app.get('/api/og/replay/:id.svg', async (req, res, next) => {
    try {
      const replay = await loadReplay(req.params.id);
      if (!replay) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).json({ detail: 'Replay not found' });
      }
      const svg = buildOgSvg(replay);
      res.set('Content-Type', 'image/svg+xml');
      res.set('Cache-Control', 'public, max-age=86400, immutable'); // replay IDs are immutable
      res.set('ETag', `"og-${replay.replay_id}"`);
      res.send(svg);
    } catch (err) { next(err); }
  });

  app.get('/api/share/:id', async (req, res, next) => {
    try {
      const replay = await loadReplay(req.params.id);
      if (!replay) {
        res.set('Cache-Control', 'no-store');
        return res.status(404).type('html').send('<!doctype html><title>Not found</title><p>Replay not found.</p>');
      }
      const origin = publicOrigin(req);
      const imageUrl = `${origin}/api/og/replay/${replay.replay_id}.svg`;
      const spaUrl = `${origin}/replay/${replay.replay_id}`;
      const N = Number(replay.board_size || 3);
      const outcome = outcomeLabel(replay);
      const movesCount = (replay.moves || []).length;
      const playerName = cleanName(replay.player_name || 'Guest');

      const title = escapeXml(`Cube3 — ${outcome} · ${N}×${N}×${N}`);
      const desc = escapeXml(`${playerName} · ${outcome} in ${movesCount} moves. Watch the replay or try to beat the position.`);
      const img = escapeXml(imageUrl);
      const spa = escapeXml(spaUrl);

      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<meta name="description" content="${desc}"/>
<meta property="og:type" content="website"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="${spa}"/>
<meta property="og:site_name" content="Cube3"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
<meta name="twitter:image" content="${img}"/>
<meta http-equiv="refresh" content="0;url=${spa}"/>
<style>body{background:#000;color:#94A3B8;font-family:Inter,sans-serif;text-align:center;padding:80px 20px}a{color:#2B4FFF}</style>
</head>
<body>
<p>Loading replay…</p>
<p><a href="${spa}">Continue to Cube3 →</a></p>
</body>
</html>`;
      res.set('Cache-Control', 'public, max-age=300');
      res.type('html').send(html);
    } catch (err) { next(err); }
  });

  // ----- Daily Cube -----
  app.get('/api/daily/today', (_req, res) => res.json(dailyConfig(todayUtcIso())));

  app.post('/api/daily/submit', requireUser(async (req, res) => {
    const todayIso = todayUtcIso();
    const { date, moves, won, duration_ms } = req.body || {};

    // Stale submissions can't enter today's leaderboard (mirror Python).
    if (date !== todayIso) return res.status(400).json({ detail: 'Stale daily submission' });

    // Cheap sanity bounds (trust-the-client model documented in PLAN.md).
    if (typeof won !== 'boolean') return res.status(400).json({ detail: 'won must be boolean' });
    const movesNum = Number(moves);
    if (!Number.isInteger(movesNum) || movesNum < 0 || movesNum > DAILY_MOVES_MAX) {
      return res.status(400).json({ detail: 'invalid moves' });
    }

    const cfg = dailyConfig(todayIso);
    const wonInt = won ? 1 : 0;
    const submittedAt = nowSql();

    // Two atomic statements — engine-agnostic (MySQL or MariaDB) and free of the
    // ON DUPLICATE KEY UPDATE column-mutation-order pitfall (a column updated earlier in
    // the SET list would corrupt a later IF() that reads it):
    //  1) INSERT IGNORE creates the row on the first submission (created_at = now).
    //  2) UPDATE replaces it ONLY when the new result is strictly BETTER — a win over a
    //     non-win, or a win with fewer moves than the stored win. A single UPDATE evaluates
    //     every RHS against the old row, and created_at is reset to the new submission time
    //     only when we actually replace (fair early-bird tiebreak).
    // "Better" is monotonic, so concurrent submissions converge to the best regardless of order.
    await pool.query(
      `INSERT IGNORE INTO daily_results
        (user_id, challenge_date, day_number, user_name, user_picture, moves, won, par, duration_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.user_id, todayIso, cfg.day_number, req.user.name, req.user.picture,
        movesNum, wonInt, cfg.par, duration_ms ?? null, submittedAt]);

    await pool.query(
      `UPDATE daily_results
          SET day_number = ?, user_name = ?, user_picture = ?, moves = ?, won = ?,
              par = ?, duration_ms = ?, created_at = ?
        WHERE user_id = ? AND challenge_date = ?
          AND ((? > won) OR (? = 1 AND won = 1 AND ? < moves))`,
      [cfg.day_number, req.user.name, req.user.picture, movesNum, wonInt,
        cfg.par, duration_ms ?? null, submittedAt,
        req.user.user_id, todayIso, wonInt, wonInt, movesNum]);

    const [[best]] = await pool.query(
      `SELECT user_id, user_name, user_picture, day_number, moves, won, par, duration_ms, created_at
         FROM daily_results WHERE user_id = ? AND challenge_date = ? LIMIT 1`,
      [req.user.user_id, todayIso]);
    if (best) best.won = !!best.won;
    res.json({ ok: true, best });
  }));

  app.get('/api/daily/leaderboard', async (req, res, next) => {
    try {
      const targetDate = (typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
        ? req.query.date : todayUtcIso();
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      // Wins first, then fewest moves, then earliest submission (uses idx_lb).
      const [rows] = await pool.query(
        `SELECT user_id, user_name, user_picture, day_number, moves, won, par, created_at
           FROM daily_results WHERE challenge_date = ?
          ORDER BY won DESC, moves ASC, created_at ASC LIMIT ?`,
        [targetDate, limit]);
      for (const r of rows) r.won = !!r.won;
      res.json(rows);
    } catch (err) { next(err); }
  });

  app.get('/api/daily/me', async (req, res, next) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.json(null);
      const [[row]] = await pool.query(
        `SELECT user_id, user_name, user_picture, day_number, moves, won, par, duration_ms, created_at
           FROM daily_results WHERE user_id = ? AND challenge_date = ? LIMIT 1`,
        [user.user_id, todayUtcIso()]);
      if (!row) return res.json(null);
      row.won = !!row.won;
      res.json(row);
    } catch (err) { next(err); }
  });

  // ----- Error handler -----
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ detail: 'Internal server error' });
  });

  return app;
}
