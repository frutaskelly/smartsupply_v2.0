"""Remisiones — delivery notes (Phase 4e, lean core).

A remisión is a non-fiscal dispatch document: BORRADOR → CONFIRMADA → CANCELADA.
Confirming reserves stock (disponible → reservada via a SALIDA_REMISION
movement); cancelling a confirmed one releases it. Folios are a per-tenant
`R-N` sequence for now — real fiscal series arrive in Phase 6.

Deliberately excluded here (arrive later): the POS operational overlay
(asignaciones caja/almacén/salida, surtido tracking, cobro) → Phase 5; the
fiscal coupling (factura_id, invoicing states, CFDI) → Phase 6; and v1's
AI/multichannel ingestion + government-contract links (cut from v2).
"""
from sqlalchemy import (
    Column,
    Date,
    Enum,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk

REMISION_ESTADO = Enum("BORRADOR", "CONFIRMADA", "CANCELADA", name="remision_estado")


class Remision(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "remisiones"
    __table_args__ = (
        UniqueConstraint("tenant_id", "folio_interno", name="uq_remision_tenant_folio"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    folio_interno = Column(String(20), nullable=False)
    cliente_facturacion_id = Column(
        UUID(as_uuid=True), ForeignKey("clientes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    almacen_id = Column(UUID(as_uuid=True), ForeignKey("almacenes.id", ondelete="SET NULL"))
    sucursal_id = Column(UUID(as_uuid=True), ForeignKey("sucursales.id", ondelete="SET NULL"))
    lista_precios_id = Column(UUID(as_uuid=True), ForeignKey("listas_precios.id", ondelete="SET NULL"))
    fecha_remision = Column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    fecha_entrega = Column(Date)
    estado = Column(REMISION_ESTADO, nullable=False, server_default="BORRADOR")
    canal = Column(String(20), nullable=False, server_default="MANUAL")
    subtotal = Column(Numeric(18, 4), nullable=False, server_default="0")
    descuento = Column(Numeric(18, 4), nullable=False, server_default="0")
    iva = Column(Numeric(18, 4), nullable=False, server_default="0")
    ieps = Column(Numeric(18, 4), nullable=False, server_default="0")
    total = Column(Numeric(18, 4), nullable=False, server_default="0")
    notas = Column(Text)
    nota_entrega = Column(Text)
    # Fase 6: una factura cruza una o varias remisiones (NULL = sin facturar).
    factura_id = Column(UUID(as_uuid=True), ForeignKey("facturas.id", ondelete="SET NULL"))
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    updated_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))

    lineas = relationship(
        "LineaRemision",
        cascade="all, delete-orphan",
        back_populates="remision",
        order_by="LineaRemision.numero_linea",
    )


class LineaRemision(Base):
    __tablename__ = "lineas_remision"
    __table_args__ = (
        UniqueConstraint("remision_id", "numero_linea", name="uq_linea_remision_numero"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    remision_id = Column(
        UUID(as_uuid=True), ForeignKey("remisiones.id", ondelete="CASCADE"), nullable=False, index=True
    )
    numero_linea = Column(SmallInteger, nullable=False)
    producto_id = Column(
        UUID(as_uuid=True), ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    presentacion = Column(String(20), nullable=False, server_default="KILO")
    cantidad_solicitada = Column(Numeric(18, 4), nullable=False)
    cantidad_surtida = Column(Numeric(18, 4))
    precio_unitario = Column(Numeric(18, 4), nullable=False)
    importe = Column(Numeric(18, 4), nullable=False, server_default="0")
    lote_id = Column(UUID(as_uuid=True), ForeignKey("lotes_inventario.id", ondelete="SET NULL"))
    notas = Column(Text)

    remision = relationship("Remision", back_populates="lineas")
