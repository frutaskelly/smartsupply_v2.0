"""Auto-generación del código de categoría a partir del nombre.

El código de una categoría NO lo escribe el usuario: se deriva del nombre y es la
única fuente de verdad (ver `api/v1/categorias.py`). La regla:

  * se normalizan acentos ("Lácteos" → "LACTEOS"),
  * se conservan sólo A-Z y 0-9 en mayúsculas,
  * se toman los primeros 5 caracteres.

Si dos nombres distintos colapsan al mismo prefijo (p. ej. "Carnes" y
"Carnitas" → "CARNI"/"CARNE" no chocan, pero "Carne" y "Carnes" → "CARNE"),
se añade un sufijo numérico hasta encontrar uno libre dentro del tenant. El
modelo limita `codigo` a 10 caracteres, así que hay margen de sobra.
"""
from __future__ import annotations

import unicodedata
from uuid import UUID

from sqlalchemy.orm import Session

from ..models import CategoriaProducto

CODIGO_LEN = 5
_MAX_LEN = 10  # debe coincidir con String(10) en el modelo


def slugify_codigo(nombre: str, *, length: int = CODIGO_LEN) -> str:
    """Convierte un nombre en un código base de hasta `length` caracteres."""
    normalized = unicodedata.normalize("NFKD", nombre or "")
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = "".join(ch for ch in ascii_only.upper() if ch.isalnum())
    return cleaned[:length] or "CAT"


def generate_unique_codigo(
    db: Session,
    tenant_id: UUID,
    nombre: str,
    *,
    exclude_id: UUID | None = None,
) -> str:
    """Código derivado del nombre, único dentro del tenant.

    La unicidad se valida contra TODAS las filas del tenant (incluidas las
    borradas lógicamente), porque la restricción `uq_categoria_tenant_codigo`
    abarca también las soft-deleted.
    """
    base = slugify_codigo(nombre)

    existing_q = db.query(CategoriaProducto.codigo).filter(
        CategoriaProducto.tenant_id == tenant_id
    )
    if exclude_id is not None:
        existing_q = existing_q.filter(CategoriaProducto.id != exclude_id)
    taken = {c for (c,) in existing_q.all()}

    if base not in taken:
        return base

    for n in range(2, 1000):
        suffix = str(n)
        candidate = (base[: _MAX_LEN - len(suffix)] or "CAT"[: _MAX_LEN - len(suffix)]) + suffix
        if candidate not in taken:
            return candidate
    # Extremadamente improbable; deja que la restricción única lo atrape.
    return base
