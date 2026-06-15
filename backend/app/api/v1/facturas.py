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

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.config import settings
from ...core.rbac import AuthContext, get_tenant_db, require_permission
from ...models import (
    Cliente,
    EsquemaImpuesto,
    Factura,
    LineaFactura,
    LoteInventario,
    Producto,
    Remision,
    Tenant,
)
from ...schemas.common import Page
from ...schemas.factura import (
    CancelarFacturaIn,
    FacturaDesdeRemisionesIn,
    FacturaDetailOut,
    FacturaDirectaIn,
    FacturaOut,
)
from ...services.cfdi import build_payload
from ...services.facturama import FacturamaClient, FacturamaError
from ...services.fiscal import calcular_linea, totales
from ...services.onboarding import compute_status
from ...services.inventario import build_movimiento, presentacion_factor, presentacion_sat
from ...services.series import consumir_folio, resolver_serie, siguiente_folio
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


def _fiscal_calc(prod, esq, importe: Decimal, cantidad: Decimal) -> dict:
    """Desglose fiscal (IVA/IEPS/retenciones) de una línea desde el esquema del
    producto. Compartido por factura-desde-remisiones y factura-directa."""
    iva_tasa = esq.iva_tasa if esq else (prod.iva_tasa if prod else ZERO)
    iva_exento = bool(esq.iva_exento) if esq else False
    tipo_ieps = esq.tipo_ieps if esq else None
    ieps_tasa = esq.ieps_tasa if esq else ZERO
    ieps_cuota = esq.ieps_cuota if esq else ZERO
    ret_iva_tasa = esq.retencion_iva_tasa if esq else ZERO
    ret_isr_tasa = esq.retencion_isr_tasa if esq else ZERO
    litros = (cantidad * Decimal(prod.contenido_litros)) if (prod and prod.contenido_litros) else ZERO
    return calcular_linea(
        importe, iva_tasa=iva_tasa, iva_exento=iva_exento,
        tipo_ieps=tipo_ieps, ieps_tasa=ieps_tasa, ieps_cuota=ieps_cuota,
        litros_totales=litros, ret_iva_tasa=ret_iva_tasa, ret_isr_tasa=ret_isr_tasa,
    )


