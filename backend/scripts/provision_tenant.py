"""Provision a tenant + its owner — the only way an account enters the system.

v2 has no open self-signup. A platform operator runs this (with DB access) to
create a tenant, its owner User, and an OWNER Membership. The owner's Supabase
Auth identity is linked to the User row automatically on first login (by email;
see app/core/rbac._resolve_user), so `--auth-user-id` is optional.

Usage:
    cd backend
    export DATABASE_URL=postgresql+psycopg2://postgres:postgres@127.0.0.1:5434/smartsupply_v2
    python -m scripts.provision_tenant \
        --slug frutas-kelly \
        --legal-name "Frutas Kelly SA de CV" \
        --rfc FKE010101AA1 \
        --cp 44100 \
        --owner-email cristian@example.com \
        --owner-name "Cristian"

Idempotent: re-running with the same slug/email reuses existing rows and
ensures the owner membership exists.
"""
from __future__ import annotations

import argparse
import sys

from app.core.db import SessionLocal
from app.models import Membership, Role, Tenant, User


def _get_owner_role(db) -> Role:
    role = (
        db.query(Role)
        .filter(Role.nombre == "OWNER", Role.es_preset.is_(True), Role.tenant_id.is_(None))
        .one_or_none()
    )
    if role is None:
        sys.exit("ERROR: preset OWNER role not found. Run `alembic upgrade head` first.")
    return role


def _upsert_tenant(db, args) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.slug == args.slug).one_or_none()
    if tenant:
        print(f"  tenant '{args.slug}' already exists ({tenant.id})")
        return tenant
    tenant = Tenant(
        slug=args.slug,
        legal_name=args.legal_name,
        trade_name=args.trade_name or args.legal_name,
        rfc=args.rfc.upper(),
        regimen_fiscal_sat=args.regimen,
        domicilio_fiscal_cp=args.cp,
        tier="PRINCIPAL",
        status="ACTIVE",
        plan=args.plan,
    )
    db.add(tenant)
    db.flush()
    print(f"  created tenant '{args.slug}' ({tenant.id})")
    return tenant


def _upsert_user(db, args) -> User:
    email = args.owner_email.lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user:
        print(f"  user '{email}' already exists ({user.id})")
        if args.auth_user_id and not user.auth_user_id:
            user.auth_user_id = args.auth_user_id
            print("  linked auth_user_id")
        return user
    user = User(email=email, full_name=args.owner_name, auth_user_id=args.auth_user_id)
    db.add(user)
    db.flush()
    print(f"  created user '{email}' ({user.id})")
    return user


def _ensure_membership(db, tenant: Tenant, user: User, role: Role) -> None:
    existing = (
        db.query(Membership)
        .filter(Membership.tenant_id == tenant.id, Membership.user_id == user.id)
        .one_or_none()
    )
    if existing:
        if existing.role_id != role.id:
            existing.role_id = role.id
            print("  updated membership role -> OWNER")
        else:
            print("  owner membership already present")
        return
    db.add(
        Membership(
            tenant_id=tenant.id,
            user_id=user.id,
            role_id=role.id,
            acceso_todas_sucursales=True,
            active=True,
        )
    )
    print("  created OWNER membership")


def main() -> None:
    p = argparse.ArgumentParser(description="Provision a tenant + owner.")
    p.add_argument("--slug", required=True)
    p.add_argument("--legal-name", required=True)
    p.add_argument("--rfc", required=True)
    p.add_argument("--cp", required=True, help="domicilio fiscal CP (5 digits)")
    p.add_argument("--regimen", default="601", help="regimen fiscal SAT (default 601)")
    p.add_argument("--trade-name", default=None)
    p.add_argument("--plan", default="trial")
    p.add_argument("--owner-email", required=True)
    p.add_argument("--owner-name", default=None)
    p.add_argument("--auth-user-id", default=None, help="Supabase auth sub (optional; linked on first login)")
    args = p.parse_args()

    db = SessionLocal()
    try:
        role = _get_owner_role(db)
        print("Provisioning…")
        tenant = _upsert_tenant(db, args)
        user = _upsert_user(db, args)
        _ensure_membership(db, tenant, user, role)
        db.commit()
        print(f"Done. Owner '{args.owner_email}' can now sign in to tenant '{args.slug}'.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
