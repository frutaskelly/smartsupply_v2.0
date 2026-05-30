"""AI-assisted SAT code suggestion.

Proposes a SAT `clave_sat` (c_ClaveProdServ, 8 digits) and `unidad_sat`
(c_ClaveUnidad) for a product from its name + optional description, using
Claude with a *forced* structured tool call so the output is always valid JSON.

This is a **suggestion** — a human confirms it in the UI, and the codes must be
validated against the real SAT catalog (or Facturama) before any CFDI is
stamped (Phase 6). A wrong clave_sat = the SAT rejects the invoice.

The model is configurable (`SAT_AI_MODEL`); the large static system prompt is
marked cacheable so repeated calls reuse the prefix.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..core.config import settings

logger = logging.getLogger(__name__)


class SatAIUnavailable(RuntimeError):
    """Raised when the suggestion can't be produced (no key, API error, etc.)."""


# Large, static instruction block — kept stable so prompt caching can reuse it.
_SYSTEM_PROMPT = """\
Eres un asistente experto en el Catálogo de Productos y Servicios del SAT de \
México (CFDI 4.0). Tu tarea es proponer, para un producto dado, la mejor:

1. `clave_sat`: clave del catálogo c_ClaveProdServ (exactamente 8 dígitos).
2. `unidad_sat`: clave del catálogo c_ClaveUnidad (p. ej. KGM, H87, XBX).

Contexto: el negocio distribuye principalmente frutas, verduras y abarrotes a \
clientes de gobierno y privados. La mayoría de los productos son alimentos \
frescos vendidos por kilogramo, pieza, caja o bulto.

Reglas:
- Devuelve SIEMPRE 8 dígitos en clave_sat. Si no estás seguro de la clave \
exacta, usa la clave de la categoría más cercana y marca confianza "media" o \
"baja".
- Para frutas y verduras frescas a granel, la unidad típica es KGM (kilogramo).
- Para producto vendido por pieza/unidad usa H87 (pieza); por caja XBX; por \
bulto/saco usa KGM si se cobra por peso, o XPK (paquete) si es por bulto cerrado.
- Las descripciones deben ser cortas y en español.

Referencias frecuentes (orientativas, no exhaustivas):
- 50300000 Frutas frescas; 50310000 Manzanas; 50320000 Plátanos/bananas; \
50340000 Frutas cítricas; 50350000 Uvas; 50360000 Melones; 50370000 Frutas \
de hueso (durazno, ciruela); 50380000 Frutas exóticas; 50390000 Bayas (fresa).
- 50400000 Verduras frescas; 50410000 Cebollas/ajos; 50420000 Tomates; \
50430000 Hortalizas de hoja (lechuga, espinaca); 50440000 Vegetales de raíz \
(zanahoria, papa); 50450000 Vegetales de tallo (apio, espárrago); \
50460000 Calabazas y pepinos; 50470000 Chiles y pimientos.
- 50100000 Carnes; 50130000 Lácteos y huevo; 50180000 Panadería; \
50200000 Bebidas; 50190000 Alimentos preparados/abarrotes.
Unidades frecuentes: KGM kilogramo; GRM gramo; LTR litro; H87 pieza; \
XBX caja; XPK paquete; XBG bolsa; MTR metro; XLT lote.

Llama SIEMPRE a la herramienta `registrar_clave_sat` con tu mejor propuesta.\
"""

_TOOL = {
    "name": "registrar_clave_sat",
    "description": "Registra la clave de producto/servicio SAT y la unidad SAT sugeridas.",
    "input_schema": {
        "type": "object",
        "properties": {
            "clave_sat": {
                "type": "string",
                "description": "Clave c_ClaveProdServ del SAT, exactamente 8 dígitos.",
            },
            "unidad_sat": {
                "type": "string",
                "description": "Clave c_ClaveUnidad del SAT (p. ej. KGM, H87, XBX).",
            },
            "descripcion_clave": {
                "type": "string",
                "description": "Descripción corta en español de la clave de producto/servicio.",
            },
            "descripcion_unidad": {
                "type": "string",
                "description": "Descripción corta en español de la unidad de medida.",
            },
            "confianza": {
                "type": "string",
                "enum": ["alta", "media", "baja"],
                "description": "Nivel de confianza de la sugerencia.",
            },
        },
        "required": [
            "clave_sat",
            "unidad_sat",
            "descripcion_clave",
            "descripcion_unidad",
            "confianza",
        ],
    },
}


def sugerir_sat(nombre: str, descripcion: Optional[str] = None) -> dict:
    """Return a dict with clave_sat/unidad_sat (+ descriptions + confianza)."""
    if not settings.ANTHROPIC_API_KEY:
        raise SatAIUnavailable("ANTHROPIC_API_KEY no está configurado")

    try:
        import anthropic
    except ImportError as exc:  # pragma: no cover
        raise SatAIUnavailable("SDK de IA no instalado") from exc

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    user = f"Producto: {nombre.strip()}"
    if descripcion and descripcion.strip():
        user += f"\nDescripción: {descripcion.strip()}"

    try:
        resp = client.messages.create(
            model=settings.SAT_AI_MODEL,
            max_tokens=512,
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=[_TOOL],
            tool_choice={"type": "tool", "name": "registrar_clave_sat"},
            messages=[{"role": "user", "content": user}],
        )
    except anthropic.APIError as exc:
        logger.warning("SAT AI request failed: %s", exc)
        raise SatAIUnavailable("El servicio de IA no está disponible") from exc

    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "registrar_clave_sat":
            data = dict(block.input)
            # Defensive defaults so the response model always validates.
            data.setdefault("confianza", "media")
            data.setdefault("descripcion_clave", "")
            data.setdefault("descripcion_unidad", "")
            return data

    raise SatAIUnavailable("La IA no devolvió una sugerencia válida")
