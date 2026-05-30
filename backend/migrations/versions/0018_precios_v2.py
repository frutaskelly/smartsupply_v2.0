"""sucursales + precio_overrides (precios v2)

Revision ID: 0018_precios_v2
Revises: 0017_facturas
Create Date: 2026-05-30

Precios multi-capa: un cliente (sold-to) puede tener varias sucursales (ship-to),
cada una con su propia lista de precios opcional; y overrides de precio por
(cliente|sucursal, producto, presentación). El resolutor (services/precios.py)
aplica la prioridad más-específico-gana. No se agregan permisos: las sucursales
se gestionan con `cliente:gestionar` y los overrides con `lista_precios:gestionar`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018_precios_v2"
down_revision: Union[str, None] = "0017_facturas"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("sucursales", "precio_overrides")


def _tenant_col():
    return sa.Column(
        "tenant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "sucursales",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("cliente_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("codigo", sa.String(20)),
        sa.Column("nombre", sa.String(254), nullable=False),
        sa.Column("lista_precios_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("listas_precios.id", ondelete="SET NULL")),
        sa.Column("domicilio", postgresql.JSONB, nullable=False, server_default="{}"),
        sa.Column("contacto", sa.String(254)),
        sa.Column("telefono", sa.String(20)),
        sa.Column("activo", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sucursales_tenant_id", "sucursales", ["tenant_id"])
    op.create_index("ix_sucursales_cliente_id", "sucursales", ["cliente_id"])

    op.create_table(
        "precio_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("cliente_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clientes.id", ondelete="CASCADE")),
        sa.Column("sucursal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("sucursales.id", ondelete="CASCADE")),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("presentacion", sa.String(20), nullable=False, server_default="KILO"),
        sa.Column("precio_unitario", sa.Numeric(18, 4), nullable=False),
        sa.Column("vigencia_desde", sa.Date),
        sa.Column("vigencia_hasta", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        # exactamente uno de cliente_id / sucursal_id
        sa.CheckConstraint(
            "(cliente_id IS NOT NULL) <> (sucursal_id IS NOT NULL)",
            name="ck_override_cliente_xor_sucursal",
        ),
    )
    op.create_index("ix_precio_overrides_tenant_id", "precio_overrides", ["tenant_id"])
    op.create_index("ix_precio_overrides_producto", "precio_overrides", ["producto_id"])
    op.create_index("ix_precio_overrides_cliente", "precio_overrides", ["cliente_id"])
    op.create_index("ix_precio_overrides_sucursal", "precio_overrides", ["sucursal_id"])

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
    op.drop_table("precio_overrides")
    op.drop_table("sucursales")
