"""FACTURISTA: otorgar menu:productos (para el cruce de productos al facturar)

Revision ID: 0026_facturista_productos
Revises: 0025_factura_cancelacion
Create Date: 2026-06-01

Los endpoints /productos/match y /productos/alias (cruce de productos) están
gated por `menu:productos`. FACTURISTA no lo tenía, así que no podía usar el
buscador inteligente al capturar facturas. Se lo concedemos (TOMADOR y
CAPTURISTA_GOV ya lo tienen).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0026_facturista_productos"
down_revision: Union[str, None] = "0025_factura_cancelacion"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, 'menu:productos'
        FROM roles r
        WHERE r.nombre = 'FACTURISTA' AND r.es_preset = true AND r.tenant_id IS NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id = 'menu:productos'
          AND role_id IN (
            SELECT id FROM roles WHERE nombre = 'FACTURISTA' AND es_preset = true AND tenant_id IS NULL
          )
        """
    )
