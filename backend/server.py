from fastapi import FastAPI, APIRouter, HTTPException, Header
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

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
ADMIN_EMAILS = {"ericgtello@gmail.com"}

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ============ MODELS ============
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = ""
    created_at: str
    goal: Optional[str] = None
    current_weight: Optional[float] = None
    target_weight: Optional[float] = None
    height: Optional[float] = None
    age: Optional[int] = None
    sex: Optional[str] = None
    activity_level: Optional[str] = None
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
    muscle_groups: List[str]
    name: Optional[str] = None


class Exercise(BaseModel):
    name: str
    sets: int
    reps: str
    rest_seconds: int
    tips: str
    equipment: str
    muscle_group: Optional[str] = None
    exercise_type: Optional[str] = None
    emphasis: Optional[str] = None
    is_unilateral: bool = False

class WorkoutPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    muscle_groups: List[str] = []
    name: Optional[str] = None
    exercises: List[Exercise]
    is_custom: bool = False
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


class RestUpdate(BaseModel):
    exercise_index: int
    rest_seconds: int


class WeightLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    weight_kg: float
    date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class WeightLogCreate(BaseModel):
    weight_kg: float


class Food(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str
    quantity: str
    kcal: float
    protein: float
    carbs: float
    fat: float
    substitutions: List[str] = []


class Meal(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:8])
    name: str
    time: str
    foods: List[Food]


class DietPlan(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    total_kcal: float
    total_protein: float
    total_carbs: float
    total_fat: float
    tmb: Optional[float] = None
    tdee: Optional[float] = None
    kcal_target_reason: Optional[str] = None
    meals: List[Meal]
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RebalanceRequest(BaseModel):
    meal_index: int
    food_index: int
    new_quantity: str


# ============ AUTH ============
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


async def require_admin(authorization: Optional[str] = Header(None)) -> User:
    user = await require_user(authorization)
    if user.email not in ADMIN_EMAILS:
        raise HTTPException(status_code=403, detail="Somente admin.")
    return user


class GoogleAuthRequest(BaseModel):
    session_id: str


@api_router.post("/auth/google")
async def auth_google(payload: GoogleAuthRequest):
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

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
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

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {
            "session_token": session_token,
            "user_id": user_id,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )

    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user_doc}


@api_router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    if doc:
        doc["is_admin"] = doc.get("email") in ADMIN_EMAILS
    return doc


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "").strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


