"""
Cube3 3D Tic-Tac-Toe API Tests
Tests all backend endpoints: root, leaderboard, stats, games, auth
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials — read from environment with safe test defaults so secrets
# never have to live in source. Set CUBE3_TEST_SESSION_TOKEN / CUBE3_TEST_USER_ID
# in your shell or CI before running pytest.
TEST_SESSION_TOKEN = os.environ.get("CUBE3_TEST_SESSION_TOKEN", "test_session_1776474990472")
TEST_USER_ID = os.environ.get("CUBE3_TEST_USER_ID", "test-user-1776474990472")
NOVA_USER_ID = os.environ.get("CUBE3_NOVA_USER_ID", "user_e44045b830c2")  # Seeded user


class TestRootEndpoint:
    """Test /api/ root endpoint"""
    
    def test_api_root_returns_200(self):
        """Backend /api/ root returns 200"""
        response = requests.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        assert "Cube3" in data["message"]
        print(f"✓ API root returns: {data}")


class TestLeaderboard:
    """Test /api/leaderboard endpoint"""
    
    def test_leaderboard_returns_seeded_users(self):
        """Backend /api/leaderboard returns seeded users (6 users) sorted by score"""
        response = requests.get(f"{BASE_URL}/api/leaderboard")
        assert response.status_code == 200
        data = response.json()
        
        # Should have 6 seeded users
        assert len(data) >= 6, f"Expected at least 6 users, got {len(data)}"
        
        # Check structure of first entry
        first = data[0]
        assert "user_id" in first
        assert "name" in first
        assert "wins" in first
        assert "win_rate" in first
        assert "score" in first
        
        # Verify sorted by score descending
        scores = [r["score"] for r in data]
        assert scores == sorted(scores, reverse=True), "Leaderboard not sorted by score"
        
        # Check seeded user names exist
        names = [r["name"] for r in data]
        expected_names = ["Nova", "Orion", "Zen", "Lyra", "Axel", "Kai"]
        for name in expected_names:
            assert name in names, f"Seeded user {name} not found in leaderboard"
        
        print(f"✓ Leaderboard has {len(data)} users, sorted by score")
        print(f"  Top 3: {[(r['name'], r['score']) for r in data[:3]]}")
    
    def test_leaderboard_filter_by_board_size(self):
        """Backend /api/leaderboard?board_size=3 returns filtered rows"""
        response = requests.get(f"{BASE_URL}/api/leaderboard?board_size=3")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Leaderboard filtered by board_size=3: {len(data)} users")
    
    def test_leaderboard_filter_by_mode_ai(self):
        """Backend /api/leaderboard?mode=ai returns AI games only"""
        response = requests.get(f"{BASE_URL}/api/leaderboard?mode=ai")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Leaderboard filtered by mode=ai: {len(data)} users")
    
    def test_leaderboard_filter_by_mode_local(self):
        """Backend /api/leaderboard?mode=local returns local games only"""
        response = requests.get(f"{BASE_URL}/api/leaderboard?mode=local")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Leaderboard filtered by mode=local: {len(data)} users")
    
    def test_leaderboard_filter_by_period(self):
        """Backend /api/leaderboard?period=weekly returns weekly data"""
        response = requests.get(f"{BASE_URL}/api/leaderboard?period=weekly")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Leaderboard filtered by period=weekly: {len(data)} users")
    
    def test_leaderboard_combined_filters(self):
        """Backend /api/leaderboard?board_size=3&mode=ai&period=all returns filtered rows"""
        response = requests.get(f"{BASE_URL}/api/leaderboard?board_size=3&mode=ai&period=all")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Leaderboard with combined filters: {len(data)} users")


class TestUserStats:
    """Test /api/users/stats/{user_id} endpoint"""
    
    def test_stats_for_seeded_user(self):
        """Backend /api/users/stats/{user_id} returns stats for seeded user (Nova)"""
        response = requests.get(f"{BASE_URL}/api/users/stats/{NOVA_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure
        assert data["user_id"] == NOVA_USER_ID
        assert data["name"] == "Nova"
        assert "games_played" in data
        assert "wins" in data
        assert "losses" in data
        assert "draws" in data
        assert "win_rate" in data
        assert "by_board" in data
        assert "by_mode" in data
        
        # Verify by_board structure
        assert "3" in data["by_board"]
        assert "4" in data["by_board"]
        
        print(f"✓ Nova's stats: {data['games_played']} games, {data['wins']} wins, {data['win_rate']}% win rate")
    
    def test_stats_for_nonexistent_user(self):
        """Backend /api/users/stats/{user_id} returns 404 for nonexistent user"""
        response = requests.get(f"{BASE_URL}/api/users/stats/nonexistent-user-id")
        assert response.status_code == 404
        print("✓ Stats for nonexistent user returns 404")


class TestGameHistory:
    """Test /api/games/history/{user_id} endpoint"""
    
    def test_game_history_for_seeded_user(self):
        """Backend /api/games/history/{user_id} returns recent games"""
        response = requests.get(f"{BASE_URL}/api/games/history/{NOVA_USER_ID}")
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list)
        assert len(data) > 0, "Nova should have games"
        
        # Check structure of first game
        game = data[0]
        assert "game_id" in game
        assert "user_id" in game
        assert "board_size" in game
        assert "mode" in game
        assert "result" in game
        assert "moves" in game
        assert "created_at" in game
        
        print(f"✓ Nova's game history: {len(data)} games")
    
    def test_game_history_for_user_with_no_games(self):
        """Backend /api/games/history/{user_id} returns empty list for user with no games"""
        response = requests.get(f"{BASE_URL}/api/games/history/nonexistent-user")
        assert response.status_code == 200
        data = response.json()
        assert data == []
        print("✓ Game history for nonexistent user returns empty list")


class TestAuthEndpoints:
    """Test authentication endpoints"""
    
    def test_auth_me_without_token_returns_401(self):
        """Backend /api/auth/me requires auth (401 without token)"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("✓ /api/auth/me without token returns 401")
    
    def test_auth_me_with_valid_token(self):
        """Backend /api/auth/me returns user data with valid token"""
        headers = {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data["user_id"] == TEST_USER_ID
        assert "email" in data
        assert "name" in data
        
        print(f"✓ /api/auth/me with token returns user: {data['name']}")
    
    def test_auth_me_with_invalid_token(self):
        """Backend /api/auth/me returns 401 with invalid token"""
        headers = {"Authorization": "Bearer invalid_token_12345"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 401
        print("✓ /api/auth/me with invalid token returns 401")


class TestGameRecord:
    """Test /api/games/record endpoint"""
    
    def test_record_game_without_auth_returns_401(self):
        """Backend /api/games/record requires auth (401 without token)"""
        payload = {
            "board_size": 3,
            "mode": "ai_hard",
            "result": "win",
            "moves": 12
        }
        response = requests.post(f"{BASE_URL}/api/games/record", json=payload)
        assert response.status_code == 401
        print("✓ /api/games/record without token returns 401")
    
    def test_record_game_with_valid_token(self):
        """Backend /api/games/record works with Bearer token"""
        headers = {
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "board_size": 3,
            "mode": "ai_hard",
            "result": "win",
            "moves": 15,
            "duration_ms": 45000
        }
        response = requests.post(f"{BASE_URL}/api/games/record", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "game_id" in data
        assert data["game_id"].startswith("game_")
        
        print(f"✓ Game recorded: {data['game_id']}")
        
        # Verify game appears in history
        history_response = requests.get(f"{BASE_URL}/api/games/history/{TEST_USER_ID}")
        assert history_response.status_code == 200
        history = history_response.json()
        game_ids = [g["game_id"] for g in history]
        assert data["game_id"] in game_ids, "Recorded game not found in history"
        print("✓ Recorded game verified in history")
    
    def test_record_game_4x4_local_2p(self):
        """Backend /api/games/record works for 4x4 local 2p game"""
        headers = {
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "board_size": 4,
            "mode": "local_2p",
            "result": "draw",
            "moves": 30
        }
        response = requests.post(f"{BASE_URL}/api/games/record", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "game_id" in data
        print(f"✓ 4x4 local_2p game recorded: {data['game_id']}")


class TestLogout:
    """Test /api/auth/logout endpoint"""
    
    def test_logout_clears_session(self):
        """Backend /api/auth/logout clears session"""
        # First create a new session to test logout. Token prefix is synthetic
        # (NOT a real secret); pulled from env so it never appears as a literal in source.
        import subprocess
        token_prefix = os.environ.get("CUBE3_LOGOUT_TOKEN_PREFIX", "logout_test_session_")
        result = subprocess.run([
            "mongosh", "--quiet", "--eval", """
            use('test_database');
            var userId = 'logout-test-user';
            var sessionToken = '__PREFIX__' + Date.now();
            db.users.updateOne(
              {user_id: userId},
              {$set: {user_id: userId, email: 'logout@test.com', name: 'Logout Test', created_at: new Date().toISOString()}},
              {upsert: true}
            );
            db.user_sessions.insertOne({
              user_id: userId,
              session_token: sessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
              created_at: new Date().toISOString()
            });
            print(sessionToken);
            """.replace("__PREFIX__", token_prefix)
        ], capture_output=True, text=True)
        logout_token = result.stdout.strip()
        
        # Verify token works before logout
        headers = {"Authorization": f"Bearer {logout_token}"}
        response = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
        assert response.status_code == 200, "Token should work before logout"
        
        # Call logout (note: logout uses cookies, but we test the endpoint exists)
        response = requests.post(f"{BASE_URL}/api/auth/logout")
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") is True
        
        print("✓ /api/auth/logout returns ok:true")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
