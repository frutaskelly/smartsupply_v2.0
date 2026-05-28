"""Tax-scheme schemas."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class EsquemaImpuestoBase(BaseModel):
    codigo: str = Field(max_length=10)
    nombre: str = Field(max_length=120)
    descripcion: Optional[str] = None
    iva_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    ieps_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    iva_exento: bool = False
    retencion_iva_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    retencion_isr_tasa: Decimal = Field(default=Decimal("0"), ge=0, le=1)
    activo: bool = True


class EsquemaImpuestoCreate(EsquemaImpuestoBase):
    pass


class EsquemaImpuestoUpdate(BaseModel):
    codigo: Optional[str] = Field(default=None, max_length=10)
    nombre: Optional[str] = Field(default=None, max_length=120)
    descripcion: Optional[str] = None
    iva_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    ieps_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    iva_exento: Optional[bool] = None
    retencion_iva_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    retencion_isr_tasa: Optional[Decimal] = Field(default=None, ge=0, le=1)
    activo: Optional[bool] = None


class EsquemaImpuestoOut(ORMModel, EsquemaImpuestoBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
