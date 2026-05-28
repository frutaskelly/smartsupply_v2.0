"""Product categories (líneas de catálogo).

Tenant-scoped master data. Products point at a category via a real FK
(`productos.categoria_id`) — v1's implicit `linea`-string join is gone.
"""
from sqlalchemy import Boolean, Column, Integer, String, Text, UniqueConstraint

from ..core.db import Base
from .base import SoftDeleteMixin, TimestampMixin, tenant_fk, uuid_pk


class CategoriaProducto(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "categorias_producto"
    __table_args__ = (
        UniqueConstraint("tenant_id", "codigo", name="uq_categoria_tenant_codigo"),
    )

    id = uuid_pk()
    tenant_id = tenant_fk()
    codigo = Column(String(10), nullable=False, index=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text)
    color = Column(String(7))  # hex, e.g. "#FF6B6B"
    orden = Column(Integer, nullable=False, server_default="0")
    activo = Column(Boolean, nullable=False, server_default="true")
