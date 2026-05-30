"""Motor de cálculo fiscal CFDI 4.0.

Reglas (México):
- IEPS de dos formas: TASA (porcentaje, p.ej. botanas 8%) o CUOTA ($/litro, p.ej.
  bebidas saborizadas) → la cuota se aplica sobre los LITROS totales del concepto.
- El IEPS se calcula ANTES del IVA: la base del IVA = importe + IEPS.
- Tasa 0% e IVA exento producen IVA $0 (la diferencia fiscal es el TipoFactor en
  el CFDI; aquí ambos dan importe 0).
- Retenciones de IVA/ISR sobre el importe (no sobre base+IEPS).

Todo se redondea a 2 decimales (centavos), como el desglose de un CFDI en MXN.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Optional

ZERO = Decimal("0")
_C = Decimal("0.01")


def _q(v: Decimal) -> Decimal:
    return Decimal(v).quantize(_C)


def calcular_linea(
    importe: Decimal,
    *,
    iva_tasa: Decimal = ZERO,
    iva_exento: bool = False,
    tipo_ieps: Optional[str] = None,
    ieps_tasa: Decimal = ZERO,
    ieps_cuota: Decimal = ZERO,
    litros_totales: Decimal = ZERO,
    ret_iva_tasa: Decimal = ZERO,
    ret_isr_tasa: Decimal = ZERO,
) -> dict:
    """Impuestos de un concepto a partir de su `importe` (cantidad×valor_unitario).

    `tipo_ieps`='CUOTA' usa `ieps_cuota` × `litros_totales`; 'TASA' usa
    `ieps_tasa` × importe; cualquier otro valor → sin IEPS.
    """
    importe = Decimal(importe)

    if tipo_ieps == "CUOTA":
        ieps_valor = Decimal(ieps_cuota)
        ieps_importe = _q(Decimal(ieps_cuota) * Decimal(litros_totales))
    elif tipo_ieps == "TASA":
        ieps_valor = Decimal(ieps_tasa)
        ieps_importe = _q(importe * Decimal(ieps_tasa))
    else:
        ieps_valor = ZERO
        ieps_importe = ZERO

    if iva_exento:
        iva_importe = ZERO
    else:
        iva_importe = _q((importe + ieps_importe) * Decimal(iva_tasa))

    return {
        "importe": _q(importe),
        "ieps_tipo": tipo_ieps if tipo_ieps in ("TASA", "CUOTA") else None,
        "ieps_valor": ieps_valor,
        "ieps_importe": ieps_importe,
        "iva_tasa": ZERO if iva_exento else Decimal(iva_tasa),
        "iva_importe": iva_importe,
        "ret_iva_importe": _q(importe * Decimal(ret_iva_tasa)),
        "ret_isr_importe": _q(importe * Decimal(ret_isr_tasa)),
    }


def totales(lineas: list[dict], descuento: Decimal = ZERO) -> dict:
    """Agrega los importes calculados de varios conceptos al total del comprobante."""
    subtotal = sum((Decimal(l["importe"]) for l in lineas), ZERO)
    iva = sum((Decimal(l["iva_importe"]) for l in lineas), ZERO)
    ieps = sum((Decimal(l["ieps_importe"]) for l in lineas), ZERO)
    ret_iva = sum((Decimal(l["ret_iva_importe"]) for l in lineas), ZERO)
    ret_isr = sum((Decimal(l["ret_isr_importe"]) for l in lineas), ZERO)
    descuento = Decimal(descuento)
    total = subtotal - descuento + iva + ieps - ret_iva - ret_isr
    return {
        "subtotal": _q(subtotal),
        "descuento": _q(descuento),
        "iva_trasladado": _q(iva),
        "ieps_trasladado": _q(ieps),
        "ret_iva": _q(ret_iva),
        "ret_isr": _q(ret_isr),
        "total": _q(total),
    }
