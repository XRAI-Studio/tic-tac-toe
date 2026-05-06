from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Query
from fastapi.responses import HTMLResponse, Response as FastAPIResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import logging
import hashlib
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta, date
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7


# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    created_at: datetime


class GameRecordCreate(BaseModel):
    board_size: int  # 3 or 4
    mode: str  # 'ai_easy' | 'ai_medium' | 'ai_hard' | 'local_2p' | 'local_3p'
    result: str  # 'win' | 'loss' | 'draw'
    moves: int
    duration_ms: Optional[int] = None


class GameRecord(BaseModel):
    game_id: str
    user_id: str
    user_name: str
    board_size: int
    mode: str
    result: str
    moves: int
    duration_ms: Optional[int] = None
    created_at: datetime


class UserStats(BaseModel):
    user_id: str
    name: str
    picture: Optional[str] = None
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float
    by_board: dict
    by_mode: dict


class LeaderboardEntry(BaseModel):
    user_id: str
    name: str
    picture: Optional[str] = None
    games_played: int
    wins: int
    losses: int
    draws: int
    win_rate: float
    score: int


# ---------- Auth helpers ----------
def _extract_token(request: Request) -> Optional[str]:
    """Pull a session token from cookies first, then `Authorization: Bearer`."""
    token = request.cookies.get("session_token")
    if token:
        return token
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return None


async def _load_active_session(token: str) -> Optional[dict]:
    """Look up a non-expired session by token. Returns the doc or None."""
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at and expires_at < datetime.now(timezone.utc):
        return None
    return session


async def get_current_user(request: Request) -> Optional[dict]:
    token = _extract_token(request)
    if not token:
        return None
    session = await _load_active_session(token)
    if not session:
        return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user


async def require_user(request: Request) -> dict:
    user = await get_current_user(request)
    if not user:  # `is None` is correct PEP 8 idiom; using truthiness is also fine here
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ---------- Auth Routes ----------
async def _fetch_emergent_session(session_id: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0) as hc:
        r = await hc.get(EMERGENT_AUTH_URL, headers={"X-Session-ID": session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session_id")
    return r.json()


async def _upsert_user(email: str, name: str, picture: Optional[str]) -> str:
    """Insert or update the user row; returns the canonical user_id."""
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "picture": picture}}
        )
        return user_id
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    await db.users.insert_one({
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return user_id


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="session_token",
        value=token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
    )


@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    data = await _fetch_emergent_session(session_id)
    email = data.get("email")
    name = data.get("name", email)
    picture = data.get("picture")
    session_token = data.get("session_token")

    user_id = await _upsert_user(email, name, picture)

    expires_at = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    _set_session_cookie(response, session_token)
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "session_token": session_token,
    }


@api_router.get("/auth/me")
async def auth_me(request: Request):
    user = await require_user(request)
    return {
        "user_id": user["user_id"],
        "email": user["email"],
        "name": user["name"],
        "picture": user.get("picture"),
    }


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie(key="session_token", path="/")
    return {"ok": True}


