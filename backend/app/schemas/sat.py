"""Schemas for the AI-assisted SAT code suggester."""
from typing import Optional

from pydantic import BaseModel, Field


class SatSugerenciaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=254)
    descripcion: Optional[str] = Field(default=None, max_length=2000)


class SatSugerenciaOut(BaseModel):
    clave_sat: str
    unidad_sat: str
    descripcion_clave: str
    descripcion_unidad: str
    confianza: str
