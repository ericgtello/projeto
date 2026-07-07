from fastapi import FastAPI, APIRouter, HTTPException, Request, Header
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# MongoDB
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ MODELS ============
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = ""
    created_at: str
    # Profile
    goal: Optional[str] = None  # "emagrecimento" | "hipertrofia"
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    height: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[str] = None  # "M" | "F"
    activity_level: Optional[str] = None  # "sedentario", "leve", "moderado", "intenso"
    deadline_weeks: Optional[int] = None
    equipment: List[str] = []
    onboarded: bool = False


class ProfileUpdate(BaseModel):
    goal: Optional[str] = None
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    height: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    activity_level: Optional[str] = None
    deadline_weeks: Optional[int] = None
    equipment: Optional[List[str]] = None
    onboarded: Optional[bool] = None


class WorkoutGenRequest(BaseModel):
    muscle_group: str  # "peito", "costas", "pernas", "ombros", "bracos", "abdomen"


class Exercise(BaseModel):
    name: str
    sets: int
    reps: str  # e.g. "10-12"
    rest_seconds: int
    tips: str
    equipment: str


class WorkoutPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    muscle_group: str
    exercises: List[Exercise]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WorkoutLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    exercise_name: str
    muscle_group: str
    weight_kg: float
    reps: int
    set_number: int
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WorkoutLogCreate(BaseModel):
    exercise_name: str
    muscle_group: str
    weight_kg: float
    reps: int
    set_number: int


class WeightLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    weight_kg: float
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WeightLogCreate(BaseModel):
    weight_kg: float


class DietGenRequest(BaseModel):
    pass


class Food(BaseModel):
    name: str
    quantity: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    substitutions: List[str] = []


class Meal(BaseModel):
    name: str  # Café da manhã, Almoço, etc.
    time: str
    foods: List[Food]


class DietPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    total_kcal: float
    total_protein: float
    total_carbs: float
    total_fat: float
    meals: List[Meal]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ============ AUTH HELPERS ============
async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[User]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "").strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at)
        except Exception:
            expires_at = None
    if isinstance(expires_at, datetime):
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            return None
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        return None
    return User(**{k: user.get(k) for k in User.model_fields.keys() if k in user or True})


async def require_user(authorization: Optional[str] = Header(None)) -> User:
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


# ============ AUTH ROUTES ============
class GoogleAuthRequest(BaseModel):
    session_id: str


