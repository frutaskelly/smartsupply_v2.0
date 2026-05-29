"""Inventory movements end-to-end (Phase 4b).

Exercises the kardex engine through the full stack: weighted-average cost on
purchase, dual-state quantity, ajuste/merma guards, transferencia between
warehouses, payload validation, RBAC gating, and cross-tenant isolation
(ensure_fk refuses a foreign producto).
"""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Almacen, Membership, Producto, Role, Tenant, User

_PURGE = ("movimientos_inventario", "mermas", "lotes_inventario", "productos", "almacenes")


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(s):
            t = Tenant(slug=f"inv-{s}-{suffix}", legal_name=f"Inv {s} SA",
                       rfc=f"I{s.upper()}{suffix.upper()}"[:13], regimen_fiscal_sat="601",
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

        def _producto(tenant, sku):
            p = Producto(tenant_id=tenant.id, sku=sku, nombre=f"Prod {sku}",
                         clave_sat="01010101", unidad_sat="KGM")
            db.add(p); db.flush(); return p

        def _almacen(tenant, codigo):
            a = Almacen(tenant_id=tenant.id, codigo=codigo, nombre=f"Bodega {codigo}")
            db.add(a); db.flush(); return a

        prod_a, alm_a = _producto(tenant_a, "INV-A"), _almacen(tenant_a, "BG-A")
        prod_b, alm_b = _producto(tenant_b, "INV-B"), _almacen(tenant_b, "BG-B")
        db.commit()

        yield {
            "admin_a": admin_a, "tomador_a": tomador_a, "admin_b": admin_b,
            "prod_a": str(prod_a.id), "alm_a": str(alm_a.id),
            "prod_b": str(prod_b.id), "alm_b": str(alm_b.id),
        }
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
            claims={"sub": user["sub"]},
        )
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(user):
    return {"X-Tenant-Id": str(user["tenant_id"])}


def _existencia(client, h, producto_id, almacen_id):
    rows = client.get("/api/v1/inventario/existencias", headers=h,
                      params={"producto_id": producto_id}).json()
    for r in rows:
        if r["almacen_id"] == almacen_id:
            return r
    return None


def test_entrada_compra_weighted_average_cost(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    r = client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "100", "costo_unitario": "10"})
    assert r.status_code == 201, r.text
    assert len(r.json()) == 1

    row = _existencia(client, h, env["prod_a"], env["alm_a"])
    assert float(row["disponible"]) == 100.0
    assert float(row["costo_promedio"]) == 10.0
    assert float(row["valor"]) == 1000.0

    # Second purchase into the same default lot → weighted average.
    client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "100", "costo_unitario": "20"})
    row = _existencia(client, h, env["prod_a"], env["alm_a"])
    assert float(row["disponible"]) == 200.0
    assert float(row["costo_promedio"]) == 15.0  # (100*10 + 100*20)/200


def test_ajuste_and_merma_guards(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])
    client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "100", "costo_unitario": "10"})

    # negative adjustment within stock
    assert client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "AJUSTE", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "-30"}).status_code == 201
    assert float(_existencia(client, h, env["prod_a"], env["alm_a"])["disponible"]) == 70.0

    # adjustment that would go negative → 422
    assert client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "AJUSTE", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "-1000"}).status_code == 422

    # merma
    assert client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "MERMA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "20", "merma_motivo": "CADUCIDAD"}).status_code == 201
    assert float(_existencia(client, h, env["prod_a"], env["alm_a"])["disponible"]) == 50.0

    # merma beyond stock → 422
    assert client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "MERMA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "9999", "merma_motivo": "ROBO"}).status_code == 422

    # kardex has the rows
    movs = client.get("/api/v1/inventario/movimientos", headers=h,
                      params={"producto_id": env["prod_a"]}).json()
    assert movs["total"] >= 3


def test_transferencia_between_warehouses(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])
    # stock in origin
    client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "100", "costo_unitario": "12"})
    # a second warehouse
    alm2 = client.post("/api/v1/almacenes", headers=h,
                       json={"codigo": "BG-A2", "nombre": "Bodega A2"}).json()["id"]

    r = client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "TRANSFERENCIA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "almacen_destino_id": alm2, "cantidad": "40"})
    assert r.status_code == 201, r.text
    assert len(r.json()) == 2

    assert float(_existencia(client, h, env["prod_a"], env["alm_a"])["disponible"]) == 60.0
    dest = _existencia(client, h, env["prod_a"], alm2)
    assert float(dest["disponible"]) == 40.0
    assert float(dest["costo_promedio"]) == 12.0  # cost travels with the goods


def test_movimiento_payload_validation(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])
    base = {"producto_id": env["prod_a"], "almacen_id": env["alm_a"], "cantidad": "5"}
    # ENTRADA_COMPRA needs costo
    assert client.post("/api/v1/inventario/movimientos", headers=h,
                       json={**base, "tipo": "ENTRADA_COMPRA"}).status_code == 422
    # MERMA needs motivo
    assert client.post("/api/v1/inventario/movimientos", headers=h,
                       json={**base, "tipo": "MERMA"}).status_code == 422
    # TRANSFERENCIA needs destino
    assert client.post("/api/v1/inventario/movimientos", headers=h,
                       json={**base, "tipo": "TRANSFERENCIA"}).status_code == 422
    # zero qty
    assert client.post("/api/v1/inventario/movimientos", headers=h,
                       json={"producto_id": env["prod_a"], "almacen_id": env["alm_a"],
                             "tipo": "AJUSTE", "cantidad": "0"}).status_code == 422


def test_tomador_cannot_touch_inventario(client, env, auth_as):
    auth_as(env["tomador_a"])
    h = _hdr(env["tomador_a"])  # TOMADOR lacks menu:inventario
    assert client.get("/api/v1/inventario/existencias", headers=h).status_code == 403
    assert client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "AJUSTE", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "1"}).status_code == 403


def test_inventario_isolated_between_tenants(client, env, auth_as):
    # Tenant A loads stock.
    auth_as(env["admin_a"])
    ha = _hdr(env["admin_a"])
    client.post("/api/v1/inventario/movimientos", headers=ha, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_a"],
        "cantidad": "10", "costo_unitario": "5"})

    # Tenant B sees none of it, and cannot reference tenant A's producto (ensure_fk → 422).
    auth_as(env["admin_b"])
    hb = _hdr(env["admin_b"])
    assert client.get("/api/v1/inventario/existencias", headers=hb).json() == []
    cross = client.post("/api/v1/inventario/movimientos", headers=hb, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_a"], "almacen_id": env["alm_b"],
        "cantidad": "1", "costo_unitario": "1"})
    assert cross.status_code == 422  # producto_a not visible in tenant B's scope
