"""Land & length units (BD standards) — deterministic Decimal conversions.

Storage is canonical metric (``m``, ``m2`` — schema law: "storage is m2"); this module
converts at the input/display boundary. Standards pinned (Dhaka practice, matching the
frozen example ``new-project.json``: 5 katha → 334.45 m2):

| Unit | Definition | In m2 |
|---|---|---|
| `sqft` | international foot, exact | 0.09290304 |
| `katha` | 720 sqft | 66.89018880 |
| `shotok` (= decimal) | 435.6 sqft; 1 acre = 100 shotok | 40.468564224 |
| `bigha` | 20 katha = 14 400 sqft | 1337.803776 |
| `gonda` | 1/20 katha = 36 sqft | 3.344509440 |

Lengths: ``m``, ``ft`` (0.3048), ``inch`` (0.0254). Everything is ``Decimal`` — no
binary-float drift, so generated text and stored values are reproducible byte-for-byte.
The RAJUK gazette tables round katha to 67 m² for their own thresholds; those numbers
stay in the rule pack as law — this module never rewrites them.

**Not included: ``kani``.** The plan lists kani among the land units, but kani is
region-dependent (its decimal value is not fixed by a national standard). Adding a
factor would invent precision, so it is deliberately absent until an authoritative
source is pinned — the same honesty rule the rest of the project follows. ``shotok``
and ``decimal`` are aliases (1 shotok = 1 decimal = 435.6 sqft).
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

SQFT_M2 = Decimal("0.09290304")
KATHA_M2 = SQFT_M2 * 720
SHOTOK_M2 = SQFT_M2 * Decimal("435.6")
BIGHA_M2 = KATHA_M2 * 20
GONDA_M2 = KATHA_M2 / 20
FT_M = Decimal("0.3048")
INCH_M = Decimal("0.0254")

AREA_TO_M2: dict[str, Decimal] = {
    "sqm": Decimal(1),
    "m2": Decimal(1),
    "sqft": SQFT_M2,
    "katha": KATHA_M2,
    "shotok": SHOTOK_M2,
    "decimal": SHOTOK_M2,
    "bigha": BIGHA_M2,
    "gonda": GONDA_M2,
}

LENGTH_TO_M: dict[str, Decimal] = {
    "m": Decimal(1),
    "meter": Decimal(1),
    "metre": Decimal(1),
    "ft": FT_M,
    "feet": FT_M,
    "foot": FT_M,
    "inch": INCH_M,
}

#: Display words per unit code: (English, Bangla). Hand-authored, never machine-translated.
#: Both canonical codes (``m2``, ``m``) and the flow book's display codes (``sqm``, ``ft``)
#: appear so generated chat text is correct in either vocabulary.
UNIT_WORDS: dict[str, tuple[str, str]] = {
    "m2": ("sqm", "বর্গমিটার"),
    "sqm": ("sqm", "বর্গমিটার"),
    "sqft": ("sqft", "বর্গফুট"),
    "katha": ("katha", "কাঠা"),
    "shotok": ("shotok", "শতক"),
    "decimal": ("shotok", "শতক"),
    "bigha": ("bigha", "বিঘা"),
    "gonda": ("gonda", "গন্ডা"),
    "m": ("m", "মিটার"),
    "meter": ("m", "মিটার"),
    "metre": ("m", "মিটার"),
    "ft": ("ft", "ফুট"),
    "feet": ("ft", "ফুট"),
    "foot": ("ft", "ফুট"),
    "inch": ("inch", "ইঞ্চি"),
    "kPa": ("kPa", "কিলোপ্যাসকেল"),
}

__all__ = [
    "AREA_TO_M2",
    "BIGHA_M2",
    "FT_M",
    "GONDA_M2",
    "INCH_M",
    "KATHA_M2",
    "LENGTH_TO_M",
    "SHOTOK_M2",
    "SQFT_M2",
    "UNIT_WORDS",
    "UnitError",
    "area_from_m2",
    "area_to_m2",
    "format_number",
    "length_from_m",
    "length_to_m",
    "quantize",
    "unit_words",
]


class UnitError(ValueError):
    """Unknown unit or unusable value."""


def _decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise UnitError(f"cannot use a boolean as a value: {value!r}")
    if isinstance(value, (int, float, str)):
        try:
            return Decimal(str(value))
        except ArithmeticError as exc:  # invalid literal
            raise UnitError(f"cannot parse {value!r} as a number") from exc
    raise UnitError(f"cannot use {type(value).__name__} as a value")


def area_to_m2(value: Any, unit: str) -> Decimal:
    """Convert an area to canonical m2."""
    key = unit.strip().lower()
    if key not in AREA_TO_M2:
        raise UnitError(f"unknown area unit {unit!r} (known: {', '.join(sorted(AREA_TO_M2))})")
    return _decimal(value) * AREA_TO_M2[key]


def area_from_m2(m2: Any, unit: str) -> Decimal:
    """Convert canonical m2 to a display unit."""
    key = unit.strip().lower()
    if key not in AREA_TO_M2:
        raise UnitError(f"unknown area unit {unit!r} (known: {', '.join(sorted(AREA_TO_M2))})")
    return _decimal(m2) / AREA_TO_M2[key]


def length_to_m(value: Any, unit: str) -> Decimal:
    """Convert a length to canonical m."""
    key = unit.strip().lower()
    if key not in LENGTH_TO_M:
        raise UnitError(f"unknown length unit {unit!r} (known: {', '.join(sorted(LENGTH_TO_M))})")
    return _decimal(value) * LENGTH_TO_M[key]


def length_from_m(m: Any, unit: str) -> Decimal:
    """Convert canonical m to a display unit."""
    key = unit.strip().lower()
    if key not in LENGTH_TO_M:
        raise UnitError(f"unknown length unit {unit!r} (known: {', '.join(sorted(LENGTH_TO_M))})")
    return _decimal(m) / LENGTH_TO_M[key]


def unit_words(unit: str) -> tuple[str, str]:
    """Display words (English, Bangla) for a unit code; unknown codes pass through unchanged."""
    return UNIT_WORDS.get(unit, (unit, unit))


def quantize(value: Any, places: int = 2) -> Decimal:
    """Round half-up to ``places`` decimals — the one rounding rule everywhere."""
    quantum = Decimal(1).scaleb(-places)
    return _decimal(value).quantize(quantum, rounding=ROUND_HALF_UP)


def format_number(value: Any, places: int = 2) -> str:
    """Plain decimal text, trailing zeros trimmed (5.00 → '5', 334.45 → '334.45')."""
    text = f"{quantize(value, places):f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"
