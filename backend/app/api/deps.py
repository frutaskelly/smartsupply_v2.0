"""FastAPI dependencies.

Security contract (the whole point of v2):
  - `get_db`           → unscoped session (auth lookups only).
  - `get_principal`    → verified identity from the JWT (app/core/auth.py).
  - `get_auth_context` → identity + the tenant/role/permissions resolved from
                         the user's membership in the DB. tenant_id comes from
                         the validated membership, NEVER from a header.
  - `require_permission(*perms)` → as above, but 403s unless the caller holds
                         every listed permission (OWNER bypasses).
  - `get_tenant_db`    → a session with `SET LOCAL ROLE app_user` + the tenant
                         GUC set, so Postgres RLS enforces isolation. Use this
                         for any endpoint that touches tenant business data.
"""
from typing import Iterator

from sqlalchemy.orm import Session

from ..core.auth import Principal, get_principal, get_principal_optional
from ..core.db import get_db as _get_db
from ..core.rbac import (
    AuthContext,
    get_auth_context,
    get_tenant_db,
    require_permission,
)

__all__ = [
    "get_db",
    "get_principal",
    "get_principal_optional",
    "Principal",
    "AuthContext",
    "get_auth_context",
    "get_tenant_db",
    "require_permission",
]


def get_db() -> Iterator[Session]:
    yield from _get_db()
