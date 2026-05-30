"""Órdenes de compra end-to-end (Phase 4c): create, folios, state machine,
receiving into inventory (full + partial), guards, RBAC, isolation."""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Almacen, Membership, Producto, Proveedor, Role, Tenant, User

_PURGE = (
    "movimientos_inventario", "mermas", "lotes_inventario",
    "lineas_orden_compra", "ordenes_compra",
    "productos", "almacenes", "proveedores",
)


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(s):
            t = Tenant(slug=f"oc-{s}-{suffix}", legal_name=f"OC {s} SA",
                       rfc=f"O{s.upper()}{suffix.upper()}"[:13], regimen_fiscal_sat="601",
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

        prov = Proveedor(tenant_id=tenant_a.id, codigo="P1", nombre="Proveedor 1")
        prod = Producto(tenant_id=tenant_a.id, sku="OC-P", nombre="Prod OC", clave_sat="01010101", unidad_sat="KGM")
        prod_bulto = Producto(
            tenant_id=tenant_a.id, sku="OC-PB", nombre="Prod Bulto",
            clave_sat="50300000", unidad_sat="KGM",
            unidad_base="KILO", presentaciones={"KILO": 1, "BULTO": 20},
        )
        alm = Almacen(tenant_id=tenant_a.id, codigo="OC-BG", nombre="Bodega OC")
        db.add_all([prov, prod, alm, prod_bulto]); db.flush()
        db.commit()

        yield {
            "admin_a": admin_a, "tomador_a": tomador_a, "admin_b": admin_b,
            "prov_a": str(prov.id), "prod_a": str(prod.id), "alm_a": str(alm.id),
            "prod_bulto_a": str(prod_bulto.id),
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
            claims={"sub": user["sub"]})
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(u):
    return {"X-Tenant-Id": str(u["tenant_id"])}


def _make_oc(client, h, env, qty="100", precio="8"):
    return client.post("/api/v1/ordenes-compra", headers=h, json={
        "proveedor_id": env["prov_a"], "almacen_destino_id": env["alm_a"],
        "lineas": [{"producto_id": env["prod_a"], "cantidad_solicitada": qty, "precio_unitario": precio}]})


def test_create_folio_and_totals(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    r = _make_oc(client, h, env)
    assert r.status_code == 201, r.text
    oc = r.json()
    assert oc["folio"] == "OC-000001"
    assert oc["estado"] == "BORRADOR"
    assert float(oc["subtotal"]) == 800.0
    assert float(oc["total_estimado"]) == 800.0
    assert len(oc["lineas"]) == 1
    # folio increments
    assert _make_oc(client, h, env).json()["folio"] == "OC-000002"


def test_state_machine_and_full_receive(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    oc_id = _make_oc(client, h, env, qty="100", precio="8").json()["id"]

    # cannot receive while BORRADOR
    assert client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h, json={}).status_code == 409
    # invalid jump
    assert client.post(f"/api/v1/ordenes-compra/{oc_id}/transition", headers=h,
                       json={"nuevo_estado": "RECIBIDA"}).status_code == 409

    for nuevo in ("ENVIADA", "ACEPTADA", "EN_TRANSITO"):
        assert client.post(f"/api/v1/ordenes-compra/{oc_id}/transition", headers=h,
                           json={"nuevo_estado": nuevo}).status_code == 200

    rec = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h, json={})
    assert rec.status_code == 200, rec.text
    body = rec.json()
    assert body["estado"] == "RECIBIDA"
    assert float(body["total_recibido"]) == 800.0
    assert float(body["lineas"][0]["cantidad_recibida"]) == 100.0
    assert body["fecha_recibida"] is not None

    # inventory reflects the receipt, costed at the PO price
    ex = client.get("/api/v1/inventario/existencias", headers=h, params={"producto_id": env["prod_a"]}).json()
    row = next(x for x in ex if x["almacen_id"] == env["alm_a"])
    assert float(row["disponible"]) == 100.0
    assert float(row["costo_promedio"]) == 8.0
    # the lot is stamped with the PO
    lotes = client.get("/api/v1/inventario/lotes", headers=h, params={"producto_id": env["prod_a"]}).json()["items"]
    assert any(l["orden_compra_id"] == oc_id for l in lotes)


def test_partial_receive(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    oc = _make_oc(client, h, env, qty="100", precio="5").json()
    oc_id, linea_id = oc["id"], oc["lineas"][0]["id"]
    for nuevo in ("ENVIADA", "ACEPTADA", "EN_TRANSITO"):
        client.post(f"/api/v1/ordenes-compra/{oc_id}/transition", headers=h, json={"nuevo_estado": nuevo})

    part = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h,
                       json={"recepciones": [{"linea_id": linea_id, "cantidad": "40"}]})
    assert part.status_code == 200
    assert part.json()["estado"] == "RECIBIDA_PARCIAL"
    assert float(part.json()["lineas"][0]["cantidad_recibida"]) == 40.0

    # over-receive the remainder + 1 → 422
    over = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h,
                       json={"recepciones": [{"linea_id": linea_id, "cantidad": "61"}]})
    assert over.status_code == 422

    rest = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h,
                       json={"recepciones": [{"linea_id": linea_id, "cantidad": "60"}]})
    assert rest.status_code == 200
    assert rest.json()["estado"] == "RECIBIDA"
    ex = client.get("/api/v1/inventario/existencias", headers=h, params={"producto_id": env["prod_a"]}).json()
    assert float(next(x for x in ex if x["almacen_id"] == env["alm_a"])["disponible"]) == 100.0


