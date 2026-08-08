from __future__ import annotations

import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import config
from database.models import Task, User, UserTask


def _regen_energy(user: User) -> None:
    """Recompute current energy based on elapsed time, capped at energy_max."""
    now = datetime.datetime.utcnow()
    elapsed = (now - user.energy_updated_at).total_seconds()
    if elapsed <= 0:
        return
    regenerated = int(elapsed * config.ENERGY_REGEN_PER_SEC)
    if regenerated > 0:
        user.energy = min(user.energy_max, user.energy + regenerated)
        user.energy_updated_at = now


def _apply_auto_income(user: User) -> None:
    """Credit passive coins earned from the auto-click upgrade since last sync."""
    now = datetime.datetime.utcnow()
    elapsed = (now - user.auto_income_updated_at).total_seconds()
    if elapsed <= 0:
        return
    if user.auto_click_level <= 0:
        user.auto_income_updated_at = now
        return
    earned = int(elapsed * user.auto_click_level * config.AUTO_CLICK_RATE_PER_LEVEL)
    if earned > 0:
        user.balance += earned
        user.auto_income_updated_at = now


def _sync_user(user: User) -> None:
    _regen_energy(user)
    _apply_auto_income(user)


def get_tap_upgrade_cost(user: User) -> int:
    return config.TAP_UPGRADE_BASE_COST * user.tap_power


def get_auto_click_upgrade_cost(user: User) -> int:
    return config.AUTO_CLICK_BASE_COST * (user.auto_click_level + 1)


async def get_or_create_user(
    session: AsyncSession,
    tg_id: int,
    username: str | None,
    first_name: str | None,
    referrer_tg_id: int | None = None,
) -> tuple[User, bool]:
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    user = result.scalar_one_or_none()
    if user is not None:
        _sync_user(user)
        await session.commit()
        return user, False

    referrer_id = None
    if referrer_tg_id and referrer_tg_id != tg_id:
        ref_result = await session.execute(select(User).where(User.tg_id == referrer_tg_id))
        referrer = ref_result.scalar_one_or_none()
        if referrer is not None:
            referrer_id = referrer.id
            referrer.balance += config.REFERRAL_BONUS_REFERRER

    user = User(
        tg_id=tg_id,
        username=username,
        first_name=first_name,
        balance=config.REFERRAL_BONUS_REFERRED if referrer_id else 0,
        energy=config.ENERGY_MAX,
        energy_max=config.ENERGY_MAX,
        referrer_id=referrer_id,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user, True


async def get_user_by_tg_id(session: AsyncSession, tg_id: int) -> User | None:
    result = await session.execute(select(User).where(User.tg_id == tg_id))
    user = result.scalar_one_or_none()
    if user is not None:
        _sync_user(user)
        await session.commit()
    return user


async def apply_tap(session: AsyncSession, user: User, taps: int) -> User:
    _sync_user(user)
    taps = max(0, min(taps, config.TAP_MAX_PER_REQUEST))
    taps = min(taps, user.energy)
    user.energy -= taps
    user.balance += taps * user.tap_power
    await session.commit()
    await session.refresh(user)
    return user


async def upgrade_tap_power(session: AsyncSession, user: User) -> bool:
    _sync_user(user)
    cost = get_tap_upgrade_cost(user)
    if user.balance < cost:
        await session.commit()
        return False
    user.balance -= cost
    user.tap_power += 1
    await session.commit()
    await session.refresh(user)
    return True


async def upgrade_auto_click(session: AsyncSession, user: User) -> bool:
    _sync_user(user)
    cost = get_auto_click_upgrade_cost(user)
    if user.balance < cost:
        await session.commit()
        return False
    user.balance -= cost
    user.auto_click_level += 1
    await session.commit()
    await session.refresh(user)
    return True


async def get_active_tasks(session: AsyncSession) -> list[Task]:
    result = await session.execute(select(Task).where(Task.is_active.is_(True)))
    return list(result.scalars().all())


async def get_completed_task_ids(session: AsyncSession, user_id: int) -> set[int]:
    result = await session.execute(select(UserTask.task_id).where(UserTask.user_id == user_id))
    return set(result.scalars().all())


async def complete_task(session: AsyncSession, user: User, task: Task) -> bool:
    completed = await get_completed_task_ids(session, user.id)
    if task.id in completed:
        return False
    user.balance += task.reward
    session.add(UserTask(user_id=user.id, task_id=task.id))
    await session.commit()
    return True


async def get_referral_count(session: AsyncSession, user_id: int) -> int:
    result = await session.execute(
        select(func.count()).select_from(User).where(User.referrer_id == user_id)
    )
    return result.scalar_one()


async def get_leaderboard(session: AsyncSession, limit: int = 100) -> list[User]:
    result = await session.execute(select(User).order_by(User.balance.desc()).limit(limit))
    return list(result.scalars().all())