# ---------- Game Records ----------
@api_router.post("/games/record")
async def record_game(payload: GameRecordCreate, request: Request):
    user = await require_user(request)
    game_id = f"game_{uuid.uuid4().hex[:12]}"
    doc = {
        "game_id": game_id,
        "user_id": user["user_id"],
        "user_name": user["name"],
        "user_picture": user.get("picture"),
        "board_size": payload.board_size,
        "mode": payload.mode,
        "result": payload.result,
        "moves": payload.moves,
        "duration_ms": payload.duration_ms,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.games.insert_one(doc)
    return {"game_id": game_id}


@api_router.get("/games/history/{user_id}")
async def game_history(user_id: str, limit: int = 20):
    games = await db.games.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(limit)
    return games


# ---------- Saved games (auto-resume) ----------
class SavedGameCreate(BaseModel):
    board_size: int
    mode: str
    moves: list  # [{player: int, flat: int}]


@api_router.post("/games/saved")
async def save_game(payload: SavedGameCreate, request: Request):
    user = await require_user(request)
    doc = {
        "user_id": user["user_id"],
        "board_size": payload.board_size,
        "mode": payload.mode,
        "moves": payload.moves,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.saved_games.update_one({"user_id": user["user_id"]}, {"$set": doc}, upsert=True)
    return {"ok": True}


@api_router.get("/games/saved")
async def get_saved(request: Request):
    user = await require_user(request)
    saved = await db.saved_games.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return saved


@api_router.delete("/games/saved")
async def clear_saved(request: Request):
    user = await require_user(request)
    await db.saved_games.delete_one({"user_id": user["user_id"]})
    return {"ok": True}


# ---------- Shareable replays ----------
class ReplayCreate(BaseModel):
    board_size: int
    mode: str
    moves: list
    winner: Optional[int] = None
    result: Optional[str] = None
    player_name: Optional[str] = None


@api_router.post("/replays")
async def create_replay(payload: ReplayCreate, request: Request):
    user = await get_current_user(request)
    replay_id = uuid.uuid4().hex[:10]
    doc = {
        "replay_id": replay_id,
        "board_size": payload.board_size,
        "mode": payload.mode,
        "moves": payload.moves,
        "winner": payload.winner,
        "result": payload.result,
        "player_name": user["name"] if user else (payload.player_name or "Guest"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.replays.insert_one(doc)
    return {"replay_id": replay_id}


@api_router.get("/replays/{replay_id}")
async def get_replay(replay_id: str):
    r = await db.replays.find_one({"replay_id": replay_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Replay not found")
    return r


# ---------- OG Card / Social Share Unfurl ----------
PLAYER_HEX = ["#2B4FFF", "#FF1744", "#00E676"]
PLAYER_LABELS = ["Blue", "Red", "Green"]
MARK_GLYPH = ["X", "O", "T"]  # SVG-safe glyphs (X / circle / triangle drawn as paths)


def _public_origin(request: Request) -> str:
    """Best-effort public origin for absolute OG URLs (handles ingress proxy headers)."""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "spatial-marks.preview.emergentagent.com"
    return f"{proto}://{host}".rstrip("/")


def _outcome_label(replay: dict) -> str:
    if replay.get("result") == "draw":
        return "Drew the match"
    winner = replay.get("winner")
    if winner is None:
        return "Match in progress"
    name = PLAYER_LABELS[winner] if 0 <= winner < len(PLAYER_LABELS) else "Player"
    return f"{name} wins"


def _replay_to_board(replay: dict) -> tuple[int, list]:
    """Replay all moves into a flat board array; returns (N, board)."""
    N = int(replay.get("board_size", 3))
    board = [None] * (N * N * N)
    for m in replay.get("moves") or []:
        flat = m.get("flat")
        if flat is not None and 0 <= flat < len(board):
            board[flat] = m.get("player")
    return N, board


def _outcome_accent(replay: dict) -> str:
    """Hex color for the outcome banner — winner's hue, neutral on draw, blue otherwise."""
    if replay.get("result") == "draw":
        return "#94A3B8"
    winner = replay.get("winner")
    if winner is not None and 0 <= winner < len(PLAYER_HEX):
        return PLAYER_HEX[winner]
    return "#2B4FFF"


def _svg_header(N: int, moves_count: int, outcome: str, accent: str, player_name: str) -> str:
    """Background gradient + brand header + outcome banner — top 130px of the card."""
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'
        '<defs>'
        '<radialGradient id="bgGrad" cx="50%" cy="50%" r="60%">'
        '<stop offset="0%" stop-color="#0A1A4F" stop-opacity="0.6"/>'
        '<stop offset="100%" stop-color="#000000" stop-opacity="0"/>'
        '</radialGradient>'
        '</defs>'
        '<rect width="1200" height="630" fill="#000000"/>'
        '<rect width="1200" height="630" fill="url(#bgGrad)"/>'
        # Brand (left)
        '<text x="60" y="80" font-family="Inter, sans-serif" font-weight="900" font-size="44" '
        'fill="#ffffff" letter-spacing="6">CUBE<tspan fill="#2B4FFF">3</tspan></text>'
        f'<text x="60" y="115" font-family="Inter, sans-serif" font-weight="600" font-size="20" '
        f'fill="#94A3B8" letter-spacing="3">{N}×{N}×{N} · {moves_count} moves</text>'
        # Outcome (right)
        f'<text x="1140" y="80" text-anchor="end" font-family="Inter, sans-serif" font-weight="900" '
        f'font-size="44" fill="{accent}">{outcome}</text>'
        f'<text x="1140" y="115" text-anchor="end" font-family="Inter, sans-serif" font-weight="500" '
        f'font-size="20" fill="#94A3B8">by {player_name}</text>'
    )


def _svg_mark(value: int, midx: float, midy: float, sz: float) -> str:
    """Player-specific glyph: X (0), O (1), triangle (2)."""
    color = PLAYER_HEX[value]
    if value == 0:
        return (
            f'<line x1="{midx - sz}" y1="{midy - sz}" x2="{midx + sz}" y2="{midy + sz}" '
            f'stroke="{color}" stroke-width="6" stroke-linecap="round"/>'
            f'<line x1="{midx + sz}" y1="{midy - sz}" x2="{midx - sz}" y2="{midy + sz}" '
            f'stroke="{color}" stroke-width="6" stroke-linecap="round"/>'
        )
    if value == 1:
        return f'<circle cx="{midx}" cy="{midy}" r="{sz}" fill="none" stroke="{color}" stroke-width="6"/>'
    h = sz * 1.05
    return (
        f'<polygon points="{midx},{midy - h} {midx + sz},{midy + h * 0.7} {midx - sz},{midy + h * 0.7}" '
        f'fill="none" stroke="{color}" stroke-width="6" stroke-linejoin="round"/>'
    )


def _svg_level_grid(L: int, gx: float, grid_y: float, grid_w: float, cell_size: float, N: int, board: list) -> str:
    """One level's N×N cell grid + L-label, rendered at the given x offset."""
    parts = [
        f'<text x="{gx + grid_w / 2}" y="{grid_y - 14}" text-anchor="middle" '
        f'font-family="Inter, sans-serif" font-weight="700" font-size="16" fill="#2B4FFF" '
        f'letter-spacing="3">L{L + 1}</text>'
    ]
    for r in range(N):
        for c in range(N):
            fi = L * N * N + r * N + c
            cx = gx + c * cell_size
            cy = grid_y + r * cell_size
            v = board[fi]
            fill = "#0A1428" if v is None else PLAYER_HEX[v] + "20"
            stroke = "#2B4FFF40" if v is None else PLAYER_HEX[v]
            parts.append(
                f'<rect x="{cx + 4}" y="{cy + 4}" width="{cell_size - 8}" height="{cell_size - 8}" '
                f'rx="6" fill="{fill}" stroke="{stroke}" stroke-width="2"/>'
            )
            if v is not None:
                parts.append(_svg_mark(v, cx + cell_size / 2, cy + cell_size / 2, cell_size * 0.32))
    return "".join(parts)


def _build_og_svg(replay: dict) -> str:
    """Render a 1200×630 OG card showing the final board state + outcome.
    Composed from focused helpers for testability and clarity."""
    N, board = _replay_to_board(replay)
    moves_count = len(replay.get("moves") or [])
    outcome = _outcome_label(replay)
    accent = _outcome_accent(replay)
    player_name = replay.get("player_name") or "Guest"

    # Layout math: stacked level grids, side by side.
    pad = 60
    title_h = 130
    avail_w = 1200 - 2 * pad
    avail_h = 630 - title_h - pad - 60
    grid_w = (avail_w - 60 * (N - 1)) / N
    cell_size = grid_w / N
    grids_h = cell_size * N
    grid_y = title_h + (avail_h - grids_h) / 2 + 20

    parts = [_svg_header(N, moves_count, outcome, accent, player_name)]
    for L in range(N):
        parts.append(_svg_level_grid(L, pad + L * (grid_w + 60), grid_y, grid_w, cell_size, N, board))
    parts.append(
        '<text x="600" y="600" text-anchor="middle" font-family="Inter, sans-serif" '
        'font-weight="500" font-size="18" fill="#475569">3D Tic-Tac-Toe · play.cube3</text>'
        '</svg>'
    )
    return "".join(parts)


@api_router.get("/og/replay/{replay_id}.svg")
async def og_replay(replay_id: str):
    """Server-rendered SVG OG image for a replay. Used as og:image source by crawlers."""
    r = await db.replays.find_one({"replay_id": replay_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Replay not found")
    svg = _build_og_svg(r)
    return FastAPIResponse(content=svg, media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


@api_router.get("/share/{replay_id}", response_class=HTMLResponse)
async def share_landing(replay_id: str, request: Request):
    """
    Crawler-friendly HTML landing page for replays. Contains full OG/Twitter meta tags
    pointing to the SVG card. Humans get a 0-second meta-refresh redirect to the SPA route.
    """
    r = await db.replays.find_one({"replay_id": replay_id}, {"_id": 0})
    if not r:
        raise HTTPException(status_code=404, detail="Replay not found")

    origin = _public_origin(request)
    image_url = f"{origin}/api/og/replay/{replay_id}.svg"
    spa_url = f"{origin}/replay/{replay_id}"
    N = int(r.get("board_size", 3))
    outcome = _outcome_label(r)
    moves_count = len(r.get("moves") or [])
    player_name = r.get("player_name") or "Guest"

    title = f"Cube3 — {outcome} · {N}×{N}×{N}"
    desc = f"{player_name} · {outcome} in {moves_count} moves. Watch the replay or try to beat the position."

    # Build crawler-friendly HTML. `<meta http-equiv="refresh">` redirects humans;
    # crawlers read the OG/Twitter meta tags and ignore the refresh.
    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{title}</title>
<meta name="description" content="{desc}"/>
<!-- Open Graph -->
<meta property="og:type" content="website"/>
<meta property="og:title" content="{title}"/>
<meta property="og:description" content="{desc}"/>
<meta property="og:image" content="{image_url}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:url" content="{spa_url}"/>
<meta property="og:site_name" content="Cube3"/>
<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="{title}"/>
<meta name="twitter:description" content="{desc}"/>
<meta name="twitter:image" content="{image_url}"/>
<!-- Redirect humans to SPA -->
<meta http-equiv="refresh" content="0;url={spa_url}"/>
<style>body{{background:#000;color:#94A3B8;font-family:Inter,sans-serif;text-align:center;padding:80px 20px}}a{{color:#2B4FFF}}</style>
</head>
<body>
<p>Loading replay…</p>
<p><a href="{spa_url}">Continue to Cube3 →</a></p>
</body>
</html>"""
    return HTMLResponse(content=html, headers={"Cache-Control": "public, max-age=300"})


# ---------- Daily Cube ----------
DAILY_EPOCH = date(2026, 2, 19)  # Day #1 = the day Phase 6 launched


def _seeded_rand(seed_str: str) -> int:
    return int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _daily_config(d: date) -> dict:
    """Generate today's daily challenge — deterministic from the date."""
    day_number = (d - DAILY_EPOCH).days + 1
    # All players see the same starting opening (one human move + one AI move)
    # so the rest of the match is comparable across users.
    seed = _seeded_rand(d.isoformat() + ":opening")
    # Pick a center-ish opening for the human (corners / center-edge)
    OPENING_HUMAN_CHOICES = [13, 4, 22, 12, 14, 10, 16]  # center, top-mid, bottom-mid, etc.
    OPENING_AI_CHOICES = [0, 2, 6, 8, 18, 20, 24, 26]  # corners
    h_move = OPENING_HUMAN_CHOICES[seed % len(OPENING_HUMAN_CHOICES)]
    ai_move = OPENING_AI_CHOICES[(seed >> 8) % len(OPENING_AI_CHOICES)]
    # Par = realistic moves-to-win for a strong player; tunable
    par = 9
    return {
        "day_number": day_number,
        "date": d.isoformat(),
        "board_size": 3,
        "ai_difficulty": "hard",
        "starting_moves": [
            {"player": 0, "flat": h_move},
            {"player": 1, "flat": ai_move},
        ],
        "par": par,
    }


@api_router.get("/daily/today")
async def daily_today():
    """Today's deterministic challenge — same for everyone, refreshes at UTC midnight."""
    return _daily_config(_today_utc())


class DailySubmit(BaseModel):
    date: str  # ISO yyyy-mm-dd
    moves: int  # total moves played by the user (lower is better; only counts winning runs)
    won: bool   # whether the user beat the AI
    duration_ms: Optional[int] = None


@api_router.post("/daily/submit")
async def daily_submit(payload: DailySubmit, request: Request):
    user = await require_user(request)
    # Must match today's challenge — refuse stale submissions to keep the leaderboard honest.
    today_iso = _today_utc().isoformat()
    if payload.date != today_iso:
        raise HTTPException(status_code=400, detail="Stale daily submission")

    cfg = _daily_config(_today_utc())
    existing = await db.daily_results.find_one({"user_id": user["user_id"], "date": today_iso}, {"_id": 0})
    if existing:
        # Only update if the new score is better (won && fewer moves), preserves first-attempt fairness.
        if not existing.get("won") and payload.won:
            replace = True
        elif existing.get("won") and payload.won and payload.moves < existing.get("moves", 9_999):
            replace = True
        else:
            replace = False
        if not replace:
            return {"ok": True, "best": existing}

    doc = {
        "user_id": user["user_id"],
        "user_name": user["name"],
        "user_picture": user.get("picture"),
        "date": today_iso,
        "day_number": cfg["day_number"],
        "moves": payload.moves,
        "won": payload.won,
        "par": cfg["par"],
        "duration_ms": payload.duration_ms,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.daily_results.update_one(
        {"user_id": user["user_id"], "date": today_iso},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True, "best": doc}


@api_router.get("/daily/leaderboard")
async def daily_leaderboard(date: Optional[str] = Query(None), limit: int = 50):
    """Leaderboard for a single day. Defaults to today (UTC). Wins ranked first by fewest moves."""
    target_date = date or _today_utc().isoformat()
    results = await db.daily_results.find({"date": target_date}, {"_id": 0}).to_list(2000)
    # Sort: wins first, then by moves ascending, then by created_at ascending (early-bird tiebreak).
    results.sort(key=lambda r: (0 if r.get("won") else 1, r.get("moves", 9_999), r.get("created_at", "")))
    return results[:limit]


@api_router.get("/daily/me")
async def daily_me(request: Request):
    """My result for today (or null if I haven't played)."""
    user = await get_current_user(request)
    if not user:
        return None
    today_iso = _today_utc().isoformat()
    return await db.daily_results.find_one(
        {"user_id": user["user_id"], "date": today_iso}, {"_id": 0}
    )


# ---------- Stats & Leaderboard ----------
async def _compute_user_stats(user_id: str) -> dict:
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    games = await db.games.find({"user_id": user_id}, {"_id": 0}).to_list(5000)
    total = len(games)
    wins = sum(1 for g in games if g["result"] == "win")
    losses = sum(1 for g in games if g["result"] == "loss")
    draws = sum(1 for g in games if g["result"] == "draw")
    win_rate = (wins / total * 100.0) if total else 0.0

    RESULT_TO_KEY = {"win": "wins", "loss": "losses", "draw": "draws"}
    by_board = {"3": {"games": 0, "wins": 0, "losses": 0, "draws": 0},
                "4": {"games": 0, "wins": 0, "losses": 0, "draws": 0}}
    by_mode: dict = {}
    for g in games:
        b = str(g["board_size"])
        bucket_key = RESULT_TO_KEY.get(g["result"])
        if b in by_board:
            by_board[b]["games"] += 1
            if bucket_key:
                by_board[b][bucket_key] += 1
        m = g["mode"]
        if m not in by_mode:
            by_mode[m] = {"games": 0, "wins": 0, "losses": 0, "draws": 0}
        by_mode[m]["games"] += 1
        if bucket_key:
            by_mode[m][bucket_key] += 1

    return {
        "user_id": user_id,
        "name": user["name"],
        "picture": user.get("picture"),
        "games_played": total,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "win_rate": round(win_rate, 1),
        "by_board": by_board,
        "by_mode": by_mode,
    }


@api_router.get("/users/stats/{user_id}")
async def user_stats(user_id: str):
    return await _compute_user_stats(user_id)


def _period_filter(period: str) -> dict:
    now = datetime.now(timezone.utc)
    cutoff: Optional[datetime] = None
    if period == "weekly":
        cutoff = now - timedelta(days=7)
    elif period == "monthly":
        cutoff = now - timedelta(days=30)
    if cutoff is None:
        return {}
    return {"created_at": {"$gte": cutoff.isoformat()}}


def _build_leaderboard_query(board_size: Optional[int], mode: Optional[str], period: Optional[str]) -> dict:
    q: dict = {}
    if board_size:
        q["board_size"] = board_size
    if mode == "ai":
        q["mode"] = {"$in": ["ai_easy", "ai_medium", "ai_hard"]}
    elif mode == "local":
        q["mode"] = {"$in": ["local_2p", "local_3p"]}
    q.update(_period_filter(period or "all"))
    return q


def _aggregate_leaderboard(games: List[dict]) -> List[dict]:
    RESULT_TO_KEY = {"win": "wins", "loss": "losses", "draw": "draws"}
    agg: dict = {}
    for g in games:
        uid = g["user_id"]
        if uid not in agg:
            agg[uid] = {
                "user_id": uid,
                "name": g.get("user_name", "Player"),
                "picture": g.get("user_picture"),
                "games_played": 0, "wins": 0, "losses": 0, "draws": 0,
            }
        agg[uid]["games_played"] += 1
        bucket = RESULT_TO_KEY.get(g["result"])
        if bucket:
            agg[uid][bucket] += 1

    rows = []
    for v in agg.values():
        gp = v["games_played"]
        wr = (v["wins"] / gp * 100.0) if gp else 0.0
        v["win_rate"] = round(wr, 1)
        v["score"] = v["wins"] * 3 + v["draws"] * 1 + int(wr)
        rows.append(v)
    rows.sort(key=lambda x: (-x["score"], -x["wins"], -x["win_rate"]))
    return rows


@api_router.get("/leaderboard")
async def leaderboard(
    board_size: Optional[int] = Query(None),
    mode: Optional[str] = Query(None),  # 'ai', 'local', 'all'
    period: Optional[str] = Query("all"),
    limit: int = 50,
):
    q = _build_leaderboard_query(board_size, mode, period)
    games = await db.games.find(q, {"_id": 0}).to_list(20000)
    return _aggregate_leaderboard(games)[:limit]


@api_router.get("/")
async def root():
    return {"message": "Cube3 Tic-Tac-Toe API"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=os.environ.get('CORS_ORIGIN_REGEX', r'https?://.*'),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
