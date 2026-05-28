"""Listas de precios y sus precios — CRUD.

A price list is a named, tenant-scoped collection; each `Precio` is one price
for a (producto, presentación, cantidad_minima) tier inside a list. Both reads
are gated by `menu:listas_precios`; both writes by `lista_precios:gestionar`.

Price lists are soft-deleted (they may be referenced by clients); individual
prices are hard-deleted (they're cheap line items, recreated freely).
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import ListaPrecios, Precio, Producto
from ...schemas.lista_precios import (
    ListaPreciosCreate,
    ListaPreciosOut,
    ListaPreciosUpdate,
    PrecioCreate,
    PrecioOut,
    PrecioUpdate,
)
from ...schemas.common import Page
from ._helpers import ensure_fk, flush_or_conflict, get_or_404, paginate

router = APIRouter(prefix="/listas-precios", tags=["listas de precios"])

_READ = "menu:listas_precios"
_WRITE = "lista_precios:gestionar"
_DUP_LISTA = "Ya existe una lista de precios con ese código"
_DUP_PRECIO = "Ya existe un precio para ese producto/presentación/cantidad en la lista"


# ─── price lists ─────────────────────────────────────────────────────────────
@router.get("", response_model=Page[ListaPreciosOut])
def list_listas(
    q: Optional[str] = Query(default=None, max_length=254),
    status_: Optional[str] = Query(default=None, alias="status", max_length=20),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    query = db.query(ListaPrecios).filter(ListaPrecios.deleted_at.is_(None))
    if q:
        like = f"%{q}%"
        query = query.filter(
            ListaPrecios.nombre.ilike(like) | ListaPrecios.codigo.ilike(like)
        )
    if status_:
        query = query.filter(ListaPrecios.status == status_)
    query = query.order_by(ListaPrecios.codigo.asc())
    return paginate(query, ListaPreciosOut, limit, offset)


@router.post("", response_model=ListaPreciosOut, status_code=status.HTTP_201_CREATED)
def create_lista(
    payload: ListaPreciosCreate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = ListaPrecios(**payload.model_dump(), tenant_id=ctx.tenant_id)
    db.add(obj)
    flush_or_conflict(db, detail=_DUP_LISTA)
    db.refresh(obj)
    return obj


@router.get("/{lista_id}", response_model=ListaPreciosOut)
def get_lista(
    lista_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return get_or_404(db, ListaPrecios, lista_id)


@router.patch("/{lista_id}", response_model=ListaPreciosOut)
def update_lista(
    lista_id: UUID,
    payload: ListaPreciosUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, ListaPrecios, lista_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    flush_or_conflict(db, detail=_DUP_LISTA)
    db.refresh(obj)
    return obj


@router.delete("/{lista_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lista(
    lista_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, ListaPrecios, lista_id)
    obj.deleted_at = func.now()
    db.flush()
    return None


# ─── prices (nested under a list) ────────────────────────────────────────────
@router.get("/{lista_id}/precios", response_model=Page[PrecioOut])
def list_precios(
    lista_id: UUID,
    producto_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    get_or_404(db, ListaPrecios, lista_id)  # 404 if the list isn't ours
    query = db.query(Precio).filter(Precio.lista_id == lista_id)
    if producto_id is not None:
        query = query.filter(Precio.producto_id == producto_id)
    query = query.order_by(Precio.producto_id.asc(), Precio.cantidad_minima.asc())
    return paginate(query, PrecioOut, limit, offset)


@router.post(
    "/{lista_id}/precios",
    response_model=PrecioOut,
    status_code=status.HTTP_201_CREATED,
)
def create_precio(
    lista_id: UUID,
    payload: PrecioCreate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    get_or_404(db, ListaPrecios, lista_id)
    ensure_fk(db, Producto, payload.producto_id, "producto_id")
    obj = Precio(
        **payload.model_dump(),
        tenant_id=ctx.tenant_id,
        lista_id=lista_id,
    )
    db.add(obj)
    flush_or_conflict(db, detail=_DUP_PRECIO)
    db.refresh(obj)
    return obj


@router.patch("/{lista_id}/precios/{precio_id}", response_model=PrecioOut)
def update_precio(
    lista_id: UUID,
    precio_id: UUID,
    payload: PrecioUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = (
        db.query(Precio)
        .filter(Precio.id == precio_id, Precio.lista_id == lista_id)
        .one_or_none()
    )
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precio no encontrado")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    flush_or_conflict(db, detail=_DUP_PRECIO)
    db.refresh(obj)
    return obj


@router.delete(
    "/{lista_id}/precios/{precio_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_precio(
    lista_id: UUID,
    precio_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = (
        db.query(Precio)
        .filter(Precio.id == precio_id, Precio.lista_id == lista_id)
        .one_or_none()
    )
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Precio no encontrado")
    db.delete(obj)
    db.flush()
    return None
