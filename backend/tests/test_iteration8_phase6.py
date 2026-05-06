"""
Phase 6 backend regression tests — Iteration 8.

Covers:
  - /api/share/{replay_id}: OG/Twitter meta tags HTML landing
  - /api/og/replay/{replay_id}.svg: SVG OG image
  - /api/daily/today: deterministic daily config
  - /api/daily/submit: auth, stale dates, best-score retention
  - /api/daily/me: per-user daily record
  - /api/daily/leaderboard: ordering
  - Regression: /api/leaderboard, /api/games/record, /api/users/stats/{uid}
"""
import os
import re
import pytest
import requests
from datetime import datetime, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://spatial-marks.preview.emergentagent.com").rstrip("/")

NOVA = "test_session_nova"
ORION = "test_session_orion"
ZEN = "test_session_zen"


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


@pytest.fixture(scope="module")
def created_replay_id():
    payload = {
        "board_size": 3,
        "mode": "local_2p",
        "moves": [
            {"player": 0, "flat": 13},
            {"player": 1, "flat": 0},
            {"player": 0, "flat": 4},
            {"player": 1, "flat": 22},
        ],
        "winner": 0,
        "result": "win",
        "player_name": "Nova",
    }
    r = requests.post(f"{BASE_URL}/api/replays", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    rid = r.json()["replay_id"]
    assert isinstance(rid, str) and len(rid) >= 8
    return rid


# ---------- TASK 1A: OG meta tag landing ----------
class TestOGShareLanding:
    def test_share_html_contains_og_meta(self, created_replay_id):
        r = requests.get(f"{BASE_URL}/api/share/{created_replay_id}", timeout=15)
        assert r.status_code == 200
        assert "text/html" in r.headers.get("content-type", "").lower()
        body = r.text
        assert '<meta property="og:title"' in body
        assert '<meta property="og:description"' in body
        assert '<meta property="og:image"' in body
        assert '<meta property="og:image:width" content="1200"' in body
        assert '<meta property="og:image:height" content="630"' in body
        assert '<meta name="twitter:card" content="summary_large_image"' in body
        # og:image should point to the SVG endpoint
        assert f"/api/og/replay/{created_replay_id}.svg" in body
        # meta refresh redirect to SPA replay route
        m = re.search(r'<meta http-equiv="refresh" content="0;url=([^"]+)"', body)
        assert m is not None
        assert f"/replay/{created_replay_id}" in m.group(1)

    def test_share_404_on_missing(self):
        r = requests.get(f"{BASE_URL}/api/share/zzznotfound", timeout=15)
        assert r.status_code == 404


# ---------- TASK 1B: OG SVG ----------
class TestOGSvg:
    def test_og_svg_content_and_type(self, created_replay_id):
        r = requests.get(f"{BASE_URL}/api/og/replay/{created_replay_id}.svg", timeout=15)
        assert r.status_code == 200
        assert "image/svg+xml" in r.headers.get("content-type", "").lower()
        body = r.text
        assert body.lstrip().startswith("<svg")
        assert 'width="1200"' in body
        assert 'height="630"' in body

    def test_og_svg_404(self):
        r = requests.get(f"{BASE_URL}/api/og/replay/zzznotfound.svg", timeout=15)
        assert r.status_code == 404


# ---------- TASK 2A: Daily config ----------
class TestDailyConfig:
    def test_daily_today_schema(self):
        r = requests.get(f"{BASE_URL}/api/daily/today", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["day_number"], int) and data["day_number"] > 0
        assert re.match(r"^\d{4}-\d{2}-\d{2}$", data["date"])
        assert data["board_size"] == 3
        assert data["ai_difficulty"] == "hard"
        assert isinstance(data["starting_moves"], list)
        assert len(data["starting_moves"]) == 2
        for mv in data["starting_moves"]:
            assert "player" in mv and "flat" in mv
        assert isinstance(data["par"], int) and data["par"] > 0

    def test_daily_today_is_deterministic(self):
        a = requests.get(f"{BASE_URL}/api/daily/today", timeout=15).json()
        b = requests.get(f"{BASE_URL}/api/daily/today", timeout=15).json()
        assert a == b


# ---------- TASK 2C: Daily submit ----------
class TestDailySubmit:
    def _wipe(self, token: str):
        # Best-effort cleanup: submit a fresh worse score so state is known.
        # There is no delete endpoint, so we just reset by submitting a low-moves win,
        # then higher-moves won't replace. Instead, tests below handle order directly.
        pass

    def test_submit_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/daily/submit",
            json={"date": _today_iso(), "moves": 7, "won": True},
            timeout=15,
        )
        assert r.status_code == 401

    def test_submit_rejects_stale_date(self):
        r = requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(NOVA),
            json={"date": "2025-01-01", "moves": 7, "won": True},
            timeout=15,
        )
        assert r.status_code == 400

    def test_submit_best_score_semantics(self):
        today = _today_iso()
        # First submission (baseline moderate win)
        r1 = requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(NOVA),
            json={"date": today, "moves": 7, "won": True},
            timeout=15,
        )
        assert r1.status_code == 200
        best1 = r1.json()["best"]
        assert best1["moves"] <= 7 or best1["moves"] == 7  # either new record or pre-existing better
        # Worse score — should NOT replace
        r2 = requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(NOVA),
            json={"date": today, "moves": 9, "won": True},
            timeout=15,
        )
        assert r2.status_code == 200
        best2 = r2.json()["best"]
        assert best2["moves"] == best1["moves"], "worse score should not replace"
        # Better score — SHOULD replace
        r3 = requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(NOVA),
            json={"date": today, "moves": 5, "won": True},
            timeout=15,
        )
        assert r3.status_code == 200
        best3 = r3.json()["best"]
        assert best3["moves"] == 5

    def test_daily_me_returns_saved(self):
        r = requests.get(f"{BASE_URL}/api/daily/me", headers=_h(NOVA), timeout=15)
        assert r.status_code == 200
        me = r.json()
        assert me is not None
        assert me["date"] == _today_iso()
        assert me["won"] is True
        assert me["moves"] == 5  # from previous test

    def test_daily_me_null_when_unauth(self):
        r = requests.get(f"{BASE_URL}/api/daily/me", timeout=15)
        assert r.status_code == 200
        assert r.json() is None


