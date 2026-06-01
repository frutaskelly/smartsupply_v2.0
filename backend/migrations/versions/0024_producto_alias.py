"""alias aprendidos de producto (cruce de productos) + pg_trgm

Revision ID: 0024_producto_alias
Revises: 0023_serie_default_y_asignacion
Create Date: 2026-05-31

Cuando el usuario teclea/pega un nombre que no es exacto ("zanahorias",
"Chile Cuaresmeño") el sistema sugiere el producto real; al confirmar, el
alias normalizado se guarda en `producto_alias` y futuras búsquedas lo
resuelven solo (no se vuelve a preguntar). pg_trgm acelera la búsqueda difusa.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024_producto_alias"
down_revision: Union[str, None] = "0023_serie_default_y_asignacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "producto_alias",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(254), nullable=False),                 # texto tal como lo escribió el usuario
        sa.Column("alias_normalizado", sa.String(254), nullable=False),     # normalizado para el lookup
        sa.Column("origen", sa.String(12), nullable=False, server_default="MANUAL"),  # MANUAL | IA | IMPORT
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "alias_normalizado", name="uq_alias_tenant_norm"),
    )
    op.create_index("ix_producto_alias_tenant", "producto_alias", ["tenant_id"])
    op.create_index("ix_producto_alias_producto", "producto_alias", ["producto_id"])

    # índices trigram para búsqueda difusa de nombre/sku
    op.execute("CREATE INDEX ix_productos_nombre_trgm ON productos USING gin (nombre gin_trgm_ops)")

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON producto_alias TO app_user")
    op.execute("ALTER TABLE producto_alias ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY tenant_isolation ON producto_alias USING (tenant_id = public.current_tenant_id())")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON producto_alias")
    op.execute("ALTER TABLE producto_alias DISABLE ROW LEVEL SECURITY")
    op.execute("DROP INDEX IF EXISTS ix_productos_nombre_trgm")
    op.drop_table("producto_alias")
