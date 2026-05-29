"""remisiones + lineas_remision (schema + RLS)

Revision ID: 0012_remisiones
Revises: 0011_conversiones
Create Date: 2026-05-29

Phase 4e — remisiones (lean core). Estado enum is minimal (BORRADOR /
CONFIRMADA / CANCELADA); the POS and fiscal states are added in later phases
via ALTER TYPE. Both tables carry tenant_id for the uniform RLS contract.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_remisiones"
down_revision: Union[str, None] = "0011_conversiones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("remisiones", "lineas_remision")

remision_estado = postgresql.ENUM(
    "BORRADOR", "CONFIRMADA", "CANCELADA", name="remision_estado", create_type=False
)


def _tenant_col():
    return sa.Column(
        "tenant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )


def upgrade() -> None:
    remision_estado.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "remisiones",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("folio_interno", sa.String(20), nullable=False),
        sa.Column("cliente_facturacion_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("almacen_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("almacenes.id", ondelete="SET NULL")),
        sa.Column("lista_precios_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("listas_precios.id", ondelete="SET NULL")),
        sa.Column("fecha_remision", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("fecha_entrega", sa.Date),
        sa.Column("estado", remision_estado, nullable=False, server_default="BORRADOR"),
        sa.Column("canal", sa.String(20), nullable=False, server_default="MANUAL"),
        sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("descuento", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("iva", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("ieps", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notas", sa.Text),
        sa.Column("nota_entrega", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("tenant_id", "folio_interno", name="uq_remision_tenant_folio"),
    )
    op.create_index("ix_remisiones_tenant_id", "remisiones", ["tenant_id"])
    op.create_index("ix_remisiones_cliente", "remisiones", ["cliente_facturacion_id"])
    op.create_index("ix_remisiones_estado", "remisiones", ["estado"])

    op.create_table(
        "lineas_remision",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("remision_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("remisiones.id", ondelete="CASCADE"), nullable=False),
        sa.Column("numero_linea", sa.SmallInteger, nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("presentacion", sa.String(20), nullable=False, server_default="KILO"),
        sa.Column("cantidad_solicitada", sa.Numeric(18, 4), nullable=False),
        sa.Column("cantidad_surtida", sa.Numeric(18, 4)),
        sa.Column("precio_unitario", sa.Numeric(18, 4), nullable=False),
        sa.Column("importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("lote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lotes_inventario.id", ondelete="SET NULL")),
        sa.Column("notas", sa.Text),
        sa.UniqueConstraint("remision_id", "numero_linea", name="uq_linea_remision_numero"),
    )
    op.create_index("ix_lineas_remision_tenant_id", "lineas_remision", ["tenant_id"])
    op.create_index("ix_lineas_remision_remision_id", "lineas_remision", ["remision_id"])
    op.create_index("ix_lineas_remision_producto_id", "lineas_remision", ["producto_id"])

    for table in _TENANT_SCOPED:
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation ON {table}
                USING (tenant_id = public.current_tenant_id())
            """
        )


def downgrade() -> None:
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("lineas_remision")
    op.drop_table("remisiones")
    remision_estado.drop(op.get_bind(), checkfirst=True)
