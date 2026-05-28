"""Permission — global catalog of granular permissions.

Each id reads "recurso:accion" (e.g. "pedido:cobrar", "menu:dashboard").
The catalog is fixed system data, seeded by migration 0003. Permissions are
global (no tenant_id): they describe *what* an action is; *who* may do it is
decided by which role a tenant assigns.
"""
from sqlalchemy import Column, String, Text

from ..core.db import Base


class Permission(Base):
    __tablename__ = "permissions"

    # e.g. "producto:read", "pedido:cobrar", "menu:dashboard"
    id = Column(String(80), primary_key=True)
    recurso = Column(String(40), nullable=False, index=True)
    accion = Column(String(40), nullable=False)
    # vertical: NULL = cross-cutting, "pos", "cadena_gov"
    vertical = Column(String(20), nullable=True, index=True)
    descripcion = Column(Text, nullable=True)
