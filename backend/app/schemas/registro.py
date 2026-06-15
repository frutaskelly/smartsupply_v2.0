"""Schemas del registro autoservicio (signup público de una empresa nueva)."""
from __future__ import annotations

import uuid
from typing import Optional

from pydantic import BaseModel, Field


class RegistroIn(BaseModel):
    # Empresa (emisor)
    legal_name: str = Field(min_length=2, max_length=254)
    rfc: str = Field(min_length=12, max_length=15)
    regimen_fiscal_sat: str = Field(min_length=3, max_length=4)
    domicilio_fiscal_cp: str = Field(min_length=5, max_length=5)
    # Dueño (primer usuario, rol OWNER)
    owner_email: str = Field(min_length=3, max_length=254)
    owner_name: Optional[str] = Field(default=None, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class RegistroOut(BaseModel):
    tenant_id: uuid.UUID
    slug: str
    email: str
