"""Add productos.unidad_base — the canonical inventory unit.

Formalizes the units/presentations model: inventory quantities and costs are
always stored in `unidad_base`, while documents (compras, remisiones, POS) carry
a `presentacion` whose factor in `presentaciones` ({presentacion: base_units})
converts to base units at stock time. Existing rows default to KILO — the prior
implicit base — so behavior is unchanged for products without presentations.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0013_producto_unidad_base"
down_revision: Union[str, None] = "0012_remisiones"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "productos",
        sa.Column(
            "unidad_base",
            sa.String(length=20),
            nullable=False,
            server_default="KILO",
        ),
    )


def downgrade() -> None:
    op.drop_column("productos", "unidad_base")
