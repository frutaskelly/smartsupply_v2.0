"""Almacenes — warehouses / stock points (Phase 4 — operaciones).

Tenant-scoped. Inventory lots and movements live against an almacén. A tenant
may flag one `es_default` warehouse (enforced in the router, not the schema).
Soft-deleted because lots reference it.
"""
from sqlalchemy import Boolean, Column, String, Text, UniqueConstraint

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk


class Almacen(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "almacenes"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_almacen_tenant_codigo"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    codigo = Column(String(20), nullable=False)
    nombre = Column(String(254), nullable=False)
    direccion = Column(Text)
    es_default = Column(Boolean, nullable=False, server_default="false")
