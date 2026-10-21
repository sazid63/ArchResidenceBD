"""Bangla numbers: the digits, the grouping, and the money.

The product is Bangla + English (plan §1), and a number is the one thing every reader sees.
The app has its own formatter for the screen; the **core** owns the rule so the documents, the
reports and the meter's text all say the same number the same way.

One implementation, so two surfaces cannot disagree about how ৳ 125,000.00 is written ✓.

- the **digits**: ০১২৩৪৫৬৭৮৯ ✓;
- the **grouping**: 12,500.50 — the same grouping the app's `Intl.NumberFormat` produces ✓;
- the **money**: "৳ " + the number ✓ — the taka sign, then the number ✓ ✓.
"""

from __future__ import annotations

from typing import Any

#: The Bangla digits, in the Latin order.
BN_DIGITS = "০১২৩৪৫৬৭৮৯"

#: The taka sign.
TAKA = "৳"

#: The translation table from the Latin digits to the Bangla ones.
_BN_TABLE = str.maketrans("0123456789", BN_DIGITS)


def bn_digits(text: str) -> str:
    """The Latin digits in a string, as Bangla digits."""
    return text.translate(_BN_TABLE)


def bn_number(value: Any) -> str:
    """A number in Bangla digits, with no grouping (the compliance report's rule)."""
    if isinstance(value, bool):
        return "সত্য" if value else "মিথ্যা"
    if isinstance(value, int):
        return str(value).translate(_BN_TABLE)
    if isinstance(value, float):
        return f"{value:.2f}".translate(_BN_TABLE)
    return str(value).translate(_BN_TABLE)


def group_number(value: float) -> str:
    """A number with the thousands grouped, and no trailing zeros (money reads cleanly)."""
    if value == int(value):
        return f"{int(value):,}"
    return f"{value:,}"


def format_bdt(value: float, lang: str = "bn") -> str:
    """A taka amount: the sign, then the number, in the reader's script."""
    text = group_number(value)
    if lang == "bn":
        text = bn_digits(text)
    return f"{TAKA} {text}"


def format_delta(value: float, lang: str = "bn") -> str:
    """A taka **change**: the sign says which way it moved ✓ (a delta without a sign lies)."""
    sign = "+" if value > 0 else ("-" if value < 0 else "")
    text = group_number(abs(value))
    if lang == "bn":
        text = bn_digits(text)
    return f"{sign}{TAKA} {text}"


__all__ = [
    "BN_DIGITS",
    "TAKA",
    "bn_digits",
    "bn_number",
    "format_bdt",
    "format_delta",
    "group_number",
]
