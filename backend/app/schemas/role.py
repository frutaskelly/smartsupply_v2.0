"""Schemas for roles (preset + custom per-tenant) and their permission sets.

Preset roles are read-only; only custom roles (scoped to the tenant) can be
created or have their permissions changed via the admin API.
"""
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class RoleBase(BaseModel):
    nombre: str = Field(max_length=60)
    vertical: Optional[str] = Field(default=None, max_length=20)
    descripcion: Optional[str] = None


class RoleCreate(RoleBase):
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=60)
    vertical: Optional[str] = Field(default=None, max_length=20)
    descripcion: Optional[str] = None
    permissions: Optional[List[str]] = None


class RolePermissionsIn(BaseModel):
    permissions: List[str] = Field(default_factory=list)


class RoleOut(ORMModel, RoleBase):
    id: uuid.UUID
    tenant_id: Optional[uuid.UUID] = None
    es_preset: bool
    created_at: datetime
    updated_at: datetime


class RoleDetailOut(RoleOut):
    permissions: List[str] = Field(default_factory=list)
