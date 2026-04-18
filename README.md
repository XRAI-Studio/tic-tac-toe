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

## Deploying

Pick the guide that matches your Hostinger plan:

- **Hostinger Business / Premium / Cloud** (shared hosting with Node.js + MySQL) →  **[DEPLOYMENT_HOSTINGER_BUSINESS.md](./DEPLOYMENT_HOSTINGER_BUSINESS.md)** — uses `backend-node/` (Express + MySQL), everything runs on the existing plan, no extra cost.
- **Hostinger VPS** (KVM 1+) → **[DEPLOYMENT_HOSTINGER.md](./DEPLOYMENT_HOSTINGER.md)** — uses `backend/` (FastAPI + MongoDB Atlas) with nginx + systemd.

Both backends expose identical `/api/*` endpoints, so the React frontend is the same regardless of which you pick.

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
