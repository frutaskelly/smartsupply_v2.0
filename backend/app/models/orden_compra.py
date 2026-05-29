"""Órdenes de compra — purchase orders + line items (Phase 4c).

Tenant-scoped. Receiving a PO line feeds inventory via an ENTRADA_COMPRA
movement (see app/services/inventario.apply_entrada_compra), which stamps the
resulting lot with this order's id and supplier. Folios are per-tenant `OC-N`.
"""
from sqlalchemy import (
    Column,
    Date,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..core.db import Base
from .base import TimestampMixin, tenant_fk, uuid_pk

OC_ESTADO = Enum(
    "BORRADOR",
    "ENVIADA",
    "ACEPTADA",
    "EN_TRANSITO",
    "RECIBIDA_PARCIAL",
    "RECIBIDA",
    "CANCELADA",
    name="oc_estado",
)


class OrdenCompra(Base, TimestampMixin):
    __tablename__ = "ordenes_compra"
    __table_args__ = (
        UniqueConstraint("tenant_id", "folio", name="uq_oc_tenant_folio"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    folio = Column(String(20))
    proveedor_id = Column(
        UUID(as_uuid=True), ForeignKey("proveedores.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    almacen_destino_id = Column(
        UUID(as_uuid=True), ForeignKey("almacenes.id", ondelete="SET NULL")
    )
    fecha = Column(Date, nullable=False, server_default=text("CURRENT_DATE"))
    fecha_entrega_esperada = Column(Date)
    fecha_recibida = Column(Date)
    estado = Column(OC_ESTADO, nullable=False, server_default="BORRADOR")
    subtotal = Column(Numeric(18, 4), nullable=False, server_default="0")
    iva_total = Column(Numeric(18, 4), nullable=False, server_default="0")
    total_estimado = Column(Numeric(18, 4), nullable=False, server_default="0")
    total_recibido = Column(Numeric(18, 4), nullable=False, server_default="0")
    notas = Column(Text)

    lineas = relationship(
        "LineaOrdenCompra",
        cascade="all, delete-orphan",
        back_populates="orden",
        order_by="LineaOrdenCompra.id",
    )


class LineaOrdenCompra(Base, TimestampMixin):
    __tablename__ = "lineas_orden_compra"

    id = uuid_pk()
    tenant_id = tenant_fk()
    orden_compra_id = Column(
        UUID(as_uuid=True), ForeignKey("ordenes_compra.id", ondelete="CASCADE"), nullable=False, index=True
    )
    producto_id = Column(
        UUID(as_uuid=True), ForeignKey("productos.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    cantidad_solicitada = Column(Numeric(18, 4), nullable=False)
    cantidad_recibida = Column(Numeric(18, 4), nullable=False, server_default="0")
    presentacion = Column(String(50))
    precio_unitario = Column(Numeric(18, 4), nullable=False)
    importe = Column(Numeric(18, 4), nullable=False, server_default="0")
    notas = Column(Text)

    orden = relationship("OrdenCompra", back_populates="lineas")
