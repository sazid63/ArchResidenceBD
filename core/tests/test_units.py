"""Land/length units (plan 5.2) - exact Decimal conversions, no float drift."""

from __future__ import annotations

from decimal import Decimal

import pytest

from archres_core import units


def test_katha_is_720_sqft_and_five_katha_matches_the_example() -> None:
    assert units.KATHA_M2 == Decimal("66.89018880")
    assert units.area_to_m2(5, "katha") == Decimal("334.45094400")
    assert units.quantize(units.area_to_m2(5, "katha"), 2) == Decimal("334.45")


def test_shotok_decimal_bigha_and_gonda() -> None:
    assert units.SHOTOK_M2 == Decimal("40.468564224")
    assert units.area_to_m2(1, "shotok") == units.area_to_m2(1, "decimal")
    assert units.area_to_m2(1, "bigha") == units.area_to_m2(20, "katha")
    assert units.area_to_m2(1, "gonda") == units.area_to_m2(1, "katha") / 20


def test_area_round_trip_is_exact_enough_for_display() -> None:
    for unit in ("sqm", "sqft", "katha", "shotok", "bigha", "gonda"):
        m2 = units.area_to_m2(units.area_from_m2(Decimal("334.45"), unit).quantize(Decimal("0.01")), unit)
        assert abs(m2 - Decimal("334.45")) < Decimal("0.5"), unit


def test_length_conversions() -> None:
    assert units.length_to_m(1, "ft") == Decimal("0.3048")
    assert units.length_to_m(12, "inch") == Decimal("0.3048")
    assert units.length_from_m(Decimal("3.048"), "ft") == Decimal("10.0")


def test_quantize_rounds_half_up_and_format_trims_zeros() -> None:
    assert units.quantize("2.345", 2) == Decimal("2.35")
    assert units.quantize("2.344", 2) == Decimal("2.34")
    assert units.format_number(Decimal("5.00")) == "5"
    assert units.format_number(Decimal("334.450944"), 2) == "334.45"
    assert units.format_number(0) == "0"


def test_unit_words_cover_the_display_vocabulary() -> None:
    assert units.unit_words("katha") == ("katha", "কাঠা")
    assert units.unit_words("sqm") == ("sqm", "বর্গমিটার")
    assert units.unit_words("ft") == ("ft", "ফুট")
    assert units.unit_words("unknown") == ("unknown", "unknown")


def test_unknown_units_are_rejected() -> None:
    with pytest.raises(units.UnitError):
        units.area_to_m2(1, "kani")
    with pytest.raises(units.UnitError):
        units.length_to_m(1, "cubit")


def test_booleans_are_not_numbers() -> None:
    with pytest.raises(units.UnitError):
        units.area_to_m2(True, "katha")


def test_unparseable_values_are_rejected() -> None:
    with pytest.raises(units.UnitError):
        units.area_to_m2("not-a-number", "katha")
