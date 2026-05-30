"""Facturas (Fase 6, P6.1): motor fiscal (unitario) + generar desde remisión.

El motor (calcular_linea/totales) se prueba puro; la generación desde remisión
prueba el cruce, los totales, el marcado de remisión facturada y los guards.
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import (
    Almacen, Cliente, EsquemaImpuesto, Membership, Producto, Role, Tenant, User,
)
from app.services.fiscal import calcular_linea, totales


# ── motor fiscal (puro) ──────────────────────────────────────────────────────
def test_iva_16():
    r = calcular_linea(Decimal("100"), iva_tasa=Decimal("0.16"))
    assert r["iva_importe"] == Decimal("16.00")
    assert r["ieps_importe"] == Decimal("0.00")


def test_iva_0_alimento():
    r = calcular_linea(Decimal("100"), iva_tasa=Decimal("0"))
    assert r["iva_importe"] == Decimal("0.00")


def test_ieps_cuota_refresco_antes_de_iva():
    # 12 piezas × 0.6 L = 7.2 L; cuota 3.0818 → IEPS 22.19; IVA 16% sobre (180+22.19)
    r = calcular_linea(Decimal("180"), iva_tasa=Decimal("0.16"), tipo_ieps="CUOTA",
                       ieps_cuota=Decimal("3.0818"), litros_totales=Decimal("7.2"))
    assert r["ieps_importe"] == Decimal("22.19")
    assert r["iva_importe"] == Decimal("32.35")


def test_ieps_tasa_botana():
    r = calcular_linea(Decimal("100"), iva_tasa=Decimal("0"), tipo_ieps="TASA", ieps_tasa=Decimal("0.08"))
    assert r["ieps_importe"] == Decimal("8.00")
    assert r["iva_importe"] == Decimal("0.00")


def test_totales_suma():
    t = totales([
        calcular_linea(Decimal("100"), iva_tasa=Decimal("0.16")),
        calcular_linea(Decimal("50"), iva_tasa=Decimal("0")),
    ])
    assert t["subtotal"] == Decimal("150.00")
    assert t["iva_trasladado"] == Decimal("16.00")
    assert t["total"] == Decimal("166.00")


# ── generar factura desde remisión (integración) ─────────────────────────────
_PURGE = (
    "movimientos_inventario", "mermas", "lineas_remision", "lineas_factura",
    "remisiones", "facturas", "lotes_inventario", "productos",
    "esquemas_impuesto", "clientes", "almacenes",
)


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(slug=f"fac-{suffix}", legal_name="Fac SA", rfc=f"F{suffix.upper()}X"[:13],
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

        esq = EsquemaImpuesto(tenant_id=tenant.id, codigo="IVA16", nombre="IVA 16%", iva_tasa=Decimal("0.16"))
        cli = Cliente(tenant_id=tenant.id, codigo="CLF", legal_name="Cliente Fac SA", rfc="XAXX010101000",
                      regimen_fiscal="601", uso_cfdi_default="G03")
        prod = Producto(tenant_id=tenant.id, sku="FAC-P", nombre="Prod Fac", clave_sat="01010101",
                        unidad_sat="H87", iva_tasa=Decimal("0.16"))
        alm = Almacen(tenant_id=tenant.id, codigo="FAC-BG", nombre="Bodega Fac")
        db.add_all([esq, cli, prod, alm]); db.flush()
        prod.esquema_impuesto_id = esq.id
        db.commit()
        yield {"admin": admin, "tomador": tomador, "cli_id": str(cli.id),
               "prod_id": str(prod.id), "alm_id": str(alm.id)}
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
            auth_user_id=user["sub"], email=user["email"], role="authenticated", claims={"sub": user["sub"]})
    yield _set
    app.dependency_overrides.pop(get_principal, None)


def _hdr(u):
    return {"X-Tenant-Id": str(u["tenant_id"])}


def _remision_confirmada(client, h, env, qty="10", precio="20"):
    client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod_id"], "almacen_id": env["alm_id"],
        "cantidad": "1000", "costo_unitario": "5"})
    rem = client.post("/api/v1/remisiones", headers=h, json={
        "cliente_facturacion_id": env["cli_id"], "almacen_id": env["alm_id"],
        "lineas": [{"producto_id": env["prod_id"], "cantidad_solicitada": qty, "precio_unitario": precio}]}).json()
    client.post(f"/api/v1/remisiones/{rem['id']}/confirmar", headers=h)
    return rem["id"]


def test_factura_desde_remision(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    rem_id = _remision_confirmada(client, h, env, qty="10", precio="20")  # 200 + IVA 16%

    f = client.post("/api/v1/facturas/desde-remisiones", headers=h, json={"remision_ids": [rem_id]})
    assert f.status_code == 201, f.text
    fac = f.json()
    assert fac["estado"] == "BORRADOR"
    assert float(fac["subtotal"]) == 200.0
    assert float(fac["iva_trasladado"]) == 32.0
    assert float(fac["total"]) == 232.0
    assert fac["folio"] == 1 and len(fac["lineas"]) == 1
    assert fac["lineas"][0]["clave_prod_serv"] == "01010101"

    # re-facturar la misma remisión → 409 (ya facturada)
    assert client.post("/api/v1/facturas/desde-remisiones", headers=h,
                       json={"remision_ids": [rem_id]}).status_code == 409


def test_cruce_dos_remisiones(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    r1 = _remision_confirmada(client, h, env, qty="5", precio="20")   # 100
    r2 = _remision_confirmada(client, h, env, qty="3", precio="20")   # 60
    f = client.post("/api/v1/facturas/desde-remisiones", headers=h, json={"remision_ids": [r1, r2]})
    assert f.status_code == 201, f.text
    fac = f.json()
    assert float(fac["subtotal"]) == 160.0 and len(fac["lineas"]) == 2
    assert float(fac["total"]) == 185.6   # 160 + 16% = 185.60


def test_guard_remision_borrador(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    rem = client.post("/api/v1/remisiones", headers=h, json={
        "cliente_facturacion_id": env["cli_id"], "almacen_id": env["alm_id"],
        "lineas": [{"producto_id": env["prod_id"], "cantidad_solicitada": "1", "precio_unitario": "10"}]}).json()
    # sin confirmar → 422
    assert client.post("/api/v1/facturas/desde-remisiones", headers=h,
                       json={"remision_ids": [rem["id"]]}).status_code == 422


def test_tomador_cannot_invoice(client, env, auth_as):
    auth_as(env["tomador"]); h = _hdr(env["tomador"])
    assert client.get("/api/v1/facturas", headers=h).status_code == 403
    assert client.post("/api/v1/facturas/desde-remisiones", headers=h,
                       json={"remision_ids": [str(uuid.uuid4())]}).status_code == 403
