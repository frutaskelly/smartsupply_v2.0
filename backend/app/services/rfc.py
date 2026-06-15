"""Validación local de RFC: formato + dígito verificador del SAT.

El último carácter del RFC es un dígito verificador determinista calculado a
partir de los 12 anteriores, así que se puede comprobar SIN consultar al SAT —
atrapa typos como `ZAAG5802226V1` (debía ser `...VA`).

Límite: NO valida existencia real ante el SAT (eso requiere Facturama de
producción), ni la homoclave intermedia (la asigna el SAT). Es un filtro previo.
"""
from __future__ import annotations

import re

# PM (moral): 3 letras + 6 dígitos + 3 homoclave. PF (física): 4 + 6 + 3.
_RFC_RE = re.compile(r"^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$")
# RFC genéricos del SAT: válidos pero NO cumplen el dígito verificador.
#   XAXX010101000 = público en general (nacional)
#   XEXX010101000 = residentes en el extranjero
_GENERICOS = {"XAXX010101000", "XEXX010101000"}
_TABLA = "0123456789ABCDEFGHIJKLMN&OPQRSTUVWXYZ"
_VAL = {ch: i for i, ch in enumerate(_TABLA)}
_VAL[" "] = 37
_VAL["Ñ"] = 38


def _digito_verificador(rfc_sin_dv: str) -> str:
    """Calcula el dígito verificador a partir de los caracteres previos.

    El RFC se alinea a la derecha en 12 posiciones (la PM se rellena con un
    espacio a la izquierda); los pesos van de 13 a 2.
    """
    base = rfc_sin_dv.rjust(12)
    s = sum(_VAL.get(ch, 0) * (13 - i) for i, ch in enumerate(base))
    r = 11 - (s % 11)
    if r == 11:
        return "0"
    if r == 10:
        return "A"
    return str(r)


def validar_rfc_local(rfc: str) -> dict:
    """Devuelve {formato_ok, digito_ok} para un RFC ya en mayúsculas."""
    rfc = (rfc or "").strip().upper()
    if rfc in _GENERICOS:
        return {"formato_ok": True, "digito_ok": True}
    if not _RFC_RE.match(rfc):
        return {"formato_ok": False, "digito_ok": False}
    return {"formato_ok": True, "digito_ok": _digito_verificador(rfc[:-1]) == rfc[-1]}
