"""Role — preset (system) roles and custom per-tenant roles.

- Preset (`es_preset=true`, `tenant_id=NULL`): OWNER, ADMIN, CAJERO,
  BODEGUERO, TOMADOR, REPARTIDOR, CAPTURISTA_GOV, SURTIDOR_GOV, FACTURISTA,
  CONTADOR. Shared by every tenant. Seeded by migration 0003.
- Custom (`es_preset=false`, `tenant_id=<uuid>`): created by a tenant's
  Owner/Admin in /ajustes/roles.

There is no SUPER_ADMIN / platform-admin role in v2: platform operators are an
email allowlist (PLATFORM_OPERATORS) used only for provisioning — never an
in-tenant impersonation role.
"""
from sqlalchemy import Boolean, Column, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from ..core.db import Base
from .base import TimestampMixin, uuid_pk


class Role(Base, TimestampMixin):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("tenant_id", "nombre", name="uq_role_tenant_nombre"),)

    id = uuid_pk()
    # NULL for preset system roles; set for tenant-custom roles.
    tenant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    nombre = Column(String(60), nullable=False)
    # vertical: NULL = cross-cutting, "pos", "cadena_gov"
    vertical = Column(String(20), nullable=True, index=True)
    es_preset = Column(Boolean, nullable=False, server_default="false")
    descripcion = Column(Text, nullable=True)
