"""Schemas for the AI-assisted SAT code suggester."""
from typing import List, Optional

from pydantic import BaseModel, Field


class SatSugerenciaIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=254)
    descripcion: Optional[str] = Field(default=None, max_length=2000)


class SatClaveOpcion(BaseModel):
    clave_sat: str
    descripcion: str


class SatSugerenciaOut(BaseModel):
    opciones: List[SatClaveOpcion]   # 2-4 claves candidatas, mejor primero
    unidad_sat: str
    descripcion_unidad: str
    confianza: str
