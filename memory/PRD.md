# Cube3 — 3D Tic-Tac-Toe

## Original Problem Statement
Full-stack 3D Tic-Tac-Toe web application with:
- Two board modes: Classic 3x3x3 (27 cells, 49 lines) and Extended 4x4x4 (64 cells, 76 lines)
- Pass-and-play 2P and 3P local multiplayer (╳ / ⚫ / ▲ marks with distinct colors)
- Single-player vs AI with 3 difficulties (Easy / Medium / Hard)
- 3D visualization (three.js / react-three-fiber) with drag-rotate, scroll-zoom, exploded-view toggle, winning-line glow
- Auth, per-user stats, global leaderboard with filters, profile page with recent games, guest mode
- Dark/light mode, mobile responsive, Hostinger deployment docs
Tech stack: React + r3f + Tailwind, FastAPI + MongoDB, JWT/session auth.

## User Choices
- Auth: Emergent-managed Google OAuth (not JWT email/password)
- Scope: Phase 1 MVP (deferred: undo, save/resume, shareable replay, sound, Hostinger README)
- Theme: glowing blue (not purple)
- Sound: skipped

## Architecture
- Frontend: React 18 + react-three-fiber 8.x + framer-motion + Tailwind. Stored session token in localStorage; axios sends it via Authorization: Bearer.
- Backend: FastAPI + MongoDB. Collections: `users`, `user_sessions`, `games`.
- AI: game/ai.js with pickEasyMove / pickMediumMove / pickHardMove (alpha-beta, depth 4 for 3x3x3, depth 2 for 4x4x4 with move ordering).
- Winning-line generator: game/logic.js `generateLines(N)` — 49 lines for N=3, 76 for N=4.

## Implemented (2026-02-18)
- Landing page (/) with hero, quickstart, CTA
- Lobby (/lobby) — pick size (3/4) and mode (ai_easy/ai_medium/ai_hard/local_2p/local_3p)
- Play (/play) — full 3D cube, turn indicator, move log, result overlay, reset view, exploded toggle, new game
- Leaderboard (/leaderboard) — global ranking with filters (size, mode, period)
- Profile (/profile) — auth-gated stats, by-board breakdown, by-mode breakdown, recent games
- Auth via Emergent Google OAuth (session_token in localStorage)
- Seed script (/app/backend/seed.py) — 6 demo users, ~60 seeded games

**Phase 2 (2026-02-18)**
- Undo last move (local games only, disabled in AI matches)
- Auto-save + resume via /api/games/saved (lobby shows resume banner)
- Shareable replays at /replay/:id (POST /api/replays) + result-overlay share button
- Sound effects via WebAudio (click / win / draw) with mute toggle
- Light/dark theme toggle (CSS vars, persisted in localStorage)

**Phase 3 (2026-02-18)**
- Rebrand: background → pure black (#000000); accent → royal blue (#2B4FFF);
  player pieces → Blue ╳ (#2B4FFF), Red ⚫ (#FF1744), Green ▲ (#00E676)
- Fixed stale-closure bug in Play.play() causing rapid clicks to register as same player
- Hostinger VPS deployment guide (`DEPLOYMENT_HOSTINGER.md`)
- `.env.example` files for backend and frontend
- Production README

**Phase 4 (2026-02-18) — Hostinger Business compatibility**
- Full Node.js + Express + MySQL backend rewrite at `/app/backend-node/`
- Identical `/api/*` surface to the Python version (no frontend changes needed)
- MySQL schema (schema.sql), idempotent migrate.js, seed.js
- Smoke-tested against local MariaDB — all endpoints return correct JSON
- `DEPLOYMENT_HOSTINGER_BUSINESS.md` — step-by-step guide for Hostinger Business (shared) hosting using built-in Node.js + MySQL
- README now routes users to the right deploy guide based on their plan

## Prioritized Backlog (Phase 2)
- [P0] Undo last move (local games only)
- [P0] Save / resume unfinished games tied to account
- [P1] Shareable game result (replay link)
- [P1] Sound effects with toggle
- [P1] Screenshot/share of final board
- [P2] Light-mode theme (currently dark only)
- [P2] Hostinger deployment README + `.env.example`
- [P2] Mobile touch tuning for camera rotation

## Next Action Items
1. Phase 2 features from backlog above
2. Add light/dark theme toggle  
3. Production deployment docs (Hostinger)
