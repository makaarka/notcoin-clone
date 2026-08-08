import asyncio
import logging

import uvicorn

import config
from bot import run_bot
from database.db import init_db
from web.server import app


async def run_web() -> None:
    server_config = uvicorn.Config(app, host=config.HOST, port=config.PORT, log_level="info")
    server = uvicorn.Server(server_config)
    await server.serve()


async def main() -> None:
    await init_db()  # run once before both tasks start to avoid concurrent create_all races
    await asyncio.gather(run_bot(), run_web())


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
