"""Precios v2: resolución por prioridad (override sucursal > override cliente >
lista cliente > lista base), tiers por volumen, CRUD de sucursales/overrides, RBAC.

Reproduce el ejemplo del usuario: Aguacate público $25; cliente fija $20;
sucursal SLP $15, QRO $12; otra sucursal → $20.
"""
import uuid
from decimal import Decimal

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import (
    Cliente, ListaPrecios, Membership, Precio, PrecioOverride, Producto,
    Role, Sucursal, Tenant, User,
)

_PURGE = (
    "precio_overrides", "precios", "sucursales", "listas_precios",
    "productos", "clientes",
)


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        tenant = Tenant(slug=f"pre-{suffix}", legal_name="Pre SA", rfc=f"P{suffix.upper()}X"[:13],
                        regimen_fiscal_sat="601", domicilio_fiscal_cp="44100", tier="PRINCIPAL", status="ACTIVE")
        db.add(tenant); db.flush(); created["tenants"].append(tenant.id)
        tid = tenant.id
        admin_role = db.query(Role).filter(Role.nombre == "ADMIN", Role.es_preset.is_(True)).one()
        tomador_role = db.query(Role).filter(Role.nombre == "TOMADOR", Role.es_preset.is_(True)).one()

        def _user(role, label):
            sub = f"sub-{label}-{suffix}"
            u = User(email=f"{label}-{suffix}@t.test", auth_user_id=sub, full_name=label)
            db.add(u); db.flush(); created["users"].append(u.id)
            m = Membership(tenant_id=tid, user_id=u.id, role_id=role.id)
            db.add(m); db.flush(); created["memberships"].append(m.id)
            return {"sub": sub, "email": u.email, "tenant_id": tid}

        admin = _user(admin_role, "admin")
        tomador = _user(tomador_role, "tomador")

        prod = Producto(tenant_id=tid, sku="AGUACATE", nombre="Aguacate", clave_sat="50300000",
                        unidad_sat="KGM", unidad_base="KILO")
        unico = ListaPrecios(tenant_id=tid, codigo="UNICO", nombre="Precio único")
        menudeo = ListaPrecios(tenant_id=tid, codigo="MENUDEO", nombre="Menudeo")
        db.add_all([prod, unico, menudeo]); db.flush()

        # precio público base + tiers de menudeo
        db.add(Precio(tenant_id=tid, lista_id=unico.id, producto_id=prod.id, presentacion="KILO",
                      precio_unitario=Decimal("25"), cantidad_minima=1))
        db.add(Precio(tenant_id=tid, lista_id=menudeo.id, producto_id=prod.id, presentacion="KILO",
                      precio_unitario=Decimal("25"), cantidad_minima=1))
        db.add(Precio(tenant_id=tid, lista_id=menudeo.id, producto_id=prod.id, presentacion="KILO",
                      precio_unitario=Decimal("20"), cantidad_minima=10))

        cli1 = Cliente(tenant_id=tid, codigo="C1", legal_name="Cliente 1 SA", rfc="XAXX010101000")
        cli3 = Cliente(tenant_id=tid, codigo="C3", legal_name="Cliente 3 SA", rfc="XEXX010101000")
        db.add_all([cli1, cli3]); db.flush()
        cli3.lista_precios_id = menudeo.id  # nivel = menudeo

        slp = Sucursal(tenant_id=tid, cliente_id=cli1.id, nombre="SLP")
        qro = Sucursal(tenant_id=tid, cliente_id=cli1.id, nombre="QRO")
        otra = Sucursal(tenant_id=tid, cliente_id=cli1.id, nombre="Otra")
        db.add_all([slp, qro, otra]); db.flush()

        # overrides: cliente fija $20; SLP $15; QRO $12 (otra hereda del cliente)
        db.add(PrecioOverride(tenant_id=tid, cliente_id=cli1.id, producto_id=prod.id, presentacion="KILO", precio_unitario=Decimal("20")))
        db.add(PrecioOverride(tenant_id=tid, sucursal_id=slp.id, producto_id=prod.id, presentacion="KILO", precio_unitario=Decimal("15")))
        db.add(PrecioOverride(tenant_id=tid, sucursal_id=qro.id, producto_id=prod.id, presentacion="KILO", precio_unitario=Decimal("12")))
        db.commit()

        yield {"admin": admin, "tomador": tomador, "aguacate": str(prod.id),
               "cli1": str(cli1.id), "cli3": str(cli3.id),
               "slp": str(slp.id), "qro": str(qro.id), "otra": str(otra.id)}
    finally:
        for table in _PURGE:
            for t in created["tenants"]:
                db.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": t})
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


