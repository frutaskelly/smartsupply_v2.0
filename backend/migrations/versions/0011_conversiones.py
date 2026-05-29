"""conversiones de producto (schema + RLS)

Revision ID: 0011_conversiones
Revises: 0010_ordenes_compra
Create Date: 2026-05-29

Phase 4d — product substitution/conversion mapping. Tenant-scoped, same RLS
contract. Both product references CASCADE from `productos`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_conversiones"
down_revision: Union[str, None] = "0010_ordenes_compra"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversiones_producto",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("producto_catalogado_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("producto_no_catalogado_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("factor", sa.Numeric(18, 6), nullable=False, server_default="1"),
        sa.Column("merma_pct", sa.Numeric(7, 4), nullable=False, server_default="0"),
        sa.Column("precio_no_cat", sa.Numeric(18, 4)),
        sa.Column("mezcla_grupo_id", postgresql.UUID(as_uuid=True)),
        sa.Column("mezcla_proporcion", sa.Numeric(7, 4)),
        sa.Column("prioridad", sa.Integer, nullable=False, server_default="10"),
        sa.Column("requiere_aprobacion", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("notas", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "producto_catalogado_id", "producto_no_catalogado_id", name="uq_conversion_tenant_cat_nocat"),
    )
    op.create_index("ix_conversiones_producto_tenant_id", "conversiones_producto", ["tenant_id"])
    op.create_index("ix_conversiones_producto_catalogado", "conversiones_producto", ["producto_catalogado_id"])
    op.create_index("ix_conversiones_producto_no_catalogado", "conversiones_producto", ["producto_no_catalogado_id"])
    op.create_index("ix_conversiones_producto_grupo", "conversiones_producto", ["mezcla_grupo_id"])

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON conversiones_producto TO app_user")
    op.execute("ALTER TABLE conversiones_producto ENABLE ROW LEVEL SECURITY")
    op.execute(
        """
        CREATE POLICY tenant_isolation ON conversiones_producto
            USING (tenant_id = public.current_tenant_id())
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON conversiones_producto")
    op.execute("ALTER TABLE conversiones_producto DISABLE ROW LEVEL SECURITY")
    op.drop_table("conversiones_producto")
