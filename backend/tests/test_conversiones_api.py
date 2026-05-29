"""Conversiones de producto end-to-end (Phase 4d): CRUD, dup/same-product
guards, the priority-ordered substitutes lookup, RBAC, and isolation."""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, Producto, Role, Tenant, User

_PURGE = ("conversiones_producto", "productos")


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(s):
            t = Tenant(slug=f"conv-{s}-{suffix}", legal_name=f"Conv {s} SA",
                       rfc=f"V{s.upper()}{suffix.upper()}"[:13], regimen_fiscal_sat="601",
                       domicilio_fiscal_cp="44100", tier="PRINCIPAL", status="ACTIVE")
            db.add(t); db.flush(); created["tenants"].append(t.id); return t

        tenant_a, tenant_b = _tenant("a"), _tenant("b")
        admin_role = db.query(Role).filter(Role.nombre == "ADMIN", Role.es_preset.is_(True)).one()
        tomador_role = db.query(Role).filter(Role.nombre == "TOMADOR", Role.es_preset.is_(True)).one()

        def _user(tenant, role, label):
            sub = f"sub-{label}-{suffix}"
            u = User(email=f"{label}-{suffix}@t.test", auth_user_id=sub, full_name=label)
            db.add(u); db.flush(); created["users"].append(u.id)
            m = Membership(tenant_id=tenant.id, user_id=u.id, role_id=role.id)
            db.add(m); db.flush(); created["memberships"].append(m.id)
            return {"sub": sub, "email": u.email, "tenant_id": tenant.id}

        admin_a = _user(tenant_a, admin_role, "admin-a")
        tomador_a = _user(tenant_a, tomador_role, "tomador-a")
        admin_b = _user(tenant_b, admin_role, "admin-b")

        def _prod(tenant, sku):
            p = Producto(tenant_id=tenant.id, sku=sku, nombre=f"P {sku}",
                         clave_sat="01010101", unidad_sat="KGM")
            db.add(p); db.flush(); return str(p.id)

        p1, p2, p3 = _prod(tenant_a, "C1"), _prod(tenant_a, "C2"), _prod(tenant_a, "C3")
        db.commit()
        yield {"admin_a": admin_a, "tomador_a": tomador_a, "admin_b": admin_b,
               "p1": p1, "p2": p2, "p3": p3}
    finally:
        for table in _PURGE:
            for tid in created["tenants"]:
                db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :tid"), {"tid": tid})
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


def test_crud_and_guards(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])

    r = client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"],
        "factor": "1.2", "merma_pct": "5", "prioridad": 5})
    assert r.status_code == 201, r.text
    conv = r.json()
    assert float(conv["factor"]) == 1.2
    conv_id = conv["id"]

    # duplicate pair → 409
    assert client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"]}).status_code == 409
    # same product on both sides → 422
    assert client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p1"]}).status_code == 422

    # patch
    patched = client.patch(f"/api/v1/conversiones/{conv_id}", headers=h, json={"prioridad": 1})
    assert patched.status_code == 200 and patched.json()["prioridad"] == 1

    # delete → 404
    assert client.delete(f"/api/v1/conversiones/{conv_id}", headers=h).status_code == 204
    assert client.get(f"/api/v1/conversiones/{conv_id}", headers=h).status_code == 404


def test_disponibles_ordered_and_active_only(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    # p1 → p2 (prioridad 5) and p1 → p3 (prioridad 1)
    client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"], "prioridad": 5})
    c3 = client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p3"], "prioridad": 1}).json()

    disp = client.get(f"/api/v1/conversiones/producto/{env['p1']}/disponibles", headers=h).json()
    assert [d["producto_no_catalogado_id"] for d in disp] == [env["p3"], env["p2"]]  # priority order

    # deactivate p3 conversion → excluded
    client.patch(f"/api/v1/conversiones/{c3['id']}", headers=h, json={"activo": False})
    disp2 = client.get(f"/api/v1/conversiones/producto/{env['p1']}/disponibles", headers=h).json()
    assert [d["producto_no_catalogado_id"] for d in disp2] == [env["p2"]]


def test_tomador_cannot_touch_conversiones(client, env, auth_as):
    auth_as(env["tomador_a"]); h = _hdr(env["tomador_a"])  # no menu:conversiones
    assert client.get("/api/v1/conversiones", headers=h).status_code == 403
    assert client.post("/api/v1/conversiones", headers=h, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"]}).status_code == 403


def test_conversiones_isolated_between_tenants(client, env, auth_as):
    auth_as(env["admin_a"]); ha = _hdr(env["admin_a"])
    conv_id = client.post("/api/v1/conversiones", headers=ha, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"]}).json()["id"]

    auth_as(env["admin_b"]); hb = _hdr(env["admin_b"])
    assert client.get(f"/api/v1/conversiones/{conv_id}", headers=hb).status_code == 404
    # B cannot reference tenant A's productos
    assert client.post("/api/v1/conversiones", headers=hb, json={
        "producto_catalogado_id": env["p1"], "producto_no_catalogado_id": env["p2"]}).status_code == 422
