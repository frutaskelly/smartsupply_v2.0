"""Remisiones — CRUD + confirmar/cancelar con efecto en inventario (Phase 4e).

Reads gated by `menu:remisiones`; writes by `remision:gestionar`.

Lifecycle: BORRADOR (editable, no stock effect) → CONFIRMADA (reserves stock:
disponible → reservada, one SALIDA_REMISION movement per line) → CANCELADA
(releases any reservation: reservada → disponible, CANCELACION_REMISION). A
draft cancels with no inventory effect. Reservation pulls from the default lot
of (producto, almacén) — lot-selection/FIFO is a later refinement.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import (
    Almacen,
    Cliente,
    LineaRemision,
    ListaPrecios,
    LoteInventario,
    Producto,
    Remision,
    Sucursal,
)
from ...services.precios import resolver_precio
from ...services.series import siguiente_folio
from ...schemas.common import Page
from ...schemas.remision import (
    ConfirmarRemisionIn,
    RemisionCreate,
    RemisionDetailOut,
    RemisionOut,
    RemisionUpdate,
)
from ...services.inventario import build_movimiento, presentacion_factor, resolve_lote
from ._helpers import ensure_fk, flush_or_conflict, get_or_404, paginate

router = APIRouter(prefix="/remisiones", tags=["remisiones"])

_READ = "menu:remisiones"
_WRITE = "remision:gestionar"
_ZERO = Decimal("0")
_DUP = "Folio de remisión duplicado"


def _next_folio(db: Session, tenant_id) -> str:
    """Folio R-N de la serie no fiscal 'R' (contador sin huecos); si no existe la
    serie, cae a max+1 sobre los folios R- existentes (back-compat)."""
    folio = siguiente_folio(db, tenant_id, codigo="R", tipo_documento="REMISION")
    if folio is not None:
        return f"R-{folio}"
    mx = 0
    for (f,) in db.query(Remision.folio_interno).filter(Remision.folio_interno.isnot(None)).all():
        if f and f.startswith("R-"):
            try:
                mx = max(mx, int(f[2:]))
            except ValueError:
                pass
    return f"R-{mx + 1}"


@router.get("", response_model=Page[RemisionOut])
def list_remisiones(
    estado: Optional[str] = Query(default=None, max_length=20),
    cliente_id: Optional[UUID] = Query(default=None),
    fecha_desde: Optional[date] = Query(default=None),
    fecha_hasta: Optional[date] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    query = db.query(Remision).filter(Remision.deleted_at.is_(None))
    if estado:
        query = query.filter(Remision.estado == estado)
    if cliente_id is not None:
        query = query.filter(Remision.cliente_facturacion_id == cliente_id)
    if fecha_desde:
        query = query.filter(Remision.fecha_remision >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Remision.fecha_remision <= fecha_hasta)
    query = query.order_by(Remision.fecha_remision.desc(), Remision.folio_interno.desc())
    return paginate(query, RemisionOut, limit, offset)


@router.post("", response_model=RemisionDetailOut, status_code=status.HTTP_201_CREATED)
def create_remision(
    payload: RemisionCreate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    ensure_fk(db, Cliente, payload.cliente_facturacion_id, "cliente_facturacion_id")
    ensure_fk(db, Almacen, payload.almacen_id, "almacen_id")
    ensure_fk(db, ListaPrecios, payload.lista_precios_id, "lista_precios_id")
    if payload.sucursal_id is not None:
        suc = get_or_404(db, Sucursal, payload.sucursal_id)
        if suc.cliente_id != payload.cliente_facturacion_id:
            raise HTTPException(status_code=422, detail="La sucursal no pertenece al cliente de la remisión")
    for ln in payload.lineas:
        ensure_fk(db, Producto, ln.producto_id, "producto_id")

    rem = Remision(
        tenant_id=ctx.tenant_id,
        folio_interno=_next_folio(db, ctx.tenant_id),
        cliente_facturacion_id=payload.cliente_facturacion_id,
        almacen_id=payload.almacen_id,
        sucursal_id=payload.sucursal_id,
        lista_precios_id=payload.lista_precios_id,
        fecha_remision=payload.fecha_remision or date.today(),
        fecha_entrega=payload.fecha_entrega,
        canal=payload.canal,
        descuento=payload.descuento,
        notas=payload.notas,
        nota_entrega=payload.nota_entrega,
        estado="BORRADOR",
        created_by=ctx.user_id,
        updated_by=ctx.user_id,
    )
    db.add(rem)
    db.flush()

    subtotal = _ZERO
    for i, ln in enumerate(payload.lineas, start=1):
        # Precio: manual si se envía; si no, se resuelve por cliente/sucursal/volumen.
        precio = ln.precio_unitario
        if precio is None:
            res = resolver_precio(
                db, producto_id=ln.producto_id, presentacion=ln.presentacion,
                cantidad=ln.cantidad_solicitada,
                cliente_id=payload.cliente_facturacion_id, sucursal_id=payload.sucursal_id,
            )
            if not res or res.get("precio") is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"No se encontró precio para el producto de la línea {i}; indícalo manualmente",
                )
            precio = res["precio"]
        importe = ln.cantidad_solicitada * precio
        subtotal += importe
        db.add(LineaRemision(
            tenant_id=ctx.tenant_id,
            remision_id=rem.id,
            numero_linea=i,
            producto_id=ln.producto_id,
            presentacion=ln.presentacion,
            cantidad_solicitada=ln.cantidad_solicitada,
            precio_unitario=precio,
            importe=importe,
            notas=ln.notas,
        ))
    rem.subtotal = subtotal
    rem.total = subtotal - payload.descuento  # iva/ieps = 0 (FyV exenta; fiscal en Fase 6)
    flush_or_conflict(db, detail=_DUP)
    db.refresh(rem)
    return rem


@router.get("/{rem_id}", response_model=RemisionDetailOut)
def get_remision(
    rem_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return get_or_404(db, Remision, rem_id)


@router.patch("/{rem_id}", response_model=RemisionDetailOut)
def update_remision(
    rem_id: UUID,
    payload: RemisionUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    rem = get_or_404(db, Remision, rem_id)
    if rem.estado != "BORRADOR":
        raise HTTPException(status_code=409, detail="Solo se puede editar una remisión en BORRADOR")
    data = payload.model_dump(exclude_unset=True)
    if "almacen_id" in data:
        ensure_fk(db, Almacen, data["almacen_id"], "almacen_id")
    if "lista_precios_id" in data:
        ensure_fk(db, ListaPrecios, data["lista_precios_id"], "lista_precios_id")
    for key, value in data.items():
        setattr(rem, key, value)
    if "descuento" in data:
        rem.total = rem.subtotal - rem.descuento + rem.iva + rem.ieps
    rem.updated_by = ctx.user_id
    db.flush()
    db.refresh(rem)
    return rem


@router.post("/{rem_id}/confirmar", response_model=RemisionDetailOut)
def confirmar_remision(
    rem_id: UUID,
    payload: ConfirmarRemisionIn | None = Body(default=None),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    rem = get_or_404(db, Remision, rem_id)
    if rem.estado != "BORRADOR":
        raise HTTPException(status_code=409, detail=f"Solo se confirma desde BORRADOR (actual: {rem.estado})")
    if rem.almacen_id is None:
        raise HTTPException(status_code=422, detail="La remisión requiere un almacén para reservar inventario")

    # Optional per-line real weights (catch-weight); override the estimate.
    pesos = {p.linea_id: p.cantidad_base for p in (payload.pesos or [])} if payload else {}

    # Lines carry a presentation + a quantity in that presentation; reserve the
    # equivalent in base units (the unit inventory is stored in). The reserved
    # base amount is stamped on the line (cantidad_surtida) so cancel releases
    # exactly what was held.
    prod_ids = {ln.producto_id for ln in rem.lineas}
    productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_(prod_ids)).all()}

    for ln in rem.lineas:
        factor = presentacion_factor(productos.get(ln.producto_id), ln.presentacion)
        real = pesos.get(ln.id)
        base_qty = real if real is not None else (ln.cantidad_solicitada * factor)
        lote = resolve_lote(db, ctx.tenant_id, ln.producto_id, rem.almacen_id, numero_lote=None, create=False)
        if lote is None or lote.cantidad_disponible < base_qty:
            raise HTTPException(
                status_code=422,
                detail=f"Existencia insuficiente para la línea {ln.numero_linea}",
            )
        lote.cantidad_disponible = lote.cantidad_disponible - base_qty
        lote.cantidad_reservada = lote.cantidad_reservada + base_qty
        ln.lote_id = lote.id
        ln.cantidad_surtida = base_qty
        db.add(build_movimiento(
            ctx.tenant_id, ctx.user_id, lote, "SALIDA_REMISION", -base_qty,
            ref_tipo="REMISION", ref_id=rem.id, motivo=f"Reserva remisión {rem.folio_interno}",
        ))

    rem.estado = "CONFIRMADA"
    rem.updated_by = ctx.user_id
    db.flush()
    db.refresh(rem)
    return rem


@router.post("/{rem_id}/cancelar", response_model=RemisionDetailOut)
def cancelar_remision(
    rem_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    rem = get_or_404(db, Remision, rem_id)
    if rem.estado == "CANCELADA":
        raise HTTPException(status_code=409, detail="La remisión ya está cancelada")

    if rem.estado == "CONFIRMADA":
        prod_ids = {ln.producto_id for ln in rem.lineas if ln.lote_id is not None}
        productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_(prod_ids)).all()}
        for ln in rem.lineas:
            if ln.lote_id is None:
                continue
            lote = (
                db.query(LoteInventario)
                .filter(LoteInventario.id == ln.lote_id)
                .with_for_update()
                .one_or_none()
            )
            if lote is None:
                continue
            # release exactly what was reserved at confirm (stored base units);
            # fall back to the estimate for legacy rows without cantidad_surtida.
            if ln.cantidad_surtida is not None:
                cantidad = ln.cantidad_surtida
            else:
                factor = presentacion_factor(productos.get(ln.producto_id), ln.presentacion)
                cantidad = ln.cantidad_solicitada * factor
            lote.cantidad_reservada = max(_ZERO, lote.cantidad_reservada - cantidad)
            lote.cantidad_disponible = lote.cantidad_disponible + cantidad
            db.add(build_movimiento(
                ctx.tenant_id, ctx.user_id, lote, "CANCELACION_REMISION", cantidad,
                ref_tipo="REMISION", ref_id=rem.id, motivo=f"Cancelación remisión {rem.folio_interno}",
            ))

    rem.estado = "CANCELADA"
    rem.updated_by = ctx.user_id
    db.flush()
    db.refresh(rem)
    return rem


@router.delete("/{rem_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_remision(
    rem_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    rem = get_or_404(db, Remision, rem_id)
    if rem.estado == "CONFIRMADA":
        raise HTTPException(status_code=409, detail="Cancela la remisión antes de eliminarla (libera inventario)")
    rem.deleted_at = func.now()
    db.flush()
    return None
