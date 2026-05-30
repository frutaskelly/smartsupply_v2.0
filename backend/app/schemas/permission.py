"""Schemas for the permission catalog (global, read-only seeded data)."""
from typing import Optional

from .common import ORMModel


class PermissionOut(ORMModel):
    id: str
    recurso: str
    accion: str
    vertical: Optional[str] = None
    descripcion: Optional[str] = None
