"""Tax schemes (esquemas de impuesto) for CFDI 4.0.

A reusable bundle of IVA/IEPS/retención rates a product can point at. The
product also keeps denormalized `iva_tasa`/`ieps_tasa` so the CFDI builder
never has to join — the scheme is the source of truth at edit time.
"""
from sqlalchemy import Boolean, Column, Numeric, String, Text, UniqueConstraint

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk


class EsquemaImpuesto(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "esquemas_impuesto"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_esquema_tenant_codigo"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    codigo = Column(String(10), nullable=False, index=True)
    nombre = Column(String(120), nullable=False)
    descripcion = Column(Text)
    # Rates stored as fractions: 0.16 == 16%.
    iva_tasa = Column(Numeric(5, 4), nullable=False, server_default="0")
    ieps_tasa = Column(Numeric(5, 4), nullable=False, server_default="0")
    iva_exento = Column(Boolean, nullable=False, server_default="false")
    retencion_iva_tasa = Column(Numeric(5, 4), nullable=False, server_default="0")
    retencion_isr_tasa = Column(Numeric(5, 4), nullable=False, server_default="0")
    activo = Column(Boolean, nullable=False, server_default="true")
