"""End-to-end catalog CRUD through the real dependency chain.

Only JWT verification is stubbed (override `get_principal`); everything else is
real: `get_auth_context` resolves the tenant/role/permissions from the DB, and
`get_tenant_db` runs each request on an RLS-scoped `app_user` session. So these
tests cover authorization gating, CRUD, FK integrity, conflict handling, AND
tenant isolation through the full stack — not just unit-level checks.
"""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, Role, Tenant, User

# Tables to purge (FK order) for the two test tenants at teardown.
_CATALOG_TABLES = (
    "precios",
    "productos",
    "listas_precios",
    "clientes",
    "categorias_producto",
    "esquemas_impuesto",
)


@pytest.fixture
def env(db_engine):
    """Two tenants; tenant A has an ADMIN + a TOMADOR, tenant B an ADMIN."""
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(slug_suffix):
            t = Tenant(
                slug=f"cat-{slug_suffix}-{suffix}",
                legal_name=f"Cat {slug_suffix} SA",
                rfc=f"C{slug_suffix.upper()}{suffix.upper()}"[:13],
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
        # Purge catalog rows for both tenants (owner session bypasses RLS).
        for table in _CATALOG_TABLES:
            for tid in created["tenants"]:
                db.execute(
                    text(f"DELETE FROM {table} WHERE tenant_id = :tid"),
                    {"tid": tid},
                )
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
    """Return a setter that makes the next requests authenticate as a user."""
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


# ─── authorization gating ────────────────────────────────────────────────────
def test_tomador_can_read_productos_but_not_manage(client, env, auth_as):
    auth_as(env["tomador_a"])
    h = _hdr(env["tomador_a"])

    # menu:productos → list allowed
    assert client.get("/api/v1/productos", headers=h).status_code == 200

    # producto:gestionar → create forbidden
    r = client.post(
        "/api/v1/productos",
        headers=h,
        json={"sku": "X1", "nombre": "X", "clave_sat": "01010101", "unidad_sat": "KGM"},
    )
    assert r.status_code == 403


def test_tomador_lacks_categorias_menu(client, env, auth_as):
    auth_as(env["tomador_a"])
    # TOMADOR has no menu:productos.categorias → even reads are denied.
    assert client.get("/api/v1/categorias", headers=_hdr(env["tomador_a"])).status_code == 403


# ─── CRUD happy path ─────────────────────────────────────────────────────────
def test_admin_full_crud_categoria(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    r = client.post("/api/v1/categorias", headers=h, json={"codigo": "FRU", "nombre": "Frutas"})
    assert r.status_code == 201, r.text
    cat = r.json()
    assert cat["tenant_id"] == str(env["tenant_a"])
    cat_id = cat["id"]

    r = client.get(f"/api/v1/categorias/{cat_id}", headers=h)
    assert r.status_code == 200 and r.json()["nombre"] == "Frutas"

    r = client.patch(f"/api/v1/categorias/{cat_id}", headers=h, json={"nombre": "Frutas y Verduras"})
    assert r.status_code == 200 and r.json()["nombre"] == "Frutas y Verduras"

    r = client.get("/api/v1/categorias", headers=h)
    assert r.status_code == 200 and r.json()["total"] == 1

    assert client.delete(f"/api/v1/categorias/{cat_id}", headers=h).status_code == 204
    # Soft-deleted → gone from reads.
    assert client.get(f"/api/v1/categorias/{cat_id}", headers=h).status_code == 404
    assert client.get("/api/v1/categorias", headers=h).json()["total"] == 0


def test_duplicate_codigo_conflicts(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])
    body = {"codigo": "DUP", "nombre": "Uno"}
    assert client.post("/api/v1/categorias", headers=h, json=body).status_code == 201
    assert client.post("/api/v1/categorias", headers=h, json=body).status_code == 409


def test_producto_with_valid_and_invalid_fk(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    cat = client.post("/api/v1/categorias", headers=h, json={"codigo": "C1", "nombre": "Cat"}).json()

    # Valid in-tenant FK → 201.
    r = client.post(
        "/api/v1/productos",
        headers=h,
        json={
            "sku": "P1", "nombre": "Prod 1", "clave_sat": "01010101",
            "unidad_sat": "KGM", "categoria_id": cat["id"],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["categoria_id"] == cat["id"]

    # Bogus FK → 422 (re-validated under tenant scope).
    r = client.post(
        "/api/v1/productos",
        headers=h,
        json={
            "sku": "P2", "nombre": "Prod 2", "clave_sat": "01010101",
            "unidad_sat": "KGM", "categoria_id": str(uuid.uuid4()),
        },
    )
    assert r.status_code == 422


def test_nested_precios_crud(client, env, auth_as):
    auth_as(env["admin_a"])
    h = _hdr(env["admin_a"])

    prod = client.post(
        "/api/v1/productos", headers=h,
        json={"sku": "P9", "nombre": "Prod 9", "clave_sat": "01010101", "unidad_sat": "KGM"},
    ).json()
    lista = client.post("/api/v1/listas-precios", headers=h, json={"codigo": "L1", "nombre": "Lista 1"}).json()

    r = client.post(
        f"/api/v1/listas-precios/{lista['id']}/precios",
        headers=h,
        json={"producto_id": prod["id"], "precio_unitario": "123.45", "cantidad_minima": 1},
    )
    assert r.status_code == 201, r.text
    precio = r.json()
    assert precio["lista_id"] == lista["id"]
    assert precio["tenant_id"] == str(env["tenant_a"])

    r = client.get(f"/api/v1/listas-precios/{lista['id']}/precios", headers=h)
    assert r.status_code == 200 and r.json()["total"] == 1

    assert client.delete(
        f"/api/v1/listas-precios/{lista['id']}/precios/{precio['id']}", headers=h
    ).status_code == 204
    assert client.get(f"/api/v1/listas-precios/{lista['id']}/precios", headers=h).json()["total"] == 0


# ─── tenant isolation through the full stack ─────────────────────────────────
def test_tenant_b_cannot_see_tenant_a_categoria(client, env, auth_as):
    auth_as(env["admin_a"])
    cat = client.post(
        "/api/v1/categorias", headers=_hdr(env["admin_a"]), json={"codigo": "SECRET", "nombre": "A only"}
    ).json()

    # Switch to tenant B's admin: the row is invisible (RLS), so 404.
    auth_as(env["admin_b"])
    assert client.get(f"/api/v1/categorias/{cat['id']}", headers=_hdr(env["admin_b"])).status_code == 404
    assert client.get("/api/v1/categorias", headers=_hdr(env["admin_b"])).json()["total"] == 0


def test_cross_tenant_fk_is_rejected(client, env, auth_as):
    # Tenant A creates a categoria.
    auth_as(env["admin_a"])
    cat = client.post(
        "/api/v1/categorias", headers=_hdr(env["admin_a"]), json={"codigo": "AX", "nombre": "A cat"}
    ).json()

    # Tenant B tries to reference it → not visible in B's scope → 422.
    auth_as(env["admin_b"])
    r = client.post(
        "/api/v1/productos",
        headers=_hdr(env["admin_b"]),
        json={
            "sku": "BP", "nombre": "B prod", "clave_sat": "01010101",
            "unidad_sat": "KGM", "categoria_id": cat["id"],
        },
    )
    assert r.status_code == 422