def _release_remision_stock(db: Session, rems, ctx, factura) -> None:
    """Devuelve a 'disponible' el stock reservado por remisiones CONFIRMADAS
    (motivo 03 de cancelación de factura: la operación no se llevó a cabo)."""
    prod_ids = {ln.producto_id for r in rems for ln in r.lineas if ln.lote_id}
    productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_(prod_ids)).all()}
    for r in rems:
        if r.estado != "CONFIRMADA":
            continue
        for ln in r.lineas:
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
            if ln.cantidad_surtida is not None:
                cantidad = Decimal(ln.cantidad_surtida)
            else:
                cantidad = Decimal(ln.cantidad_solicitada) * presentacion_factor(
                    productos.get(ln.producto_id), ln.presentacion)
            lote.cantidad_reservada = max(ZERO, lote.cantidad_reservada - cantidad)
            lote.cantidad_disponible = lote.cantidad_disponible + cantidad
            db.add(build_movimiento(
                ctx.tenant_id, ctx.user_id, lote, "CANCELACION_REMISION", cantidad,
                ref_tipo="FACTURA", ref_id=factura.id,
                motivo=f"Cancelación factura {factura.serie}{factura.folio} (motivo 03)",
            ))


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

    # Serie: override manual → sucursal (si todas las remisiones comparten una) →
    # cliente → default del inquilino. Folio del contador atómico de la serie.
    sucursales = {r.sucursal_id for r in rems if r.sucursal_id}
    sucursal_id = sucursales.pop() if len(sucursales) == 1 else None
    serie_obj = resolver_serie(
        db, ctx.tenant_id, "FACTURA",
        serie_id=payload.serie_id, sucursal_id=sucursal_id, cliente_id=cliente.id,
    )
    if serie_obj is not None:
        folio = consumir_folio(db, serie_obj.id)
        serie_codigo = serie_obj.codigo
        if folio is None:                       # carrera/desactivada: cae a back-compat
            serie_codigo = payload.serie or serie_obj.codigo
            folio = _next_folio(db, ctx.tenant_id, serie_codigo)
    else:
        serie_codigo = payload.serie or "A"
        folio = _next_folio(db, ctx.tenant_id, serie_codigo)

    factura = Factura(
        tenant_id=ctx.tenant_id, serie=serie_codigo, folio=folio,
        cliente_id=cliente.id,
        uso_cfdi=payload.uso_cfdi or cliente.uso_cfdi_default or "G03",
        forma_pago=payload.forma_pago or cliente.forma_pago_default or "99",
        metodo_pago=payload.metodo_pago or cliente.metodo_pago_default or "PUE",
        lugar_expedicion=tenant.domicilio_fiscal_cp,
        notas=payload.notas, created_by=ctx.user_id, estado="BORRADOR",
    )
    db.add(factura); db.flush()

    # Reúne las líneas de todas las remisiones; respeta peso variable/catch-weight.
    specs: list[dict] = []
    for r in rems:
        for ln in r.lineas:
            prod = productos.get(ln.producto_id)
            esq = esquemas.get(prod.esquema_impuesto_id) if prod and prod.esquema_impuesto_id else None
            importe = Decimal(ln.importe)
            if prod and prod.peso_variable and ln.cantidad_surtida and Decimal(ln.cantidad_surtida) > 0:
                cantidad = Decimal(ln.cantidad_surtida)            # unidades base reales
                clave_unidad = prod.unidad_sat
            else:
                cantidad = Decimal(ln.cantidad_solicitada)
                clave_unidad = presentacion_sat(prod, ln.presentacion) or (prod.unidad_sat if prod else "H87")
            specs.append({"producto_id": ln.producto_id, "prod": prod, "esq": esq,
                          "cantidad": cantidad, "clave_unidad": clave_unidad, "importe": importe})
        r.factura_id = factura.id

    # agrupar_productos: suma cantidad/importe de líneas con mismo producto+unidad.
    if payload.agrupar_productos:
        merged: dict = {}
        order: list = []
        for s in specs:
            k = (s["producto_id"], s["clave_unidad"])
            if k not in merged:
                merged[k] = dict(s); order.append(k)
            else:
                merged[k]["cantidad"] += s["cantidad"]
                merged[k]["importe"] += s["importe"]
        specs = [merged[k] for k in order]

    calc_lineas = []
    for numero, s in enumerate(specs, start=1):
        prod, esq = s["prod"], s["esq"]
        importe, cantidad, clave_unidad = s["importe"], s["cantidad"], s["clave_unidad"]
        valor_unitario = (importe / cantidad).quantize(Decimal("0.000001")) if cantidad else ZERO
        calc = _fiscal_calc(prod, esq, importe, cantidad)
        calc_lineas.append(calc)
        db.add(LineaFactura(
            tenant_id=ctx.tenant_id, factura_id=factura.id, numero_linea=numero,
            producto_id=s["producto_id"],
            clave_prod_serv=(prod.clave_sat if prod else "01010101"),
            clave_unidad=clave_unidad, descripcion=(prod.nombre if prod else "Producto"),
            cantidad=cantidad, valor_unitario=valor_unitario, importe=importe, objeto_imp="02",
            iva_tasa=calc["iva_tasa"], iva_importe=calc["iva_importe"],
            ieps_tipo=calc["ieps_tipo"], ieps_valor=calc["ieps_valor"], ieps_importe=calc["ieps_importe"],
            ret_iva_importe=calc["ret_iva_importe"], ret_isr_importe=calc["ret_isr_importe"],
        ))

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


