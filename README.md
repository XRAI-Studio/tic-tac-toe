# Cube3 — 3D Tic-Tac-Toe

A full-stack 3D Tic-Tac-Toe web app.

- **Boards**: Classic 3×3×3 (27 cells · 49 winning lines) and Extended 4×4×4 (64 cells · 76 lines)
- **Modes**: Pass-and-play 2P / 3P · AI opponent (Easy / Medium / Hard with alpha-beta pruning)
- **3D**: react-three-fiber canvas with drag-rotate, scroll-zoom, exploded view, hover ghost preview, winning-line glow + bloom
- **Persistence**: Google OAuth via Emergent, per-user stats, global leaderboard with filters, profile & recent-games, guest play
- **Extras**: Undo (local games), auto-save/resume, shareable replays (`/replay/:id`), sound effects (Web Audio), dark/light theme

## Folder layout
```
/app
├── backend/   # FastAPI (Python 3.11)
│   ├── server.py
│   ├── seed.py                 # optional demo-data seeder
│   ├── requirements.txt
│   └── .env.example
├── frontend/  # React 18 + react-three-fiber 8
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── .env.example
├── memory/PRD.md
├── DEPLOYMENT_HOSTINGER.md     # full step-by-step deployment guide
└── README.md                   # this file
```

## Local development
Prerequisites: Python 3.11+, Node 20+, yarn, MongoDB (local or Atlas).

```bash
# 1. Backend
cd backend
cp .env.example .env                    # edit MONGO_URL if needed
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python seed.py                          # (optional) seed demo data
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env                    # set REACT_APP_BACKEND_URL=http://localhost:8001
yarn install
yarn start                              # http://localhost:3000
```

## Production build
```bash
# Frontend — produces /app/frontend/build/ (static assets)
cd frontend
yarn install --frozen-lockfile
yarn build

# Backend — run with gunicorn + uvicorn workers
cd backend
pip install -r requirements.txt gunicorn
gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 127.0.0.1:8001 server:app
```

## Deploying to Hostinger
See **[DEPLOYMENT_HOSTINGER.md](./DEPLOYMENT_HOSTINGER.md)** for a full, tested, copy-paste walkthrough for Hostinger VPS + MongoDB Atlas + nginx + HTTPS.

A one-paragraph summary: Because Cube3 uses a Python (FastAPI) backend, the **Hostinger VPS plan** is required (shared-hosting Python cPanel also works if you only need the frontend — but the backend cannot run on shared hosting without Python/uvicorn/systemd). The guide covers VPS provisioning, MongoDB Atlas setup (free tier), deploying the React build, running FastAPI as a systemd service behind nginx, TLS via Let's Encrypt, and subdomain/subdirectory routing recommendations.

## Key routes
| Route              | Auth?  | Description                                   |
|--------------------|--------|-----------------------------------------------|
| `/`                | —      | Landing page                                  |
| `/lobby`           | —      | Pick board size + mode, start / resume match  |
| `/play`            | —      | Active match (query: `size`, `mode`, `resume`)|
| `/leaderboard`     | —      | Global rankings with filters                  |
| `/profile`         | ✅     | Stats + recent games                          |
| `/replay/:id`      | —      | Public auto-playing replay                    |

## Backend endpoints (prefix: `/api`)
| Method | Path                          | Auth |
|--------|-------------------------------|------|
| GET    | `/`                           | —    |
| POST   | `/auth/session`               | —    |
| GET    | `/auth/me`                    | ✅   |
| POST   | `/auth/logout`                | ✅   |
| POST   | `/games/record`               | ✅   |
| GET    | `/games/history/{user_id}`    | —    |
| POST   | `/games/saved`                | ✅   |
| GET    | `/games/saved`                | ✅   |
| DELETE | `/games/saved`                | ✅   |
| GET    | `/users/stats/{user_id}`      | —    |
| GET    | `/leaderboard`                | —    |
| POST   | `/replays`                    | —    |
| GET    | `/replays/{id}`               | —    |
