"""Proveedores — supplier master data (Phase 4 — operaciones).

Tenant-scoped. Suppliers feed órdenes de compra and are stamped onto the
inventory lots they originate (`lotes_inventario.proveedor_id`). Soft-deleted
because they're referenced by purchase orders and lots.
"""
from sqlalchemy import Boolean, Column, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk


class Proveedor(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "proveedores"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_proveedor_tenant_codigo"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    codigo = Column(String(20), nullable=False)
    nombre = Column(String(254), nullable=False)
    rfc = Column(String(15))
    contacto = Column(String(254))
    telefono = Column(String(20))
    email = Column(String(254))
    categorias = Column(ARRAY(Text), nullable=False, server_default=text("'{}'::text[]"))
    condiciones_pago = Column(String(50))
    activo = Column(Boolean, nullable=False, server_default="true")
    notas = Column(Text)
