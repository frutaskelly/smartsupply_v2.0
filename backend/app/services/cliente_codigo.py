"""Auto-generación del código de cliente.

El `codigo` de un cliente NO lo escribe el usuario: se genera secuencialmente en
el servidor (`CLI-001`, `CLI-002`, …) y es único dentro del tenant. Se calcula a
partir del máximo sufijo numérico existente para el prefijo `CLI-`, incrementado
y rellenado a 3 dígitos.

La unicidad se valida contra TODAS las filas del tenant (incluidas las borradas
lógicamente), porque la restricción `uq_cliente_tenant_codigo` abarca también
las soft-deleted.
"""
from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from ..models import Cliente

_PREFIX = "CLI-"
_PAD = 3


def generate_cliente_codigo(db: Session, tenant_id: UUID) -> str:
    """Devuelve el siguiente código secuencial `CLI-NNN`, único en el tenant."""
    taken = {
        c for (c,) in db.query(Cliente.codigo).filter(Cliente.tenant_id == tenant_id).all()
        if c
    }

    max_n = 0
    for codigo in taken:
        if not codigo.startswith(_PREFIX):
            continue
        suffix = codigo[len(_PREFIX):]
        if suffix.isdigit():
            max_n = max(max_n, int(suffix))

    n = max_n + 1
    candidate = f"{_PREFIX}{n:0{_PAD}d}"
    while candidate in taken:
        n += 1
        candidate = f"{_PREFIX}{n:0{_PAD}d}"
    return candidate
