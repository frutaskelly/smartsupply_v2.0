"""Cruce de productos — resuelve un texto libre al producto real del catálogo.

Cascada de mayor a menor confianza:
  1. Exacto         — sku o nombre normalizado idéntico.
  2. Alias aprendido — `producto_alias` (ya confirmado antes; no se vuelve a preguntar).
  3. Difuso         — RapidFuzz sobre nombre + sinónimos (typos: "zanahorias"→"zanahoria").
  4. IA (opcional)  — Claude para sinónimos regionales ("Chile Cuaresmeño"="Jalapeño").

Cuando el usuario confirma una sugerencia, `aprender_alias` la guarda y a partir
de ahí el paso 2 la resuelve al instante.
"""
from __future__ import annotations

import logging
import unicodedata
from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from rapidfuzz import fuzz, process
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models import Producto, ProductoAlias

logger = logging.getLogger(__name__)

_FUZZY_FLOOR = 60  # score mínimo (0-100) para ofrecer un candidato difuso


def normalizar(texto: str) -> str:
    """minúsculas + sin acentos + sin puntuación + espacios colapsados."""
    s = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in s)
    return " ".join(s.split())


@dataclass
class Candidato:
    producto_id: UUID
    sku: str
    nombre: str
    score: int            # 0-100
    origen: str           # exacto | alias | difuso | ia


def _productos_activos(db: Session) -> list[Producto]:
    return db.query(Producto).filter(Producto.deleted_at.is_(None), Producto.activo.is_(True)).all()


def buscar(db: Session, tenant_id: UUID, texto: str, *, limit: int = 5) -> list[Candidato]:
    """Devuelve candidatos ordenados por confianza para un texto libre."""
    norm = normalizar(texto)
    if not norm:
        return []

    prods = _productos_activos(db)
    by_id = {p.id: p for p in prods}

    # 1) exacto por nombre o sku
    for p in prods:
        if normalizar(p.nombre) == norm or normalizar(p.sku) == norm:
            return [Candidato(p.id, p.sku, p.nombre, 100, "exacto")]

    # 2) alias aprendido
    alias = (
        db.query(ProductoAlias)
        .filter(ProductoAlias.alias_normalizado == norm)
        .one_or_none()
    )
    if alias is not None and alias.producto_id in by_id:
        p = by_id[alias.producto_id]
        return [Candidato(p.id, p.sku, p.nombre, 100, "alias")]

    # 3) difuso sobre nombre + sinónimos (mejor score por producto)
    choices: dict[str, UUID] = {}
    for p in prods:
        choices[normalizar(p.nombre)] = p.id
        for s in (p.sinonimos or []):
            ns = normalizar(s)
            if ns:
                choices.setdefault(ns, p.id)
    matches = process.extract(norm, list(choices.keys()), scorer=fuzz.token_set_ratio, limit=limit * 3)
    best: dict[UUID, int] = {}
    for text_choice, score, _ in matches:
        pid = choices[text_choice]
        if score > best.get(pid, 0):
            best[pid] = int(score)
    ordered = sorted(best.items(), key=lambda kv: kv[1], reverse=True)
    out = []
    for pid, score in ordered:
        if score < _FUZZY_FLOOR:
            continue
        p = by_id[pid]
        out.append(Candidato(p.id, p.sku, p.nombre, score, "difuso"))
        if len(out) >= limit:
            break
    return out


def aprender_alias(
    db: Session, tenant_id: UUID, texto: str, producto_id: UUID, *, origen: str = "MANUAL", user_id=None
) -> Optional[ProductoAlias]:
    """Guarda (o reapunta) el alias normalizado → producto. Idempotente."""
    norm = normalizar(texto)
    if not norm:
        return None
    existing = (
        db.query(ProductoAlias)
        .filter(ProductoAlias.alias_normalizado == norm)
        .one_or_none()
    )
    if existing is not None:
        existing.producto_id = producto_id
        existing.origen = origen
        db.flush()
        return existing
    alias = ProductoAlias(
        tenant_id=tenant_id, producto_id=producto_id, alias=texto.strip()[:254],
        alias_normalizado=norm, origen=origen, created_by=user_id,
    )
    db.add(alias)
    db.flush()
    return alias


# ─── IA: sinónimos regionales / typos que el difuso no alcanza ────────────────
_AI_TOOL = {
    "name": "registrar_cruce",
    "description": "Asocia cada texto de entrada con el SKU del catálogo que representa, o null si ninguno.",
    "input_schema": {
        "type": "object",
        "properties": {
            "cruces": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "texto": {"type": "string"},
                        "sku": {"type": "string", "description": "SKU exacto del catálogo, o vacío si ninguno aplica."},
                    },
                    "required": ["texto", "sku"],
                },
            }
        },
        "required": ["cruces"],
    },
}


def sugerir_con_ia(db: Session, tenant_id: UUID, textos: list[str]) -> dict[str, Optional[UUID]]:
    """Cruce por IA en una sola llamada (batch). {} si no hay API key o falla."""
    textos = [t for t in (t.strip() for t in textos) if t]
    if not textos or not settings.ANTHROPIC_API_KEY:
        return {}
    try:
        import anthropic
    except ImportError:  # pragma: no cover
        return {}

    prods = _productos_activos(db)
    by_sku = {p.sku: p.id for p in prods}
    catalogo = "\n".join(
        f"- {p.sku}: {p.nombre}" + (f" (sinónimos: {', '.join(p.sinonimos)})" if p.sinonimos else "")
        for p in prods
    )
    system = (
        "Eres un asistente que cruza nombres de productos de frutas, verduras y abarrotes "
        "(incluyendo variantes regionales y errores de escritura) contra un catálogo. "
        "Ejemplos: 'zanahorias'→'zanahoria'; 'Chile Cuaresmeño'='Chile Jalapeño'. "
        "Devuelve el SKU EXACTO del catálogo para cada texto, o vacío si ninguno corresponde con seguridad."
    )
    user = f"Catálogo:\n{catalogo}\n\nTextos a cruzar (JSON): {textos}"
    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        resp = client.messages.create(
            model=getattr(settings, "SAT_AI_MODEL", "claude-sonnet-4-5"),
            max_tokens=1024,
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
            tools=[_AI_TOOL],
            tool_choice={"type": "tool", "name": "registrar_cruce"},
            messages=[{"role": "user", "content": user}],
        )
    except Exception as exc:  # noqa: BLE001 — degradación elegante
        logger.warning("cruce IA falló: %s", exc)
        return {}

    out: dict[str, Optional[UUID]] = {}
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "registrar_cruce":
            for c in (block.input.get("cruces") or []):
                if isinstance(c, dict):
                    out[str(c.get("texto", ""))] = by_sku.get(str(c.get("sku", "")))
    return out
