"""operaciones masters: proveedores + almacenes (schema + RLS)

Revision ID: 0008_operaciones_masters
Revises: 0007_seed_operaciones_perms
Create Date: 2026-05-29

Phase 4a — the operaciones master data. Same RLS contract as the catalog
(0004): each table carries its own `tenant_id` and a single policy keyed on
`tenant_id = public.current_tenant_id()`, reused as the INSERT/UPDATE WITH
CHECK (no explicit WITH CHECK clause).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_operaciones_masters"
down_revision: Union[str, None] = "0007_seed_operaciones_perms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("proveedores", "almacenes")


def _audit_cols():
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def _tenant_col():
    return sa.Column(
        "tenant_id",
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )


def upgrade() -> None:
    # ─── proveedores ─────────────────────────────────────────────────────────
    op.create_table(
        "proveedores",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(20), nullable=False),
        sa.Column("nombre", sa.String(254), nullable=False),
        sa.Column("rfc", sa.String(15)),
        sa.Column("contacto", sa.String(254)),
        sa.Column("telefono", sa.String(20)),
        sa.Column("email", sa.String(254)),
        sa.Column("categorias", postgresql.ARRAY(sa.Text()), nullable=False, server_default=sa.text("'{}'::text[]")),
        sa.Column("condiciones_pago", sa.String(50)),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("notas", sa.Text),
        *_audit_cols(),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_proveedor_tenant_codigo"),
    )
    op.create_index("ix_proveedores_tenant_id", "proveedores", ["tenant_id"])
    op.create_index("ix_proveedores_codigo", "proveedores", ["codigo"])

    # ─── almacenes ───────────────────────────────────────────────────────────
    op.create_table(
        "almacenes",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("codigo", sa.String(20), nullable=False),
        sa.Column("nombre", sa.String(254), nullable=False),
        sa.Column("direccion", sa.Text),
        sa.Column("es_default", sa.Boolean, nullable=False, server_default="false"),
        *_audit_cols(),
        sa.UniqueConstraint("tenant_id", "codigo", name="uq_almacen_tenant_codigo"),
    )
    op.create_index("ix_almacenes_tenant_id", "almacenes", ["tenant_id"])

    # ─── grants + RLS ────────────────────────────────────────────────────────
    for table in _TENANT_SCOPED:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                USING (tenant_id = public.current_tenant_id())
            """
        )


def downgrade() -> None:
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("almacenes")
    op.drop_table("proveedores")
