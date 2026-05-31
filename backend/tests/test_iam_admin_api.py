"""IAM admin API (FF4): roles CRUD + permission catalog + memberships.

Covers: preset roles are visible but read-only; custom roles can be created and
have their permission set replaced; unknown permissions are rejected; the catalog
lists; members can be reassigned but you can't touch your own membership; RBAC
gating (TOMADOR is locked out); and tenant isolation.
"""
import uuid

import pytest
from sqlalchemy import text

from app.core.auth import Principal, get_principal
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, Role, Tenant, User

_PURGE_ROLE_PERMS = "DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = :tid)"
_PURGE_ROLES = "DELETE FROM roles WHERE tenant_id = :tid"


@pytest.fixture
def env(db_engine):
    suffix = uuid.uuid4().hex[:8]
    db = SessionLocal()
    created = {"memberships": [], "users": [], "tenants": []}
    try:
        def _tenant(s):
            t = Tenant(slug=f"iam-{s}-{suffix}", legal_name=f"IAM {s} SA",
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
            return {"sub": sub, "email": u.email, "tenant_id": tenant.id, "membership_id": str(m.id)}

        admin_a = _user(tenant_a, admin_role, "admin-a")
        tomador_a = _user(tenant_a, tomador_role, "tomador-a")
        admin_b = _user(tenant_b, admin_role, "admin-b")
        db.commit()
        yield {"admin_a": admin_a, "tomador_a": tomador_a, "admin_b": admin_b}
    finally:
        for tid in created["tenants"]:
            db.execute(text(_PURGE_ROLE_PERMS), {"tid": tid})
            db.execute(text(_PURGE_ROLES), {"tid": tid})
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


def _preset_id(client, h, nombre):
    roles = client.get("/api/v1/roles", headers=h).json()
    return next(r["id"] for r in roles if r["nombre"] == nombre and r["es_preset"])


def _mk_role(client, h, nombre, perms=None):
    return client.post("/api/v1/roles", headers=h, json={
        "nombre": nombre, "descripcion": "rol de prueba", "permissions": perms or []})


# ── roles ──────────────────────────────────────────────────────────────────
def test_list_roles_includes_presets(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    names = {r["nombre"] for r in client.get("/api/v1/roles", headers=h).json()}
    assert {"OWNER", "ADMIN", "TOMADOR", "CAPTURISTA_GOV"} <= names


def test_create_custom_role_with_permissions(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    r = _mk_role(client, h, "Supervisor", ["menu:dashboard", "menu:productos"])
    assert r.status_code == 201, r.text
    role = r.json()
    assert role["es_preset"] is False
    assert role["tenant_id"] is not None
    assert set(role["permissions"]) == {"menu:dashboard", "menu:productos"}
    # appears in the list now
    ids = {x["id"] for x in client.get("/api/v1/roles", headers=h).json()}
    assert role["id"] in ids


def test_set_permissions_replaces_set(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    rid = _mk_role(client, h, "Capturista", ["menu:dashboard"]).json()["id"]
    put = client.put(f"/api/v1/roles/{rid}/permissions", headers=h,
                     json={"permissions": ["menu:remisiones", "remision:gestionar"]})
    assert put.status_code == 200, put.text
    assert set(put.json()["permissions"]) == {"menu:remisiones", "remision:gestionar"}


def test_create_role_rejects_unknown_permission(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    assert _mk_role(client, h, "Malo", ["no:existe"]).status_code == 422


def test_preset_roles_are_read_only(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    admin_id = _preset_id(client, h, "ADMIN")
    assert client.patch(f"/api/v1/roles/{admin_id}", headers=h, json={"descripcion": "x"}).status_code == 403
    assert client.put(f"/api/v1/roles/{admin_id}/permissions", headers=h,
                      json={"permissions": []}).status_code == 403
    assert client.delete(f"/api/v1/roles/{admin_id}", headers=h).status_code == 403


def test_delete_custom_role_and_in_use_guard(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    rid = _mk_role(client, h, "Temporal", ["menu:dashboard"]).json()["id"]
    # assign it to the tomador member → then deletion is blocked
    client.patch(f"/api/v1/memberships/{env['tomador_a']['membership_id']}", headers=h,
                 json={"role_id": rid})
    assert client.delete(f"/api/v1/roles/{rid}", headers=h).status_code == 409
    # move the member off it, then delete succeeds
    client.patch(f"/api/v1/memberships/{env['tomador_a']['membership_id']}", headers=h,
                 json={"role_id": _preset_id(client, h, "TOMADOR")})
    assert client.delete(f"/api/v1/roles/{rid}", headers=h).status_code == 204
    assert client.get(f"/api/v1/roles/{rid}", headers=h).status_code == 404


# ── permission catalog ───────────────────────────────────────────────────────
def test_permissions_catalog(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    perms = client.get("/api/v1/permissions", headers=h).json()
    ids = {p["id"] for p in perms}
    assert {"role:gestionar", "membership:gestionar", "menu:dashboard", "producto:gestionar"} <= ids


# ── memberships ──────────────────────────────────────────────────────────────
def test_list_memberships_has_display_fields(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    rows = client.get("/api/v1/memberships", headers=h).json()
    emails = {m["user_email"] for m in rows}
    assert env["admin_a"]["email"] in emails and env["tomador_a"]["email"] in emails
    assert all(m["role_nombre"] for m in rows)


def test_patch_membership_role(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    cajero_id = _preset_id(client, h, "CAJERO")
    mid = env["tomador_a"]["membership_id"]
    r = client.patch(f"/api/v1/memberships/{mid}", headers=h, json={"role_id": cajero_id})
    assert r.status_code == 200, r.text
    assert r.json()["role_id"] == cajero_id and r.json()["role_nombre"] == "CAJERO"


def test_cannot_modify_own_membership(client, env, auth_as):
    auth_as(env["admin_a"]); h = _hdr(env["admin_a"])
    own = env["admin_a"]["membership_id"]
    assert client.patch(f"/api/v1/memberships/{own}", headers=h, json={"active": False}).status_code == 409
    assert client.delete(f"/api/v1/memberships/{own}", headers=h).status_code == 409


# ── RBAC + isolation ─────────────────────────────────────────────────────────
def test_tomador_cannot_access_iam(client, env, auth_as):
    auth_as(env["tomador_a"]); h = _hdr(env["tomador_a"])
    assert client.get("/api/v1/roles", headers=h).status_code == 403
    assert client.get("/api/v1/permissions", headers=h).status_code == 403
    assert client.get("/api/v1/memberships", headers=h).status_code == 403
    assert _mk_role(client, h, "X").status_code == 403


def test_iam_isolated_between_tenants(client, env, auth_as):
    auth_as(env["admin_a"]); ha = _hdr(env["admin_a"])
    rid = _mk_role(client, ha, "SoloA", ["menu:dashboard"]).json()["id"]

    auth_as(env["admin_b"]); hb = _hdr(env["admin_b"])
    assert client.get(f"/api/v1/roles/{rid}", headers=hb).status_code == 404
    # B cannot see or modify A's membership
    assert client.patch(f"/api/v1/memberships/{env['tomador_a']['membership_id']}", headers=hb,
                        json={"active": False}).status_code == 404
    b_emails = {m["user_email"] for m in client.get("/api/v1/memberships", headers=hb).json()}
    assert env["tomador_a"]["email"] not in b_emails
