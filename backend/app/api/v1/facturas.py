"""Facturas (CFDI 4.0) — generar desde remisión(es) + consulta (Fase 6, P6.1).

Reads gated por `menu:facturas`; writes por `factura:gestionar`. Aquí se genera
el DOCUMENTO con el desglose fiscal (IVA/IEPS/retenciones por concepto). El
timbrado real ante el SAT vía Facturama llega en P6.2.

Cruce: una factura agrupa una o varias remisiones CONFIRMADAS del MISMO cliente
que aún no estén facturadas. Cada concepto respeta el modelo de unidades: para
productos de peso variable factura la cantidad realmente surtida (cantidad_surtida)
en la unidad base; el resto factura la presentación con su unidad SAT.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import (
    Cliente,
    EsquemaImpuesto,
    Factura,
    LineaFactura,
    Producto,
    Remision,
    Tenant,
)
from ...schemas.common import Page
from ...schemas.factura import FacturaDesdeRemisionesIn, FacturaDetailOut, FacturaOut
from ...services.fiscal import calcular_linea, totales
from ...services.inventario import presentacion_sat
from ...services.series import siguiente_folio
from ._helpers import get_or_404, paginate

router = APIRouter(prefix="/facturas", tags=["facturas"])

_READ = "menu:facturas"
_WRITE = "factura:gestionar"
ZERO = Decimal("0")


def _next_folio(db: Session, tenant_id, serie: str) -> int:
    """Folio de la serie (contador sin huecos); si la serie no existe, cae a
    max+1 sobre las facturas de esa serie (back-compat)."""
    folio = siguiente_folio(db, tenant_id, codigo=serie, tipo_documento="FACTURA")
    if folio is not None:
        return folio
    mx = 0
    for (f,) in db.query(Factura.folio).filter(Factura.serie == serie).all():
        if f and f > mx:
            mx = f
    return mx + 1


@router.get("", response_model=Page[FacturaOut])
def list_facturas(
    estado: Optional[str] = Query(default=None, max_length=20),
    cliente_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    query = db.query(Factura).filter(Factura.deleted_at.is_(None))
    if estado:
        query = query.filter(Factura.estado == estado)
    if cliente_id is not None:
        query = query.filter(Factura.cliente_id == cliente_id)
    query = query.order_by(Factura.fecha.desc(), Factura.folio.desc())
    return paginate(query, FacturaOut, limit, offset)


@router.get("/{factura_id}", response_model=FacturaDetailOut)
def get_factura(
    factura_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return get_or_404(db, Factura, factura_id)


@router.post("/desde-remisiones", response_model=FacturaDetailOut, status_code=status.HTTP_201_CREATED)
def factura_desde_remisiones(
    payload: FacturaDesdeRemisionesIn,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    ids = list(dict.fromkeys(payload.remision_ids))
    rems = db.query(Remision).filter(Remision.id.in_(ids), Remision.deleted_at.is_(None)).all()
    if len(rems) != len(ids):
        raise HTTPException(status_code=404, detail="Una o más remisiones no existen")

    clientes = {r.cliente_facturacion_id for r in rems}
    if len(clientes) != 1:
        raise HTTPException(status_code=422, detail="Todas las remisiones deben ser del mismo cliente")
    for r in rems:
        if r.estado != "CONFIRMADA":
            raise HTTPException(status_code=422, detail=f"La remisión {r.folio_interno} no está CONFIRMADA")
        if r.factura_id is not None:
            raise HTTPException(status_code=409, detail=f"La remisión {r.folio_interno} ya está facturada")

    cliente = get_or_404(db, Cliente, clientes.pop())
    tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).one()

    prod_ids = {ln.producto_id for r in rems for ln in r.lineas}
    productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_(prod_ids)).all()}
    esq_ids = {p.esquema_impuesto_id for p in productos.values() if p.esquema_impuesto_id}
    esquemas = {e.id: e for e in db.query(EsquemaImpuesto).filter(EsquemaImpuesto.id.in_(esq_ids)).all()}

    factura = Factura(
        tenant_id=ctx.tenant_id, serie=payload.serie, folio=_next_folio(db, ctx.tenant_id, payload.serie),
        cliente_id=cliente.id,
        uso_cfdi=payload.uso_cfdi or cliente.uso_cfdi_default or "G03",
        forma_pago=payload.forma_pago or cliente.forma_pago_default or "99",
        metodo_pago=payload.metodo_pago or cliente.metodo_pago_default or "PUE",
        lugar_expedicion=tenant.domicilio_fiscal_cp,
        notas=payload.notas, created_by=ctx.user_id, estado="BORRADOR",
    )
    db.add(factura); db.flush()

    calc_lineas = []
    numero = 0
    for r in rems:
        for ln in r.lineas:
            numero += 1
            prod = productos.get(ln.producto_id)
            esq = esquemas.get(prod.esquema_impuesto_id) if prod and prod.esquema_impuesto_id else None
            importe = Decimal(ln.importe)

            # Cantidad/unidad/valor a facturar (respeta peso variable / catch-weight).
            if prod and prod.peso_variable and ln.cantidad_surtida and Decimal(ln.cantidad_surtida) > 0:
                cantidad = Decimal(ln.cantidad_surtida)            # unidades base reales
                clave_unidad = prod.unidad_sat
                valor_unitario = (importe / cantidad) if cantidad else Decimal(ln.precio_unitario)
            else:
                cantidad = Decimal(ln.cantidad_solicitada)
                clave_unidad = presentacion_sat(prod, ln.presentacion) or (prod.unidad_sat if prod else "H87")
                valor_unitario = Decimal(ln.precio_unitario)

            iva_tasa = esq.iva_tasa if esq else (prod.iva_tasa if prod else ZERO)
            iva_exento = bool(esq.iva_exento) if esq else False
            tipo_ieps = esq.tipo_ieps if esq else None
            ieps_tasa = esq.ieps_tasa if esq else ZERO
            ieps_cuota = esq.ieps_cuota if esq else ZERO
            ret_iva_tasa = esq.retencion_iva_tasa if esq else ZERO
            ret_isr_tasa = esq.retencion_isr_tasa if esq else ZERO
            litros = (cantidad * Decimal(prod.contenido_litros)) if (prod and prod.contenido_litros) else ZERO

            calc = calcular_linea(
                importe, iva_tasa=iva_tasa, iva_exento=iva_exento,
                tipo_ieps=tipo_ieps, ieps_tasa=ieps_tasa, ieps_cuota=ieps_cuota,
                litros_totales=litros, ret_iva_tasa=ret_iva_tasa, ret_isr_tasa=ret_isr_tasa,
            )
            calc_lineas.append(calc)
            db.add(LineaFactura(
                tenant_id=ctx.tenant_id, factura_id=factura.id, numero_linea=numero,
                producto_id=ln.producto_id,
                clave_prod_serv=(prod.clave_sat if prod else "01010101"),
                clave_unidad=clave_unidad, descripcion=(prod.nombre if prod else "Producto"),
                cantidad=cantidad, valor_unitario=valor_unitario, importe=importe, objeto_imp="02",
                iva_tasa=calc["iva_tasa"], iva_importe=calc["iva_importe"],
                ieps_tipo=calc["ieps_tipo"], ieps_valor=calc["ieps_valor"], ieps_importe=calc["ieps_importe"],
                ret_iva_importe=calc["ret_iva_importe"], ret_isr_importe=calc["ret_isr_importe"],
            ))
        r.factura_id = factura.id

    tot = totales(calc_lineas)
    factura.subtotal = tot["subtotal"]
    factura.descuento = tot["descuento"]
    factura.iva_trasladado = tot["iva_trasladado"]
    factura.ieps_trasladado = tot["ieps_trasladado"]
    factura.ret_iva = tot["ret_iva"]
    factura.ret_isr = tot["ret_isr"]
    factura.total = tot["total"]
    db.flush()
    db.refresh(factura)
    return factura
