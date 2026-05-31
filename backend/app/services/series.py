"""Reserva de folios consecutivos sin huecos.

`siguiente_folio` incrementa el contador de la serie de forma atómica
(`UPDATE … RETURNING` con la fila bloqueada por la transacción), así dos
emisiones simultáneas no duplican ni dejan huecos. Devuelve None si la serie no
existe/está inactiva (el llamador puede caer a su lógica previa).
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session


def siguiente_folio(db: Session, tenant_id: UUID, *, codigo: str, tipo_documento: str) -> Optional[int]:
    row = db.execute(
        text(
            """
            UPDATE series
               SET folio_actual = folio_actual + 1, updated_at = now()
             WHERE tenant_id = :tid AND codigo = :codigo
               AND tipo_documento = :td AND activa = true
            RETURNING folio_actual
            """
        ),
        {"tid": str(tenant_id), "codigo": codigo, "td": tipo_documento},
    ).first()
    return int(row[0]) if row else None
