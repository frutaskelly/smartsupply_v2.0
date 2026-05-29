"""Conversión de producto schemas."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from .common import ORMModel


class ConversionBase(BaseModel):
    producto_catalogado_id: uuid.UUID
    producto_no_catalogado_id: uuid.UUID
    factor: Decimal = Field(default=Decimal("1"), gt=0)
    merma_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    precio_no_cat: Optional[Decimal] = Field(default=None, ge=0)
    mezcla_grupo_id: Optional[uuid.UUID] = None
    mezcla_proporcion: Optional[Decimal] = Field(default=None, ge=0, le=100)
    prioridad: int = Field(default=10, ge=0)
    requiere_aprobacion: bool = False
    activo: bool = True
    notas: Optional[str] = None

    @model_validator(mode="after")
    def _distinct(self) -> "ConversionBase":
        if self.producto_catalogado_id == self.producto_no_catalogado_id:
            raise ValueError("el producto catalogado y el no catalogado deben ser distintos")
        return self


class ConversionCreate(ConversionBase):
    pass


class ConversionUpdate(BaseModel):
    factor: Optional[Decimal] = Field(default=None, gt=0)
    merma_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    precio_no_cat: Optional[Decimal] = Field(default=None, ge=0)
    mezcla_grupo_id: Optional[uuid.UUID] = None
    mezcla_proporcion: Optional[Decimal] = Field(default=None, ge=0, le=100)
    prioridad: Optional[int] = Field(default=None, ge=0)
    requiere_aprobacion: Optional[bool] = None
    activo: Optional[bool] = None
    notas: Optional[str] = None


class ConversionOut(ORMModel, ConversionBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
