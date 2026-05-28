"""Column helpers + mixins shared across models.

Every tenant-scoped table carries a non-null `tenant_id` (see `tenant_fk`).
That column is what the RLS policies key on:
`USING (tenant_id = public.current_tenant_id())`.
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func


def uuid_pk():
    return Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def tenant_fk(*, index: bool = True, nullable: bool = False):
    """FK to tenants.id. Default non-null — the RLS isolation key."""
    return Column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=nullable,
        index=index,
    )


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    deleted_at = Column(DateTime(timezone=True), nullable=True)
