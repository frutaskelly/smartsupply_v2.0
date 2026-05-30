"""Memberships — list members of the tenant and manage their role/status.

Reads gated by `menu:ajustes.usuarios`; writes by `membership:gestionar`.

RLS scopes every query to the current tenant. You can reassign a member to any
preset role or one of your own custom roles, activate/deactivate them, or remove
them. You cannot touch your own membership (prevents self-lockout). Inviting
brand-new users is an operator/provisioning flow, not exposed here.
"""
from __future__ import annotations

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import Membership, Role
from ...schemas.membership import MembershipOut, MembershipUpdate
from ._helpers import ensure_fk, get_or_404

router = APIRouter(prefix="/memberships", tags=["membresías"])

_READ = "menu:ajustes.usuarios"
_WRITE = "membership:gestionar"


def _m_out(m: Membership) -> MembershipOut:
    out = MembershipOut.model_validate(m)
    out.user_email = m.user.email if m.user else None
    out.user_full_name = m.user.full_name if m.user else None
    out.role_nombre = m.role.nombre if m.role else None
    return out


@router.get("", response_model=List[MembershipOut])
def list_memberships(
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    rows = db.query(Membership).order_by(Membership.created_at).all()
    return [_m_out(m) for m in rows]


@router.get("/{membership_id}", response_model=MembershipOut)
def get_membership(
    membership_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    return _m_out(get_or_404(db, Membership, membership_id))


@router.patch("/{membership_id}", response_model=MembershipOut)
def update_membership(
    membership_id: UUID,
    payload: MembershipUpdate,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    m = get_or_404(db, Membership, membership_id)
    if m.user_id == ctx.user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No puedes modificar tu propia membresía",
        )
    data = payload.model_dump(exclude_unset=True)
    if "role_id" in data:
        # RLS: role must be a preset or one of this tenant's custom roles.
        ensure_fk(db, Role, data["role_id"], "role_id")
    for key, value in data.items():
        setattr(m, key, value)
    db.flush()
    db.refresh(m)
    return _m_out(m)


@router.delete("/{membership_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_membership(
    membership_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    m = get_or_404(db, Membership, membership_id)
    if m.user_id == ctx.user_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No puedes eliminar tu propia membresía",
        )
    db.delete(m)
    db.flush()
    return None
