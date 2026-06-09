// Integration / contract tests against a disposable MySQL DB.
// Skips automatically (with a warning) if MySQL is unreachable, so `npm test`
// still runs the DB-free unit suite anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import request from 'supertest';
import { createApp } from '../app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_NAME = process.env.TEST_DB_NAME || 'cube3_test';
const conn = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ?? 'root',
};

let pool;
let app;
let dbAvailable = false;
let token; // Bearer token for the primary test user

// Mock Emergent: 'good' -> Tester, 'good2' -> Tester2; anything else throws (=> 401).
function fetchEmergentSession(sessionId) {
  if (sessionId === 'good') {
    return Promise.resolve({ email: 't@cube3.app', name: 'Tester', picture: null, session_token: 'tok_test_1' });
  }
  if (sessionId === 'good2') {
    return Promise.resolve({ email: 't2@cube3.app', name: 'Tester Two', picture: null, session_token: 'tok_test_2' });
  }
  return Promise.reject(new Error('invalid'));
}

before(async () => {
  try {
    const admin = await mysql.createConnection({ ...conn, multipleStatements: true });
    await admin.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.end();

    pool = mysql.createPool({ ...conn, database: DB_NAME, multipleStatements: true, timezone: 'Z' });
    const schema = readFileSync(resolve(__dirname, '../schema.sql'), 'utf8');
    await pool.query(schema);
    for (const t of ['daily_results', 'replays', 'saved_games', 'games', 'user_sessions', 'users']) {
      await pool.query(`DELETE FROM ${t}`);
    }
    app = createApp({ pool, fetchEmergentSession });
    dbAvailable = true;
  } catch (err) {
    console.warn(`[test] MySQL unavailable (${err.message}); skipping integration tests.`);
  }
});

after(async () => { if (pool) await pool.end(); });

const need = (t) => { if (!dbAvailable) { t.skip('no MySQL'); return false; } return true; };

test('GET /api/ returns the API banner', async (t) => {
  if (!need(t)) return;
  const res = await request(app).get('/api/');
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Cube3 Tic-Tac-Toe API');
});

test('GET /api/health pings the DB', async (t) => {
  if (!need(t)) return;
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.db, 'up');
});

test('auth: guard, bad id, and session->me round trip', async (t) => {
  if (!need(t)) return;
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).post('/api/auth/session').send({})).status, 400);
  assert.equal((await request(app).post('/api/auth/session').send({ session_id: 'nope' })).status, 401);

  const ses = await request(app).post('/api/auth/session').send({ session_id: 'good' });
  assert.equal(ses.status, 200);
  assert.equal(ses.body.email, 't@cube3.app');
  token = ses.body.session_token;
  assert.ok(token);

  const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.equal(me.status, 200);
  assert.equal(me.body.name, 'Tester');
});

