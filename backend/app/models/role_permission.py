"""RolePermission — N:N between Role and Permission."""
from sqlalchemy import Column, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from ..core.db import Base


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(
        UUID(as_uuid=True),
        ForeignKey("roles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id = Column(
        String(80),
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    )