@api_router.patch("/profile")
async def update_profile(payload: ProfileUpdate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    if update:
        await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    return await db.users.find_one({"user_id": user.user_id}, {"_id": 0})


# ============ HELPERS ============
def _parse_json_from_llm(text: str) -> Any:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
        text = text.strip("`").strip()
    for opener, closer in (("{", "}"), ("[", "]")):
        i = text.find(opener)
        j = text.rfind(closer)
        if i != -1 and j != -1 and j > i:
            try:
                return json.loads(text[i : j + 1])
            except Exception:
                continue
    return json.loads(text)


GROUP_LABELS = {
    "peito": "Peito",
    "costas": "Costas",
    "pernas": "Pernas",
    "ombros": "Ombros",
    "bracos": "Braços",
    "abdomen": "Abdômen",
}


# ============ WORKOUT ============
@api_router.post("/workout/generate")
async def generate_workout(payload: WorkoutGenRequest, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    if not user.equipment:
        raise HTTPException(status_code=400, detail="Cadastre seus equipamentos antes de gerar treinos.")
    if not payload.muscle_groups:
        raise HTTPException(status_code=400, detail="Selecione ao menos um grupamento.")

    groups_pt = [GROUP_LABELS.get(g, g) for g in payload.muscle_groups]
    is_custom = len(payload.muscle_groups) > 1 or bool(payload.name)

    system = (
    "Você é um personal trainer experiente, baseado em ciência do treinamento. "
    "Gere treinos personalizados em português (pt-BR). "
    "Responda SEMPRE apenas com JSON válido, sem markdown."
)

if is_custom:
    target = f"combinação de grupamentos musculares: {', '.join(groups_pt)}"
    count = "entre 6 e 9 exercícios, distribuindo bem entre os grupamentos escolhidos"
else:
    target = f"grupamento muscular: {groups_pt[0]}"
    count = "entre 5 e 7 exercícios"

prompt = f"""Gere um treino para {target}.

Perfil do aluno:
- Objetivo: {user.goal or 'não informado'}
- Idade: {user.age or 'não informada'}
- Sexo: {user.sex or 'não informado'}
- Peso atual: {user.current_weight or 'não informado'} kg
- Nível de atividade: {user.activity_level or 'moderado'}
- Equipamentos disponíveis: {', '.join(user.equipment)}

Regras:
- Selecione {count} adequados aos equipamentos disponíveis.
- Quando houver múltiplos grupamentos, distribua os exercícios entre todos eles.
- Ordene os exercícios de forma inteligente: compostos/multiarticulares primeiro, isolados/monoarticulares depois.
- Para exercícios compostos ou multiarticulares, use 3-4 séries, faixa de 5-9 repetições e descanso de 120 segundos.
- Para exercícios isolados ou monoarticulares, use 3-4 séries, faixa de 8-12 repetições e descanso mínimo de 90 segundos.
- Para exercícios unilaterais, use a faixa de 8-12 repetições, descanso de 60-90 segundos entre séries e informe nas dicas que o usuário pode descansar 30 segundos entre os lados.
- Não use a divisão "hipertrofia 8-12" e "emagrecimento 12-15". A prescrição deve ser baseada no tipo do exercício, não no objetivo.
- Para cada exercício, escreva 2-3 frases claras com dicas de execução.
- Em todos os exercícios, inclua ao final das dicas: "Quando atingir o limite superior da faixa de repetições com boa execução em todas as séries, considere aumentar a carga em até 5% na próxima sessão."
- Não ultrapasse 10 séries diretas para o mesmo grupamento em uma única sessão.
- Inclua exercise_type como "compound" ou "isolation".
- Inclua emphasis com a região de maior ênfase do exercício.

Retorne APENAS este JSON:
{{
  "exercises": [
    {{
      "name": "Nome do exercício",
      "muscle_group": "peito",
      "exercise_type": "compound",
      "emphasis": "Peitoral superior",
      "is_unilateral": false,
      "sets": 4,
      "reps": "5-9 ou 8-12",
      "rest_seconds": 120,
      "tips": "Dicas de execução em 2-3 frases. Inclua a orientação de progressão.",
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

    plan = WorkoutPlan(
        user_id=user.user_id,
        muscle_groups=payload.muscle_groups,
        name=payload.name,
        exercises=exercises,
        is_custom=is_custom,
    )
    await db.workout_plans.insert_one(plan.model_dump())
    return plan.model_dump()


@api_router.get("/workout/plans")
async def list_workout_plans(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plans = await db.workout_plans.find({"user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return plans


@api_router.get("/workout/plans/custom")
async def list_custom_plans(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plans = await db.workout_plans.find(
        {"user_id": user.user_id, "is_custom": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return plans


@api_router.get("/workout/plans/group/{muscle_group}")
async def get_group_plan(muscle_group: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plan = await db.workout_plans.find_one(
        {"user_id": user.user_id, "muscle_groups": [muscle_group], "is_custom": False},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not plan:
        # Backwards compat: also try old records where muscle_group was a string
        plan = await db.workout_plans.find_one(
            {"user_id": user.user_id, "muscle_group": muscle_group},
            {"_id": 0},
            sort=[("created_at", -1)],
        )
    if not plan:
        raise HTTPException(status_code=404, detail="Nenhum treino gerado ainda")
    return plan


@api_router.get("/workout/plans/id/{plan_id}")
async def get_plan_by_id(plan_id: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plan = await db.workout_plans.find_one({"user_id": user.user_id, "id": plan_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Treino não encontrado")
    return plan


@api_router.delete("/workout/plans/{plan_id}")
async def delete_workout_plan(plan_id: str, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    await db.workout_plans.delete_one({"id": plan_id, "user_id": user.user_id})
    return {"ok": True}


@api_router.patch("/workout/plans/{plan_id}/rest")
async def update_exercise_rest(plan_id: str, payload: RestUpdate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    plan = await db.workout_plans.find_one({"id": plan_id, "user_id": user.user_id}, {"_id": 0})
    if not plan:
        raise HTTPException(status_code=404, detail="Treino não encontrado")
    exercises = plan.get("exercises", [])
    if payload.exercise_index < 0 or payload.exercise_index >= len(exercises):
        raise HTTPException(status_code=400, detail="Índice de exercício inválido")
    if payload.rest_seconds < 0 or payload.rest_seconds > 600:
        raise HTTPException(status_code=400, detail="Descanso deve estar entre 0 e 600s")
    exercises[payload.exercise_index]["rest_seconds"] = payload.rest_seconds
    await db.workout_plans.update_one({"id": plan_id}, {"$set": {"exercises": exercises}})
    return {"ok": True, "rest_seconds": payload.rest_seconds}


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
    return await db.workout_logs.distinct("exercise_name", {"user_id": user.user_id})


@api_router.get("/workout/logs/last")
async def last_session_summary(exercise: str, authorization: Optional[str] = Header(None)):
    """Return the sets from the most recent session for an exercise (grouped by date)."""
    user = await require_user(authorization)
    logs = await db.workout_logs.find(
        {"user_id": user.user_id, "exercise_name": exercise}, {"_id": 0}
    ).sort("date", -1).to_list(200)
    if not logs:
        return {"has_history": False}
    last_date = logs[0]["date"][:10]
    # collect only logs from that day
    session = [log for log in logs if log["date"][:10] == last_date]
    session.sort(key=lambda x: x.get("set_number", 0))
    max_w = max((s["weight_kg"] for s in session), default=0)
    return {
        "has_history": True,
        "date": last_date,
        "sets": session,
        "max_weight": max_w,
    }


# ============ WEIGHT LOGS ============
@api_router.post("/weight/logs")
async def add_weight_log(payload: WeightLogCreate, authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    log = WeightLog(user_id=user.user_id, weight_kg=payload.weight_kg)
    await db.weight_logs.insert_one(log.model_dump())
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"current_weight": payload.weight_kg}})
    return log.model_dump()


@api_router.get("/weight/logs")
async def list_weight_logs(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    return await db.weight_logs.find({"user_id": user.user_id}, {"_id": 0}).sort("date", 1).to_list(2000)


# ============ DIET ============
@api_router.post("/diet/generate")
async def generate_diet(authorization: Optional[str] = Header(None)):
    user = await require_user(authorization)
    if not user.goal or not user.current_weight:
        raise HTTPException(status_code=400, detail="Complete seu perfil (objetivo e peso) antes de gerar a dieta.")

    system = (
        "Você é um nutricionista especializado em pt-BR. Gere planos alimentares equilibrados, realistas e "
        "detalhados. Responda APENAS com JSON válido, sem markdown."
    )
    prompt = f"""Monte um plano alimentar diário completo para este aluno e explique de forma clara como você chegou às calorias.

Perfil:
- Objetivo: {user.goal}
- Peso atual: {user.current_weight} kg
- Peso alvo: {user.target_weight or 'não informado'} kg
- Altura: {user.height or 'não informada'} cm
- Idade: {user.age or 'não informada'}
- Sexo: {user.sex or 'não informado'}
- Nível de atividade: {user.activity_level or 'moderado'}

Regras:
1. Calcule a TMB (Taxa Metabólica Basal) usando a fórmula Mifflin-St Jeor.
2. Calcule o GET (Gasto Energético Total) multiplicando pela atividade (sedentário 1.2, leve 1.375, moderado 1.55, intenso 1.725).
3. Ajuste as calorias-alvo ao objetivo:
   - Emagrecimento: déficit de ~20% (mínimo 1200 kcal para mulheres, 1500 para homens).
   - Hipertrofia: superávit de ~10-15%.
4. Distribua em 5 refeições: Café da manhã, Lanche da manhã, Almoço, Lanche da tarde, Jantar.
5. Cada alimento deve trazer: nome, quantidade (com unidade, ex: "150 g"), kcal, proteína, carbo, gordura (em gramas).
6. Para cada alimento inclua entre 4 e 5 substituições realistas com quantidades equivalentes (mantendo o mesmo valor calórico e macro similar).
7. Some macros totais do dia.
8. Escreva um texto claro (4 a 6 frases) em "kcal_target_reason" explicando: TMB calculada, fator de atividade, ajuste do objetivo, distribuição de macros e recomendação de hidratação.

Retorne APENAS este JSON:
{{
  "tmb": 1650,
  "tdee": 2560,
  "total_kcal": 2050,
  "total_protein": 155,
  "total_carbs": 200,
  "total_fat": 65,
  "kcal_target_reason": "Explicação em 4-6 frases.",
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
          "substitutions": ["4 claras + 1 gema (200 kcal)", "100g queijo cottage (210 kcal)", "2 fatias peito de peru + 1 ovo (200 kcal)", "50g whey isolado (210 kcal)"]
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


@api_router.post("/diet/rebalance")
async def rebalance_diet(payload: RebalanceRequest, authorization: Optional[str] = Header(None)):
    """User changed the quantity of one food. Ask the LLM to rebalance the other foods
    across the remaining meals so the day's total calories stay the same."""
    user = await require_user(authorization)
    plan = await db.diet_plans.find_one({"user_id": user.user_id}, {"_id": 0}, sort=[("created_at", -1)])
    if not plan:
        raise HTTPException(status_code=404, detail="Nenhum plano ativo")

    try:
        meal = plan["meals"][payload.meal_index]
        food = meal["foods"][payload.food_index]
    except (IndexError, KeyError):
        raise HTTPException(status_code=400, detail="Refeição ou alimento inválido")

    system = (
        "Você é um nutricionista especializado em pt-BR. Rebalanceia planos alimentares mantendo o total "
        "calórico diário estável. Responda APENAS com JSON válido, sem markdown."
    )
    prompt = f"""O usuário alterou a quantidade de um alimento e quer manter o mesmo total calórico diário.

Plano atual (kcal total: {plan['total_kcal']:.0f}):
{json.dumps(plan['meals'], ensure_ascii=False)}

Alteração solicitada:
- Refeição: {meal['name']}
- Alimento: {food['name']} (era "{food['quantity']}", passa a ser "{payload.new_quantity}")

Regras:
1. Recalcule os macros e kcal do alimento alterado proporcionalmente à nova quantidade.
2. Ajuste as quantidades e macros de OUTROS alimentos (em outras refeições) para manter o total calórico do dia PRÓXIMO do original ({plan['total_kcal']:.0f} kcal, com diferença máxima de 2%).
3. Priorize ajustar carboidratos primeiro; mantenha proteína próxima do total original.
4. Preserve os IDs dos alimentos e refeições. Preserve a lista de substituições.
5. Explique em 2-3 frases quais alimentos foram alterados e por que.

Retorne APENAS este JSON:
{{
  "total_kcal": ...,
  "total_protein": ...,
  "total_carbs": ...,
  "total_fat": ...,
  "explanation": "texto curto explicando as trocas",
  "meals": [ ... refeições completas com id, name, time, foods (com id preservado) ... ]
}}
"""

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"rebalance_{user.user_id}_{uuid.uuid4().hex[:8]}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    try:
        response = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        logging.exception("LLM rebalance error")
        raise HTTPException(status_code=500, detail=f"Falha ao rebalancear: {e}")

    try:
        parsed = _parse_json_from_llm(response)
        new_meals = parsed["meals"]
        explanation = parsed.get("explanation", "")
        totals = {
            "total_kcal": float(parsed["total_kcal"]),
            "total_protein": float(parsed["total_protein"]),
            "total_carbs": float(parsed["total_carbs"]),
            "total_fat": float(parsed["total_fat"]),
        }
    except Exception as e:
        logging.exception("Parse rebalance error: %s", response)
        raise HTTPException(status_code=500, detail=f"Resposta da IA inválida: {e}")

    updated = {**plan, **totals, "meals": new_meals}
    updated.pop("_id", None)
    await db.diet_plans.update_one({"id": plan["id"]}, {"$set": {**totals, "meals": new_meals}})
    return {"plan": updated, "explanation": explanation}


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
        pct = ((start_weight - current) / (start_weight - target)) * 100
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


# ============ EQUIPMENT ============
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


@api_router.get("/muscle-groups")
async def muscle_groups_catalog():
    return [
        {"id": "peito", "name": "Peito"},
        {"id": "costas", "name": "Costas"},
        {"id": "ombros", "name": "Ombros"},
        {"id": "bracos", "name": "Braços"},
        {"id": "pernas", "name": "Pernas"},
        {"id": "abdomen", "name": "Abdômen"},
    ]


@api_router.get("/")
async def root():
    return {"message": "FitJourney API", "version": "1.1"}


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