def test_receive_with_presentation_converts_to_base_units(client, env, auth_as):
    """Buying in BULTO (1 BULTO = 20 KILO) stocks inventory in base units and
    costs it per base unit: 2 BULTO @ $100 → 40 KILO @ $5/KILO. The PO line
    keeps its own units (cantidad_recibida is in BULTO)."""
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    oc = client.post("/api/v1/ordenes-compra", headers=h, json={
        "proveedor_id": env["prov_a"], "almacen_destino_id": env["alm_a"],
        "lineas": [{"producto_id": env["prod_bulto_a"], "cantidad_solicitada": "2",
                    "precio_unitario": "100", "presentacion": "BULTO"}]}).json()
    oc_id = oc["id"]
    for nuevo in ("ENVIADA", "ACEPTADA", "EN_TRANSITO"):
        client.post(f"/api/v1/ordenes-compra/{oc_id}/transition", headers=h, json={"nuevo_estado": nuevo})

    rec = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h, json={})
    assert rec.status_code == 200, rec.text
    assert float(rec.json()["lineas"][0]["cantidad_recibida"]) == 2.0  # in BULTO

    ex = client.get("/api/v1/inventario/existencias", headers=h,
                    params={"producto_id": env["prod_bulto_a"]}).json()
    row = next(x for x in ex if x["almacen_id"] == env["alm_a"])
    assert float(row["disponible"]) == 40.0          # 2 × 20 base units
    assert float(row["costo_promedio"]) == 5.0        # 100 / 20 per base unit


def test_receive_with_real_weight_catch_weight(client, env, auth_as):
    """Catch-weight: ordeno 2 BULTO (estimado 40 kg) pero el peso real es 45 kg.
    El inventario usa el peso real y el costo = (precio×cantidad)/peso_real."""
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    oc = client.post("/api/v1/ordenes-compra", headers=h, json={
        "proveedor_id": env["prov_a"], "almacen_destino_id": env["alm_a"],
        "lineas": [{"producto_id": env["prod_bulto_a"], "cantidad_solicitada": "2",
                    "precio_unitario": "100", "presentacion": "BULTO"}]}).json()
    oc_id, linea_id = oc["id"], oc["lineas"][0]["id"]
    for nuevo in ("ENVIADA", "ACEPTADA", "EN_TRANSITO"):
        client.post(f"/api/v1/ordenes-compra/{oc_id}/transition", headers=h, json={"nuevo_estado": nuevo})

    rec = client.post(f"/api/v1/ordenes-compra/{oc_id}/recibir", headers=h, json={
        "recepciones": [{"linea_id": linea_id, "cantidad": "2", "cantidad_base": "45"}]})
    assert rec.status_code == 200, rec.text

    ex = client.get("/api/v1/inventario/existencias", headers=h,
                    params={"producto_id": env["prod_bulto_a"]}).json()
    row = next(x for x in ex if x["almacen_id"] == env["alm_a"])
    assert float(row["disponible"]) == 45.0                      # peso real, no 40
    assert abs(float(row["costo_promedio"]) - (200 / 45)) < 0.01  # (100×2)/45


def test_tomador_cannot_touch_compras(client, env, auth_as):
    auth_as(env["tomador_a"]); h = _hdr(env["tomador_a"])
    assert client.get("/api/v1/ordenes-compra", headers=h).status_code == 403
    assert _make_oc(client, h, env).status_code == 403


def test_oc_isolated_between_tenants(client, env, auth_as):
    auth_as(env["admin_a"]); ha = _hdr(env["admin_a"])
    oc_id = _make_oc(client, ha, env).json()["id"]

    auth_as(env["admin_b"]); hb = _hdr(env["admin_b"])
    assert client.get(f"/api/v1/ordenes-compra/{oc_id}", headers=hb).status_code == 404
    # referencing tenant A's proveedor from B → ensure_fk 422
    cross = client.post("/api/v1/ordenes-compra", headers=hb, json={
        "proveedor_id": env["prov_a"],
        "lineas": [{"producto_id": env["prod_a"], "cantidad_solicitada": "1", "precio_unitario": "1"}]})
    assert cross.status_code == 422
