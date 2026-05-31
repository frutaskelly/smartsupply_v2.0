"""factura: campos de cancelación CFDI

Revision ID: 0025_factura_cancelacion
Revises: 0024_producto_alias
Create Date: 2026-05-31
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0025_factura_cancelacion"
down_revision: Union[str, None] = "0024_producto_alias"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("facturas", sa.Column("fecha_cancelacion", sa.DateTime(timezone=True)))
    op.add_column("facturas", sa.Column("motivo_cancelacion", sa.String(2)))
    op.add_column("facturas", sa.Column("uuid_sustitucion", sa.String(36)))


def downgrade() -> None:
    op.drop_column("facturas", "uuid_sustitucion")
    op.drop_column("facturas", "motivo_cancelacion")
    op.drop_column("facturas", "fecha_cancelacion")
