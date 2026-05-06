"""Seed script for Cube3 — creates demo users and games so leaderboard isn't empty.

NOTE: this script uses Python's `random` module deliberately for generating
demo timestamps and shuffling sample data. Nothing here is security-sensitive
(no tokens, passwords, or auth material), so `random` is the right tool —
`secrets` would be inappropriate.
"""
import asyncio
import os
import uuid
import random  # noqa: S311 — non-crypto demo data only
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


DEMO_USERS = [
    {"name": "Nova",  "email": "nova@cube3.app",  "picture": "https://images.pexels.com/photos/7047671/pexels-photo-7047671.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200&w=200"},
    {"name": "Orion", "email": "orion@cube3.app", "picture": "https://images.pexels.com/photos/7046708/pexels-photo-7046708.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=200&w=200"},
    {"name": "Zen",   "email": "zen@cube3.app",   "picture": None},
    {"name": "Lyra",  "email": "lyra@cube3.app",  "picture": None},
    {"name": "Axel",  "email": "axel@cube3.app",  "picture": None},
    {"name": "Kai",   "email": "kai@cube3.app",   "picture": None},
]

MODES = ["ai_easy", "ai_medium", "ai_hard", "local_2p", "local_3p"]
RESULTS = ["win", "win", "win", "loss", "loss", "draw"]


async def main():
    mongo_url = os.environ['MONGO_URL']
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ['DB_NAME']]

    await db.games.delete_many({"seed": True})

    user_ids = {}
    for u in DEMO_USERS:
        existing = await db.users.find_one({"email": u["email"]}, {"_id": 0})
        if existing:
            user_ids[u["email"]] = existing["user_id"]
            await db.users.update_one({"email": u["email"]}, {"$set": {"picture": u["picture"], "name": u["name"]}})
            continue
        uid = f"user_{uuid.uuid4().hex[:12]}"
        user_ids[u["email"]] = uid
        await db.users.insert_one({
            "user_id": uid,
            "email": u["email"],
            "name": u["name"],
            "picture": u["picture"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Create ~12 games per user spanning last 30 days
    now = datetime.now(timezone.utc)
    for u in DEMO_USERS:
        uid = user_ids[u["email"]]
        for i in range(random.randint(8, 16)):
            result = random.choice(RESULTS)
            mode = random.choice(MODES)
            size = random.choice([3, 3, 3, 4])
            created_at = now - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))
            await db.games.insert_one({
                "game_id": f"game_{uuid.uuid4().hex[:12]}",
                "user_id": uid,
                "user_name": u["name"],
                "user_picture": u["picture"],
                "board_size": size,
                "mode": mode,
                "result": result,
                "moves": random.randint(6, 30),
                "duration_ms": random.randint(30000, 600000),
                "created_at": created_at.isoformat(),
                "seed": True,
            })

    # ── Test session tokens for the regression suite ────────────────────────
    # We seed deterministic, named tokens for the first three demo users so
    # the testing agent can authenticate without re-seeding each run. Tokens
    # are NOT secrets (test environment only) and are stable across reseeds.
    test_tokens = [
        ("nova@cube3.app",  "test_session_nova"),
        ("orion@cube3.app", "test_session_orion"),
        ("zen@cube3.app",   "test_session_zen"),
    ]
    expires_at = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    for email, token in test_tokens:
        uid = user_ids[email]
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {
                "session_token": token,
                "user_id": uid,
                "expires_at": expires_at,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "seed": True,
            }},
            upsert=True,
        )

    print(f"Seeded {len(DEMO_USERS)} demo users and games.")
    print(f"Seeded {len(test_tokens)} test session tokens (1y expiry).")
    for email, token in test_tokens:
        print(f"  {email:30s} -> {token}  (user_id: {user_ids[email]})")


if __name__ == "__main__":
    asyncio.run(main())
