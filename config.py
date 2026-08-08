import os
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
BOT_USERNAME = os.getenv("BOT_USERNAME", "")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:8000")
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "bot.db"))
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

# Game balance
ENERGY_MAX = 1000
ENERGY_REGEN_PER_SEC = 1 / 3  # 1 energy every 3 seconds
TAP_MAX_PER_REQUEST = 50  # anti-cheat cap per single sync call

REFERRAL_BONUS_REFERRER = 2500
REFERRAL_BONUS_REFERRED = 1000
REFERRAL_COMMISSION_RATE = 0.10  # referrer keeps earning this share of every friend's income

# Upgrades
TAP_UPGRADE_BASE_COST = 500  # cost to go from level N -> N+1 = TAP_UPGRADE_BASE_COST * N
AUTO_CLICK_BASE_COST = 2000  # cost to go from level N -> N+1 = AUTO_CLICK_BASE_COST * (N + 1)
AUTO_CLICK_RATE_PER_LEVEL = 0.2  # passive coins per second, per auto-click level (~720/hour/level)
ENERGY_REGEN_UPGRADE_BASE_COST = 800  # cost to go from level N -> N+1 = base * (N + 1)
ENERGY_REGEN_BONUS_PER_LEVEL = 1 / 6  # extra energy/sec per level (level 2 ~ doubles base regen)
