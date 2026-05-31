"""Construye el payload CFDI 4.0 (Facturama /3/cfdis) desde una Factura v2.

Las líneas ya traen el desglose fiscal calculado al crear la factura
(services/fiscal.py), así que aquí solo se mapea al formato de Facturama.
El emisor (Issuer) se omite si no hay FACTURAMA_ISSUER_RFC configurado: en
sandbox Facturama usa el CSD por defecto de la cuenta.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy.orm import Session

from ..core.config import settings
from ..models import Cliente, Factura, Tenant


def _f(x) -> float:
    return float(Decimal(str(x or 0)))


def _receptor_cp(cliente: Cliente, tenant: Tenant) -> str:
    dom = cliente.domicilio_fiscal or {}
    return str(dom.get("cp") or dom.get("codigo_postal") or tenant.domicilio_fiscal_cp or "")


def build_payload(db: Session, factura: Factura) -> dict:
    cliente = db.query(Cliente).filter(Cliente.id == factura.cliente_id).one()
    tenant = db.query(Tenant).filter(Tenant.id == factura.tenant_id).one()

    items = []
    for ln in sorted(factura.lineas, key=lambda x: x.numero_linea):
        taxes = []
        retenciones = []
        if str(ln.objeto_imp) == "02":
            if ln.iva_importe and Decimal(ln.iva_importe) > 0:
                taxes.append({
                    "Total": _f(ln.iva_importe), "Name": "IVA", "Base": _f(ln.importe),
                    "Rate": _f(ln.iva_tasa), "IsRetention": False,
                })
            if ln.ieps_importe and Decimal(ln.ieps_importe) > 0:
                taxes.append({
                    "Total": _f(ln.ieps_importe), "Name": "IEPS", "Base": _f(ln.importe),
                    "Rate": _f(ln.ieps_valor), "IsRetention": False,
                })
            if ln.ret_iva_importe and Decimal(ln.ret_iva_importe) > 0:
                retenciones.append({
                    "Total": _f(ln.ret_iva_importe), "Name": "IVA", "Base": _f(ln.importe),
                    "Rate": _f(ln.iva_tasa), "IsRetention": True,
                })
            if ln.ret_isr_importe and Decimal(ln.ret_isr_importe) > 0:
                retenciones.append({
                    "Total": _f(ln.ret_isr_importe), "Name": "ISR", "Base": _f(ln.importe),
                    "Rate": 0, "IsRetention": True,
                })

        item = {
            "ProductCode": ln.clave_prod_serv,
            "Description": ln.descripcion,
            "UnitCode": ln.clave_unidad,
            "Unit": ln.clave_unidad,
            "UnitPrice": _f(ln.valor_unitario),
            "Quantity": _f(ln.cantidad),
            "Subtotal": _f(ln.importe),
            "Discount": _f(ln.descuento),
            "TaxObject": ln.objeto_imp,
            "Total": _f(Decimal(str(ln.importe)) + Decimal(str(ln.iva_importe or 0)) + Decimal(str(ln.ieps_importe or 0))
                       - Decimal(str(ln.ret_iva_importe or 0)) - Decimal(str(ln.ret_isr_importe or 0))),
        }
        if taxes or retenciones:
            item["Taxes"] = taxes + retenciones
        items.append(item)

    payload = {
        "NameId": "1",                       # CFDI ingresos
        "CfdiType": "I",
        "PaymentForm": factura.forma_pago or "99",
        "PaymentMethod": factura.metodo_pago or "PUE",
        "Currency": factura.moneda or "MXN",
        "ExpeditionPlace": settings.FACTURAMA_EXPEDITION_PLACE or factura.lugar_expedicion or tenant.domicilio_fiscal_cp,
        "Serie": factura.serie,
        "Folio": factura.folio,
        "Receiver": {
            "Rfc": cliente.rfc,
            "Name": cliente.legal_name,
            "CfdiUse": factura.uso_cfdi or cliente.uso_cfdi_default or "G03",
            "FiscalRegime": cliente.regimen_fiscal or "616",
            "TaxZipCode": _receptor_cp(cliente, tenant),
        },
        "Items": items,
    }

    # Emisor explícito solo si está configurado (en sandbox normalmente se omite).
    if settings.FACTURAMA_ISSUER_RFC:
        payload["Issuer"] = {
            "Rfc": settings.FACTURAMA_ISSUER_RFC,
            "Name": settings.FACTURAMA_ISSUER_NAME or tenant.legal_name,
            "FiscalRegime": settings.FACTURAMA_ISSUER_REGIMEN or tenant.regimen_fiscal_sat,
        }
    return payload
