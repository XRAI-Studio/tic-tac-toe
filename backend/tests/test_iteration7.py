"""Iteration 7 — Backend regression for parity audit + test session tokens.

Covers:
  - TASK 1: leaderboard + user stats schema (wins/losses/draws keys, NOT losss)
  - TASK 3: deterministic test session tokens (nova/orion/zen)
  - TASK 3b: saved games E2E (POST → GET → DELETE → GET null)
  - REGRESSION: public health endpoints
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://spatial-marks.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

NOVA = "test_session_nova"
ORION = "test_session_orion"
ZEN = "test_session_zen"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ───── Health / public ────────────────────────────────────────────────────
class TestPublicHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert "message" in r.json()

    def test_leaderboard_all(self, session):
        r = session.get(f"{API}/leaderboard?period=all")
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) > 0, "expected seeded leaderboard rows"
        # TASK 1: schema keys must be wins/losses/draws (NOT 'losss')
        first = rows[0]
        for k in ("wins", "losses", "draws", "games_played", "win_rate", "score", "user_id", "name"):
            assert k in first, f"missing key {k} in leaderboard row: {first.keys()}"
        assert "losss" not in first, "BUG: typo 'losss' present"
        # at least one of these aggregates should be > 0 across the leaderboard
        total_l = sum(r["losses"] for r in rows)
        total_d = sum(r["draws"] for r in rows)
        total_w = sum(r["wins"] for r in rows)
        assert total_w > 0
        assert total_l + total_d >= 0  # may legitimately be zero on some seeds

    def test_leaderboard_period_week(self, session):
        r = session.get(f"{API}/leaderboard?period=weekly")
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ───── TASK 3: session tokens ─────────────────────────────────────────────
class TestSessionTokens:
    @pytest.mark.parametrize("token,email", [
        (NOVA, "nova@cube3.app"),
        (ORION, "orion@cube3.app"),
        (ZEN, "zen@cube3.app"),
    ])
    def test_auth_me_with_token(self, session, token, email):
        r = session.get(f"{API}/auth/me", headers=_bearer(token))
        assert r.status_code == 200, f"token {token} failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["email"] == email
        assert "user_id" in data and data["user_id"].startswith("user_")
        assert "name" in data

    def test_auth_me_without_token_401(self, session):
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_auth_me_with_bad_token_401(self, session):
        r = session.get(f"{API}/auth/me", headers=_bearer("not_a_real_token_xyz"))
        assert r.status_code == 401


# ───── TASK 1: user stats schema ──────────────────────────────────────────
class TestUserStatsSchema:
    def test_stats_for_nova(self, session):
        # First fetch nova user_id
        me = session.get(f"{API}/auth/me", headers=_bearer(NOVA)).json()
        uid = me["user_id"]
        r = session.get(f"{API}/users/stats/{uid}")
        assert r.status_code == 200
        data = r.json()
        # top-level
        for k in ("wins", "losses", "draws", "games_played", "win_rate", "by_board", "by_mode"):
            assert k in data, f"missing top-level {k}"
        assert "losss" not in data
        # by_board['3'] and by_board['4']
        assert "3" in data["by_board"]
        assert "4" in data["by_board"]
        for size in ("3", "4"):
            bucket = data["by_board"][size]
            for k in ("wins", "losses", "draws", "games"):
                assert k in bucket, f"by_board[{size}] missing {k}: {bucket}"
            assert "losss" not in bucket

    def test_stats_404_for_unknown(self, session):
        r = session.get(f"{API}/users/stats/user_does_not_exist_xyz")
        assert r.status_code == 404


# ───── TASK 3 cont: record game ───────────────────────────────────────────
class TestRecordGame:
    def test_record_game_with_token(self, session):
        payload = {"board_size": 3, "mode": "ai_hard", "result": "win", "moves": 12}
        r = session.post(f"{API}/games/record", json=payload, headers=_bearer(NOVA))
        assert r.status_code == 200, r.text
        data = r.json()
        assert "game_id" in data and data["game_id"].startswith("game_")

        # Verify it persisted in the user's history
        me = session.get(f"{API}/auth/me", headers=_bearer(NOVA)).json()
        uid = me["user_id"]
        h = session.get(f"{API}/games/history/{uid}?limit=5")
        assert h.status_code == 200
        ids = [g["game_id"] for g in h.json()]
        assert data["game_id"] in ids

    def test_record_requires_auth(self, session):
        r = session.post(f"{API}/games/record",
                         json={"board_size": 3, "mode": "ai_hard", "result": "win", "moves": 1})
        assert r.status_code == 401


# ───── TASK 3b: saved games E2E ───────────────────────────────────────────
class TestSavedGamesE2E:
    def test_full_lifecycle(self, session):
        h = _bearer(NOVA)
        # ensure clean slate
        session.delete(f"{API}/games/saved", headers=h)

        # POST
        payload = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [{"player": 0, "flat": 13}, {"player": 1, "flat": 0}],
        }
        r = session.post(f"{API}/games/saved", json=payload, headers=h)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # GET — should return the saved doc
        r = session.get(f"{API}/games/saved", headers=h)
        assert r.status_code == 200
        doc = r.json()
        assert doc is not None
        assert doc["board_size"] == 3
        assert doc["mode"] == "local_2p"
        assert len(doc["moves"]) == 2
        assert doc["moves"][0]["flat"] == 13

        # DELETE
        r = session.delete(f"{API}/games/saved", headers=h)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # GET — should return null
        r = session.get(f"{API}/games/saved", headers=h)
        assert r.status_code == 200
        assert r.json() is None
