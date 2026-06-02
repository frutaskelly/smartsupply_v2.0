"""End-to-end CRUD for the Phase 4a masters (proveedores, almacenes).

Same harness as test_catalog_api.py: only JWT verification is stubbed; tenant
resolution, RBAC, and the RLS-scoped session are all real. Covers auth gating,
CRUD, the single-default-warehouse rule, conflict handling, and cross-tenant
isolation through the full stack.
"""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, Role, Tenant, User

_OPS_TABLES = ("almacenes", "proveedores")


@pytest.fixture
def env(db_engine):
    """Two tenants; tenant A has an ADMIN + a TOMADOR, tenant B an ADMIN."""
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(slug_suffix):
            t = Tenant(
                slug=f"ops-{slug_suffix}-{suffix}",
                legal_name=f"Ops {slug_suffix} SA",
                rfc=f"O{slug_suffix.upper()}{suffix.upper()}"[:13],
                regimen_fiscal_sat="601",
                domicilio_fiscal_cp="44100",
                tier="PRINCIPAL",
                status="ACTIVE",
            )
            db.add(t)
            db.flush()
            created["tenants"].append(t.id)
            return t

        tenant_a = _tenant("a")
        tenant_b = _tenant("b")

        admin_role = db.query(Role).filter(Role.nombre == "ADMIN", Role.es_preset.is_(True)).one()
        tomador_role = db.query(Role).filter(Role.nombre == "TOMADOR", Role.es_preset.is_(True)).one()

        def _user(tenant, role, label):
            sub = f"sub-{label}-{suffix}"
            u = User(email=f"{label}-{suffix}@t.test", auth_user_id=sub, full_name=label)
            db.add(u)
            db.flush()
            created["users"].append(u.id)
            m = Membership(tenant_id=tenant.id, user_id=u.id, role_id=role.id)
            db.add(m)
            db.flush()
            created["memberships"].append(m.id)
            return {"sub": sub, "email": u.email, "tenant_id": tenant.id}

        admin_a = _user(tenant_a, admin_role, "admin-a")
        tomador_a = _user(tenant_a, tomador_role, "tomador-a")
        admin_b = _user(tenant_b, admin_role, "admin-b")
        db.commit()

        yield {
            "tenant_a": tenant_a.id,
            "tenant_b": tenant_b.id,
            "admin_a": admin_a,
            "tomador_a": tomador_a,
            "admin_b": admin_b,
        }
    finally:
        for table in _OPS_TABLES:
            for tid in created["tenants"]:
                db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :tid"), {"tid": tid})
        for mid in created["memberships"]:
            db.query(Membership).filter(Membership.id == mid).delete()
        for uid in created["users"]:
            db.query(User).filter(User.id == uid).delete()
        for tid in created["tenants"]:
            db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
        db.close()


@pytest.fixture
def auth_as():
    def _set(user):
        app.dependency_overrides[get_principal] = lambda: Principal(
            auth_user_id=user["sub"],
            email=user["email"],
            role="authenticated",
            claims={"sub": user["sub"]},
        )
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(user):
    return {"X-Tenant-Id": str(user["tenant_id"])}


# ─── proveedores ───────────────────────────────────────────────────────────
def test_admin_crud_proveedor(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    r = client.post(
        "/api/v1/proveedores",
        headers=h,
        json={"codigo": "PROV-1", "nombre": "Frutas del Valle", "rfc": "XAXX010101000",
              "categorias": ["frutas", "verduras"]},
    )
    assert r.status_code == 201, r.text
    prov = r.json()
    assert prov["activo"] is True
    assert prov["categorias"] == ["frutas", "verduras"]
    prov_id = prov["id"]

    # duplicate codigo → 409
    dup = client.post("/api/v1/proveedores", headers=h, json={"codigo": "PROV-1", "nombre": "Otro"})
    assert dup.status_code == 409

    # list + q filter
    listed = client.get("/api/v1/proveedores", headers=h, params={"q": "Valle"})
    assert listed.status_code == 200
    assert any(p["id"] == prov_id for p in listed.json()["items"])

    # patch
    patched = client.patch(f"/api/v1/proveedores/{prov_id}", headers=h, json={"activo": False})
    assert patched.status_code == 200
    assert patched.json()["activo"] is False

    # activo filter
    inactivos = client.get("/api/v1/proveedores", headers=h, params={"activo": False})
    assert any(p["id"] == prov_id for p in inactivos.json()["items"])

    # soft delete → then 404
    assert client.delete(f"/api/v1/proveedores/{prov_id}", headers=h).status_code == 204
    assert client.get(f"/api/v1/proveedores/{prov_id}", headers=h).status_code == 404


def test_proveedor_missing_required_is_422(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])
    # Falta el nombre (obligatorio) → 422.
    assert client.post("/api/v1/proveedores", headers=h, json={"rfc": "XAXX010101000"}).status_code == 422
    # Con nombre basta: el código se autogenera (PROV-01) → 201.
    r = client.post("/api/v1/proveedores", headers=h, json={"nombre": "Sin código"})
    assert r.status_code == 201 and r.json()["codigo"]


