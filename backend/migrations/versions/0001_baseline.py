"""baseline: RLS plumbing (current_tenant_id helper) + extensions

Revision ID: 0001_baseline
Revises:
Create Date: 2026-05-28

Phase 1 establishes only the foundation the security model depends on:
  - pgcrypto (gen_random_uuid) so future tables can default UUID PKs.
  - public.current_tenant_id(): reads the request-scoped GUC the backend sets
    from the JWT-validated membership. Every tenant table's RLS policy in
    Phase 2 will be `USING (tenant_id = public.current_tenant_id())`.

Domain tables (tenants, users, memberships, roles, catálogo, POS, fiscal …)
arrive in Phase 2's consolidated schema migration.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.current_tenant_id()
        RETURNS uuid
        LANGUAGE sql
        STABLE
        AS $$
            SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        $$
        """
    )


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.current_tenant_id()")