test('saved games: auth required, JSON moves round-trip', async (t) => {
  if (!need(t)) return;
  assert.equal((await request(app).post('/api/games/saved').send({})).status, 401);

  const moves = [{ player: 0, flat: 13 }, { player: 1, flat: 0 }];
  const save = await request(app).post('/api/games/saved')
    .set('Authorization', `Bearer ${token}`).send({ board_size: 3, mode: 'ai_hard', moves });
  assert.equal(save.status, 200);

  const got = await request(app).get('/api/games/saved').set('Authorization', `Bearer ${token}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body.moves, moves, 'moves JSON column must come back parsed');

  assert.equal((await request(app).delete('/api/games/saved').set('Authorization', `Bearer ${token}`)).status, 200);
  assert.equal((await request(app).get('/api/games/saved').set('Authorization', `Bearer ${token}`)).body, null);
});

test('record + history + stats + leaderboard', async (t) => {
  if (!need(t)) return;
  for (const r of ['win', 'win', 'loss']) {
    const rec = await request(app).post('/api/games/record')
      .set('Authorization', `Bearer ${token}`).send({ board_size: 3, mode: 'ai_hard', result: r, moves: 12 });
    assert.equal(rec.status, 200);
  }
  const ses = await request(app).post('/api/auth/session').send({ session_id: 'good' });
  const uid = ses.body.user_id;

  const hist = await request(app).get(`/api/games/history/${uid}`);
  assert.equal(hist.status, 200);
  assert.ok(hist.body.length >= 3);

  const stats = await request(app).get(`/api/users/stats/${uid}`);
  assert.equal(stats.status, 200);
  assert.equal(stats.body.wins, 2);
  assert.equal(stats.body.losses, 1);

  const lb = await request(app).get('/api/leaderboard');
  assert.equal(lb.status, 200);
  assert.ok(lb.body.some((row) => row.user_id === uid));
});

test('replays: create, fetch (parsed), 404', async (t) => {
  if (!need(t)) return;
  const create = await request(app).post('/api/replays')
    .send({ board_size: 3, mode: 'ai_hard', moves: [{ player: 0, flat: 0 }], winner: 0, result: 'win', player_name: 'Neo' });
  assert.equal(create.status, 200);
  const id = create.body.replay_id;

  const got = await request(app).get(`/api/replays/${id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body.moves, [{ player: 0, flat: 0 }]);

  assert.equal((await request(app).get('/api/replays/doesnotexist')).status, 404);
});

test('replays: reject malformed input', async (t) => {
  if (!need(t)) return;
  const bad = [
    { board_size: 5, mode: 'ai_hard', moves: [] },                                  // bad board size
    { board_size: 3, mode: 'ai_hard', moves: [{ player: 0, flat: 99 }] },           // flat out of range
    { board_size: 3, mode: 'ai_hard', moves: [{ player: 7, flat: 0 }] },            // bad player id
    { board_size: 3, mode: 'ai_hard', moves: 'nope' },                              // moves not an array
  ];
  for (const body of bad) {
    const res = await request(app).post('/api/replays').send(body);
    assert.equal(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test('share/OG: rendered, escaped, cached, 404', async (t) => {
  if (!need(t)) return;
  const create = await request(app).post('/api/replays')
    .send({ board_size: 3, mode: 'ai_hard', moves: [{ player: 0, flat: 0 }, { player: 1, flat: 4 }], winner: 0, result: 'win', player_name: '<script>x</script>&"' });
  const id = create.body.replay_id;

  // superagent has no text parser for image/svg+xml (it would buffer to a binary res.body),
  // so attach an explicit parser that concatenates the stream into a string.
  const og = await request(app).get(`/api/og/replay/${id}.svg`)
    .buffer(true)
    .parse((res, cb) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => cb(null, data));
    });
  const ogSvg = og.body; // the string returned by the custom parser
  assert.equal(og.status, 200);
  assert.match(og.headers['content-type'], /image\/svg\+xml/);
  assert.match(og.headers['cache-control'], /immutable/);
  assert.ok(og.headers.etag);
  assert.ok(!ogSvg.includes('<script>'), 'OG SVG must escape player_name');

  const share = await request(app).get(`/api/share/${id}`);
  assert.equal(share.status, 200);
  assert.match(share.headers['content-type'], /text\/html/);
  assert.ok(share.text.includes('og:image'));
  assert.ok(share.text.includes(`/api/og/replay/${id}.svg`));
  assert.ok(!share.text.includes('<script>x</script>'), 'share HTML must escape player_name');

  const miss = await request(app).get('/api/og/replay/missing.svg');
  assert.equal(miss.status, 404);
  assert.match(miss.headers['cache-control'], /no-store/);
});

test('daily: today config shape', async (t) => {
  if (!need(t)) return;
  const res = await request(app).get('/api/daily/today');
  assert.equal(res.status, 200);
  assert.equal(res.body.board_size, 3);
  assert.equal(res.body.par, 9);
  assert.equal(res.body.starting_moves.length, 2);
  assert.equal(typeof res.body.day_number, 'number');
});

test('daily submit: validation + best-score upsert + leaderboard order', async (t) => {
  if (!need(t)) return;
  const today = new Date().toISOString().slice(0, 10);
  const auth = (tok) => ({ Authorization: `Bearer ${tok}` });

  // Validation
  assert.equal((await request(app).post('/api/daily/submit').send({ date: today, moves: 5, won: true })).status, 401);
  assert.equal((await request(app).post('/api/daily/submit').set(auth(token)).send({ date: '2000-01-01', moves: 5, won: true })).status, 400);
  assert.equal((await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 5, won: 'yes' })).status, 400);
  assert.equal((await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 9999, won: true })).status, 400);

  // First win at 10 moves
  await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 10, won: true });
  let me = await request(app).get('/api/daily/me').set(auth(token));
  assert.equal(me.body.moves, 10);
  assert.equal(me.body.won, true);

  // Worse win (12) does NOT replace
  await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 12, won: true });
  me = await request(app).get('/api/daily/me').set(auth(token));
  assert.equal(me.body.moves, 10);

  // Better win (8) replaces — and ALL columns move together (created_at + duration_ms),
  // guarding the upsert column-mutation-order bug Codex flagged.
  await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 8, won: true, duration_ms: 4242 });
  me = await request(app).get('/api/daily/me').set(auth(token));
  assert.equal(me.body.moves, 8);
  assert.equal(me.body.duration_ms, 4242, 'duration_ms must update on a better win');

  // A loss does NOT overwrite an existing win
  await request(app).post('/api/daily/submit').set(auth(token)).send({ date: today, moves: 3, won: false });
  me = await request(app).get('/api/daily/me').set(auth(token));
  assert.equal(me.body.moves, 8);
  assert.equal(me.body.won, true);

  // Second user, a DNF — should rank below the winner.
  const ses2 = await request(app).post('/api/auth/session').send({ session_id: 'good2' });
  const token2 = ses2.body.session_token;
  await request(app).post('/api/daily/submit').set(auth(token2)).send({ date: today, moves: 4, won: false });

  const lb = await request(app).get('/api/daily/leaderboard');
  assert.equal(lb.status, 200);
  assert.equal(lb.body[0].user_name, 'Tester', 'winner ranks first');
  assert.equal(lb.body[0].won, true);
  assert.equal(lb.body[lb.body.length - 1].won, false, 'DNF ranks last');
});
