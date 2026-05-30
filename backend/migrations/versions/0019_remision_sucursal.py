"""remisiones.sucursal_id — destino (ship-to) para precio por sucursal

Revision ID: 0019_remision_sucursal
Revises: 0018_precios_v2
Create Date: 2026-05-30

Para que el auto-precio resuelva el override por sucursal (p.ej. Aguacate $15 en
SLP), la remisión debe registrar a qué sucursal del cliente se entrega.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_remision_sucursal"
down_revision: Union[str, None] = "0018_precios_v2"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "remisiones",
        sa.Column("sucursal_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("sucursales.id", ondelete="SET NULL")),
    )


def downgrade() -> None:
    op.drop_column("remisiones", "sucursal_id")
