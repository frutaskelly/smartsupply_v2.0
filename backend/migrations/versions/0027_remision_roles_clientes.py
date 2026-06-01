"""FACTURISTA/CONTADOR/SURTIDOR_GOV: otorgar menu:clientes

Revision ID: 0027_remision_roles_clientes
Revises: 0026_facturista_productos
Create Date: 2026-06-01

La pantalla de Remisiones necesita listar clientes (GET /clientes, gated por
`menu:clientes`) para el selector de cliente al capturar. Estos tres roles
podían entrar a Remisiones (`menu:remisiones`) pero no tenían `menu:clientes`,
así que el selector les salía vacío. Se los concedemos (ADMIN y CAPTURISTA_GOV
ya lo tienen).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0027_remision_roles_clientes"
down_revision: Union[str, None] = "0026_facturista_productos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ROLES = ("FACTURISTA", "CONTADOR", "SURTIDOR_GOV")


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, 'menu:clientes'
        FROM roles r
        WHERE r.nombre IN ('FACTURISTA', 'CONTADOR', 'SURTIDOR_GOV')
          AND r.es_preset = true AND r.tenant_id IS NULL
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id = 'menu:clientes'
          AND role_id IN (
            SELECT id FROM roles
            WHERE nombre IN ('FACTURISTA', 'CONTADOR', 'SURTIDOR_GOV')
              AND es_preset = true AND tenant_id IS NULL
          )
        """
    )
