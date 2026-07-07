"""Platform operator endpoints — cross-tenant, READ-ONLY.

Gated to the `PLATFORM_OPERATORS` email allowlist. This is the only place that
reads across tenants by design: v2 has no platform-admin *role* (see
`models/role.py`), so authority here is the verified-JWT email being on the
operator allowlist — a provisioning concern, never an in-tenant role.

Deliberately uses the unscoped session (`get_db`): no tenant GUC is set, so the
operator sees every tenant. Nothing here writes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.auth import Principal, get_principal
from ...core.config import settings
from ...core.db import get_db
from ...models.role import Role
from ...models.tenant import Membership, Tenant, User

router = APIRouter(prefix="/platform", tags=["platform"])


def require_operator(principal: Principal = Depends(get_principal)) -> Principal:
    """403 unless the verified JWT email is on the PLATFORM_OPERATORS allowlist."""
    email = (principal.email or "").strip().lower()
    if not email or email not in settings.platform_operators_list():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo operadores de plataforma",
        )
    return principal


@router.get("/me")
def operator_me(op: Principal = Depends(require_operator)) -> dict:
    """Cheap probe the admin UI uses to confirm operator access."""
    return {"email": op.email, "is_operator": True}


@router.get("/tenants")
def list_tenants(
    op: Principal = Depends(require_operator),
    db: Session = Depends(get_db),
) -> dict:
    """Every company (tenant) with its users — read-only operator view."""
    tenants = (
        db.query(Tenant)
        .filter(Tenant.deleted_at.is_(None))
        .order_by(Tenant.created_at.desc())
        .all()
    )
    memberships = db.query(Membership).all()
    users = {u.id: u for u in db.query(User).all()}
    roles = {r.id: r for r in db.query(Role).all()}

    by_tenant: dict = {}
    for m in memberships:
        by_tenant.setdefault(m.tenant_id, []).append(m)

    out = []
    for t in tenants:
        ms = by_tenant.get(t.id, [])
        out.append(
            {
                "id": str(t.id),
                "slug": t.slug,
                "legal_name": t.legal_name,
                "trade_name": t.trade_name,
                "rfc": t.rfc,
                "status": t.status,
                "tier": t.tier,
                "plan": t.plan,
                "seats_limit": t.seats_limit,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "user_count": len(ms),
                "users": [
                    {
                        "email": users[m.user_id].email if m.user_id in users else None,
                        "full_name": users[m.user_id].full_name if m.user_id in users else None,
                        "role": roles[m.role_id].nombre if m.role_id in roles else None,
                        "active": m.active,
                    }
                    for m in ms
                ],
            }
        )

    total_users = sum(t["user_count"] for t in out)
    return {"tenants": out, "tenant_count": len(out), "user_count": total_users}
