"""Drop categorias_producto.color y .orden — campos sin uso.

`color` se guardaba pero no se mostraba en ninguna parte de la app (no hay chips
de color en productos ni en el POS). `orden` permitía un orden manual que nadie
usaba (todas las filas en 0); las categorías se ordenan ahora por nombre. Se
eliminan ambos del catálogo para simplificar la pantalla.
"""
from typing import Union

import sqlalchemy as sa
from alembic import op

revision: str = "0021_drop_categoria_color_orden"
down_revision: Union[str, None] = "0020_series"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.drop_column("categorias_producto", "orden")
    op.drop_column("categorias_producto", "color")


def downgrade() -> None:
    op.add_column(
        "categorias_producto",
        sa.Column("color", sa.String(7), nullable=True),
    )
    op.add_column(
        "categorias_producto",
        sa.Column("orden", sa.Integer(), nullable=False, server_default="0"),
    )
