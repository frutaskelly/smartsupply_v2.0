"""Remisión schemas."""
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .common import ORMModel

RemisionEstado = Literal["BORRADOR", "CONFIRMADA", "CANCELADA"]
Canal = Literal["MANUAL", "WEB", "API"]


class LineaRemisionCreate(BaseModel):
    producto_id: uuid.UUID
    presentacion: str = Field(default="KILO", max_length=20)
    cantidad_solicitada: Decimal = Field(gt=0)
    # Opcional: si se omite, se resuelve automáticamente (cliente/sucursal/volumen).
    precio_unitario: Optional[Decimal] = Field(default=None, ge=0)
    notas: Optional[str] = None


class LineaRemisionOut(ORMModel):
    id: uuid.UUID
    numero_linea: int
    producto_id: uuid.UUID
    presentacion: str
    cantidad_solicitada: Decimal
    cantidad_surtida: Optional[Decimal] = None
    precio_unitario: Decimal
    importe: Decimal
    lote_id: Optional[uuid.UUID] = None
    notas: Optional[str] = None


class RemisionCreate(BaseModel):
    cliente_facturacion_id: uuid.UUID
    almacen_id: Optional[uuid.UUID] = None
    sucursal_id: Optional[uuid.UUID] = None
    lista_precios_id: Optional[uuid.UUID] = None
    # Override manual de serie; si es None se resuelve por sucursal/cliente/default.
    serie_id: Optional[uuid.UUID] = None
    fecha_remision: Optional[date] = None
    fecha_entrega: Optional[date] = None
    canal: Canal = "MANUAL"
    descuento: Decimal = Field(default=Decimal("0"), ge=0)
    notas: Optional[str] = None
    nota_entrega: Optional[str] = None
    lineas: list[LineaRemisionCreate] = Field(min_length=1)


class RemisionUpdate(BaseModel):
    almacen_id: Optional[uuid.UUID] = None
    lista_precios_id: Optional[uuid.UUID] = None
    fecha_entrega: Optional[date] = None
    descuento: Optional[Decimal] = Field(default=None, ge=0)
    notas: Optional[str] = None
    nota_entrega: Optional[str] = None


class RemisionOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    folio_interno: str
    cliente_facturacion_id: uuid.UUID
    almacen_id: Optional[uuid.UUID] = None
    sucursal_id: Optional[uuid.UUID] = None
    lista_precios_id: Optional[uuid.UUID] = None
    fecha_remision: date
    fecha_entrega: Optional[date] = None
    estado: str
    canal: str
    subtotal: Decimal
    descuento: Decimal
    iva: Decimal
    ieps: Decimal
    total: Decimal
    notas: Optional[str] = None
    nota_entrega: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class RemisionDetailOut(RemisionOut):
    lineas: list[LineaRemisionOut] = []


class PesoLinea(BaseModel):
    linea_id: uuid.UUID
    # Peso/medida real en UNIDADES BASE (catch-weight) para esta línea.
    cantidad_base: Decimal = Field(gt=0)


class ConfirmarRemisionIn(BaseModel):
    """Cuerpo opcional al confirmar: pesos reales por línea (peso variable).
    Si no se envía, se reserva el estimado cantidad×factor."""
    pesos: Optional[list[PesoLinea]] = None
