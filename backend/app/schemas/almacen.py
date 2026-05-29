"""Almacén (warehouse) schemas."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class AlmacenBase(BaseModel):
    codigo: str = Field(max_length=20)
    nombre: str = Field(max_length=254)
    direccion: Optional[str] = None
    es_default: bool = False


class AlmacenCreate(AlmacenBase):
    pass


class AlmacenUpdate(BaseModel):
    codigo: Optional[str] = Field(default=None, max_length=20)
    nombre: Optional[str] = Field(default=None, max_length=254)
    direccion: Optional[str] = None
    es_default: Optional[bool] = None


class AlmacenOut(ORMModel, AlmacenBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
