"""Schemas de series de folios."""
import uuid
from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .common import ORMModel

TipoSerie = Literal["FISCAL", "NO_FISCAL"]
TipoDoc = Literal["FACTURA", "NOTA_CREDITO", "REMISION", "PAGO"]


class SerieBase(BaseModel):
    codigo: str = Field(max_length=25)
    tipo: TipoSerie = "FISCAL"
    tipo_documento: TipoDoc
    nombre: Optional[str] = Field(default=None, max_length=120)
    activa: bool = True
    vigencia_desde: Optional[date] = None
    vigencia_hasta: Optional[date] = None
    notas: Optional[str] = None


class SerieCreate(SerieBase):
    folio_actual: int = Field(default=0, ge=0)  # folio inicial; el primero emitido será +1


class SerieUpdate(BaseModel):
    nombre: Optional[str] = Field(default=None, max_length=120)
    activa: Optional[bool] = None
    vigencia_desde: Optional[date] = None
    vigencia_hasta: Optional[date] = None
    notas: Optional[str] = None
    folio_actual: Optional[int] = Field(default=None, ge=0)


class SerieOut(ORMModel, SerieBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    folio_actual: int
    created_at: datetime
    updated_at: datetime
