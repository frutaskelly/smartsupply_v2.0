"""Alembic environment.

The DB URL comes from settings (DATABASE_URL), or from the ALEMBIC_DB_URL env
var when targeting the cloud Supabase project. `target_metadata` is the
declarative Base so future `--autogenerate` works once models land in Phase 2.
"""
import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the app package importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings  # noqa: E402
from app.core.db import Base  # noqa: E402
import app.models  # noqa: E402,F401  (import models so they register on Base)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# psycopg2 driver for sync migrations even if the app uses asyncpg elsewhere.
_db_url = os.getenv("ALEMBIC_DB_URL") or settings.DATABASE_URL
config.set_main_option("sqlalchemy.url", _db_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=_db_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
