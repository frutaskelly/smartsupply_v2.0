"""get_auth_context resolves tenant/role/permissions from the DB, not headers.

These exercise the trusted server-side resolution: identity in, validated
tenant + effective permissions out. OWNER bypasses; a scoped role gets exactly
its catalog; an unprovisioned identity and an unauthorized tenant selector are
both rejected.
"""
import uuid

import pytest
from fastapi import HTTPException

from app.core.auth import Principal
from app.core.db import SessionLocal
from app.core.rbac import get_auth_context
from app.models import Membership, Role, Tenant, User


def _principal(sub: str, email: str) -> Principal:
    return Principal(auth_user_id=sub, email=email, role="authenticated", claims={"sub": sub})


@pytest.fixture
def seeded(db_engine):
    """Create a tenant + an OWNER user + a CAJERO user. Cleaned up after."""
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(
            slug=f"rbac-{suffix}",
            legal_name="RBAC Test SA",
            rfc=f"RB{suffix.upper()}X",
            regimen_fiscal_sat="601",
            domicilio_fiscal_cp="44100",
            tier="PRINCIPAL",
            status="ACTIVE",
        )
        db.add(tenant)
        db.flush()
        created["tenants"].append(tenant.id)

        owner_role = db.query(Role).filter(Role.nombre == "OWNER", Role.es_preset.is_(True)).one()
        cajero_role = db.query(Role).filter(Role.nombre == "CAJERO", Role.es_preset.is_(True)).one()

        owner_sub = f"sub-owner-{suffix}"
        cajero_sub = f"sub-cajero-{suffix}"
        owner = User(email=f"owner-{suffix}@t.test", auth_user_id=owner_sub, full_name="Owner")
        cajero = User(email=f"cajero-{suffix}@t.test", auth_user_id=cajero_sub, full_name="Cajero")
        db.add_all([owner, cajero])
        db.flush()
        created["users"] += [owner.id, cajero.id]

        m1 = Membership(tenant_id=tenant.id, user_id=owner.id, role_id=owner_role.id)
        m2 = Membership(tenant_id=tenant.id, user_id=cajero.id, role_id=cajero_role.id)
        db.add_all([m1, m2])
        db.flush()
        created["memberships"] += [m1.id, m2.id]
        db.commit()

        yield {
            "tenant_id": tenant.id,
            "owner_sub": owner_sub,
            "owner_email": owner.email,
            "cajero_sub": cajero_sub,
            "cajero_email": cajero.email,
        }
    finally:
        for mid in created["memberships"]:
            db.query(Membership).filter(Membership.id == mid).delete()
        for uid in created["users"]:
            db.query(User).filter(User.id == uid).delete()
        for tid in created["tenants"]:
            db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
        db.close()


def test_owner_gets_all_permissions(seeded):
    ctx = get_auth_context(
        principal=_principal(seeded["owner_sub"], seeded["owner_email"]),
        x_tenant_id=None,
    )
    assert ctx.tenant_id == seeded["tenant_id"]
    assert ctx.is_owner is True
    assert ctx.role_name == "OWNER"
    # Owner bypass → holds catalog permissions it has no explicit rows for.
    assert ctx.has("menu:dashboard")
    assert ctx.has("pedido:surtir")
    assert "menu:dashboard" in ctx.permissions


def test_scoped_role_gets_only_its_catalog(seeded):
    ctx = get_auth_context(
        principal=_principal(seeded["cajero_sub"], seeded["cajero_email"]),
        x_tenant_id=None,
    )
    assert ctx.is_owner is False
    assert ctx.role_name == "CAJERO"
    assert ctx.has("pedido:cobrar") is True
    assert ctx.has("pedido:surtir") is False  # belongs to BODEGUERO
    assert "menu:ajustes.usuarios" not in ctx.permissions


def test_unprovisioned_identity_is_rejected(db_engine):
    with pytest.raises(HTTPException) as exc:
        get_auth_context(
            principal=_principal(f"sub-ghost-{uuid.uuid4().hex}", "ghost@nowhere.test"),
            x_tenant_id=None,
        )
    assert exc.value.status_code == 403


def test_tenant_selector_must_match_a_membership(seeded):
    # Cajero asks to operate in a tenant they have no membership in → 403.
    other_tenant = str(uuid.uuid4())
    with pytest.raises(HTTPException) as exc:
        get_auth_context(
            principal=_principal(seeded["cajero_sub"], seeded["cajero_email"]),
            x_tenant_id=other_tenant,
        )
    assert exc.value.status_code == 403
