"""Unit-conversion helper: `presentacion_factor` maps a document presentation to
the number of base inventory units it represents. Pure (no DB) — exercises the
back-compat defaults that keep presentation-less documents 1:1."""
from decimal import Decimal

from app.models import Producto
from app.services.inventario import presentacion_factor


def _prod(presentaciones):
    return Producto(
        sku="X", nombre="X", clave_sat="50300000", unidad_sat="KGM",
        unidad_base="KILO", presentaciones=presentaciones,
    )


def test_blank_presentation_is_one():
    p = _prod({"KILO": 1, "BULTO": 20})
    assert presentacion_factor(p, None) == Decimal(1)
    assert presentacion_factor(p, "") == Decimal(1)


def test_known_presentation_returns_factor():
    p = _prod({"KILO": 1, "BULTO": 20})
    assert presentacion_factor(p, "BULTO") == Decimal(20)
    assert presentacion_factor(p, "KILO") == Decimal(1)


def test_unknown_presentation_defaults_to_one():
    assert presentacion_factor(_prod({"KILO": 1}), "CAJA") == Decimal(1)


def test_missing_or_bad_factor_defaults_to_one():
    assert presentacion_factor(_prod(None), "BULTO") == Decimal(1)
    assert presentacion_factor(_prod({"BULTO": 0}), "BULTO") == Decimal(1)
    assert presentacion_factor(_prod({"BULTO": "abc"}), "BULTO") == Decimal(1)
    assert presentacion_factor(None, "BULTO") == Decimal(1)


def test_fractional_factor_supported():
    # a "MEDIO" (half) presentation of a KILO-based product
    assert presentacion_factor(_prod({"KILO": 1, "MEDIO": "0.5"}), "MEDIO") == Decimal("0.5")
