import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlalchemy import select

import config
from database.db import get_session, init_db
from database.models import Task, User
from database.crud import (
    admin_set_balance,
    apply_tap,
    complete_task,
    get_active_tasks,
    get_auto_click_upgrade_cost,
    get_completed_task_ids,
    get_energy_regen_rate,
    get_energy_regen_upgrade_cost,
    get_leaderboard,
    get_or_create_user,
    get_referral_count,
    get_tap_upgrade_cost,
    upgrade_auto_click,
    upgrade_energy_regen,
    upgrade_tap_power,
)
from web.auth import InvalidInitData, validate_init_data

STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

DEFAULT_TASKS = [
    dict(title="Подписаться на канал", description="Подпишись на наш новостной канал", url="https://t.me/", reward=2500),
    dict(title="Пригласить друга", description="Пригласи хотя бы одного друга по своей ссылке", url=None, reward=5000),
]


async def _seed_tasks() -> None:
    async with get_session() as session:
        result = await session.execute(select(Task))
        if result.scalars().first() is not None:
            return
        for t in DEFAULT_TASKS:
            session.add(Task(**t))
        await session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    await _seed_tasks()
    yield


app = FastAPI(title="NotCoin Клон API", lifespan=lifespan)


async def get_current_user(x_init_data: str = Header(..., alias="X-Init-Data")) -> dict:
    try:
        tg_user = validate_init_data(x_init_data)
    except InvalidInitData as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    async with get_session() as session:
        user, _ = await get_or_create_user(
            session,
            tg_id=tg_user["id"],
            username=tg_user.get("username"),
            first_name=tg_user.get("first_name"),
        )
        return _user_to_dict(user)


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "tg_id": user.tg_id,
        "username": user.username,
        "first_name": user.first_name,
        "balance": user.balance,
        "energy": user.energy,
        "energy_max": user.energy_max,
        "tap_power": user.tap_power,
        "auto_click_level": user.auto_click_level,
        "energy_regen_level": user.energy_regen_level,
        "energy_regen_per_sec": get_energy_regen_rate(user),
        "tap_upgrade_cost": get_tap_upgrade_cost(user),
        "auto_click_upgrade_cost": get_auto_click_upgrade_cost(user),
        "energy_regen_upgrade_cost": get_energy_regen_upgrade_cost(user),
    }


class TapRequest(BaseModel):
    taps: int


@app.get("/api/me")
async def api_me(user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        ref_count = await get_referral_count(session, user["id"])
    ref_link = f"https://t.me/{config.BOT_USERNAME}?start=ref_{user['tg_id']}" if config.BOT_USERNAME else ""
    return {**user, "referrals": ref_count, "ref_link": ref_link}


@app.post("/api/tap")
async def api_tap(body: TapRequest, user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        db_user = await session.get(User, user["id"])
        db_user = await apply_tap(session, db_user, body.taps)
        return _user_to_dict(db_user)


@app.post("/api/upgrade/tap")
async def api_upgrade_tap(user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        db_user = await session.get(User, user["id"])
        ok = await upgrade_tap_power(session, db_user)
        if not ok:
            raise HTTPException(status_code=400, detail="not enough balance")
        return _user_to_dict(db_user)


@app.post("/api/upgrade/auto")
async def api_upgrade_auto(user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        db_user = await session.get(User, user["id"])
        ok = await upgrade_auto_click(session, db_user)
        if not ok:
            raise HTTPException(status_code=400, detail="not enough balance")
        return _user_to_dict(db_user)


@app.post("/api/upgrade/energy")
async def api_upgrade_energy(user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        db_user = await session.get(User, user["id"])
        ok = await upgrade_energy_regen(session, db_user)
        if not ok:
            raise HTTPException(status_code=400, detail="not enough balance")
        return _user_to_dict(db_user)


@app.get("/api/tasks")
async def api_tasks(user: dict = Depends(get_current_user)) -> list[dict]:
    async with get_session() as session:
        tasks = await get_active_tasks(session)
        completed_ids = await get_completed_task_ids(session, user["id"])
        return [
            {
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "url": t.url,
                "reward": t.reward,
                "completed": t.id in completed_ids,
            }
            for t in tasks
        ]


@app.post("/api/tasks/{task_id}/claim")
async def api_claim_task(task_id: int, user: dict = Depends(get_current_user)) -> dict:
    async with get_session() as session:
        db_user = await session.get(User, user["id"])
        tasks = await get_active_tasks(session)
        task = next((t for t in tasks if t.id == task_id), None)
        if task is None:
            raise HTTPException(status_code=404, detail="task not found")
        ok = await complete_task(session, db_user, task)
        if not ok:
            raise HTTPException(status_code=400, detail="task already completed")
        await session.refresh(db_user)
        return _user_to_dict(db_user)


@app.get("/api/leaderboard")
async def api_leaderboard() -> list[dict]:
    async with get_session() as session:
        top = await get_leaderboard(session)
        return [
            {
                "rank": i + 1,
                "username": u.username or u.first_name or f"Player{u.tg_id}",
                "balance": u.balance,
            }
            for i, u in enumerate(top)
        ]


class AdminSetBalanceRequest(BaseModel):
    username: str
    balance: int


@app.post("/api/admin/set-balance")
async def api_admin_set_balance(
    body: AdminSetBalanceRequest, x_admin_secret: str = Header(..., alias="X-Admin-Secret")
) -> dict:
    if not config.ADMIN_SECRET or x_admin_secret != config.ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    async with get_session() as session:
        user = await admin_set_balance(session, body.username, body.balance)
        if user is None:
            raise HTTPException(status_code=404, detail="user not found")
        return _user_to_dict(user)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
