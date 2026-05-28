"""Auth endpoints.

Phase 1 ships /me, which proves the JWKS verification pipeline end to end:
a valid Supabase access token resolves to a verified identity. Phase 2 extends
the response with the user's tenants/role/permissions from the DB.
"""
from fastapi import APIRouter, Depends

from ...core.auth import Principal, get_principal

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(principal: Principal = Depends(get_principal)) -> dict:
    """Return the verified identity behind the bearer token."""
    return {
        "auth_user_id": principal.auth_user_id,
        "email": principal.email,
        "role": principal.role,
        # Phase 2: "tenants": [...], "permissions": [...]
    }