# ─── almacenes (single-default rule) ──────────────────────────────────────────
def test_admin_crud_almacen_single_default(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    a1 = client.post("/api/v1/almacenes", headers=h,
                     json={"codigo": "BG-001", "nombre": "Bodega 1", "es_default": True})
    assert a1.status_code == 201, a1.text
    a1_id = a1.json()["id"]
    assert a1.json()["es_default"] is True

    # second default unsets the first
    a2 = client.post("/api/v1/almacenes", headers=h,
                     json={"codigo": "BG-002", "nombre": "Bodega 2", "es_default": True})
    assert a2.status_code == 201
    a2_id = a2.json()["id"]

    assert client.get(f"/api/v1/almacenes/{a1_id}", headers=h).json()["es_default"] is False
    assert client.get(f"/api/v1/almacenes/{a2_id}", headers=h).json()["es_default"] is True

    # patch a1 back to default unsets a2
    assert client.patch(f"/api/v1/almacenes/{a1_id}", headers=h, json={"es_default": True}).status_code == 200
    assert client.get(f"/api/v1/almacenes/{a2_id}", headers=h).json()["es_default"] is False

    # codigo se autogenera (ALM-NN) e ignora el del cliente: el código de
    # entrada repetido NO choca, cada alta recibe uno único.
    a3 = client.post("/api/v1/almacenes", headers=h,
                     json={"codigo": "BG-001", "nombre": "x"})
    assert a3.status_code == 201, a3.text
    codigos = {a1.json()["codigo"], a2.json()["codigo"], a3.json()["codigo"]}
    assert len(codigos) == 3
    assert all(c.startswith("ALM-") for c in codigos)

    # soft delete
    assert client.delete(f"/api/v1/almacenes/{a2_id}", headers=h).status_code == 204
    assert client.get(f"/api/v1/almacenes/{a2_id}", headers=h).status_code == 404


# ─── authorization gating ────────────────────────────────────────────────────
def test_tomador_cannot_touch_operaciones_masters(client, env, auth_as):
    auth_as(env["tomador_a"])
    h = _hdr(env["tomador_a"])
    # TOMADOR has neither menu:compras nor menu:inventario.
    assert client.get("/api/v1/proveedores", headers=h).status_code == 403
    assert client.get("/api/v1/almacenes", headers=h).status_code == 403
    assert client.post("/api/v1/proveedores", headers=h,
                       json={"codigo": "X", "nombre": "X"}).status_code == 403


# ─── cross-tenant isolation through the API ──────────────────────────────────
def test_masters_isolated_between_tenants(client, env, auth_as):
    auth_as(env["admin_a"])
    ha = _hdr(env["admin_a"])
    prov = client.post("/api/v1/proveedores", headers=ha,
                       json={"codigo": "SHARED", "nombre": "A only"}).json()

    # Tenant B can reuse the same code (separate scope) and cannot see A's row.
    auth_as(env["admin_b"])
    hb = _hdr(env["admin_b"])
    assert client.post("/api/v1/proveedores", headers=hb,
                       json={"codigo": "SHARED", "nombre": "B only"}).status_code == 201
    assert client.get(f"/api/v1/proveedores/{prov['id']}", headers=hb).status_code == 404
    b_items = client.get("/api/v1/proveedores", headers=hb).json()["items"]
    assert all(p["id"] != prov["id"] for p in b_items)
