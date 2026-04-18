"""
Cube3 3D Tic-Tac-Toe Phase 2 API Tests
Tests new endpoints: /api/games/saved (POST/GET/DELETE), /api/replays (POST), /api/replays/{id} (GET)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials - created via mongosh for Phase 2
TEST_SESSION_TOKEN = "test_session_phase2_1776475809546"
TEST_USER_ID = "test-user-phase2-1776475809546"


class TestSavedGamesEndpoints:
    """Test /api/games/saved endpoints (POST/GET/DELETE) - auth required"""
    
    def test_save_game_without_auth_returns_401(self):
        """POST /api/games/saved requires auth (401 without token)"""
        payload = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [{"player": 0, "flat": 13}, {"player": 1, "flat": 0}]
        }
        response = requests.post(f"{BASE_URL}/api/games/saved", json=payload)
        assert response.status_code == 401
        print("✓ POST /api/games/saved without token returns 401")
    
    def test_get_saved_game_without_auth_returns_401(self):
        """GET /api/games/saved requires auth (401 without token)"""
        response = requests.get(f"{BASE_URL}/api/games/saved")
        assert response.status_code == 401
        print("✓ GET /api/games/saved without token returns 401")
    
    def test_delete_saved_game_without_auth_returns_401(self):
        """DELETE /api/games/saved requires auth (401 without token)"""
        response = requests.delete(f"{BASE_URL}/api/games/saved")
        assert response.status_code == 401
        print("✓ DELETE /api/games/saved without token returns 401")
    
    def test_get_saved_game_returns_null_when_none_exists(self):
        """GET /api/games/saved returns null when no saved game exists"""
        headers = {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        # First ensure no saved game exists
        requests.delete(f"{BASE_URL}/api/games/saved", headers=headers)
        
        response = requests.get(f"{BASE_URL}/api/games/saved", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data is None, f"Expected null, got {data}"
        print("✓ GET /api/games/saved returns null when no saved game")
    
    def test_save_game_with_valid_token(self):
        """POST /api/games/saved saves game state with valid Bearer token"""
        headers = {
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [
                {"player": 0, "flat": 13},
                {"player": 1, "flat": 0},
                {"player": 0, "flat": 26}
            ]
        }
        response = requests.post(f"{BASE_URL}/api/games/saved", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        print("✓ POST /api/games/saved with token saves game")
    
    def test_get_saved_game_returns_doc_when_exists(self):
        """GET /api/games/saved returns saved game doc when exists"""
        headers = {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        
        # First save a game
        payload = {
            "board_size": 4,
            "mode": "local_3p",
            "moves": [
                {"player": 0, "flat": 0},
                {"player": 1, "flat": 1},
                {"player": 2, "flat": 2}
            ]
        }
        requests.post(f"{BASE_URL}/api/games/saved", json=payload, headers=headers)
        
        # Now get it
        response = requests.get(f"{BASE_URL}/api/games/saved", headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert data is not None, "Expected saved game doc, got null"
        assert data["board_size"] == 4
        assert data["mode"] == "local_3p"
        assert len(data["moves"]) == 3
        assert data["user_id"] == TEST_USER_ID
        assert "updated_at" in data
        
        print(f"✓ GET /api/games/saved returns doc: board_size={data['board_size']}, mode={data['mode']}, moves={len(data['moves'])}")
    
    def test_save_game_upserts_existing(self):
        """POST /api/games/saved upserts (replaces) existing saved game"""
        headers = {
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        
        # Save first game
        payload1 = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [{"player": 0, "flat": 0}]
        }
        requests.post(f"{BASE_URL}/api/games/saved", json=payload1, headers=headers)
        
        # Save second game (should replace)
        payload2 = {
            "board_size": 4,
            "mode": "ai_hard",
            "moves": [{"player": 0, "flat": 10}, {"player": 1, "flat": 20}]
        }
        requests.post(f"{BASE_URL}/api/games/saved", json=payload2, headers=headers)
        
        # Get and verify it's the second one
        response = requests.get(f"{BASE_URL}/api/games/saved", headers=headers)
        data = response.json()
        
        assert data["board_size"] == 4
        assert data["mode"] == "ai_hard"
        assert len(data["moves"]) == 2
        
        print("✓ POST /api/games/saved upserts existing saved game")
    
    def test_delete_saved_game_removes_it(self):
        """DELETE /api/games/saved removes saved game"""
        headers = {"Authorization": f"Bearer {TEST_SESSION_TOKEN}"}
        
        # First save a game
        payload = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [{"player": 0, "flat": 5}]
        }
        requests.post(f"{BASE_URL}/api/games/saved", json=payload, headers=headers)
        
        # Verify it exists
        response = requests.get(f"{BASE_URL}/api/games/saved", headers=headers)
        assert response.json() is not None
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/games/saved", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data.get("ok") == True
        
        # Verify it's gone
        response = requests.get(f"{BASE_URL}/api/games/saved", headers=headers)
        assert response.json() is None
        
        print("✓ DELETE /api/games/saved removes saved game")


class TestReplayEndpoints:
    """Test /api/replays endpoints (POST, GET) - auth optional for POST, public for GET"""
    
    def test_create_replay_without_auth(self):
        """POST /api/replays creates replay without auth (guest)"""
        payload = {
            "board_size": 3,
            "mode": "local_2p",
            "moves": [
                {"player": 0, "flat": 13},
                {"player": 1, "flat": 0},
                {"player": 0, "flat": 26},
                {"player": 1, "flat": 1},
                {"player": 0, "flat": 4}
            ],
            "winner": 0,
            "result": "win",
            "player_name": "GuestPlayer"
        }
        response = requests.post(f"{BASE_URL}/api/replays", json=payload)
        assert response.status_code == 200
        data = response.json()
        
        assert "replay_id" in data
        assert len(data["replay_id"]) == 10  # hex[:10]
        
        print(f"✓ POST /api/replays without auth creates replay: {data['replay_id']}")
        return data["replay_id"]
    
    def test_create_replay_with_auth(self):
        """POST /api/replays creates replay with auth (uses user name)"""
        headers = {
            "Authorization": f"Bearer {TEST_SESSION_TOKEN}",
            "Content-Type": "application/json"
        }
        payload = {
            "board_size": 4,
            "mode": "ai_hard",
            "moves": [
                {"player": 0, "flat": 0},
                {"player": 1, "flat": 1}
            ],
            "winner": 1,
            "result": "loss"
        }
        response = requests.post(f"{BASE_URL}/api/replays", json=payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "replay_id" in data
        
        # Verify the replay uses the authenticated user's name
        get_response = requests.get(f"{BASE_URL}/api/replays/{data['replay_id']}")
        replay = get_response.json()
        assert replay["player_name"] == "Phase2 Test User"
        
        print(f"✓ POST /api/replays with auth creates replay with user name: {replay['player_name']}")
        return data["replay_id"]
    
    def test_get_replay_returns_doc(self):
        """GET /api/replays/{id} returns replay doc"""
        # First create a replay
        payload = {
            "board_size": 3,
            "mode": "local_3p",
            "moves": [
                {"player": 0, "flat": 0},
                {"player": 1, "flat": 1},
                {"player": 2, "flat": 2}
            ],
            "winner": 2,
            "result": "win",
            "player_name": "TestPlayer"
        }
        create_response = requests.post(f"{BASE_URL}/api/replays", json=payload)
        replay_id = create_response.json()["replay_id"]
        
        # Get the replay
        response = requests.get(f"{BASE_URL}/api/replays/{replay_id}")
        assert response.status_code == 200
        data = response.json()
        
        # Verify all fields
        assert data["replay_id"] == replay_id
        assert data["board_size"] == 3
        assert data["mode"] == "local_3p"
        assert len(data["moves"]) == 3
        assert data["winner"] == 2
        assert data["result"] == "win"
        assert data["player_name"] == "TestPlayer"
        assert "created_at" in data
        
        print(f"✓ GET /api/replays/{replay_id} returns full doc")
    
    def test_get_replay_invalid_id_returns_404(self):
        """GET /api/replays/invalidid returns 404"""
        response = requests.get(f"{BASE_URL}/api/replays/invalidid123")
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        
        print("✓ GET /api/replays/invalidid returns 404")
    
    def test_get_replay_nonexistent_returns_404(self):
        """GET /api/replays/{nonexistent} returns 404"""
        response = requests.get(f"{BASE_URL}/api/replays/0000000000")
        assert response.status_code == 404
        
        print("✓ GET /api/replays/nonexistent returns 404")
    
    def test_create_replay_with_draw_result(self):
        """POST /api/replays handles draw result (winner=null)"""
        payload = {
            "board_size": 3,
            "mode": "ai_medium",
            "moves": [{"player": 0, "flat": i} for i in range(27)],
            "winner": None,
            "result": "draw",
            "player_name": "DrawTest"
        }
        response = requests.post(f"{BASE_URL}/api/replays", json=payload)
        assert response.status_code == 200
        replay_id = response.json()["replay_id"]
        
        # Verify
        get_response = requests.get(f"{BASE_URL}/api/replays/{replay_id}")
        data = get_response.json()
        assert data["winner"] is None
        assert data["result"] == "draw"
        
        print(f"✓ POST /api/replays handles draw result correctly")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
