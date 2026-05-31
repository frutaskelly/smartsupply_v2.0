"""Category schemas."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class CategoriaBase(BaseModel):
    # `codigo` no se acepta como entrada: se autogenera a partir del nombre en
    # el router (única fuente de verdad). Sólo aparece en la salida.
    nombre: str = Field(max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)
    orden: int = 0
    activo: bool = True


class CategoriaCreate(CategoriaBase):
    pass


class CategoriaUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=100)
    descripcion: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=7)
    orden: Optional[int] = None
    activo: Optional[bool] = None


class CategoriaOut(ORMModel, CategoriaBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    codigo: str
    created_at: datetime
    updated_at: datetime