@router.post("/directa", response_model=FacturaDetailOut, status_code=status.HTTP_201_CREATED)
def factura_directa(
    payload: FacturaDirectaIn,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    """Crea una factura capturada a mano (sin remisión, sin afectar inventario).
    Las líneas referencian productos del catálogo para tomar su clave SAT y su
    desglose fiscal."""
    cliente = get_or_404(db, Cliente, payload.cliente_id)
    tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).one()

    prod_ids = {ln.producto_id for ln in payload.lineas}
    productos = {p.id: p for p in db.query(Producto).filter(Producto.id.in_(prod_ids)).all()}
    if len(productos) != len(prod_ids):
        raise HTTPException(status_code=404, detail="Uno o más productos no existen")
    esq_ids = {p.esquema_impuesto_id for p in productos.values() if p.esquema_impuesto_id}
    esquemas = {e.id: e for e in db.query(EsquemaImpuesto).filter(EsquemaImpuesto.id.in_(esq_ids)).all()}

    serie_obj = resolver_serie(
        db, ctx.tenant_id, "FACTURA", serie_id=payload.serie_id, cliente_id=cliente.id,
    )
    if serie_obj is not None:
        folio = consumir_folio(db, serie_obj.id)
        serie_codigo = serie_obj.codigo
        if folio is None:
            serie_codigo = payload.serie or serie_obj.codigo
            folio = _next_folio(db, ctx.tenant_id, serie_codigo)
    else:
        serie_codigo = payload.serie or "A"
        folio = _next_folio(db, ctx.tenant_id, serie_codigo)

    factura = Factura(
        tenant_id=ctx.tenant_id, serie=serie_codigo, folio=folio, cliente_id=cliente.id,
        uso_cfdi=payload.uso_cfdi or cliente.uso_cfdi_default or "G03",
        forma_pago=payload.forma_pago or cliente.forma_pago_default or "99",
        metodo_pago=payload.metodo_pago or cliente.metodo_pago_default or "PUE",
        lugar_expedicion=tenant.domicilio_fiscal_cp,
        notas=payload.notas, created_by=ctx.user_id, estado="BORRADOR",
    )
    db.add(factura); db.flush()

    calc_lineas = []
    for numero, ln in enumerate(payload.lineas, start=1):
        prod = productos.get(ln.producto_id)
        esq = esquemas.get(prod.esquema_impuesto_id) if prod and prod.esquema_impuesto_id else None
        cantidad = Decimal(ln.cantidad)
        valor_unitario = Decimal(ln.precio_unitario)
        importe = (cantidad * valor_unitario).quantize(Decimal("0.0001"))
        clave_unidad = presentacion_sat(prod, ln.presentacion) or (prod.unidad_sat if prod else "H87")
        calc = _fiscal_calc(prod, esq, importe, cantidad)
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


