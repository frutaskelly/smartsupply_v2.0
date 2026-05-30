"""Factura (CFDI 4.0) schemas."""
import uuid
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, Field

from .common import ORMModel


class FacturaDesdeRemisionesIn(BaseModel):
    remision_ids: List[uuid.UUID] = Field(min_length=1)
    serie: str = Field(default="F", max_length=10)
    uso_cfdi: Optional[str] = Field(default=None, max_length=5)
    forma_pago: Optional[str] = Field(default=None, max_length=5)
    metodo_pago: Optional[str] = Field(default=None, max_length=5)
    notas: Optional[str] = None


class LineaFacturaOut(ORMModel):
    numero_linea: int
    producto_id: uuid.UUID
    clave_prod_serv: str
    clave_unidad: str
    descripcion: str
    cantidad: Decimal
    valor_unitario: Decimal
    importe: Decimal
    descuento: Decimal
    objeto_imp: str
    iva_tasa: Decimal
    iva_importe: Decimal
    ieps_tipo: Optional[str] = None
    ieps_valor: Decimal
    ieps_importe: Decimal
    ret_iva_importe: Decimal
    ret_isr_importe: Decimal


class FacturaOut(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    serie: str
    folio: int
    cliente_id: uuid.UUID
    uso_cfdi: str
    forma_pago: str
    metodo_pago: str
    moneda: str
    tipo_comprobante: str
    lugar_expedicion: Optional[str] = None
    fecha: datetime
    subtotal: Decimal
    descuento: Decimal
    iva_trasladado: Decimal
    ieps_trasladado: Decimal
    ret_iva: Decimal
    ret_isr: Decimal
    total: Decimal
    estado: str
    uuid: Optional[str] = None
    fecha_timbrado: Optional[datetime] = None
    pdf_url: Optional[str] = None
    notas: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FacturaDetailOut(FacturaOut):
    lineas: List[LineaFacturaOut] = []
