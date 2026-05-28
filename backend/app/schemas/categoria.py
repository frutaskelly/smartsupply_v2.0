"""Category schemas."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class CategoriaBase(BaseModel):
    codigo: str = Field(max_length=10)
    nombre: str = Field(max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)
    orden: int = 0
    activo: bool = True


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaUpdate(BaseModel):
    codigo: Optional[str] = Field(default=None, max_length=10)
    nombre: Optional[str] = Field(default=None, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)
    orden: Optional[int] = None
    activo: Optional[bool] = None


class CategoriaOut(ORMModel, CategoriaBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
