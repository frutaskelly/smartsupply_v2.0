"""Conversiones de producto — substitution mapping (Phase 4d).

Maps a *catalogado* product (what a customer/contract orders) to a
*no catalogado* product (what the warehouse actually stocks), with a conversion
`factor`, an expected `merma_pct`, and optional mixing (`mezcla_grupo_id` /
`mezcla_proporcion`). `prioridad` orders substitution preference. Tenant-scoped.
"""
from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from ..core.db import Base
from .base import TimestampMixin, tenant_fk, uuid_pk


class ConversionProducto(Base, TimestampMixin):
    __tablename__ = "conversiones_producto"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "producto_catalogado_id", "producto_no_catalogado_id",
            name="uq_conversion_tenant_cat_nocat",
        ),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    producto_catalogado_id = Column(
        UUID(as_uuid=True), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    producto_no_catalogado_id = Column(
        UUID(as_uuid=True), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    factor = Column(Numeric(18, 6), nullable=False, server_default="1")
    merma_pct = Column(Numeric(7, 4), nullable=False, server_default="0")
    precio_no_cat = Column(Numeric(18, 4))
    mezcla_grupo_id = Column(UUID(as_uuid=True), index=True)
    mezcla_proporcion = Column(Numeric(7, 4))
    prioridad = Column(Integer, nullable=False, server_default="10")
    requiere_aprobacion = Column(Boolean, nullable=False, server_default="false")
    activo = Column(Boolean, nullable=False, server_default="true")
    notas = Column(Text)
