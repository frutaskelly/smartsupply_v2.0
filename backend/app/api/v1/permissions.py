"""Permission catalog — read-only listing of the global permission set.

Gated by `menu:ajustes.roles`: whoever can manage roles needs to see the
catalog to build them. The `permissions` table is not tenant-scoped (it's fixed
system data), so this returns the full catalog.
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import Permission
from ...schemas.permission import PermissionOut

router = APIRouter(prefix="/permissions", tags=["permisos"])

_READ = "menu:ajustes.roles"


@router.get("", response_model=List[PermissionOut])
def list_permissions(
    db=Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    rows = (
        db.query(Permission)
        .order_by(Permission.recurso, Permission.accion)
        .all()
    )
    return [PermissionOut.model_validate(r) for r in rows]
