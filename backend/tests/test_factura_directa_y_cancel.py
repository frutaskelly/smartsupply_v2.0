"""Nuevas funciones P6.x:
  - Factura DIRECTA (sin remisión, sin afectar inventario).
  - Cancelación de factura con efecto en inventario según el MOTIVO:
      * motivo 03 (no se llevó a cabo) → devuelve inventario, remisión CANCELADA.
      * motivo 02 (errores) → libera la remisión para refacturar, inventario sigue reservado.
El PAC (Facturama) se mockea.
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import (
    Almacen, Cliente, EsquemaImpuesto, LoteInventario, Membership, Producto, Role, Tenant, User,
)
import app.api.v1.facturas as facturas_mod

_PURGE = (
    "movimientos_inventario", "mermas", "lineas_remision", "lineas_factura",
    "remisiones", "facturas", "lotes_inventario", "productos",
    "esquemas_impuesto", "clientes", "almacenes",
)


class _FakePAC:
    """Stub de FacturamaClient: no llama al sandbox."""
    configured = True

    @classmethod
    def from_settings(cls, settings):
        return cls()

    def cancel_cfdi(self, cfdi_id, motive, uuid_replacement=None):
        return {"status": "canceled"}


@pytest.fixture
def fake_pac(monkeypatch):
    monkeypatch.setattr(facturas_mod, "FacturamaClient", _FakePAC)


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(slug=f"fdc-{suffix}", legal_name="FDC SA", rfc=f"F{suffix.upper()}D"[:13],
                        regimen_fiscal_sat="601", domicilio_fiscal_cp="44100", tier="PRINCIPAL", status="ACTIVE")
        db.add(tenant); db.flush(); created["tenants"].append(tenant.id)
        admin_role = db.query(Role).filter(Role.nombre == "ADMIN", Role.es_preset.is_(True)).one()
        sub = f"sub-fdc-{suffix}"
        u = User(email=f"fdc-{suffix}@t.test", auth_user_id=sub, full_name="admin")
        db.add(u); db.flush(); created["users"].append(u.id)
        m = Membership(tenant_id=tenant.id, user_id=u.id, role_id=admin_role.id)
        db.add(m); db.flush(); created["memberships"].append(m.id)

        esq = EsquemaImpuesto(tenant_id=tenant.id, codigo="IVA16", nombre="IVA 16%", iva_tasa=Decimal("0.16"))
        cli = Cliente(tenant_id=tenant.id, codigo="CLD", legal_name="Cliente D SA", rfc="XAXX010101000",
                      regimen_fiscal="601", uso_cfdi_default="G03")
        prod = Producto(tenant_id=tenant.id, sku="FD-P", nombre="Prod FD", clave_sat="50406500",
                        unidad_sat="KGM", iva_tasa=Decimal("0.16"))
        alm = Almacen(tenant_id=tenant.id, codigo="FD-BG", nombre="Bodega FD")
        db.add_all([esq, cli, prod, alm]); db.flush()
        prod.esquema_impuesto_id = esq.id
        db.commit()
        yield {"sub": sub, "email": u.email, "tenant_id": tenant.id,
               "cli": str(cli.id), "prod": str(prod.id), "alm": str(alm.id)}
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
def auth(env):
    app.dependency_overrides[get_principal] = lambda: Principal(
        auth_user_id=env["sub"], email=env["email"], role="authenticated", claims={"sub": env["sub"]})
    yield
    app.dependency_overrides.pop(get_principal, None)


def _h(env):
    return {"X-Tenant-Id": str(env["tenant_id"])}


def _disponible(env):
    db = SessionLocal()
    try:
        row = db.query(LoteInventario).filter(
            LoteInventario.producto_id == uuid.UUID(env["prod"])).first()
        return (Decimal(row.cantidad_disponible), Decimal(row.cantidad_reservada)) if row else (None, None)
    finally:
        db.close()


# ── Factura directa ───────────────────────────────────────────────────────────
def test_factura_directa_sin_inventario(client, env, auth):
    body = {"cliente_id": env["cli"], "lineas": [
        {"producto_id": env["prod"], "cantidad": "10", "precio_unitario": "20"},
        {"producto_id": env["prod"], "cantidad": "5", "precio_unitario": "20"},
    ]}
    r = client.post("/api/v1/facturas/directa", headers=_h(env), json=body)
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["estado"] == "BORRADOR"
    assert float(f["subtotal"]) == 300.0           # (10+5) × 20
    assert float(f["iva_trasladado"]) == 48.0       # 16 %
    assert float(f["total"]) == 348.0
    assert len(f["lineas"]) == 2
    assert f["lineas"][0]["clave_prod_serv"] == "50406500"
    # No se creó inventario ni lotes para esta factura
    assert _disponible(env) == (None, None)


# ── Cancelación con efecto por motivo ──────────────────────────────────────────
def _remision_facturada_timbrada(client, env):
    h = _h(env)
    client.post("/api/v1/inventario/movimientos", headers=h, json={
        "tipo": "ENTRADA_COMPRA", "producto_id": env["prod"], "almacen_id": env["alm"],
        "cantidad": "100", "costo_unitario": "5"})
    rem = client.post("/api/v1/remisiones", headers=h, json={
        "cliente_facturacion_id": env["cli"], "almacen_id": env["alm"],
        "lineas": [{"producto_id": env["prod"], "cantidad_solicitada": "30", "precio_unitario": "20"}]}).json()
    client.post(f"/api/v1/remisiones/{rem['id']}/confirmar", headers=h)
    fac = client.post("/api/v1/facturas/desde-remisiones", headers=h,
                      json={"remision_ids": [rem["id"]]}).json()
    # marcar TIMBRADA directamente (sin PAC)
    db = SessionLocal()
    try:
        from app.models import Factura
        f = db.query(Factura).filter(Factura.id == uuid.UUID(fac["id"])).one()
        f.estado = "TIMBRADA"; f.facturama_id = "FAKE123"; f.uuid = str(uuid.uuid4())
        db.commit()
    finally:
        db.close()
    return rem["id"], fac["id"]


def test_cancel_motivo_02_libera_para_refacturar(client, env, auth, fake_pac):
    rem_id, fac_id = _remision_facturada_timbrada(client, env)
    disp_antes, res_antes = _disponible(env)        # 70 disp, 30 reservada
    assert (disp_antes, res_antes) == (Decimal("70"), Decimal("30"))

    r = client.post(f"/api/v1/facturas/{fac_id}/cancelar", headers=_h(env), json={"motivo": "02"})
    assert r.status_code == 200, r.text
    # inventario NO cambia (la mercancía sigue saliendo, se refactura)
    assert _disponible(env) == (Decimal("70"), Decimal("30"))
    # remisión vuelve a CONFIRMADA y refacturable (su factura quedó CANCELADA;
    # factura_id se conserva para mostrarla en la columna "Factura")
    det = client.get(f"/api/v1/remisiones/{rem_id}", headers=_h(env)).json()
    assert det["estado"] == "CONFIRMADA"
    assert det["factura_estado"] == "CANCELADA"
    refac = client.post("/api/v1/facturas/desde-remisiones", headers=_h(env),
                        json={"remision_ids": [rem_id]})
    assert refac.status_code == 201, refac.text


def test_cancel_simulada_sin_pac(client, env, auth, monkeypatch):
    """FACTURAMA_FAKE_CANCEL=true: cancela SIN llamar al PAC (sandbox no cancela),
    aplicando la lógica interna (motivo 03 → devuelve inventario)."""
    monkeypatch.setattr(facturas_mod.settings, "FACTURAMA_FAKE_CANCEL", True)
    rem_id, fac_id = _remision_facturada_timbrada(client, env)
    assert _disponible(env) == (Decimal("70"), Decimal("30"))
    # sin fake_pac: si intentara llamar al PAC fallaría; el flag debe saltarlo
    r = client.post(f"/api/v1/facturas/{fac_id}/cancelar", headers=_h(env), json={"motivo": "03"})
    assert r.status_code == 200, r.text
    assert r.json()["estado"] == "CANCELADA"
    assert _disponible(env) == (Decimal("100"), Decimal("0"))


def test_cancel_motivo_03_devuelve_inventario(client, env, auth, fake_pac):
    rem_id, fac_id = _remision_facturada_timbrada(client, env)
    assert _disponible(env) == (Decimal("70"), Decimal("30"))

    r = client.post(f"/api/v1/facturas/{fac_id}/cancelar", headers=_h(env), json={"motivo": "03"})
    assert r.status_code == 200, r.text
    # inventario devuelto: 100 disponible, 0 reservada
    assert _disponible(env) == (Decimal("100"), Decimal("0"))
    # remisión CANCELADA (no refacturable)
    det = client.get(f"/api/v1/remisiones/{rem_id}", headers=_h(env)).json()
    assert det["estado"] == "CANCELADA"
