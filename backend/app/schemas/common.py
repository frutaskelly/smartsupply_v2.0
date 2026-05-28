"""Shared schema building blocks."""
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ORMModel(BaseModel):
    """Response models read straight off SQLAlchemy instances."""

    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    """A page of results + the total matching count (for the UI's pager)."""

    items: list[T]
    total: int
    limit: int
    offset: int
