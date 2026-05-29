"""Inventory — lots, the append-only kardex, and mermas (Phase 4b).

Design (faithful to v1):
  * `LoteInventario` is a denormalized *cache* of current stock for a
    (producto, almacén, numero_lote). It carries a dual-state quantity:
    `cantidad_disponible` (free to sell) and `cantidad_reservada` (committed to
    an issued-but-uninvoiced remisión).
  * `MovimientoInventario` is an **immutable** kardex/ledger — every quantity
    change is one append-only row. No TimestampMixin: rows are never updated.
  * `Merma` is the detail record paired with a MERMA movement.

All three carry their own `tenant_id`, so the RLS policy is uniform.
"""
from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from ..core.db import Base
from .base import TimestampMixin, tenant_fk, uuid_pk

MOVIMIENTO_TIPO = Enum(
    "ENTRADA",
    "SALIDA",
    "AJUSTE",
    "MERMA",
    "TRANSFERENCIA",
    "ENTRADA_COMPRA",
    "SALIDA_REMISION",
    "CONFIRMACION_FACTURA",
    "CANCELACION_REMISION",
    "ENTRADA_DEVOLUCION",
    name="movimiento_tipo",
)

MERMA_MOTIVO = Enum(
    "CADUCIDAD",
    "CALIDAD",
    "DEVOLUCION_CLIENTE",
    "ROBO",
    "DESCOMPOSICION",
    "OTRO",
    name="merma_motivo",
)


class LoteInventario(Base, TimestampMixin):
    __tablename__ = "lotes_inventario"

    id = uuid_pk()
    tenant_id = tenant_fk()
    producto_id = Column(
        UUID(as_uuid=True), ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    almacen_id = Column(
        UUID(as_uuid=True), ForeignKey("almacenes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    numero_lote = Column(String(50))
    fecha_ingreso = Column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    fecha_caducidad = Column(Date, index=True)
    cantidad_inicial = Column(Numeric(18, 4), nullable=False, server_default="0")
    cantidad_disponible = Column(Numeric(18, 4), nullable=False, server_default="0")
    cantidad_reservada = Column(Numeric(18, 4), nullable=False, server_default="0")
    costo_unitario = Column(Numeric(18, 4), nullable=False, server_default="0")
    proveedor_id = Column(
        UUID(as_uuid=True), ForeignKey("proveedores.id", ondelete="SET NULL")
    )
    notas = Column(Text)


class MovimientoInventario(Base):
    """Immutable ledger. Never updated; the lote is the mutable cache."""

    __tablename__ = "movimientos_inventario"

    id = uuid_pk()
    tenant_id = tenant_fk()
    tipo = Column(MOVIMIENTO_TIPO, nullable=False)
    fecha = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    lote_id = Column(
        UUID(as_uuid=True), ForeignKey("lotes_inventario.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cantidad = Column(Numeric(18, 4), nullable=False)  # signed (+ inbound, − outbound)
    costo_unitario = Column(Numeric(18, 4))
    ref_tipo = Column(String(20))
    ref_id = Column(UUID(as_uuid=True), index=True)
    motivo = Column(String(254))
    notas = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class Merma(Base):
    __tablename__ = "mermas"

    id = uuid_pk()
    tenant_id = tenant_fk()
    fecha = Column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    lote_id = Column(
        UUID(as_uuid=True), ForeignKey("lotes_inventario.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cantidad = Column(Numeric(18, 4), nullable=False)
    motivo = Column(MERMA_MOTIVO, nullable=False)
    descripcion = Column(Text)
    evidencia_url = Column(Text)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
