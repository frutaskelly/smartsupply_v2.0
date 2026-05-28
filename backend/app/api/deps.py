"""FastAPI dependencies.

Security contract (the whole point of v2):
  - `get_db`           → unscoped session (auth lookups only).
  - `get_principal`    → verified identity from the JWT (app/core/auth.py).
  - `get_auth_context` → identity + the tenant/role/permissions resolved from
                         the user's membership in the DB. tenant_id comes from
                         the validated membership, NEVER from a header.

Phase 2 wires `get_auth_context` to the User/Membership/Role models and
opens a tenant-scoped session via `db.set_tenant(...)`. Phase 1 ships the
identity layer (JWKS verification) which everything else builds on.
"""
from typing import Iterator

from sqlalchemy.orm import Session

from ..core.auth import Principal, get_principal, get_principal_optional
from ..core.db import get_db as _get_db

__all__ = ["get_db", "get_principal", "get_principal_optional", "Principal"]


def get_db() -> Iterator[Session]:
    yield from _get_db()