@api_router.post("/auth/google")
async def auth_google(payload: GoogleAuthRequest):
    """Exchange session_id from Emergent Google Auth for a session_token."""
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session id")
        data = resp.json()

    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=400, detail="Malformed session data")

    # Upsert user
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        # ensure basic fields present
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name or existing.get("name", ""), "picture": picture or existing.get("picture", "")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "goal": None,
            "current_weight": None,
            "target_weight": None,
            "height": None,
            "age": None,
            "sex": None,
            "activity_level": None,
            "deadline_weeks": None,
            "equipment": [],
            "onboarded": False,
        }
        await db.users.insert_one(new_user)

    # Store session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {
            "$set": {
                "session_token": session_token,
                "user_id": user_id,
                "expires_at": expires_at.isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user_doc}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return user_doc


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ============ PROFILE ============
@api_router.patch("/profile")
async def update_profile(payload: ProfileUpdate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return doc


# ============ AI WORKOUT ============
def _parse_json_from_llm(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        # remove leading language tag
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("`").strip()
    # find first { or [
    for opener, closer in (("{", "}"), ("[", "]")):
        i = text.find(opener)
        j = text.rfind(closer)
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(text[i : j + 1])
            except Exception:
                continue
    return json.loads(text)


@api_router.post("/workout/generate")
async def generate_workout(payload: WorkoutGenRequest, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    if not user.equipment:
        raise HTTPException(status_code=400, detail="Cadastre seus equipamentos antes de gerar treinos.")

    system = (
        "Você é um personal trainer experiente. Gere treinos personalizados em português (pt-BR). "
        "Responda SEMPRE apenas com JSON válido, sem markdown, sem comentários."
    )
    prompt = f"""Gere um treino para o grupamento muscular: {payload.muscle_group}.

Perfil do aluno:
- Objetivo: {user.goal or 'não informado'}
- Idade: {user.age or 'não informada'}
- Sexo: {user.sex or 'não informado'}
- Peso atual: {user.current_weight or 'não informado'} kg
- Nível de atividade: {user.activity_level or 'moderado'}
- Equipamentos disponíveis: {', '.join(user.equipment)}

Regras:
- Selecione entre 5 e 7 exercícios adequados ao grupamento e aos equipamentos disponíveis.
- Se o objetivo for hipertrofia: 3-4 séries de 8-12 repetições, descanso 60-90s.
- Se for emagrecimento: 3-4 séries de 12-15 repetições, descanso 30-45s.
- Para cada exercício, escreva 2-3 frases claras com dicas de execução (postura, respiração, erros comuns).

Retorne APENAS este JSON:
{{
  "exercises": [
    {{
      "name": "Nome do exercício",
      "sets": 4,
      "reps": "10-12",
      "rest_seconds": 60,
      "tips": "Dicas de execução em 2-3 frases.",
      "equipment": "Nome do equipamento usado"
    }}
  ]
}}
"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"workout_{user.user_id}_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(status_code=500, detail=f"Falha ao gerar treino: {e}")

    try:
        parsed = _parse_json_from_llm(response)
        exercises = [Exercise(**ex) for ex in parsed.get("exercises", [])]
    except Exception as e:
        logging.exception("Parse error: %s", response)
        raise HTTPException(status_code=500, detail=f"Resposta da IA inválida: {e}")

    plan = WorkoutPlan(user_id=user.user_id, muscle_group=payload.muscle_group, exercises=exercises)
    await db.workout_plans.insert_one(plan.model_dump())
    return plan.model_dump()


@api_router.get("/workout/plans")
async def list_workout_plans(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plans = await db.workout_plans.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return plans


@api_router.get("/workout/plans/{muscle_group}")
async def get_workout_plan(muscle_group: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plan = await db.workout_plans.find_one(
        {"user_id": user.user_id, "muscle_group": muscle_group},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Nenhum treino gerado ainda")
    return plan


@api_router.delete("/workout/plans/{plan_id}")
async def delete_workout_plan(plan_id: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    await db.workout_plans.delete_one({"id": plan_id, "user_id": user.user_id})
    return {"ok": True}


# ============ WORKOUT LOGS ============
@api_router.post("/workout/logs")
async def add_workout_log(payload: WorkoutLogCreate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    log = WorkoutLog(user_id=user.user_id, **payload.model_dump())
    await db.workout_logs.insert_one(log.model_dump())
    return log.model_dump()


@api_router.get("/workout/logs")
async def list_workout_logs(exercise: Optional[str] = None, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    q: Dict[str, Any] = {"user_id": user.user_id}
    if exercise:
        q["exercise_name"] = exercise
    logs = await db.workout_logs.find(q, {"_id": 0}).sort("date", 1).to_list(2000)
    return logs


@api_router.get("/workout/logs/exercises")
async def list_logged_exercises(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    names = await db.workout_logs.distinct("exercise_name", {"user_id": user.user_id})
    return names


# ============ WEIGHT LOGS ============
@api_router.post("/weight/logs")
async def add_weight_log(payload: WeightLogCreate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    log = WeightLog(user_id=user.user_id, weight_kg=payload.weight_kg)
    await db.weight_logs.insert_one(log.model_dump())
    # Also update user's current weight
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"current_weight": payload.weight_kg}})
    return log.model_dump()


@api_router.get("/weight/logs")
async def list_weight_logs(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    logs = await db.weight_logs.find({"user_id": user.user_id}, {"_id": 0}).sort("date", 1).to_list(2000)
    return logs


# ============ DIET ============
@api_router.post("/diet/generate")
async def generate_diet(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    if not user.goal or not user.current_weight:
        raise HTTPException(status_code=400, detail="Complete seu perfil (objetivo e peso) antes de gerar a dieta.")

    system = (
        "Você é um nutricionista especializado em pt-BR. Gere planos alimentares equilibrados e realistas. "
        "Sempre responda APENAS com JSON válido, sem markdown ou texto adicional."
    )
    prompt = f"""Monte um plano alimentar diário completo para este aluno.

Perfil:
- Objetivo: {user.goal}
- Peso atual: {user.current_weight} kg
- Peso alvo: {user.target_weight or 'não informado'} kg
- Altura: {user.height or 'não informada'} cm
- Idade: {user.age or 'não informada'}
- Sexo: {user.sex or 'não informado'}
- Nível de atividade: {user.activity_level or 'moderado'}

Regras:
- Calcule TMB (Mifflin-St Jeor) e ajuste kcal ao objetivo (déficit ~20% para emagrecimento, superávit ~10% para hipertrofia).
- Distribua em 5 refeições: Café da manhã, Lanche da manhã, Almoço, Lanche da tarde, Jantar.
- Cada alimento deve ter: nome, quantidade (com unidade), kcal, proteína, carboidrato, gordura (em gramas) e 2 a 3 substituições realistas com quantidades equivalentes.
- Some macros totais do dia.

Retorne APENAS este JSON:
{{
  "total_kcal": 2000,
  "total_protein": 150,
  "total_carbs": 200,
  "total_fat": 60,
  "meals": [
    {{
      "name": "Café da manhã",
      "time": "07:00",
      "foods": [
        {{
          "name": "Ovos mexidos",
          "quantity": "3 unidades",
          "kcal": 210,
          "protein": 18,
          "carbs": 2,
          "fat": 15,
          "substitutions": ["4 claras + 1 gema", "100g de queijo cottage"]
        }}
      ]
    }}
  ]
}}
"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"diet_{user.user_id}_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logging.exception("LLM error")
        raise HTTPException(status_code=500, detail=f"Falha ao gerar dieta: {e}")

    try:
        parsed = _parse_json_from_llm(response)
        plan = DietPlan(user_id=user.user_id, **parsed)
    except Exception as e:
        logging.exception("Parse diet error: %s", response)
        raise HTTPException(status_code=500, detail=f"Resposta da IA inválida: {e}")

    # Replace latest diet plan
    await db.diet_plans.delete_many({"user_id": user.user_id})
    await db.diet_plans.insert_one(plan.model_dump())
    return plan.model_dump()


@api_router.get("/diet/current")
async def get_current_diet(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plan = await db.diet_plans.find_one({"user_id": user.user_id}, {"_id": 0}, sort=[("created_at", -1)])
    if not plan:
        raise HTTPException(status_code=404, detail="Nenhum plano alimentar gerado ainda")
    return plan


# ============ GOAL PROGRESS ============
@api_router.get("/goal/progress")
async def goal_progress(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    if user.current_weight is None or user.target_weight is None:
        return {"has_goal": False}
    logs = await db.weight_logs.find({"user_id": user.user_id}, {"_id": 0}).sort("date", 1).to_list(1000)
    start_weight = logs[0]["weight_kg"] if logs else user.current_weight
    current = user.current_weight
    target = user.target_weight
    if start_weight == target:
        pct = 100.0
    else:
        pct = ((start_weight - current) / (start_weight - target)) * 100 if start_weight != target else 0
        pct = max(0.0, min(100.0, pct))
    return {
        "has_goal": True,
        "goal": user.goal,
        "start_weight": start_weight,
        "current_weight": current,
        "target_weight": target,
        "deadline_weeks": user.deadline_weeks,
        "progress_pct": round(pct, 1),
        "logs": logs,
    }


# ============ EQUIPMENT LIST ============
@api_router.get("/equipment/catalog")
async def equipment_catalog():
    return [
        {"id": "halteres", "name": "Halteres"},
        {"id": "barra", "name": "Barra e anilhas"},
        {"id": "banco", "name": "Banco supino"},
        {"id": "banco_inclinado", "name": "Banco inclinado"},
        {"id": "smith", "name": "Smith machine"},
        {"id": "cabo", "name": "Cabos / Polia"},
        {"id": "leg_press", "name": "Leg press"},
        {"id": "cadeira_extensora", "name": "Cadeira extensora"},
        {"id": "mesa_flexora", "name": "Mesa flexora"},
        {"id": "cadeira_adutora", "name": "Cadeira adutora"},
        {"id": "supino_reto", "name": "Supino máquina"},
        {"id": "peck_deck", "name": "Peck deck / Voador"},
        {"id": "puxada_alta", "name": "Puxada alta"},
        {"id": "remada_baixa", "name": "Remada baixa"},
        {"id": "kettlebell", "name": "Kettlebells"},
        {"id": "corda", "name": "Corda / Elásticos"},
        {"id": "esteira", "name": "Esteira"},
        {"id": "bike", "name": "Bicicleta ergométrica"},
        {"id": "elptico", "name": "Elíptico"},
        {"id": "peso_corporal", "name": "Peso corporal"},
    ]


# ============ ROOT ============
@api_router.get("/")
async def root():
    return {"message": "FitJourney API", "version": "1.0"}


# ============ Setup ============
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
