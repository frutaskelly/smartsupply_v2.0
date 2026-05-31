"""Proveedor (supplier) schemas."""
import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class ProveedorBase(BaseModel):
    # Se autogenera en el router (PROV-01, …) si no viene dado.
    codigo: Optional[str] = Field(default=None, max_length=20)
    nombre: str = Field(max_length=254)
    rfc: Optional[str] = Field(default=None, max_length=15)
    contacto: Optional[str] = Field(default=None, max_length=254)
    telefono: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=254)
    categorias: list[str] = Field(default_factory=list)
    condiciones_pago: Optional[str] = Field(default=None, max_length=50)
    activo: bool = True
    notas: Optional[str] = None


class ProveedorCreate(ProveedorBase):
    pass


class ProveedorUpdate(BaseModel):
    codigo: Optional[str] = Field(default=None, max_length=20)
    nombre: Optional[str] = Field(default=None, max_length=254)
    rfc: Optional[str] = Field(default=None, max_length=15)
    contacto: Optional[str] = Field(default=None, max_length=254)
    telefono: Optional[str] = Field(default=None, max_length=20)
    email: Optional[str] = Field(default=None, max_length=254)
    categorias: Optional[list[str]] = None
    condiciones_pago: Optional[str] = Field(default=None, max_length=50)
    activo: Optional[bool] = None
    notas: Optional[str] = None


class ProveedorOut(ORMModel, ProveedorBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
