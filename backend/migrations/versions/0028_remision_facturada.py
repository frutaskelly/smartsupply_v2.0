"""Agrega el estado FACTURADA al ENUM remision_estado

Revision ID: 0028_remision_facturada
Revises: 0027_remision_roles_clientes
Create Date: 2026-07-13

Al facturar una remisión (desde BORRADOR o CONFIRMADA) ahora pasa a FACTURADA,
para distinguir visualmente y en las reglas de negocio las remisiones ya
facturadas de las que siguen disponibles para facturar. Postgres no permite
eliminar valores de un ENUM, así que el downgrade es no-op.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0028_remision_facturada"
down_revision: Union[str, None] = "0027_remision_roles_clientes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de la transacción de la
    # migración cuando el valor se usará después; se emite en un bloque autocommit.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE remision_estado ADD VALUE IF NOT EXISTS 'FACTURADA'")


def downgrade() -> None:
    # Postgres no soporta quitar un valor de un ENUM; nada que revertir.
    pass
