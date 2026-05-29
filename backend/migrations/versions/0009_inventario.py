"""inventario: lotes, kardex (movimientos), mermas (schema + RLS)

Revision ID: 0009_inventario
Revises: 0008_operaciones_masters
Create Date: 2026-05-29

Phase 4b — inventory. `lotes_inventario` is the per-(producto, almacén, lote)
stock cache with dual-state quantities; `movimientos_inventario` is the
append-only kardex; `mermas` details each MERMA movement. All three carry
`tenant_id` for the uniform RLS policy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_inventario"
down_revision: Union[str, None] = "0008_operaciones_masters"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_SCOPED = ("lotes_inventario", "movimientos_inventario", "mermas")

movimiento_tipo = postgresql.ENUM(
    "ENTRADA", "SALIDA", "AJUSTE", "MERMA", "TRANSFERENCIA", "ENTRADA_COMPRA",
    "SALIDA_REMISION", "CONFIRMACION_FACTURA", "CANCELACION_REMISION", "ENTRADA_DEVOLUCION",
    name="movimiento_tipo", create_type=False,
)
merma_motivo = postgresql.ENUM(
    "CADUCIDAD", "CALIDAD", "DEVOLUCION_CLIENTE", "ROBO", "DESCOMPOSICION", "OTRO",
    name="merma_motivo", create_type=False,
)


def _tenant_col():
    return sa.Column(
        "tenant_id", postgresql.UUID(as_uuid=True),
        sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False,
    )


def upgrade() -> None:
    bind = op.get_bind()
    movimiento_tipo.create(bind, checkfirst=True)
    merma_motivo.create(bind, checkfirst=True)

    # ─── lotes_inventario ────────────────────────────────────────────────────
    op.create_table(
        "lotes_inventario",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("producto_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("almacen_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("almacenes.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("numero_lote", sa.String(50)),
        sa.Column("fecha_ingreso", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("fecha_caducidad", sa.Date),
        sa.Column("cantidad_inicial", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("cantidad_disponible", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("cantidad_reservada", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("costo_unitario", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("proveedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("proveedores.id", ondelete="SET NULL")),
        sa.Column("notas", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_lotes_inventario_tenant_id", "lotes_inventario", ["tenant_id"])
    op.create_index("ix_lotes_inventario_producto_id", "lotes_inventario", ["producto_id"])
    op.create_index("ix_lotes_inventario_almacen_id", "lotes_inventario", ["almacen_id"])
    op.create_index("ix_lotes_inventario_fecha_caducidad", "lotes_inventario", ["fecha_caducidad"])
    op.create_index("ix_lotes_lookup", "lotes_inventario", ["producto_id", "almacen_id", "numero_lote"])

    # ─── movimientos_inventario (immutable kardex) ───────────────────────────
    op.create_table(
        "movimientos_inventario",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("tipo", movimiento_tipo, nullable=False),
        sa.Column("fecha", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("lote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lotes_inventario.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cantidad", sa.Numeric(18, 4), nullable=False),
        sa.Column("costo_unitario", sa.Numeric(18, 4)),
        sa.Column("ref_tipo", sa.String(20)),
        sa.Column("ref_id", postgresql.UUID(as_uuid=True)),
        sa.Column("motivo", sa.String(254)),
        sa.Column("notas", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_movimientos_inventario_tenant_id", "movimientos_inventario", ["tenant_id"])
    op.create_index("ix_movimientos_inventario_lote_id", "movimientos_inventario", ["lote_id"])
    op.create_index("ix_movimientos_inventario_ref_id", "movimientos_inventario", ["ref_id"])

    # ─── mermas ──────────────────────────────────────────────────────────────
    op.create_table(
        "mermas",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        _tenant_col(),
        sa.Column("fecha", sa.Date, nullable=False, server_default=sa.text("CURRENT_DATE")),
        sa.Column("lote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("lotes_inventario.id", ondelete="CASCADE"), nullable=False),
        sa.Column("cantidad", sa.Numeric(18, 4), nullable=False),
        sa.Column("motivo", merma_motivo, nullable=False),
        sa.Column("descripcion", sa.Text),
        sa.Column("evidencia_url", sa.Text),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_mermas_tenant_id", "mermas", ["tenant_id"])
    op.create_index("ix_mermas_lote_id", "mermas", ["lote_id"])

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
    for table in _TENANT_SCOPED:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table("mermas")
    op.drop_table("movimientos_inventario")
    op.drop_table("lotes_inventario")
    merma_motivo.drop(op.get_bind(), checkfirst=True)
    movimiento_tipo.drop(op.get_bind(), checkfirst=True)
