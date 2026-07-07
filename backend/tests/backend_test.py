"""Backend tests for FitJourney API v1.1 (iteration 2)."""
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

# Shared state between tests
STATE: dict = {}


@pytest.fixture(scope="session")
def mongo():
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    yield db
    client.close()


@pytest.fixture(scope="session", autouse=True)
def seed_user(mongo):
    """Seed test user + session directly into Mongo."""
    for coll in ("users", "user_sessions", "workout_plans", "workout_logs", "weight_logs", "diet_plans"):
        mongo[coll].delete_many({"user_id": TEST_USER_ID})
    mongo.user_sessions.delete_many({"session_token": TEST_TOKEN})

    mongo.users.insert_one({
        "user_id": TEST_USER_ID,
        "email": "test@example.com",
        "name": "Test",
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
        "equipment": ["halteres", "banco", "barra", "banco_inclinado", "smith", "cabo", "peck_deck", "puxada_alta"],
        "onboarded": True,
    })
    mongo.user_sessions.insert_one({
        "session_token": TEST_TOKEN,
        "user_id": TEST_USER_ID,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield
    for coll in ("users", "user_sessions", "workout_plans", "workout_logs", "weight_logs", "diet_plans"):
        mongo[coll].delete_many({"user_id": TEST_USER_ID})
    mongo.user_sessions.delete_many({"session_token": TEST_TOKEN})


@pytest.fixture
def auth_headers():
    return {"Authorization": f"Bearer {TEST_TOKEN}", "Content-Type": "application/json"}


# ============ Health / catalog ============
def test_root_version():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    data = r.json()
    assert data.get("version") == "1.1", f"expected v1.1 got {data}"


def test_equipment_catalog():
    r = requests.get(f"{API}/equipment/catalog")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 10
    assert "id" in data[0] and "name" in data[0]


def test_muscle_groups_catalog():
    r = requests.get(f"{API}/muscle-groups")
    assert r.status_code == 200
    data = r.json()
    ids = {m["id"] for m in data}
    assert {"peito", "costas", "ombros", "bracos", "pernas", "abdomen"}.issubset(ids)


# ============ Auth ============
def test_auth_me_no_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_auth_me_with_token(auth_headers):
    r = requests.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["user_id"] == TEST_USER_ID
    assert data["goal"] == "hipertrofia"
    assert data["onboarded"] is True


# ============ Workout ============
def test_workout_generate_single_group(auth_headers):
    r = requests.post(f"{API}/workout/generate", headers=auth_headers,
                      json={"muscle_groups": ["peito"]}, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["muscle_groups"] == ["peito"]
    assert data.get("is_custom") is False
    assert isinstance(data["exercises"], list) and len(data["exercises"]) > 0
    STATE["peito_plan_id"] = data["id"]


def test_workout_generate_custom(auth_headers):
    r = requests.post(
        f"{API}/workout/generate",
        headers=auth_headers,
        json={"muscle_groups": ["peito", "ombros", "bracos"], "name": "Push Day"},
        timeout=120,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_custom"] is True
    assert data["name"] == "Push Day"
    assert data["muscle_groups"] == ["peito", "ombros", "bracos"]
    n = len(data["exercises"])
    assert 6 <= n <= 9, f"expected 6..9 exercises, got {n}"
    STATE["custom_plan_id"] = data["id"]


def test_get_group_plan_peito(auth_headers):
    r = requests.get(f"{API}/workout/plans/group/peito", headers=auth_headers)
    assert r.status_code == 200
    plan = r.json()
    assert plan["muscle_groups"] == ["peito"]
    assert plan["is_custom"] is False


def test_list_custom_plans(auth_headers):
    r = requests.get(f"{API}/workout/plans/custom", headers=auth_headers)
    assert r.status_code == 200
    plans = r.json()
    assert isinstance(plans, list)
    ids = [p["id"] for p in plans]
    assert STATE.get("custom_plan_id") in ids
    push = next(p for p in plans if p["id"] == STATE["custom_plan_id"])
    assert push["name"] == "Push Day"


def test_get_plan_by_id_custom(auth_headers):
    pid = STATE["custom_plan_id"]
    r = requests.get(f"{API}/workout/plans/id/{pid}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == pid


# ============ Rest Update ============
def test_rest_update_valid(auth_headers):
    pid = STATE["custom_plan_id"]
    r = requests.patch(
        f"{API}/workout/plans/{pid}/rest",
        headers=auth_headers,
        json={"exercise_index": 0, "rest_seconds": 90},
    )
    assert r.status_code == 200, r.text
    # verify persistence
    r2 = requests.get(f"{API}/workout/plans/id/{pid}", headers=auth_headers)
    assert r2.json()["exercises"][0]["rest_seconds"] == 90


def test_rest_update_invalid(auth_headers):
    pid = STATE["custom_plan_id"]
    r = requests.patch(
        f"{API}/workout/plans/{pid}/rest",
        headers=auth_headers,
        json={"exercise_index": 0, "rest_seconds": 700},
    )
    assert r.status_code == 400


# ============ Workout Logs last session ============
def test_workout_logs_last(auth_headers):
    for w, reps, sn in [(60, 10, 1), (60, 8, 2), (55, 10, 3)]:
        r = requests.post(f"{API}/workout/logs", headers=auth_headers, json={
            "exercise_name": "Supino reto",
            "muscle_group": "peito",
            "weight_kg": w,
            "reps": reps,
            "set_number": sn,
        })
        assert r.status_code == 200

    r = requests.get(f"{API}/workout/logs/last", headers=auth_headers,
                     params={"exercise": "Supino reto"})
    assert r.status_code == 200
    data = r.json()
    assert data["has_history"] is True
    assert len(data["sets"]) == 3
    # sorted by set_number
    sn_list = [s["set_number"] for s in data["sets"]]
    assert sn_list == sorted(sn_list)
    assert data["max_weight"] == 60


# ============ Diet ============
def test_diet_generate(auth_headers):
    r = requests.post(f"{API}/diet/generate", headers=auth_headers, json={}, timeout=180)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("tmb") and data["tmb"] > 800, f"tmb {data.get('tmb')}"
    assert data.get("tdee") and data["tdee"] > data["tmb"], f"tdee vs tmb {data.get('tdee')} {data.get('tmb')}"
    assert isinstance(data.get("kcal_target_reason"), str) and len(data["kcal_target_reason"]) > 30
    assert data["total_kcal"] > 0
    assert len(data["meals"]) >= 1
    first_food = data["meals"][0]["foods"][0]
    subs = first_food.get("substitutions") or []
    assert len(subs) >= 4, f"expected 4+ subs got {len(subs)}"
    STATE["diet_original_kcal"] = data["total_kcal"]


def test_diet_rebalance(auth_headers):
    original = STATE.get("diet_original_kcal")
    assert original, "diet must be generated first"
    r = requests.post(
        f"{API}/diet/rebalance",
        headers=auth_headers,
        json={"meal_index": 2, "food_index": 0, "new_quantity": "200 g"},
        timeout=180,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "plan" in body and "explanation" in body
    new_kcal = body["plan"]["total_kcal"]
    diff = abs(new_kcal - original) / original
    assert diff <= 0.05, f"rebalance drifted {diff*100:.1f}% ({new_kcal} vs {original})"