def _cot(client, h, pid, **params):
    return client.get("/api/v1/precios/cotizar", headers=h, params={"producto_id": pid, **params}).json()


def test_resolucion_por_prioridad(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"]); pid = env["aguacate"]

    base = _cot(client, h, pid)
    assert float(base["precio"]) == 25.0 and base["origen"] == "lista_base"

    c1 = _cot(client, h, pid, cliente_id=env["cli1"])
    assert float(c1["precio"]) == 20.0 and c1["origen"] == "override_cliente"

    slp = _cot(client, h, pid, sucursal_id=env["slp"])
    assert float(slp["precio"]) == 15.0 and slp["origen"] == "override_sucursal"

    qro = _cot(client, h, pid, sucursal_id=env["qro"])
    assert float(qro["precio"]) == 12.0

    # sucursal sin override → hereda el precio del cliente ($20)
    otra = _cot(client, h, pid, sucursal_id=env["otra"])
    assert float(otra["precio"]) == 20.0 and otra["origen"] == "override_cliente"


def test_tiers_por_volumen(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"]); pid = env["aguacate"]
    # cli3 usa lista MENUDEO: 1–9 = $25, ≥10 = $20 (acceso a mayoreo por volumen)
    assert float(_cot(client, h, pid, cliente_id=env["cli3"], cantidad="5")["precio"]) == 25.0
    assert float(_cot(client, h, pid, cliente_id=env["cli3"], cantidad="15")["precio"]) == 20.0


def test_sucursal_crud(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    r = client.post("/api/v1/sucursales", headers=h, json={"cliente_id": env["cli1"], "nombre": "CDMX"})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    assert client.get("/api/v1/sucursales", headers=h, params={"cliente_id": env["cli1"]}).json()["total"] == 4
    assert client.patch(f"/api/v1/sucursales/{sid}", headers=h, json={"nombre": "CDMX Centro"}).json()["nombre"] == "CDMX Centro"
    assert client.delete(f"/api/v1/sucursales/{sid}", headers=h).status_code == 204


def test_override_xor_validation(client, env, auth_as):
    auth_as(env["admin"]); h = _hdr(env["admin"])
    # ni cliente ni sucursal → 422
    assert client.post("/api/v1/precios/overrides", headers=h, json={
        "producto_id": env["aguacate"], "precio_unitario": "10"}).status_code == 422
    # ambos → 422
    assert client.post("/api/v1/precios/overrides", headers=h, json={
        "cliente_id": env["cli1"], "sucursal_id": env["slp"],
        "producto_id": env["aguacate"], "precio_unitario": "10"}).status_code == 422
    # solo cliente → 201
    assert client.post("/api/v1/precios/overrides", headers=h, json={
        "cliente_id": env["cli3"], "producto_id": env["aguacate"], "precio_unitario": "10"}).status_code == 201


def test_rbac(client, env, auth_as):
    auth_as(env["tomador"]); h = _hdr(env["tomador"])
    # TOMADOR puede cotizar (menu:productos)…
    assert client.get("/api/v1/precios/cotizar", headers=h,
                      params={"producto_id": env["aguacate"]}).status_code == 200
    # …pero no crear sucursales (cliente:gestionar) ni overrides (lista_precios:gestionar)
    assert client.post("/api/v1/sucursales", headers=h,
                       json={"cliente_id": env["cli1"], "nombre": "X"}).status_code == 403
    assert client.post("/api/v1/precios/overrides", headers=h, json={
        "cliente_id": env["cli1"], "producto_id": env["aguacate"], "precio_unitario": "1"}).status_code == 403
