from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Cookie, Header, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
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
