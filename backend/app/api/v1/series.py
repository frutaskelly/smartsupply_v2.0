"""Series de folios — CRUD.

Reads gated por `menu:series`; writes por `serie:gestionar`. Una serie con folios
ya emitidos (folio_actual > 0) no se elimina (rompería la consecutividad).
"""
from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import Serie
from ...schemas.serie import SerieCreate, SerieOut, SerieUpdate
from ._helpers import flush_or_conflict, get_or_404

router = APIRouter(prefix="/series", tags=["series"])

_READ = "menu:series"
_WRITE = "serie:gestionar"
_DUP = "Ya existe una serie con ese código para ese tipo de documento"


@router.get("", response_model=List[SerieOut])
def list_series(
    tipo_documento: Optional[str] = Query(default=None, max_length=20),
    tipo: Optional[str] = Query(default=None, max_length=10),
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    query = db.query(Serie)
    if tipo_documento:
        query = query.filter(Serie.tipo_documento == tipo_documento)
    if tipo:
        query = query.filter(Serie.tipo == tipo)
    rows = query.order_by(Serie.tipo_documento, Serie.codigo).all()
    return [SerieOut.model_validate(r) for r in rows]


@router.get("/{serie_id}", response_model=SerieOut)
def get_serie(
    serie_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return get_or_404(db, Serie, serie_id, soft=False)


@router.post("", response_model=SerieOut, status_code=status.HTTP_201_CREATED)
def create_serie(
    payload: SerieCreate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = Serie(**payload.model_dump(), tenant_id=ctx.tenant_id)
    db.add(obj)
    flush_or_conflict(db, detail=_DUP)
    db.refresh(obj)
    return obj


@router.patch("/{serie_id}", response_model=SerieOut)
def update_serie(
    serie_id: UUID,
    payload: SerieUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, Serie, serie_id, soft=False)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(obj, key, value)
    db.flush()
    db.refresh(obj)
    return obj


@router.delete("/{serie_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_serie(
    serie_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    obj = get_or_404(db, Serie, serie_id, soft=False)
    if obj.folio_actual and obj.folio_actual > 0:
        raise HTTPException(status_code=409, detail="La serie ya emitió folios; desactívala en vez de eliminarla")
    db.delete(obj)
    db.flush()
    return None