# ---------- TASK 2D: Leaderboard ordering ----------
class TestDailyLeaderboard:
    def test_leaderboard_order(self):
        today = _today_iso()
        # Orion: 6 moves win
        requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(ORION),
            json={"date": today, "moves": 6, "won": True},
            timeout=15,
        ).raise_for_status()
        # Zen: loss 8 moves
        requests.post(
            f"{BASE_URL}/api/daily/submit",
            headers=_h(ZEN),
            json={"date": today, "moves": 8, "won": False},
            timeout=15,
        ).raise_for_status()
        r = requests.get(f"{BASE_URL}/api/daily/leaderboard", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        # The three seeded users should appear; wins sorted first, by moves asc.
        by_user = {row["user_name"]: row for row in rows}
        assert "Nova" in by_user and "Orion" in by_user and "Zen" in by_user
        # Nova has 5 moves win (best), Orion has 6 moves win (next), Zen is a loss (last)
        nova_idx = next(i for i, row in enumerate(rows) if row["user_name"] == "Nova")
        orion_idx = next(i for i, row in enumerate(rows) if row["user_name"] == "Orion")
        zen_idx = next(i for i, row in enumerate(rows) if row["user_name"] == "Zen")
        assert nova_idx < orion_idx < zen_idx, f"order wrong: {[r['user_name'] for r in rows]}"


# ---------- Regression: Phase 5/5b endpoints ----------
class TestRegressionPhase5:
    def test_global_leaderboard_200(self):
        r = requests.get(f"{BASE_URL}/api/leaderboard?period=all", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        if rows:
            assert "wins" in rows[0] and "losses" in rows[0] and "draws" in rows[0]

    def test_games_record_persists(self):
        payload = {"board_size": 3, "mode": "ai_hard", "result": "win", "moves": 12}
        r = requests.post(
            f"{BASE_URL}/api/games/record",
            headers=_h(NOVA),
            json=payload,
            timeout=15,
        )
        assert r.status_code == 200
        assert "game_id" in r.json()

    def test_user_stats_structure(self):
        me = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(NOVA), timeout=15).json()
        uid = me["user_id"]
        r = requests.get(f"{BASE_URL}/api/users/stats/{uid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "by_board" in data and "3" in data["by_board"] and "4" in data["by_board"]
        for k in ("games", "wins", "losses", "draws"):
            assert k in data["by_board"]["3"]