# ─── Timbrado ─────────────────────────────────────────────────────────────────
@router.post("/{factura_id}/timbrar", response_model=FacturaDetailOut)
def timbrar_factura(
    factura_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    """Timbra la factura contra Facturama (BORRADOR → TIMBRADA).

    El ambiente (sandbox/producción) lo decide FACTURAMA_BASE_URL; en producción
    el timbre es REAL ante el SAT.
    """
    factura = get_or_404(db, Factura, factura_id)
    if factura.estado == "TIMBRADA":
        raise HTTPException(status_code=409, detail="La factura ya está timbrada")
    if factura.estado == "CANCELADA":
        raise HTTPException(status_code=409, detail="La factura está cancelada")

    client = FacturamaClient.from_settings(settings)
    if not client.configured:
        raise HTTPException(status_code=503, detail="Facturama no está configurado")

    # Multi-emisor: el tenant debe estar listo (datos fiscales + su CSD cargado)
    # antes de timbrar a su nombre. Mensaje accionable en vez del error críptico del PAC.
    if bool(getattr(settings, "FACTURAMA_MULTIEMISOR", False)):
        tenant = db.query(Tenant).filter(Tenant.id == ctx.tenant_id).one()
        estado = compute_status(client, tenant, multiemisor=True)
        if not estado["listo_para_facturar"]:
            faltan = [p["titulo"] for p in estado["pasos"] if not p["completo"]]
            raise HTTPException(
                status_code=422,
                detail=(
                    "La empresa aún no está lista para facturar. Completa en "
                    "Ajustes › Empresa: " + ", ".join(faltan) + "."
                ),
            )

    payload = build_payload(db, factura)
    try:
        resp = client.create_cfdi(payload)
    except FacturamaError as exc:
        raise HTTPException(status_code=502, detail=f"Timbrado rechazado por el PAC: {exc}")

    uuid_sat = ((resp.get("Complement") or {}).get("TaxStamp") or {}).get("Uuid") or resp.get("Uuid")
    factura.facturama_id = resp.get("Id")
    factura.uuid = uuid_sat
    factura.estado = "TIMBRADA"
    factura.fecha_timbrado = func.now()
    try:
        factura.xml = client.download_xml(factura.facturama_id).decode("utf-8", "ignore")
    except FacturamaError:
        pass  # el timbre ya quedó; el XML se puede descargar luego
    db.flush()
    db.refresh(factura)
    return factura


@router.post("/{factura_id}/cancelar", response_model=FacturaDetailOut)
def cancelar_factura(
    factura_id: UUID,
    payload: CancelarFacturaIn,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_WRITE)),
):
    """Cancela el CFDI ante el PAC y libera sus remisiones.

    Con FACTURAMA_FAKE_CANCEL=true la cancelación es interna (no llama al PAC);
    en producción debe ser false para que la cancelación llegue al SAT.
    """
    factura = get_or_404(db, Factura, factura_id)
    if factura.estado != "TIMBRADA":
        raise HTTPException(status_code=409, detail="Solo se cancela una factura timbrada")
    if payload.motivo == "01" and payload.uuid_sustitucion is None:
        raise HTTPException(status_code=422, detail="El motivo 01 requiere uuid_sustitucion")

    if settings.FACTURAMA_FAKE_CANCEL:
        # Cancelación simulada (el sandbox de Facturama no cancela). NO se llama al
        # PAC; solo se aplica la lógica interna. En producción: FACTURAMA_FAKE_CANCEL=false.
        pass
    else:
        client = FacturamaClient.from_settings(settings)
        if not client.configured:
            raise HTTPException(status_code=503, detail="Facturama no está configurado")
        try:
            client.cancel_cfdi(
                factura.facturama_id, motive=payload.motivo,
                uuid_replacement=str(payload.uuid_sustitucion) if payload.uuid_sustitucion else None,
            )
        except FacturamaError as exc:
            raise HTTPException(status_code=502, detail=f"Cancelación rechazada por el PAC: {exc}")

    factura.estado = "CANCELADA"
    factura.fecha_cancelacion = func.now()
    factura.motivo_cancelacion = payload.motivo
    factura.uuid_sustitucion = str(payload.uuid_sustitucion) if payload.uuid_sustitucion else None

    rems = db.query(Remision).filter(Remision.factura_id == factura.id).all()
    if payload.motivo == "03":
        # "No se llevó a cabo la operación": la venta NO ocurrió → se devuelve el
        # inventario reservado y la(s) remisión(es) quedan CANCELADAS (no se
        # refacturan, porque no hubo operación).
        _release_remision_stock(db, rems, ctx, factura)
        for r in rems:
            if r.estado == "CONFIRMADA":
                r.estado = "CANCELADA"
            r.factura_id = None
    else:
        # 01/02/04 (errores/sustitución/global): la operación sí ocurre y se
        # reexpide → se liberan las remisiones para refacturar; el inventario
        # permanece reservado (la mercancía sigue saliendo).
        for r in rems:
            r.factura_id = None
    db.flush()
    db.refresh(factura)
    return factura


@router.get("/{factura_id}/xml")
def descargar_xml(
    factura_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    factura = get_or_404(db, Factura, factura_id)
    xml = factura.xml
    if not xml and factura.facturama_id:
        try:
            xml = FacturamaClient.from_settings(settings).download_xml(factura.facturama_id).decode("utf-8", "ignore")
        except FacturamaError:
            xml = None
    if not xml:
        raise HTTPException(status_code=404, detail="La factura no tiene XML (¿no está timbrada?)")
    return Response(content=xml, media_type="application/xml",
                    headers={"Content-Disposition": f'attachment; filename="{factura.serie}{factura.folio}.xml"'})


@router.get("/{factura_id}/pdf")
def descargar_pdf(
    factura_id: UUID,
    db: Session = Depends(get_tenant_db),
    ctx: AuthContext = Depends(require_permission(_READ)),
):
    factura = get_or_404(db, Factura, factura_id)
    if not factura.facturama_id:
        raise HTTPException(status_code=404, detail="La factura no está timbrada")
    try:
        pdf = FacturamaClient.from_settings(settings).download_pdf(factura.facturama_id)
    except FacturamaError as exc:
        raise HTTPException(status_code=502, detail=f"No se pudo descargar el PDF: {exc}")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{factura.serie}{factura.folio}.pdf"'})
