"""Resolutor de precios (precios v2).

Devuelve el precio unitario para (cliente, sucursal, producto, presentación,
cantidad, fecha) aplicando prioridad MÁS-ESPECÍFICO-GANA (estándar wholesale,
no "precio más bajo"):

  1. Override de la sucursal + producto
  2. Override del cliente + producto
  3. Lista de precios de la sucursal (tier por cantidad)
  4. Lista de precios del cliente (tier por cantidad)
  5. Lista base/default del tenant (código UNICO, o la primera activa)

Dentro de una lista se toma el tier cuyo `cantidad_minima` ≤ cantidad más alto
(así "compra más → mejor precio"). Todo filtrado por vigencia.
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Cliente, ListaPrecios, Precio, PrecioOverride, Sucursal


def _vigente(query, model, fecha):
    return query.filter(
        or_(model.vigencia_desde.is_(None), model.vigencia_desde <= fecha),
        or_(model.vigencia_hasta.is_(None), model.vigencia_hasta >= fecha),
    )


def _override(db, *, producto_id, presentacion, fecha, cliente_id=None, sucursal_id=None):
    q = db.query(PrecioOverride.precio_unitario).filter(
        PrecioOverride.producto_id == producto_id,
        PrecioOverride.presentacion == presentacion,
    )
    q = q.filter(PrecioOverride.sucursal_id == sucursal_id) if sucursal_id else q.filter(PrecioOverride.cliente_id == cliente_id)
    q = _vigente(q, PrecioOverride, fecha).order_by(PrecioOverride.created_at.desc())
    row = q.first()
    return row[0] if row else None


def _precio_lista(db, lista_id, producto_id, presentacion, cantidad, fecha):
    q = db.query(Precio.precio_unitario).filter(
        Precio.lista_id == lista_id,
        Precio.producto_id == producto_id,
        Precio.presentacion == presentacion,
        Precio.cantidad_minima <= cantidad,
    )
    q = _vigente(q, Precio, fecha).order_by(Precio.cantidad_minima.desc())
    row = q.first()
    return row[0] if row else None


def _lista_default(db):
    base = (
        db.query(ListaPrecios)
        .filter(ListaPrecios.codigo == "UNICO", ListaPrecios.deleted_at.is_(None))
        .one_or_none()
    )
    if base is None:
        base = (
            db.query(ListaPrecios)
            .filter(ListaPrecios.status == "ACTIVO", ListaPrecios.deleted_at.is_(None))
            .order_by(ListaPrecios.created_at.asc())
            .first()
        )
    return base


def resolver_precio(
    db: Session,
    *,
    producto_id: UUID,
    presentacion: str = "KILO",
    cantidad: Decimal = Decimal("1"),
    cliente_id: Optional[UUID] = None,
    sucursal_id: Optional[UUID] = None,
    fecha: Optional[date] = None,
) -> Optional[dict]:
    """Precio resuelto + origen, o None si no hay ninguna regla aplicable."""
    fecha = fecha or date.today()
    cantidad = Decimal(cantidad)

    suc = None
    if sucursal_id:
        suc = db.query(Sucursal).filter(Sucursal.id == sucursal_id, Sucursal.deleted_at.is_(None)).one_or_none()
        if suc and cliente_id is None:
            cliente_id = suc.cliente_id
    cliente = db.query(Cliente).filter(Cliente.id == cliente_id).one_or_none() if cliente_id else None

    # 1. override sucursal
    if sucursal_id:
        p = _override(db, sucursal_id=sucursal_id, producto_id=producto_id, presentacion=presentacion, fecha=fecha)
        if p is not None:
            return {"precio": p, "origen": "override_sucursal"}
    # 2. override cliente
    if cliente_id:
        p = _override(db, cliente_id=cliente_id, producto_id=producto_id, presentacion=presentacion, fecha=fecha)
        if p is not None:
            return {"precio": p, "origen": "override_cliente"}
    # 3. lista de la sucursal
    if suc and suc.lista_precios_id:
        p = _precio_lista(db, suc.lista_precios_id, producto_id, presentacion, cantidad, fecha)
        if p is not None:
            return {"precio": p, "origen": "lista_sucursal", "lista_id": str(suc.lista_precios_id)}
    # 4. lista del cliente
    if cliente and cliente.lista_precios_id:
        p = _precio_lista(db, cliente.lista_precios_id, producto_id, presentacion, cantidad, fecha)
        if p is not None:
            return {"precio": p, "origen": "lista_cliente", "lista_id": str(cliente.lista_precios_id)}
    # 5. lista base/default
    base = _lista_default(db)
    if base is not None:
        p = _precio_lista(db, base.id, producto_id, presentacion, cantidad, fecha)
        if p is not None:
            return {"precio": p, "origen": "lista_base", "lista_id": str(base.id)}
    return None
