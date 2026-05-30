"""Drop productos.costo_promedio — el costo no pertenece al catálogo.

El costo varía mucho (temporada, sequía, política) y su verdad vive en el
inventario: `lotes_inventario.costo_unitario` (promedio ponderado por lote) y la
vista de existencias lo agrega por almacén. Tener un costo editable en la ficha
del producto invitaba a que se desincronizara de las compras reales. Se elimina
del catálogo; el costo se consulta en Inventario / Existencias.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_drop_producto_costo"
down_revision: Union[str, None] = "0015_fiscal_fields"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.drop_column("productos", "costo_promedio")


def downgrade() -> None:
    op.add_column(
        "productos",
        sa.Column("costo_promedio", sa.Numeric(18, 4), nullable=False, server_default="0"),
    )
