// ─────────────────────────────────────────────────────────────────────────────
// Cube3 — LOCAL, backend-free API.
//
// This app originally talked to a FastAPI/MySQL backend behind Emergent auth.
// That backend is retired. To keep every feature working with zero servers and
// zero cost, this module reimplements the same `api.get/post/delete` surface
// entirely in the browser, backed by localStorage. Your identity, games,
// records, daily results and saved game all live on this device. Replays are
// encoded into the share URL itself, so a shared link opens on any device with
// no server involved.
//
// The public shape (default axios-like client + setAuthToken/getAuthToken) is
// preserved so no calling code had to change its call sites.
// ─────────────────────────────────────────────────────────────────────────────

const LS = {
  user: "cube3_device_user",
  token: "cube3_token",
  games: "cube3_games",
  saved: "cube3_saved",
  daily: "cube3_daily",
};

/* ───────────────────────────── storage helpers ──────────────────────────── */

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private-mode — non-fatal, feature just won't persist */
  }
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ─────────────────────────── device identity ────────────────────────────── */

// The device is the identity. Created lazily on first access; the "token" is
// just the user id so AuthContext's `getAuthToken()` gate treats us as signed in.
function getDeviceUser() {
  let u = read(LS.user, null);
  if (!u || !u.user_id) {
    u = { user_id: uid(), name: "Player", email: "", picture: null };
    write(LS.user, u);
    write(LS.token, u.user_id);
  }
  return u;
}

export function getAuthToken() {
  const u = getDeviceUser();
  return u.user_id;
}

export function setAuthToken(token) {
  if (token) write(LS.token, token);
  else localStorage.removeItem(LS.token);
}

export function setDeviceName(name) {
  const u = getDeviceUser();
  u.name = (name || "").trim().slice(0, 24) || "Player";
  write(LS.user, u);
  return u;
}

/* ──────────────────────────── replay codec ──────────────────────────────── */
// Encode a whole replay into a compact URL-safe token so share links are
// self-contained (no server store). Unicode-safe (player names).

function b64urlEncode(str) {
  const b64 = btoa(unescape(encodeURIComponent(str)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b64)));
}

function encodeReplay(r) {
  const compact = {
    s: r.board_size,
    m: r.mode,
    w: r.winner ?? null,
    r: r.result ?? null,
    p: r.player_name || "Player",
    mv: (r.moves || []).map((x) => [x.flat, x.player]),
  };
  return b64urlEncode(JSON.stringify(compact));
}

function decodeReplay(token) {
  const c = JSON.parse(b64urlDecode(token));
  return {
    board_size: c.s,
    mode: c.m,
    winner: c.w,
    result: c.r,
    player_name: c.p,
    moves: (c.mv || []).map(([flat, player]) => ({ flat, player })),
  };
}

/* ───────────────────────────── daily puzzle ─────────────────────────────── */
// Deterministic per-UTC-day so the "same opening every day" framing holds for a
// single player. Day 0 = 2024-01-01. One AI opening move seeded from the date.

const DAILY_EPOCH = Date.UTC(2024, 0, 1);

function todayUtcIso() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

function dayNumber(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 86400000) + 1;
}

// The 3×3×3 daily: beat the Hard AI in the fewest moves. The human moves first
// from an empty board — the game's turn order is derived from move count
// (history.length % numPlayers), so a pre-seeded opening would desync whose turn
// it is. Par varies by day for a little flavor; the board itself is a clean start.
function dailyConfig(iso) {
  const n = dayNumber(iso);
  let h = 2166136261;
  for (let i = 0; i < iso.length; i++) { h ^= iso.charCodeAt(i); h = Math.imul(h, 16777619); }
  return {
    date: iso,
    day_number: n,
    par: 6 + (Math.abs(h) % 3), // 6–8
    starting_moves: [],
  };
}

/* ─────────────────────────── stats aggregation ──────────────────────────── */

const AI_MODES = ["ai_easy", "ai_medium", "ai_hard"];

function computeStats(games) {
  const blank = () => ({ games: 0, wins: 0, losses: 0, draws: 0 });
  const stats = {
    games_played: games.length,
    wins: 0, losses: 0, draws: 0, win_rate: 0,
    by_board: { 3: blank(), 4: blank() },
    by_mode: { ai_easy: blank(), ai_medium: blank(), ai_hard: blank(), local_2p: blank(), local_3p: blank() },
  };
  for (const g of games) {
    const bucketB = stats.by_board[g.board_size] || (stats.by_board[g.board_size] = blank());
    const bucketM = stats.by_mode[g.mode] || (stats.by_mode[g.mode] = blank());
    bucketB.games++; bucketM.games++;
    if (g.result === "win") { stats.wins++; bucketB.wins++; bucketM.wins++; }
    else if (g.result === "loss") { stats.losses++; bucketB.losses++; bucketM.losses++; }
    else { stats.draws++; bucketB.draws++; bucketM.draws++; }
  }
  stats.win_rate = stats.games_played ? Math.round((stats.wins / stats.games_played) * 100) : 0;
  return stats;
}

