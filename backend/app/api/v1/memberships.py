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

from ...core.db import get_db
from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import Membership, Role, User
from ...schemas.membership import (
    CambiarPasswordIn,
    CrearUsuarioIn,
    MembershipOut,
    MembershipUpdate,
)
from ...services import supabase_admin
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


@router.post("/usuarios", response_model=MembershipOut, status_code=status.HTTP_201_CREATED)
def crear_usuario(
    payload: CrearUsuarioIn,
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    # rol debe existir (preset o de este tenant)
    role = db.query(Role).filter(Role.id == payload.role_id).one_or_none()
    if role is None or (role.tenant_id is not None and role.tenant_id != ctx.tenant_id):
        raise HTTPException(422, "Rol inválido")
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).one_or_none()
    if user is None:
        if not supabase_admin.configured():
            raise HTTPException(503, "Supabase no está configurado para crear usuarios")
        try:
            auth_id = supabase_admin.create_auth_user(email, payload.password, payload.full_name)
        except supabase_admin.SupabaseAdminError as exc:
            raise HTTPException(502, f"No se pudo crear el usuario en Auth: {exc}")
        user = User(email=email, full_name=payload.full_name, auth_user_id=auth_id)
        db.add(user)
        db.flush()
    else:
        # usuario existente: si tiene cuenta auth, actualiza su contraseña
        if user.auth_user_id:
            try:
                supabase_admin.set_password(user.auth_user_id, payload.password)
            except supabase_admin.SupabaseAdminError:
                pass
    dup = (
        db.query(Membership)
        .filter(Membership.tenant_id == ctx.tenant_id, Membership.user_id == user.id)
        .one_or_none()
    )
    if dup is not None:
        raise HTTPException(409, "Ese usuario ya es miembro de esta empresa")
    m = Membership(tenant_id=ctx.tenant_id, user_id=user.id, role_id=payload.role_id, active=True)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _m_out(m)


@router.post("/{membership_id}/password", response_model=MembershipOut)
def cambiar_password(
    membership_id: UUID,
    payload: CambiarPasswordIn,
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    m = (
        db.query(Membership)
        .filter(Membership.id == membership_id, Membership.tenant_id == ctx.tenant_id)
        .one_or_none()
    )
    if m is None:
        raise HTTPException(404, "Membership no encontrada")
    user = db.query(User).filter(User.id == m.user_id).one()
    if not user.auth_user_id:
        raise HTTPException(422, "El usuario no tiene cuenta de autenticación")
    if not supabase_admin.configured():
        raise HTTPException(503, "Supabase no está configurado")
    try:
        supabase_admin.set_password(user.auth_user_id, payload.password)
    except supabase_admin.SupabaseAdminError as exc:
        raise HTTPException(502, f"No se pudo cambiar la contraseña: {exc}")
    return _m_out(m)
