"""Empresa / emisor — datos fiscales del tenant + sellos digitales (CSD).

Edita la información fiscal del tenant que factura (razón social, RFC, régimen,
CP, domicilio) y sube su CSD (.cer + .key) a Facturama para poder timbrar CFDIs
con su propio RFC.

Usa la sesión plana `get_db` (operación de administración sobre la fila del
propio tenant; evita líos con RLS al actualizar `tenants`), scopeada por
`ctx.tenant_id`. Gated con `membership:gestionar` — la misma perm admin de
Ajustes que usa correo.py (no existe una permission específica de tenant).
"""
from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ...core.config import settings
from ...core.db import get_db
from ...core.rbac import AuthContext, require_permission
from ...models import Tenant
from ...schemas.empresa import EmpresaOnboardingOut, EmpresaOut, EmpresaUpdate
from ...services.facturama import FacturamaClient, FacturamaError
from ...services.onboarding import compute_status

router = APIRouter(prefix="/empresa", tags=["empresa"])

_WRITE = "membership:gestionar"


def _load_tenant(db: Session, tenant_id) -> Tenant:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).one_or_none()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant no encontrado")
    return tenant


@router.get("", response_model=EmpresaOut)
def get_empresa(
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    tenant = _load_tenant(db, ctx.tenant_id)
    return EmpresaOut(
        legal_name=tenant.legal_name or "",
        rfc=tenant.rfc or "",
        regimen_fiscal_sat=tenant.regimen_fiscal_sat or "",
        domicilio_fiscal_cp=tenant.domicilio_fiscal_cp or "",
        domicilio_fiscal=tenant.domicilio_fiscal or {},
    )


@router.put("", response_model=EmpresaOut)
def put_empresa(
    payload: EmpresaUpdate,
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    tenant = _load_tenant(db, ctx.tenant_id)

    rfc = payload.rfc.strip().upper()
    cp = payload.domicilio_fiscal_cp.strip()
    if not rfc:
        raise HTTPException(status_code=422, detail="El RFC es obligatorio")
    if not cp:
        raise HTTPException(status_code=422, detail="El código postal es obligatorio")

    tenant.legal_name = payload.legal_name.strip()
    tenant.rfc = rfc
    tenant.regimen_fiscal_sat = payload.regimen_fiscal_sat.strip()
    tenant.domicilio_fiscal_cp = cp
    # Reasignar el dict para que SQLAlchemy detecte el cambio del JSONB.
    tenant.domicilio_fiscal = dict(payload.domicilio_fiscal or {})
    flag_modified(tenant, "domicilio_fiscal")
    db.commit()
    db.refresh(tenant)

    return EmpresaOut(
        legal_name=tenant.legal_name or "",
        rfc=tenant.rfc or "",
        regimen_fiscal_sat=tenant.regimen_fiscal_sat or "",
        domicilio_fiscal_cp=tenant.domicilio_fiscal_cp or "",
        domicilio_fiscal=tenant.domicilio_fiscal or {},
    )


@router.post("/csd")
def subir_csd(
    cer: UploadFile = File(...),
    key: UploadFile = File(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    tenant = _load_tenant(db, ctx.tenant_id)
    if not tenant.rfc:
        raise HTTPException(status_code=422, detail="Configura primero el RFC del emisor")

    client = FacturamaClient.from_settings(settings)
    if not client.configured:
        raise HTTPException(status_code=503, detail="Facturama no está configurado")

    cer_b64 = base64.b64encode(cer.file.read()).decode()
    key_b64 = base64.b64encode(key.file.read()).decode()
    try:
        return client.subir_csd(tenant.rfc, cer_b64, key_b64, password)
    except FacturamaError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo subir el CSD: {exc}")


@router.get("/csd")
def listar_csd(
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    client = FacturamaClient.from_settings(settings)
    if not client.configured:
        raise HTTPException(status_code=503, detail="Facturama no está configurado")
    return client.listar_csds()


@router.get("/onboarding", response_model=EmpresaOnboardingOut)
def onboarding_status(
    db: Session = Depends(get_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    """Estado de la configuración fiscal del emisor para el wizard de onboarding:
    datos fiscales, RFC válido y CSD cargado → `listo_para_facturar`."""
    tenant = _load_tenant(db, ctx.tenant_id)
    client = FacturamaClient.from_settings(settings)
    status = compute_status(
        client, tenant, multiemisor=bool(getattr(settings, "FACTURAMA_MULTIEMISOR", False))
    )
    return EmpresaOnboardingOut(**status)
