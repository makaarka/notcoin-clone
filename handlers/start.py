from aiogram import Router
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import Message, InlineKeyboardButton, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

import config
from database.db import get_session
from database.crud import get_or_create_user

router = Router()


def _game_keyboard():
    if not config.WEBAPP_URL.startswith("https://"):
        return None
    builder = InlineKeyboardBuilder()
    builder.row(
        InlineKeyboardButton(
            text="🪙 Открыть игру",
            web_app=WebAppInfo(url=config.WEBAPP_URL),
        )
    )
    return builder.as_markup()


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    referrer_tg_id = None
    if command.args and command.args.startswith("ref_"):
        try:
            referrer_tg_id = int(command.args.removeprefix("ref_"))
        except ValueError:
            referrer_tg_id = None

    async with get_session() as session:
        user, created = await get_or_create_user(
            session,
            tg_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
            referrer_tg_id=referrer_tg_id,
        )

    keyboard = _game_keyboard()
    game_note = "" if keyboard else "\n\n⚠️ Игра пока не подключена (нет публичного https-адреса)."

    bonus_note = ""
    if created and referrer_tg_id:
        bonus_note = f"\n\n🎁 Тебе начислен бонус {config.REFERRAL_BONUS_REFERRED} монет за переход по приглашению!"

    await message.answer(
        "Добро пожаловать!\n\n"
        "Тапай по монете, зарабатывай очки, приглашай друзей и выполняй задания."
        f"{bonus_note}{game_note}",
        reply_markup=keyboard,
    )


@router.message()
async def fallback(message: Message) -> None:
    keyboard = _game_keyboard()
    if keyboard:
        await message.answer("Открой игру кнопкой ниже 👇", reply_markup=keyboard)
    else:
        await message.answer("Бот на связи. Игра пока не подключена (нет публичного https-адреса).")
