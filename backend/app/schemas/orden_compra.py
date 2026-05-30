"""Órdenes de compra schemas."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .common import ORMModel

OCEstado = Literal[
    "BORRADOR", "ENVIADA", "ACEPTADA", "EN_TRANSITO", "RECIBIDA_PARCIAL", "RECIBIDA", "CANCELADA"
]


class LineaOCCreate(BaseModel):
    producto_id: uuid.UUID
    cantidad_solicitada: Decimal = Field(gt=0)
    presentacion: Optional[str] = Field(default=None, max_length=50)
    precio_unitario: Decimal = Field(ge=0)
    notas: Optional[str] = None


class LineaOCOut(ORMModel):
    id: uuid.UUID
    producto_id: uuid.UUID
    cantidad_solicitada: Decimal
    cantidad_recibida: Decimal
    presentacion: Optional[str] = None
    precio_unitario: Decimal
    importe: Decimal
    notas: Optional[str] = None


class OrdenCompraCreate(BaseModel):
    proveedor_id: uuid.UUID
    almacen_destino_id: Optional[uuid.UUID] = None
    fecha: Optional[date] = None
    fecha_entrega_esperada: Optional[date] = None
    notas: Optional[str] = None
    lineas: list[LineaOCCreate] = Field(min_length=1)


class OrdenCompraUpdate(BaseModel):
    almacen_destino_id: Optional[uuid.UUID] = None
    fecha_entrega_esperada: Optional[date] = None
    notas: Optional[str] = None


class OrdenCompraOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    folio: Optional[str] = None
    proveedor_id: uuid.UUID
    almacen_destino_id: Optional[uuid.UUID] = None
    fecha: date
    fecha_entrega_esperada: Optional[date] = None
    fecha_recibida: Optional[date] = None
    estado: str
    subtotal: Decimal
    iva_total: Decimal
    total_estimado: Decimal
    total_recibido: Decimal
    notas: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class OrdenCompraDetailOut(OrdenCompraOut):
    lineas: list[LineaOCOut] = []


class TransitionIn(BaseModel):
    nuevo_estado: OCEstado


class RecepcionLinea(BaseModel):
    linea_id: uuid.UUID
    cantidad: Decimal = Field(gt=0)  # en unidades de la presentación de la línea
    # Peso/medida real en UNIDADES BASE (catch-weight). Si se envía, manda sobre
    # el estimado cantidad×factor — para sandía/carnes pesadas al recibir.
    cantidad_base: Optional[Decimal] = Field(default=None, gt=0)


class RecibirIn(BaseModel):
    almacen_id: Optional[uuid.UUID] = None
    recepciones: Optional[list[RecepcionLinea]] = None
