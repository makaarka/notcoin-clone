from contextlib import asynccontextmanager

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from config import DATABASE_URL
from database.models import Base

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


def _add_missing_columns(sync_conn) -> None:
    """Best-effort auto-migration: add columns present in the models but missing
    from an existing (already populated) table, so schema changes don't require
    wiping the persisted database on redeploy."""
    inspector = inspect(sync_conn)
    existing_tables = set(inspector.get_table_names())
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing_cols:
                continue
            col_type = column.type.compile(dialect=sync_conn.dialect)
            default_clause = ""
            if column.default is not None and column.default.is_scalar:
                val = column.default.arg
                if isinstance(val, bool):
                    default_clause = f" DEFAULT {1 if val else 0}"
                elif isinstance(val, (int, float)):
                    default_clause = f" DEFAULT {val}"
            sync_conn.execute(
                text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_clause}')
            )


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


@asynccontextmanager
async def get_session():
    async with async_session() as session:
        yield session
