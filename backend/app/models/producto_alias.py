"""Alias aprendidos de producto — el cruce de productos.

Cada fila mapea un texto que escribió/pegó el usuario ("zanahorias", "Chile
Cuaresmeño") al producto real del catálogo. Se crea cuando el usuario confirma
una sugerencia; a partir de ahí el resolutor lo encuentra al instante y no
vuelve a preguntar. Único por (tenant, alias_normalizado).
"""
from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID

from ..core.db import Base
from .base import tenant_fk, uuid_pk


class ProductoAlias(Base):
    __tablename__ = "producto_alias"
    __table_args__ = (
        UniqueConstraint("tenant_id", "alias_normalizado", name="uq_alias_tenant_norm"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    producto_id = Column(UUID(as_uuid=True), ForeignKey("productos.id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String(254), nullable=False)
    alias_normalizado = Column(String(254), nullable=False)
    origen = Column(String(12), nullable=False, server_default="MANUAL")  # MANUAL | IA | IMPORT
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=text("now()"), nullable=False)
