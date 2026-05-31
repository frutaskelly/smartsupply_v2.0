"""series de folios (fiscal / no fiscal) + permiso serie:gestionar

Revision ID: 0020_series
Revises: 0019_remision_sucursal
Create Date: 2026-05-31

Folios de control interno consecutivos por serie (sin huecos), separados por
tipo de documento (factura, nota_credito, remision, …) y por naturaleza
(FISCAL = CFDI, NO_FISCAL = remisión/nota de venta). El folio se consume con un
contador bloqueado en la transacción. Las series default por inquilino se
siembran con scripts/seed_catalog.py (no en la migración, que es tenant-agnóstica).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020_series"
down_revision: Union[str, None] = "0019_remision_sucursal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PERMS = [("serie:gestionar", "serie", "gestionar", None, "Administrar series de folios")]
ROLE_GRANTS = {"ADMIN": ["serie:gestionar"], "FACTURISTA": ["serie:gestionar"]}


def upgrade() -> None:
    op.create_table(
        "series",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("codigo", sa.String(25), nullable=False),
        sa.Column("tipo", sa.String(10), nullable=False, server_default="FISCAL"),       # FISCAL | NO_FISCAL
        sa.Column("tipo_documento", sa.String(20), nullable=False),                       # FACTURA | NOTA_CREDITO | REMISION | PAGO
        sa.Column("nombre", sa.String(120)),
        sa.Column("folio_actual", sa.Integer, nullable=False, server_default="0"),
        sa.Column("activa", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("vigencia_desde", sa.Date),
        sa.Column("vigencia_hasta", sa.Date),
        sa.Column("notas", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("tenant_id", "codigo", "tipo_documento", name="uq_serie_tenant_codigo_doc"),
    )
    op.create_index("ix_series_tenant_id", "series", ["tenant_id"])

    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON series TO app_user")
    op.execute("ALTER TABLE series ENABLE ROW LEVEL SECURITY")
    op.execute("CREATE POLICY tenant_isolation ON series USING (tenant_id = public.current_tenant_id())")

    perm_rows = ",\n            ".join(
        f"({_q(pid)}, {_q(rec)}, {_q(acc)}, {_q(vert)}, {_q(desc)})" for pid, rec, acc, vert, desc in PERMS
    )
    op.execute(f"INSERT INTO permissions (id, recurso, accion, vertical, descripcion) VALUES {perm_rows}")
    pairs = [f"('{rol}', '{pid}')" for rol, pids in ROLE_GRANTS.items() for pid in pids]
    op.execute(
        f"""
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, v.permission_id
        FROM (VALUES {",".join(pairs)}) AS v(role_nombre, permission_id)
        JOIN roles r ON r.nombre = v.role_nombre AND r.es_preset = true AND r.tenant_id IS NULL
        """
    )


def downgrade() -> None:
    perm_ids = [p[0] for p in PERMS]
    in_perms = ",".join(f"'{p}'" for p in perm_ids)
    op.execute(f"DELETE FROM role_permissions WHERE permission_id IN ({in_perms})")
    op.execute(f"DELETE FROM permissions WHERE id IN ({in_perms})")
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON series")
    op.execute("ALTER TABLE series DISABLE ROW LEVEL SECURITY")
    op.drop_table("series")


def _q(value) -> str:
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"
