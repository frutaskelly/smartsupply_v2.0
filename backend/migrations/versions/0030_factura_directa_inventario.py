"""Factura directa impacta inventario

Revision ID: 0030_factura_directa_inventario
Revises: 0029_tenant_logo
Create Date: 2026-07-15

Una factura DIRECTA (sin remisión) ahora descuenta inventario al timbrar y lo
regresa al cancelar. Para eso guarda de qué almacén sale (`facturas.almacen_id`)
y, por línea, la cantidad en unidad base (`cantidad_base`) y el lote afectado
(`lote_id`) para poder revertir con exactitud. Nullable: las facturas desde
remisiones no lo usan (su inventario ya se mueve por la remisión).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030_factura_directa_inventario"
down_revision: Union[str, None] = "0029_tenant_logo"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("facturas", sa.Column("almacen_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_facturas_almacen", "facturas", "almacenes",
        ["almacen_id"], ["id"], ondelete="RESTRICT",
    )
    op.create_index("ix_facturas_almacen_id", "facturas", ["almacen_id"])
    op.add_column("lineas_factura", sa.Column("cantidad_base", sa.Numeric(18, 4), nullable=True))
    op.add_column("lineas_factura", sa.Column("lote_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_lineas_factura_lote", "lineas_factura", "lotes_inventario",
        ["lote_id"], ["id"], ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_lineas_factura_lote", "lineas_factura", type_="foreignkey")
    op.drop_column("lineas_factura", "lote_id")
    op.drop_column("lineas_factura", "cantidad_base")
    op.drop_index("ix_facturas_almacen_id", table_name="facturas")
    op.drop_constraint("fk_facturas_almacen", "facturas", type_="foreignkey")
    op.drop_column("facturas", "almacen_id")