/* ─────────────────────────────── router ─────────────────────────────────── */
// Minimal path router returning axios-like { data }. Query strings tolerated.

function ok(data) { return Promise.resolve({ data }); }
function fail(status, message) {
  const err = new Error(message || "Not found");
  err.response = { status, data: { detail: message } };
  return Promise.reject(err);
}

function match(path, pattern) {
  const p = path.split("?")[0].replace(/\/+$/, "");
  const pp = pattern.replace(/\/+$/, "");
  const ps = p.split("/"), qs = pp.split("/");
  if (ps.length !== qs.length) return null;
  const params = {};
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].startsWith(":")) params[qs[i].slice(1)] = decodeURIComponent(ps[i]);
    else if (qs[i] !== ps[i]) return null;
  }
  return params;
}

function handleGet(path) {
  let m;
  if (match(path, "/auth/me")) return ok(getDeviceUser());

  if (match(path, "/games/saved")) return ok(read(LS.saved, null));

  if (match(path, "/leaderboard")) {
    const url = new URL("http://x/" + path.replace(/^\//, ""));
    const size = Number(url.searchParams.get("board_size") || 0);
    const mode = url.searchParams.get("mode") || "all";
    let games = read(LS.games, []);
    if (size) games = games.filter((g) => g.board_size === size);
    if (mode === "ai") games = games.filter((g) => AI_MODES.includes(g.mode));
    else if (mode === "local") games = games.filter((g) => !AI_MODES.includes(g.mode));
    if (games.length === 0) return ok([]);
    const u = getDeviceUser();
    const wins = games.filter((g) => g.result === "win").length;
    const draws = games.filter((g) => g.result === "draw").length;
    return ok([{
      user_id: u.user_id, name: u.name, picture: u.picture,
      games_played: games.length, wins,
      win_rate: Math.round((wins / games.length) * 100),
      score: wins * 3 + draws,
    }]);
  }

  if ((m = match(path, "/users/stats/:id"))) return ok(computeStats(read(LS.games, [])));

  if ((m = match(path, "/games/history/:id"))) {
    const games = read(LS.games, []).slice().reverse().slice(0, 25);
    return ok(games);
  }

  if (match(path, "/daily/today")) return ok(dailyConfig(todayUtcIso()));
  if (match(path, "/daily/me")) {
    const store = read(LS.daily, {});
    return ok(store[todayUtcIso()] || null);
  }
  if (match(path, "/daily/leaderboard")) {
    const store = read(LS.daily, {});
    const today = store[todayUtcIso()];
    return ok(today ? [today] : []);
  }

  if ((m = match(path, "/replays/:id"))) {
    try { return ok(decodeReplay(m.id)); }
    catch { return fail(404, "Replay link is invalid or corrupted."); }
  }

  return fail(404, "Unknown GET " + path);
}

function handlePost(path, body = {}) {
  if (match(path, "/auth/session")) return ok(getDeviceUser());
  if (match(path, "/auth/logout")) return ok({ ok: true });

  if (match(path, "/games/saved")) {
    write(LS.saved, { board_size: body.board_size, mode: body.mode, moves: body.moves || [] });
    return ok({ ok: true });
  }

  if (match(path, "/games/record")) {
    const u = getDeviceUser();
    const games = read(LS.games, []);
    games.push({
      game_id: uid(),
      user_id: u.user_id,
      user_name: u.name,
      board_size: body.board_size,
      mode: body.mode,
      result: body.result,
      moves: body.moves,
      duration_ms: body.duration_ms ?? null,
      created_at: new Date().toISOString(),
    });
    write(LS.games, games.slice(-500));
    return ok({ ok: true });
  }

  if (match(path, "/replays")) {
    // No server store — the replay IS the id (URL-encoded).
    return ok({ replay_id: encodeReplay(body) });
  }

  if (match(path, "/daily/submit")) {
    const u = getDeviceUser();
    const iso = body.date || todayUtcIso();
    const store = read(LS.daily, {});
    const cfg = dailyConfig(iso);
    const prev = store[iso];
    const entry = {
      user_id: u.user_id, user_name: u.name, user_picture: u.picture,
      date: iso, day_number: cfg.day_number, par: cfg.par,
      moves: body.moves, won: !!body.won,
      final_board: body.final_board || null,
    };
    // Keep the player's best (fewest-move) winning attempt for the day.
    if (!prev || (entry.won && (!prev.won || entry.moves < prev.moves))) store[iso] = entry;
    write(LS.daily, store);
    return ok(store[iso]);
  }

  return fail(404, "Unknown POST " + path);
}

function handleDelete(path) {
  if (match(path, "/games/saved")) { localStorage.removeItem(LS.saved); return ok({ ok: true }); }
  return fail(404, "Unknown DELETE " + path);
}

/* ─────────────────────────── axios-like client ──────────────────────────── */

const api = {
  get: (path) => handleGet(path),
  post: (path, body) => handlePost(path, body),
  delete: (path) => handleDelete(path),
  put: (path, body) => handlePost(path, body),
  defaults: { headers: { common: {} } },
};

export { api };
export default api;
