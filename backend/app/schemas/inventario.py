"""Inventory schemas — manual movement input, kardex/lote/existencias output."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

from .common import ORMModel

# Movement types accepted through the *manual* endpoint. The remisión/POS flows
# emit SALIDA_REMISION / CONFIRMACION_FACTURA / CANCELACION_REMISION /
# ENTRADA_DEVOLUCION themselves — not via this payload.
MovimientoTipo = Literal["ENTRADA_COMPRA", "AJUSTE", "MERMA", "TRANSFERENCIA"]
MermaMotivo = Literal["CADUCIDAD", "CALIDAD", "DEVOLUCION_CLIENTE", "ROBO", "DESCOMPOSICION", "OTRO"]


class MovimientoCreate(BaseModel):
    tipo: MovimientoTipo
    producto_id: uuid.UUID
    almacen_id: uuid.UUID
    cantidad: Decimal
    costo_unitario: Optional[Decimal] = Field(default=None, ge=0)
    numero_lote: Optional[str] = Field(default=None, max_length=50)
    fecha_caducidad: Optional[date] = None
    lote_id: Optional[uuid.UUID] = None
    almacen_destino_id: Optional[uuid.UUID] = None
    merma_motivo: Optional[MermaMotivo] = None
    motivo: Optional[str] = Field(default=None, max_length=254)
    notas: Optional[str] = None

    @model_validator(mode="after")
    def _check(self) -> "MovimientoCreate":
        if self.cantidad == 0:
            raise ValueError("cantidad no puede ser cero")
        if self.tipo != "AJUSTE" and self.cantidad <= 0:
            raise ValueError("cantidad debe ser positiva para este tipo de movimiento")
        if self.tipo == "ENTRADA_COMPRA" and self.costo_unitario is None:
            raise ValueError("costo_unitario es requerido para ENTRADA_COMPRA")
        if self.tipo == "MERMA" and self.merma_motivo is None:
            raise ValueError("merma_motivo es requerido para MERMA")
        if self.tipo == "TRANSFERENCIA" and self.almacen_destino_id is None:
            raise ValueError("almacen_destino_id es requerido para TRANSFERENCIA")
        return self


class MovimientoOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    tipo: str
    fecha: datetime
    lote_id: uuid.UUID
    cantidad: Decimal
    costo_unitario: Optional[Decimal] = None
    ref_tipo: Optional[str] = None
    ref_id: Optional[uuid.UUID] = None
    motivo: Optional[str] = None
    notas: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime


class LoteOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    producto_id: uuid.UUID
    almacen_id: uuid.UUID
    numero_lote: Optional[str] = None
    fecha_ingreso: date
    fecha_caducidad: Optional[date] = None
    cantidad_inicial: Decimal
    cantidad_disponible: Decimal
    cantidad_reservada: Decimal
    costo_unitario: Decimal
    proveedor_id: Optional[uuid.UUID] = None
    notas: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ExistenciaRow(BaseModel):
    producto_id: uuid.UUID
    almacen_id: uuid.UUID
    disponible: Decimal
    reservada: Decimal
    costo_promedio: Decimal
    valor: Decimal
