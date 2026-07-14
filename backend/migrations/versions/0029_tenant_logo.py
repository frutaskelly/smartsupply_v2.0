"""Logo del emisor (para la representación impresa de la factura)

Revision ID: 0029_tenant_logo
Revises: 0028_remision_facturada
Create Date: 2026-07-14

El cliente sube su logo en Ajustes › Empresa; se guarda en el tenant (bytes +
mime) y se embebe en el PDF propio de la factura, arriba a la derecha.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0029_tenant_logo"
down_revision: Union[str, None] = "0028_remision_facturada"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("logo", sa.LargeBinary(), nullable=True))
    op.add_column("tenants", sa.Column("logo_mime", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("tenants", "logo_mime")
    op.drop_column("tenants", "logo")
