"""Catch-weight + fiscal fields on productos and esquemas_impuesto.

- productos.peso_variable: marks catch-weight goods (sandía, carnes, queso al
  peso) where the presentation factor is only an estimate and the real weight is
  captured at receiving/delivery.
- productos.codigo_barras: EAN-13/GTIN of the consumer unit (separate from SKU).
- productos.contenido_litros: liters per piece — base for IEPS *cuota* (refrescos).
- esquemas_impuesto.tipo_ieps: 'TASA' (percentage, e.g. botanas 8%) vs 'CUOTA'
  (fixed $/liter, e.g. bebidas saborizadas). Default TASA (back-compat).
- esquemas_impuesto.ieps_cuota: the $/liter quota when tipo_ieps = 'CUOTA'.

All columns are additive with safe defaults — existing rows are unaffected.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015_fiscal_fields"
down_revision: Union[str, None] = "0014_seed_iam_admin_perms"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column(
        "productos",
        sa.Column("peso_variable", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column("productos", sa.Column("codigo_barras", sa.String(length=20), nullable=True))
    op.add_column("productos", sa.Column("contenido_litros", sa.Numeric(10, 4), nullable=True))

    op.add_column(
        "esquemas_impuesto",
        sa.Column("tipo_ieps", sa.String(length=10), nullable=False, server_default="TASA"),
    )
    op.add_column(
        "esquemas_impuesto",
        sa.Column("ieps_cuota", sa.Numeric(10, 4), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("esquemas_impuesto", "ieps_cuota")
    op.drop_column("esquemas_impuesto", "tipo_ieps")
    op.drop_column("productos", "contenido_litros")
    op.drop_column("productos", "codigo_barras")
    op.drop_column("productos", "peso_variable")
