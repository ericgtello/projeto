"""Backend tests for FitJourney API."""
import os
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://body-transform-fit-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

TEST_TOKEN = "fj-test-token"
TEST_USER_ID = "test_user_1"


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="session", autouse=True)
def seed_user(mongo):
    """Seed test user + session directly into Mongo."""
    mongo.users.delete_many({"user_id": TEST_USER_ID})
    mongo.user_sessions.delete_many({"session_token": TEST_TOKEN})
    mongo.workout_plans.delete_many({"user_id": TEST_USER_ID})
    mongo.workout_logs.delete_many({"user_id": TEST_USER_ID})
    mongo.weight_logs.delete_many({"user_id": TEST_USER_ID})
    mongo.diet_plans.delete_many({"user_id": TEST_USER_ID})

    mongo.users.insert_one({
        "user_id": TEST_USER_ID,
        "email": "TEST_user1@example.com",
        "name": "Test User",
        "picture": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "goal": "hipertrofia",
        "current_weight": 80,
        "target_weight": 85,
        "height": 180,
        "age": 28,
        "sex": "M",
        "activity_level": "moderado",
        "deadline_weeks": 12,
        "equipment": ["halteres", "banco", "barra"],
        "onboarded": True,
    })
    mongo.user_sessions.insert_one({
        "session_token": TEST_TOKEN,
        "user_id": TEST_USER_ID,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield
    # cleanup
    mongo.users.delete_many({"user_id": TEST_USER_ID})
    mongo.user_sessions.delete_many({"session_token": TEST_TOKEN})
    mongo.workout_plans.delete_many({"user_id": TEST_USER_ID})
    mongo.workout_logs.delete_many({"user_id": TEST_USER_ID})
    mongo.weight_logs.delete_many({"user_id": TEST_USER_ID})
    mongo.diet_plans.delete_many({"user_id": TEST_USER_ID})


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# ============ Health / catalog ============
def test_root():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_equipment_catalog():
    r = requests.get(f"{API}/equipment/catalog")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 10
    assert "id" in data[0] and "name" in data[0]


# ============ Auth ============
def test_auth_google_invalid():
    r = requests.post(f"{API}/auth/google", json={"session_id": "invalid_xyz"})
    assert r.status_code == 401


def test_auth_me_no_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_auth_me_with_token(auth_headers):
    r = requests.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == TEST_USER_ID
    assert data["goal"] == "hipertrofia"
    assert data["equipment"] == ["halteres", "banco", "barra"]


# ============ Profile ============
def test_profile_update(auth_headers):
    r = requests.patch(f"{API}/profile", headers=auth_headers, json={"current_weight": 79})
    assert r.status_code == 200
    assert r.json()["current_weight"] == 79
    # Verify persistence
    r2 = requests.get(f"{API}/auth/me", headers=auth_headers)
    assert r2.json()["current_weight"] == 79


# ============ Workout ============
def test_workout_generate(auth_headers):
    r = requests.post(f"{API}/workout/generate", headers=auth_headers,
                      json={"muscle_group": "peito"}, timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["muscle_group"] == "peito"
    assert isinstance(data["exercises"], list) and len(data["exercises"]) > 0
    ex = data["exercises"][0]
    assert "name" in ex and "sets" in ex and "reps" in ex


def test_workout_get_plan(auth_headers):
    r = requests.get(f"{API}/workout/plans/peito", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["muscle_group"] == "peito"


# ============ Workout Logs ============
def test_workout_log_create_and_list(auth_headers):
    payload = {
        "exercise_name": "Supino reto",
        "muscle_group": "peito",
        "weight_kg": 60.0,
        "reps": 10,
        "set_number": 1,
    }
    r = requests.post(f"{API}/workout/logs", headers=auth_headers, json=payload)
    assert r.status_code == 200
    log_id = r.json()["id"]

    r2 = requests.get(f"{API}/workout/logs", headers=auth_headers)
    assert r2.status_code == 200
    logs = r2.json()
    assert any(log["id"] == log_id for log in logs)


# ============ Weight Logs ============
def test_weight_log(auth_headers):
    r = requests.post(f"{API}/weight/logs", headers=auth_headers, json={"weight_kg": 79})
    assert r.status_code == 200
    assert r.json()["weight_kg"] == 79
    # Verify user's current_weight updated
    me = requests.get(f"{API}/auth/me", headers=auth_headers).json()
    assert me["current_weight"] == 79


# ============ Goal Progress ============
def test_goal_progress(auth_headers):
    r = requests.get(f"{API}/goal/progress", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["has_goal"] is True
    assert "progress_pct" in data


# ============ Diet ============
def test_diet_generate(auth_headers):
    r = requests.post(f"{API}/diet/generate", headers=auth_headers, json={}, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data["meals"], list) and len(data["meals"]) > 0
    assert data["total_kcal"] > 0


def test_diet_current(auth_headers):
    r = requests.get(f"{API}/diet/current", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json()["meals"], list)
