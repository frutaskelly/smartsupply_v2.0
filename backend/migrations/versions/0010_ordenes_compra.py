"""órdenes de compra + lineas, y lotes.orden_compra_id (schema + RLS)

Revision ID: 0010_ordenes_compra
Revises: 0009_inventario
Create Date: 2026-05-29

Phase 4c — purchase orders. Adds the deferred `lotes_inventario.orden_compra_id`
FK now that `ordenes_compra` exists, so received goods can be traced back to
their PO. Same uniform RLS contract.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_ordenes_compra"
down_revision: Union[str, None] = "0009_inventario"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("ordenes_compra", "lineas_orden_compra")

oc_estado = postgresql.ENUM(
    "BORRADOR", "ENVIADA", "ACEPTADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA", "CANCELADA",
    name="oc_estado", create_type=False,
)


def _tenant_col():
    return sa.Column(
        "tenant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )


def _audit_cols():
    return (
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )


def upgrade() -> None:
    oc_estado.create(op.get_bind(), checkfirst=True)

    # ─── ordenes_compra ──────────────────────────────────────────────────────
    op.create_table(
        "ordenes_compra",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("folio", sa.String(20)),
        sa.Column("proveedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("proveedores.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("almacen_destino_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("almacenes.id", ondelete="SET NULL")),
        sa.Column("fecha", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("fecha_entrega_esperada", sa.Date),
        sa.Column("fecha_recibida", sa.Date),
        sa.Column("estado", oc_estado, nullable=False, server_default="BORRADOR"),
        sa.Column("subtotal", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("iva_total", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total_estimado", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total_recibido", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notas", sa.Text),
        *_audit_cols(),
        sa.UniqueConstraint("tenant_id", "folio", name="uq_oc_tenant_folio"),
    )
    op.create_index("ix_ordenes_compra_tenant_id", "ordenes_compra", ["tenant_id"])
    op.create_index("ix_ordenes_compra_proveedor_id", "ordenes_compra", ["proveedor_id"])
    op.create_index("ix_ordenes_compra_estado", "ordenes_compra", ["estado"])

    # ─── lineas_orden_compra ─────────────────────────────────────────────────
    op.create_table(
        "lineas_orden_compra",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("orden_compra_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ordenes_compra.id", ondelete="CASCADE"), nullable=False),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("cantidad_solicitada", sa.Numeric(18, 4), nullable=False),
        sa.Column("cantidad_recibida", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("presentacion", sa.String(50)),
        sa.Column("precio_unitario", sa.Numeric(18, 4), nullable=False),
        sa.Column("importe", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("notas", sa.Text),
        *_audit_cols(),
    )
    op.create_index("ix_lineas_orden_compra_tenant_id", "lineas_orden_compra", ["tenant_id"])
    op.create_index("ix_lineas_orden_compra_orden_compra_id", "lineas_orden_compra", ["orden_compra_id"])
    op.create_index("ix_lineas_orden_compra_producto_id", "lineas_orden_compra", ["producto_id"])

    # ─── deferred FK on lotes_inventario (PO traceability) ───────────────────
    op.add_column("lotes_inventario", sa.Column("orden_compra_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_lotes_orden_compra", "lotes_inventario", "ordenes_compra",
        ["orden_compra_id"], ["id"], ondelete="SET NULL",
    )
    op.create_index("ix_lotes_inventario_orden_compra_id", "lotes_inventario", ["orden_compra_id"])

    # ─── grants + RLS ────────────────────────────────────────────────────────
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
    op.drop_index("ix_lotes_inventario_orden_compra_id", table_name="lotes_inventario")
    op.drop_constraint("fk_lotes_orden_compra", "lotes_inventario", type_="foreignkey")
    op.drop_column("lotes_inventario", "orden_compra_id")
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("lineas_orden_compra")
    op.drop_table("ordenes_compra")
    oc_estado.drop(op.get_bind(), checkfirst=True)
