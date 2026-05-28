"""iam core schema + real RLS

Revision ID: 0002_iam_schema_rls
Revises: 0001_baseline
Create Date: 2026-05-28

The secure core. Creates the identity tables (tenants/users/memberships/roles/
permissions/role_permissions) and — the whole point of v2 — enforces tenant
isolation in the database, not just in application code:

  * A non-superuser role `app_user` (NOBYPASSRLS) is created. Request handlers
    run their tenant-scoped work after `SET LOCAL ROLE app_user`, so Postgres
    itself rejects any row whose tenant_id != current_tenant_id().
  * RLS is ENABLED (not FORCED) on the tenant-scoped tables. The owner role
    (postgres / Supabase) still bypasses it for migrations, seeding and the
    trusted auth-resolution step that runs *before* a tenant is chosen.
  * Every policy keys on public.current_tenant_id() (migration 0001), which
    reads the request GUC the backend sets from the JWT-validated membership —
    never from a client header.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_iam_schema_rls"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: we create the types explicitly in upgrade() with
# checkfirst, so create_table must NOT also try to emit CREATE TYPE.
tenant_tier = postgresql.ENUM(
    "PRINCIPAL", "SUB", "SUB_SUB", name="tenant_tier", create_type=False
)
tenant_status = postgresql.ENUM(
    "ACTIVE", "TRIAL", "SUSPENDED", "CHURNED", name="tenant_status", create_type=False
)

# Tables that carry tenant data and must be isolated by RLS.
_TENANT_SCOPED = ("tenants", "memberships", "roles", "users", "role_permissions")


def upgrade() -> None:
    bind = op.get_bind()
    tenant_tier.create(bind, checkfirst=True)
    tenant_status.create(bind, checkfirst=True)

    # ─── tenants ───────────────────────────────────────────────────────────
    op.create_table(
        "tenants",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("parent_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=True),
        sa.Column("tier", tenant_tier, nullable=False, server_default="PRINCIPAL"),
        sa.Column("status", tenant_status, nullable=False, server_default="TRIAL"),
        sa.Column("slug", sa.String(50), nullable=False, unique=True),
        sa.Column("legal_name", sa.String(254), nullable=False),
        sa.Column("trade_name", sa.String(254)),
        sa.Column("rfc", sa.String(15), nullable=False, unique=True),
        sa.Column("regimen_fiscal_sat", sa.String(4), nullable=False),
        sa.Column("domicilio_fiscal_cp", sa.String(5), nullable=False),
        sa.Column("domicilio_fiscal", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("config", postgresql.JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("plan", sa.String(50), nullable=False, server_default="trial"),
        sa.Column("seats_limit", sa.Integer, nullable=False, server_default="3"),
        sa.Column("trial_ends_at", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tenants_parent_tenant_id", "tenants", ["parent_tenant_id"])

    # ─── users (global; linked to Supabase Auth via auth_user_id) ───────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("full_name", sa.String(254)),
        sa.Column("phone", sa.String(20)),
        sa.Column("auth_provider", sa.String(20), nullable=False, server_default="supabase"),
        sa.Column("auth_user_id", sa.String(254), unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_auth_user_id", "users", ["auth_user_id"])

    # ─── roles (preset = tenant_id NULL; custom = per-tenant) ───────────────
    op.create_table(
        "roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("nombre", sa.String(60), nullable=False),
        sa.Column("vertical", sa.String(20), nullable=True),
        sa.Column("es_preset", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("descripcion", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "nombre", name="uq_role_tenant_nombre"),
    )
    op.create_index("ix_roles_tenant_id", "roles", ["tenant_id"])
    op.create_index("ix_roles_vertical", "roles", ["vertical"])

    # ─── permissions (global catalog) ───────────────────────────────────────
    op.create_table(
        "permissions",
        sa.Column("id", sa.String(80), primary_key=True),
        sa.Column("recurso", sa.String(40), nullable=False),
        sa.Column("accion", sa.String(40), nullable=False),
        sa.Column("vertical", sa.String(20), nullable=True),
        sa.Column("descripcion", sa.Text, nullable=True),
    )
    op.create_index("ix_permissions_recurso", "permissions", ["recurso"])
    op.create_index("ix_permissions_vertical", "permissions", ["vertical"])

    # ─── role_permissions (N:N) ─────────────────────────────────────────────
    op.create_table(
        "role_permissions",
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("permission_id", sa.String(80), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
    )

    # ─── memberships (the only grant of tenant access) ──────────────────────
    op.create_table(
        "memberships",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id"), nullable=False),
        sa.Column("acceso_todas_sucursales", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_membership_tenant_user"),
    )
    op.create_index("ix_memberships_tenant_id", "memberships", ["tenant_id"])
    op.create_index("ix_memberships_user_id", "memberships", ["user_id"])
    op.create_index("ix_memberships_role_id", "memberships", ["role_id"])

    # ─── app_user role: the RLS-enforced identity for request handlers ──────
    # NOBYPASSRLS + NOLOGIN. Granted to the connection role so the backend can
    # `SET LOCAL ROLE app_user`. Idempotent: safe on a DB where it pre-exists.
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                CREATE ROLE app_user NOLOGIN NOBYPASSRLS;
            END IF;
        END
        $$;
        """
    )
    op.execute("GRANT app_user TO CURRENT_USER")
    op.execute("GRANT USAGE ON SCHEMA public TO app_user")
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user")
    op.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user")
    # Future tables/sequences (later phases) inherit the same grants.
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user"
    )
    op.execute(
        "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
        "GRANT USAGE, SELECT ON SEQUENCES TO app_user"
    )

    # ─── Row-Level Security ─────────────────────────────────────────────────
    # ENABLE (not FORCE): the owner/superuser still bypasses for migrations,
    # seeding and the pre-tenant auth-resolution step. app_user is subject to it.
    for table in _TENANT_SCOPED:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    # tenants: a request scoped to tenant T sees only its own row.
    op.execute(
        """
        CREATE POLICY tenant_isolation ON tenants
            USING (id = public.current_tenant_id())
        """
    )
    # memberships: only rows for the current tenant.
    op.execute(
        """
        CREATE POLICY tenant_isolation ON memberships
            USING (tenant_id = public.current_tenant_id())
        """
    )
    # roles: current tenant's custom roles + all preset (global) roles.
    op.execute(
        """
        CREATE POLICY tenant_isolation ON roles
            USING (tenant_id = public.current_tenant_id() OR tenant_id IS NULL)
        """
    )
    # users: only users that hold a membership in the current tenant
    # (prevents cross-tenant user enumeration through app_user).
    op.execute(
        """
        CREATE POLICY tenant_isolation ON users
            USING (
                EXISTS (
                    SELECT 1 FROM memberships m
                    WHERE m.user_id = users.id
                      AND m.tenant_id = public.current_tenant_id()
                )
            )
        """
    )
    # role_permissions: rows whose role belongs to this tenant or is preset.
    op.execute(
        """
        CREATE POLICY tenant_isolation ON role_permissions
            USING (
                EXISTS (
                    SELECT 1 FROM roles r
                    WHERE r.id = role_permissions.role_id
                      AND (r.tenant_id = public.current_tenant_id() OR r.tenant_id IS NULL)
                )
            )
        """
    )


def downgrade() -> None:
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.drop_table("memberships")
    op.drop_table("role_permissions")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("users")
    op.drop_table("tenants")

    tenant_status.drop(op.get_bind(), checkfirst=True)
    tenant_tier.drop(op.get_bind(), checkfirst=True)

    # DROP OWNED BY clears every privilege granted to app_user (table grants
    # incl. the retained alembic_version table, plus the default-privilege
    # entries) so DROP ROLE has no remaining dependencies.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
                EXECUTE 'DROP OWNED BY app_user';
                DROP ROLE app_user;
            END IF;
        END
        $$;
        """
    )
