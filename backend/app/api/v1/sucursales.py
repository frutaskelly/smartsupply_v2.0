"""Sucursales (ship-to) de un cliente — precios v2.

Reads gated por `menu:clientes`; writes por `cliente:gestionar` (las sucursales
son parte del alta comercial del cliente).
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import Cliente, ListaPrecios, Sucursal
from ...schemas.common import Page
from ...schemas.sucursal import SucursalCreate, SucursalOut, SucursalUpdate
from ._helpers import ensure_fk, get_or_404, paginate

router = APIRouter(prefix="/sucursales", tags=["sucursales"])

_READ = "menu:clientes"
_WRITE = "cliente:gestionar"


@router.get("", response_model=Page[SucursalOut])
def list_sucursales(
    cliente_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    query = db.query(Sucursal).filter(Sucursal.deleted_at.is_(None))
    if cliente_id is not None:
        query = query.filter(Sucursal.cliente_id == cliente_id)
    query = query.order_by(Sucursal.nombre.asc())
    return paginate(query, SucursalOut, limit, offset)


@router.get("/{sucursal_id}", response_model=SucursalOut)
def get_sucursal(
    sucursal_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return get_or_404(db, Sucursal, sucursal_id)


@router.post("", response_model=SucursalOut, status_code=status.HTTP_201_CREATED)
def create_sucursal(
    payload: SucursalCreate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    ensure_fk(db, Cliente, payload.cliente_id, "cliente_id")
    ensure_fk(db, ListaPrecios, payload.lista_precios_id, "lista_precios_id")
    obj = Sucursal(**payload.model_dump(), tenant_id=ctx.tenant_id)
    db.add(obj)
    db.flush()
    db.refresh(obj)
    return obj


@router.patch("/{sucursal_id}", response_model=SucursalOut)
def update_sucursal(
    sucursal_id: UUID,
    payload: SucursalUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, Sucursal, sucursal_id)
    data = payload.model_dump(exclude_unset=True)
    if "lista_precios_id" in data:
        ensure_fk(db, ListaPrecios, data["lista_precios_id"], "lista_precios_id")
    for key, value in data.items():
        setattr(obj, key, value)
    db.flush()
    db.refresh(obj)
    return obj


@router.delete("/{sucursal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sucursal(
    sucursal_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, Sucursal, sucursal_id)
    obj.deleted_at = func.now()
    db.flush()
    return None
