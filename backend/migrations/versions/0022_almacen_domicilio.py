"""almacenes: domicilio estructurado (reemplaza direccion libre)

Revision ID: 0022_almacen_domicilio
Revises: 0021_drop_categoria_color_orden
Create Date: 2026-05-31

Reemplaza el campo libre `direccion` por campos estructurados. El `cp` (código
postal) es columna propia porque es el Lugar de Expedición del CFDI cuando se
factura desde ese almacén.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0022_almacen_domicilio"
down_revision: Union[str, None] = "0021_drop_categoria_color_orden"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("almacenes", sa.Column("calle", sa.String(254), nullable=True))
    op.add_column("almacenes", sa.Column("colonia", sa.String(120), nullable=True))
    op.add_column("almacenes", sa.Column("cp", sa.String(5), nullable=True))
    op.add_column("almacenes", sa.Column("ciudad", sa.String(120), nullable=True))
    op.add_column("almacenes", sa.Column("estado", sa.String(120), nullable=True))
    op.drop_column("almacenes", "direccion")


def downgrade() -> None:
    op.add_column("almacenes", sa.Column("direccion", sa.Text(), nullable=True))
    op.drop_column("almacenes", "estado")
    op.drop_column("almacenes", "ciudad")
    op.drop_column("almacenes", "cp")
    op.drop_column("almacenes", "colonia")
    op.drop_column("almacenes", "calle")
