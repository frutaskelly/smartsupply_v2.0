"""Series de folios: contador sin huecos (servicio), CRUD, guards y RBAC."""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.core.rbac import tenant_session
from app.main import app
from app.models import Membership, Role, Serie, Tenant, User
from app.services.series import siguiente_folio


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(slug=f"ser-{suffix}", legal_name="Ser SA", rfc=f"S{suffix.upper()}X"[:13],
                        regimen_fiscal_sat="601", domicilio_fiscal_cp="44100", tier="PRINCIPAL", status="ACTIVE")
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
        yield {"admin": admin, "tomador": tomador, "tenant_id": tenant.id}
    finally:
        for t in created["tenants"]:
            db.execute(text("DELETE FROM series WHERE tenant_id = :t"), {"t": t})
        for mid in created["memberships"]:
            db.query(Membership).filter(Membership.id == mid).delete()
        for uid in created["users"]:
            db.query(User).filter(User.id == uid).delete()
        for t in created["tenants"]:
            db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit(); db.close()


@pytest.fixture
def auth_as():
    def _set(user):
        app.dependency_overrides[get_principal] = lambda: Principal(
            auth_user_id=user["sub"], email=user["email"], role="authenticated", claims={"sub": user["sub"]})
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(u):
    return {"X-Tenant-Id": str(u["tenant_id"])}


def test_siguiente_folio_gapless(env):
    tid = env["tenant_id"]
    with tenant_session(tid) as db:
        db.add(Serie(tenant_id=tid, codigo="T", tipo="FISCAL", tipo_documento="FACTURA", nombre="T"))
    with tenant_session(tid) as db:
        assert siguiente_folio(db, tid, codigo="T", tipo_documento="FACTURA") == 1
    with tenant_session(tid) as db:
        assert siguiente_folio(db, tid, codigo="T", tipo_documento="FACTURA") == 2
    with tenant_session(tid) as db:
        assert siguiente_folio(db, tid, codigo="T", tipo_documento="FACTURA") == 3
        # serie inexistente → None (el llamador cae a su lógica previa)
        assert siguiente_folio(db, tid, codigo="NOPE", tipo_documento="FACTURA") is None


def test_serie_crud_y_guard(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    r = client.post("/api/v1/series", headers=h, json={
        "codigo": "A", "tipo": "FISCAL", "tipo_documento": "FACTURA", "nombre": "Facturas"})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert any(s["codigo"] == "A" for s in client.get("/api/v1/series", headers=h).json()["items"])
    # duplicado (codigo+tipo_doc) → 409
    assert client.post("/api/v1/series", headers=h, json={
        "codigo": "A", "tipo": "FISCAL", "tipo_documento": "FACTURA"}).status_code == 409
    # con folios emitidos no se elimina
    client.patch(f"/api/v1/series/{sid}", headers=h, json={"folio_actual": 5})
    assert client.delete(f"/api/v1/series/{sid}", headers=h).status_code == 409
    # reset a 0 → ya se puede eliminar
    client.patch(f"/api/v1/series/{sid}", headers=h, json={"folio_actual": 0})
    assert client.delete(f"/api/v1/series/{sid}", headers=h).status_code == 204


def test_serie_invalid_tipo_422(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    assert client.post("/api/v1/series", headers=h, json={
        "codigo": "X", "tipo": "OTRO", "tipo_documento": "FACTURA"}).status_code == 422
    assert client.post("/api/v1/series", headers=h, json={
        "codigo": "X", "tipo": "FISCAL", "tipo_documento": "TICKET"}).status_code == 422


def test_tomador_cannot_manage_series(client, env, auth_as):
    auth_as(env["tomador"]); h = _hdr(env["tomador"])
    assert client.post("/api/v1/series", headers=h, json={
        "codigo": "Z", "tipo": "FISCAL", "tipo_documento": "FACTURA"}).status_code == 403
