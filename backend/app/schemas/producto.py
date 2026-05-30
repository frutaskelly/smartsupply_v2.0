"""Product schemas."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class ProductoBase(BaseModel):
    sku: str = Field(max_length=50)
    nombre: str = Field(max_length=254)
    descripcion: Optional[str] = None
    categoria_id: Optional[uuid.UUID] = None
    esquema_impuesto_id: Optional[uuid.UUID] = None
    # SAT / CFDI 4.0
    clave_sat: str = Field(max_length=8)
    unidad_sat: str = Field(max_length=3)
    objeto_imp: str = Field(default="02", max_length=2)
    iva_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    ieps_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    # units / presentations
    unidad_base: str = Field(default="KILO", max_length=20)
    presentaciones: dict = Field(default_factory=lambda: {"KILO": 1})
    presentacion_default: Optional[str] = Field(default="KILO", max_length=20)
    unidad_entrada: Optional[str] = Field(default=None, max_length=20)
    unidad_salida: Optional[str] = Field(default=None, max_length=20)
    # inventory attributes
    perecedero: bool = False
    cold_chain: bool = False
    requiere_lote: bool = False
    requiere_caducidad: bool = False
    vida_util_dias: Optional[int] = Field(default=None, ge=0)
    costo_promedio: Decimal = Field(default=Decimal("0"), ge=0)
    sinonimos: list[str] = Field(default_factory=list)
    activo: bool = True
    custom_fields: dict = Field(default_factory=dict)


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    sku: Optional[str] = Field(default=None, max_length=50)
    nombre: Optional[str] = Field(default=None, max_length=254)
    descripcion: Optional[str] = None
    categoria_id: Optional[uuid.UUID] = None
    esquema_impuesto_id: Optional[uuid.UUID] = None
    clave_sat: Optional[str] = Field(default=None, max_length=8)
    unidad_sat: Optional[str] = Field(default=None, max_length=3)
    objeto_imp: Optional[str] = Field(default=None, max_length=2)
    iva_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    ieps_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    unidad_base: Optional[str] = Field(default=None, max_length=20)
    presentaciones: Optional[dict] = None
    presentacion_default: Optional[str] = Field(default=None, max_length=20)
    unidad_entrada: Optional[str] = Field(default=None, max_length=20)
    unidad_salida: Optional[str] = Field(default=None, max_length=20)
    perecedero: Optional[bool] = None
    cold_chain: Optional[bool] = None
    requiere_lote: Optional[bool] = None
    requiere_caducidad: Optional[bool] = None
    vida_util_dias: Optional[int] = Field(default=None, ge=0)
    costo_promedio: Optional[Decimal] = Field(default=None, ge=0)
    sinonimos: Optional[list[str]] = None
    activo: Optional[bool] = None
    custom_fields: Optional[dict] = None


class ProductoOut(ORMModel, ProductoBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
