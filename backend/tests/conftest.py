"""Test fixtures.

We set the minimum env BEFORE importing the app so settings validate. The
engine is created lazily (no connection at import), so these API-level tests
need no live database.
"""
import os

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/test"
)
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault(
    "SUPABASE_JWKS_URL",
    "https://example.supabase.co/auth/v1/.well-known/jwks.json",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="session")
def db_engine():
    """The app engine, but only if a live database is reachable.

    DB-backed tests (RLS, RBAC) require `alembic upgrade head` to have run.
    When no DB is available (e.g. a bare local run pointed at a stub URL),
    these tests skip instead of erroring.
    """
    from app.core.db import engine

    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            # Confirm the schema is migrated, not just reachable.
            conn.execute(text("SELECT 1 FROM permissions LIMIT 1"))
    except Exception as exc:  # pragma: no cover - environment dependent
        pytest.skip(f"No migrated database available: {exc}")
    return engine
