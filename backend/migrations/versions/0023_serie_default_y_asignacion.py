"""serie predeterminada + asignación de serie a cliente y sucursal

Revision ID: 0023_serie_default_y_asignacion
Revises: 0022_almacen_domicilio
Create Date: 2026-05-31

Resolución de serie al emitir factura/remisión, de mayor a menor prioridad:
  1) serie elegida manualmente al emitir (override)
  2) serie de la sucursal (si el documento tiene sucursal)
  3) serie del cliente
  4) serie predeterminada del inquilino para ese tipo de documento (es_default)

`series.es_default` marca la default por (tenant, tipo_documento) — un índice
único parcial garantiza una sola default por tipo. Cliente y sucursal pueden
fijar su propia serie de factura (fiscal) y de remisión (no fiscal).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023_serie_default_y_asignacion"
down_revision: Union[str, None] = "0022_almacen_domicilio"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── serie predeterminada por tipo de documento ──
    op.add_column("series", sa.Column("es_default", sa.Boolean(), nullable=False, server_default="false"))
    op.create_index(
        "uq_serie_default",
        "series",
        ["tenant_id", "tipo_documento"],
        unique=True,
        postgresql_where=sa.text("es_default"),
    )

    # ── asignación de serie a cliente / sucursal ──
    for tabla in ("clientes", "sucursales"):
        op.add_column(
            tabla,
            sa.Column(
                "serie_factura_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("series.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.add_column(
            tabla,
            sa.Column(
                "serie_remision_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("series.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )


def downgrade() -> None:
    for tabla in ("clientes", "sucursales"):
        op.drop_column(tabla, "serie_remision_id")
        op.drop_column(tabla, "serie_factura_id")
    op.drop_index("uq_serie_default", table_name="series")
    op.drop_column("series", "es_default")
