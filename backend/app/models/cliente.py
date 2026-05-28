"""Customers / CRM.

Tenant-scoped. Holds the fiscal identity used to stamp CFDIs (RFC, régimen,
uso CFDI, formas/métodos de pago, domicilio fiscal) plus commercial terms
(price list, credit) and running accumulators.

Deferred to Phase 6 (Fiscal): `serie_fiscal_id` / `serie_remision_id` — they
FK to `series_fiscales`, which does not exist yet. They'll be added by a later
migration once that table lands.
"""
from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk

CLIENTE_TIPO = Enum("PRINCIPAL_GOV", "SUB", "PRIVADO", "OTRO", name="cliente_tipo")


class Cliente(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "clientes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_cliente_tenant_codigo"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    codigo = Column(String(20))
    tipo = Column(CLIENTE_TIPO, nullable=False, server_default="PRIVADO")
    status = Column(String(20), nullable=False, server_default="ACTIVO")

    # ── fiscal identity (CFDI 4.0 receptor) ──
    legal_name = Column(String(254), nullable=False)
    rfc = Column(String(15), nullable=False, index=True)
    regimen_fiscal = Column(String(4))         # RegimenFiscalReceptor
    uso_cfdi_default = Column(String(5))       # UsoCFDI
    forma_pago_default = Column(String(5))     # FormaPago
    metodo_pago_default = Column(String(5))    # MetodoPago (PUE/PPD)
    domicilio_fiscal = Column(JSONB, nullable=False, server_default="{}")

    # ── commercial ──
    lista_precios_id = Column(
        UUID(as_uuid=True),
        ForeignKey("listas_precios.id", ondelete="SET NULL"),
        nullable=True,
    )
    condiciones_pago = Column(String(50))
    limite_credito = Column(Numeric(18, 4), nullable=False, server_default="0")
    dias_credito = Column(Integer, nullable=False, server_default="0")
    descuento_default = Column(Numeric(5, 2), nullable=False, server_default="0")
    config_addenda = Column(JSONB, nullable=False, server_default="{}")

    # ── accumulators ──
    saldo_actual = Column(Numeric(18, 4), nullable=False, server_default="0")
    ventas_ytd = Column(Numeric(18, 4), nullable=False, server_default="0")
    ultima_venta_at = Column(DateTime(timezone=True))
    ultimo_pago_at = Column(DateTime(timezone=True))

    custom_fields = Column(JSONB, nullable=False, server_default="{}")

    lista_precios = relationship("ListaPrecios")
