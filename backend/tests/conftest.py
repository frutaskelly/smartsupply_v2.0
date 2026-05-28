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

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    return TestClient(app)
