"""SAT suggester endpoint — auth gating + graceful degradation.

The AI call itself is an external dependency and isn't exercised here. With no
ANTHROPIC_API_KEY in the test environment the service returns 503 (not a crash),
which is exactly the behavior we assert. RBAC gating (producto:gestionar) is the
other half.
"""
import uuid

import pytest

from app.core.auth import Principal, get_principal
from app.core.config import settings
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, Role, Tenant, User


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(
            slug=f"sat-{suffix}", legal_name="SAT Test SA", rfc=f"S{suffix.upper()}X"[:13],
            regimen_fiscal_sat="601", domicilio_fiscal_cp="44100", tier="PRINCIPAL", status="ACTIVE",
        )
        db.add(tenant); db.flush(); created["tenants"].append(tenant.id)
        admin_role = db.query(Role).filter(Role.nombre == "ADMIN", Role.es_preset.is_(True)).one()
        tomador_role = db.query(Role).filter(Role.nombre == "TOMADOR", Role.es_preset.is_(True)).one()

        def _user(role, label):
            sub = f"sub-{label}-{suffix}"
            u = User(email=f"{label}-{suffix}@t.test", auth_user_id=sub, full_name=label)
            db.add(u); db.flush(); created["users"].append(u.id)
            m = Membership(tenant_id=tenant.id, user_id=u.id, role_id=role.id)
            db.add(m); db.flush(); created["memberships"].append(m.id)
            return {"sub": sub, "email": u.email, "tenant_id": tenant.id}

        admin = _user(admin_role, "admin")
        tomador = _user(tomador_role, "tomador")
        db.commit()
        yield {"admin": admin, "tomador": tomador}
    finally:
        for mid in created["memberships"]:
            db.query(Membership).filter(Membership.id == mid).delete()
        for uid in created["users"]:
            db.query(User).filter(User.id == uid).delete()
        for tid in created["tenants"]:
            db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit(); db.close()


@pytest.fixture
def auth_as():
    def _set(user):
        app.dependency_overrides[get_principal] = lambda: Principal(
            auth_user_id=user["sub"], email=user["email"], role="authenticated",
            claims={"sub": user["sub"]})
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(u):
    return {"X-Tenant-Id": str(u["tenant_id"])}


def test_tomador_cannot_use_sat_suggester(client, env, auth_as):
    auth_as(env["tomador"])
    r = client.post("/api/v1/sat/sugerir", headers=_hdr(env["tomador"]),
                    json={"nombre": "Manzana roja"})
    assert r.status_code == 403


def test_admin_gets_503_without_api_key(client, env, auth_as):
    auth_as(env["admin"])
    r = client.post("/api/v1/sat/sugerir", headers=_hdr(env["admin"]),
                    json={"nombre": "Manzana roja"})
    # In CI/test there is no ANTHROPIC_API_KEY → graceful 503, never a 500.
    if settings.ANTHROPIC_API_KEY:
        pytest.skip("ANTHROPIC_API_KEY configured; live AI call not exercised in tests")
    assert r.status_code == 503


def test_sat_suggester_requires_nombre(client, env, auth_as):
    auth_as(env["admin"])
    r = client.post("/api/v1/sat/sugerir", headers=_hdr(env["admin"]), json={})
    assert r.status_code == 422
