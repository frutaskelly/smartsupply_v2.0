"""Schemas para los datos fiscales del emisor (tenant) y sus CSD."""
from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, Field


class EmpresaOut(BaseModel):
    legal_name: str = ""
    rfc: str = ""
    regimen_fiscal_sat: str = ""
    domicilio_fiscal_cp: str = ""
    domicilio_fiscal: Dict[str, Any] = Field(default_factory=dict)


class EmpresaUpdate(BaseModel):
    legal_name: str = Field(max_length=254)
    rfc: str = Field(max_length=15)
    regimen_fiscal_sat: str = Field(max_length=4)
    domicilio_fiscal_cp: str = Field(max_length=5)
    domicilio_fiscal: Dict[str, Any] = Field(default_factory=dict)


class CsdOut(BaseModel):
    """Pass-through del objeto que devuelve Facturama por cada CSD cargado."""

    model_config = {"extra": "allow"}
