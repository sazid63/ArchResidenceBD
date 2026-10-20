"""Deterministic answer parser for the question engine (W1.4).

Free text is parsed here — never by a model first (plan §2.2, §8): chips, numbers and
choices are shortcuts, and a *deterministic* parser handles the sloppy cases the training
class exercises (Bangla digits, BN/EN/Banglish yes-no, unit words, "don't know"). When the
text genuinely cannot be read, the result is ``escalate`` — the orchestrator (W1.10) may
ask a model, and the engine accepts the model's value through ``accept_external`` with
``confidence: low``. Nothing in this module touches the network or a clock.

Bare numbers on a unit question mean the project's **display unit** (the unit the app is
already showing) and are recorded at ``medium`` confidence; the reply always echoes the
canonical value, so a wrong unit is visible immediately. An explicit unit always wins.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from .. import units
from .flow import Question

DECISIONS = ("accept", "skip", "default", "ask_again", "escalate")

#: Schema-level text limits the parser must respect (question engine, not the spec engine).
TEXT_LIMITS = {"/project/name": 120}

#: Integer bounds per pointer (the Building Spec's own bounds; storeys 1..20 per schema).
INTEGER_RANGES: dict[str, tuple[int, int]] = {
    "/building/storeys/count": (1, 20),
    "/building/unitsPerFloor": (1, 20),
    "/phases/floor-<n>/data/unitsPerFloor": (1, 20),
    "/phases/floor-<n>/data/bedroomsPerUnit": (1, 20),
}

_BN_DIGITS = "০১২৩৪৫৬৭৮৯"
_BN_DIGIT_MAP = str.maketrans(_BN_DIGITS, "0123456789")
_BN_DIGIT_MAP_REVERSE = str.maketrans("0123456789", _BN_DIGITS)

NUMBER_WORDS: dict[str, int] = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
}

BN_NUMBER_WORDS: dict[str, int] = {
    "এক": 1,
    "দুই": 2,
    "দুইটা": 2,
    "তিন": 3,
    "চার": 4,
    "পাঁচ": 5,
    "পাচ": 5,
    "ছয়": 6,
    "সাত": 7,
    "আট": 8,
    "নয়": 9,
    "দশ": 10,
    "এগারো": 11,
    "বারো": 12,
    "তেরো": 13,
    "চৌদ্দ": 14,
    "পনেরো": 15,
    "ষোলো": 16,
    "সতেরো": 17,
    "আঠারো": 18,
    "উনিশ": 19,
    "বিশ": 20,
}

BANGLISH_NUMBER_WORDS: dict[str, int] = {
    "ek": 1,
    "dui": 2,
    "tin": 3,
    "char": 4,
    "panch": 5,
    "pach": 5,
    "choy": 6,
    "saat": 7,
    "aat": 8,
    "noy": 9,
    "dosh": 10,
}

_ALL_NUMBER_WORDS: dict[str, int] = {**NUMBER_WORDS, **BN_NUMBER_WORDS, **BANGLISH_NUMBER_WORDS}

#: Fractional quantifiers. These are expanded to a decimal *before* number extraction;
#: a hint that survives expansion (e.g. "সাড়ে কাঠা" with no base number) still escalates.
#: The app must never silently drop the fractional part: "সাড়ে ৫" is 5.5, not 5.
_FRACTION_HINTS = ("সাড়ে", "সাড়ে", "দেড়", "দেড়", "আড়াই", "আড়াই", "সোয়া", "সোয়া", "পৌনে", "half")
_FRACTION_PREFIXES: dict[str, Decimal] = {
    "সাড়ে": Decimal("0.5"),
    "সাড়ে": Decimal("0.5"),
    "sare": Decimal("0.5"),
    "sarey": Decimal("0.5"),
    "sara": Decimal("0.5"),
    "সোয়া": Decimal("0.25"),
    "সোয়া": Decimal("0.25"),
    "sowa": Decimal("0.25"),
    "পৌনে": Decimal("-0.25"),
    "poune": Decimal("-0.25"),
}
_FRACTION_STANDALONE: dict[str, Decimal] = {
    "দেড়": Decimal("1.5"),
    "দেড়": Decimal("1.5"),
    "dedh": Decimal("1.5"),
    "আড়াই": Decimal("2.5"),
    "আড়াই": Decimal("2.5"),
    "arai": Decimal("2.5"),
    "সোয়া": Decimal("1.25"),
    "sowa": Decimal("1.25"),
    "পৌনে": Decimal("0.75"),
    "poune": Decimal("0.75"),
}

YES_WORDS = (
    "yes",
    "y",
    "yeah",
    "yep",
    "yup",
    "sure",
    "ok",
    "okay",
    "true",
    "ha",
    "haa",
    "han",
    "hyan",
    "hae",
    "ache",
    "ase",
    "korbo",
    "lagbe",
    "chai",
    "হ্যাঁ",
    "হা",
    "জি",
    "আছে",
    "করব",
    "লাগবে",
    "চাই",
    "হবে",
    "ঠিক আছে",
)

NO_WORDS = (
    "no",
    "n",
    "nope",
    "nah",
    "na",
    "naa",
    "nahi",
    "false",
    "না",
    "নেই",
    "লাগবে না",
    "চাই না",
    "করব না",
    "হবে না",
    "দরকার নেই",
)

DONT_KNOW_PHRASES = (
    "don't know",
    "dont know",
    "do not know",
    "no idea",
    "not sure",
    "unsure",
    "no clue",
    "can't say",
    "cannot say",
    "unknown",
    "skip",
    "pass",
    "later",
    "no answer",
    "জানি না",
    "জানা নেই",
    "মনে নেই",
    "নিশ্চিত না",
    "নিশ্চিত নই",
    "বলতে পারব না",
    "পারব না",
    "পরে বলব",
    "বাদ দিন",
    "স্কিপ",
    "jani na",
    "janina",
    "jani naa",
    "mone nei",
    "thik jani na",
    "nishchit na",
    "bolte parbo na",
    "pore bolbo",
    "skip koro",
)

DECIDE_PHRASES = (
    "you decide",
    "you choose",
    "your choice",
    "whatever",
    "default",
    "as you like",
    "up to you",
    "your call",
    "recommend",
    "suggest",
    "আপনি ঠিক করুন",
    "আপনি দেখুন",
    "আপনার পছন্দ",
    "যেটা ভালো",
    "যা ভালো মনে হয়",
    "আপনি বলুন",
    "ডিফল্ট",
    "apni dekhen",
    "apni thik korun",
    "ja bhalo mone hoy",
)

#: Unit aliases -> internal unit code. Longest alias wins (``square feet`` before ``ft``).
UNIT_ALIASES: dict[str, str] = {
    "square meter": "sqm",
    "square meters": "sqm",
    "square metre": "sqm",
    "square metres": "sqm",
    "sq m": "sqm",
    "sqm": "sqm",
    "m2": "m2",
    "বর্গমিটার": "sqm",
    "বর্গ মিটার": "sqm",
    "square feet": "sqft",
    "square foot": "sqft",
    "square ft": "sqft",
    "sq ft": "sqft",
    "sqft": "sqft",
    "sft": "sqft",
    "বর্গফুট": "sqft",
    "বর্গ ফুট": "sqft",
    "katha": "katha",
    "kattah": "katha",
    "কাঠা": "katha",
    "shotok": "shotok",
    "shotangsho": "shotok",
    "decimal": "shotok",
    "শতক": "shotok",
    "শতাংশ": "shotok",
    "bigha": "bigha",
    "বিঘা": "bigha",
    "gonda": "gonda",
    "গন্ডা": "gonda",
    "গণ্ডা": "gonda",
    "kilopascal": "kPa",
    "kilopascals": "kPa",
    "kpa": "kPa",
    "কিলোপ্যাসকেল": "kPa",
    "m": "m",
    "meter": "m",
    "meters": "m",
    "metre": "m",
    "metres": "m",
    "মিটার": "m",
    "ft": "ft",
    "feet": "ft",
    "foot": "ft",
    "ফুট": "ft",
    "inch": "inch",
    "inches": "inch",
    "ইঞ্চি": "inch",
    "millimeter": "mm",
    "millimeters": "mm",
    "millimetre": "mm",
    "mm": "mm",
    "মিলিমিটার": "mm",
    "taka": "BDT",
    "tk": "BDT",
    "৳": "BDT",
    "টাকা": "BDT",
}

_UNIT_ALIASES_BY_LENGTH = sorted(UNIT_ALIASES, key=len, reverse=True)

DIMENSION = {
    "sqm": "area",
    "m2": "area",
    "sqft": "area",
    "katha": "area",
    "shotok": "area",
    "bigha": "area",
    "gonda": "area",
    "m": "length",
    "ft": "length",
    "inch": "length",
    "mm": "length",
    "kPa": "pressure",
    "BDT": "money",
}

CANONICAL_DIMENSION = {"m": "length", "m2": "area", "mm": "length", "kPa": "pressure", "BDT": "money"}

_CANONICAL_DECIMALS = {"m2": 2, "m": 3, "mm": 2, "kPa": 2, "BDT": 2}

_BANGLA_CHAR = r"\u0980-\u09ff"


class ParseError(RuntimeError):
    """The parser itself was misused (a bug, not a user answer)."""


@dataclass(frozen=True)
class ParseResult:
    """One parsed answer. ``value`` is always in the question's **canonical** unit."""

    decision: str
    value: Any = None
    unit: str | None = None
    as_entered: str = ""
    reason: str = ""
    candidates: tuple[str, ...] = ()
    bounds: tuple[int, int] | None = None
    used_display_unit: bool = False

    def __post_init__(self) -> None:
        if self.decision not in DECISIONS:
            raise ParseError(f"unknown parse decision {self.decision!r}")


def normalize(text: str) -> str:
    """Fold Bangla digits, quotes, case and whitespace — the one matching form."""
    value = unicodedata.normalize("NFKC", str(text))
    value = value.translate(_BN_DIGIT_MAP)
    value = (
        value.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .replace("\u00a0", " ")
    )
    value = value.casefold()
    value = re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value.strip(" \t.,;:!?।")


def bn_digits(text: str) -> str:
    """Render ASCII digits as Bengali numerals (chat replies in Bangla)."""
    return text.translate(_BN_DIGIT_MAP_REVERSE)


def _contains(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    pattern = rf"(?<![{_BANGLA_CHAR}\w]){re.escape(needle)}(?![{_BANGLA_CHAR}\w])"
    return re.search(pattern, haystack) is not None


def _any_phrase(norm: str, phrases: tuple[str, ...]) -> bool:
    return any(_contains(norm, normalize(phrase)) for phrase in phrases)


def _base_label(label: str) -> str:
    """Drop a trailing parenthetical: 'DNCC (Dhaka North City)' -> 'DNCC'."""
    return re.sub(r"\s*\([^)]*\)\s*", " ", label).strip()


def _find_unit(norm: str) -> str | None:
    for alias in _UNIT_ALIASES_BY_LENGTH:
        if _contains(norm, alias):
            return UNIT_ALIASES[alias]
    return None


def _numbers(norm: str) -> list[Decimal]:
    out = []
    for token in re.findall(r"\d+(?:\.\d+)?", norm):
        try:
            out.append(Decimal(token))
        except ArithmeticError:  # pragma: no cover - regex guarantees a number
            continue
    return out


def _decimal_text(value: Decimal) -> str:
    """Render a Decimal without exponent or needless trailing zeros."""
    text = format(value.normalize(), "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def _number_token(token: str) -> Decimal | None:
    token = token.strip(" \t.,;:!?।")
    if re.fullmatch(r"\d+(?:\.\d+)?", token):
        return Decimal(token)
    value = _ALL_NUMBER_WORDS.get(token)
    return Decimal(value) if value is not None else None


def _expand_fractions(norm: str) -> str:
    """Turn BN/EN fractional phrases into decimal numbers before extraction.

    ``সাড়ে ৫`` -> ``5.5``, ``পৌনে পাঁচ`` -> ``4.75``, ``5 and a half`` -> ``5.5``.
    A fraction word with no resolvable base (``সাড়ে কাঠা``) is left in place so the
    caller can escalate instead of guessing.
    """
    # English "N and a half" / "N and half", including number words.
    def english_half(match: re.Match[str]) -> str:
        base = _number_token(match.group(1))
        if base is None:
            return match.group(0)
        return _decimal_text(base + Decimal("0.5"))

    norm = re.sub(
        r"(?<!\w)(\d+(?:\.\d+)?|[A-Za-z]+)\s+and\s+(?:a\s+)?half(?!\w)",
        english_half,
        norm,
        flags=re.IGNORECASE,
    )

    # Bengali/Banglish prefix fractions: সাড়ে ৫, পৌনে পাঁচ, sowa 5.
    for word, delta in sorted(_FRACTION_PREFIXES.items(), key=lambda item: len(item[0]), reverse=True):
        pattern = re.compile(rf"(?<![\w\u0980-\u09ff]){re.escape(word)}\s+(\S+)")

        def prefix(match: re.Match[str], delta: Decimal = delta) -> str:
            base = _number_token(match.group(1))
            if base is None:
                return match.group(0)
            value = base + delta
            if value <= 0:
                return match.group(0)
            return _decimal_text(value)

        norm = pattern.sub(prefix, norm)

    # Standalone fractions: দেড়, আড়াই, half.
    for word, value in sorted(_FRACTION_STANDALONE.items(), key=lambda item: len(item[0]), reverse=True):
        norm = re.sub(
            rf"(?<![\w\u0980-\u09ff]){re.escape(word)}(?![\w\u0980-\u09ff])",
            _decimal_text(value),
            norm,
        )
    norm = re.sub(r"(?<!\w)half(?!\w)", "0.5", norm)
    return norm


def _leading_number_word(norm: str) -> str:
    """Replace a leading number word ('five katha', 'পাঁচ কাঠা', 'panch katha')."""
    first, _, rest = norm.partition(" ")
    if first in _ALL_NUMBER_WORDS:
        return f"{_ALL_NUMBER_WORDS[first]} {rest}".strip()
    return norm


def _feet_inches(norm: str) -> tuple[Decimal, str] | None:
    match = re.search(
        rf"(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|ফুট|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|ইঞ্চি|\")",
        norm,
    )
    if not match:
        return None
    feet = Decimal(match.group(1))
    inches = Decimal(match.group(2))
    return feet + inches / Decimal(12), f"{units.format_number(feet)} ft {units.format_number(inches)} in"


def _storey_count(norm: str) -> int | None:
    match = re.search(r"\bg\s*\+\s*(\d{1,2})\b", norm) or re.search(
        r"\bground\s*(?:\+|plus)\s*(\d{1,2})\b", norm
    )
    if match:
        return int(match.group(1)) + 1
    if re.search(r"\b(?:g|ground)\b", norm) and not _numbers(norm):
        return 1
    return None


def _option_hits(question: Question, norm: str) -> list[dict[str, Any]]:
    def keys(option: dict[str, Any], *, full: bool) -> set[str]:
        label = option.get("label") or {}
        raw_value = str(option.get("value", ""))
        out = {normalize(raw_value), normalize(raw_value.replace("-", " "))}
        for lang in ("en", "bn"):
            text = str(label.get(lang, ""))
            out.add(normalize(text))
            if not full:
                out.add(normalize(_base_label(text)))
        return {item for item in out if item}

    exact = [option for option in question.options if norm in keys(option, full=True)]
    if exact:
        return list(exact)

    forward = [
        option
        for option in question.options
        if any(_contains(norm, key) for key in keys(option, full=False))
    ]
    if forward:
        return list(forward)

    if len(norm) >= 4:
        reverse = [
            option
            for option in question.options
            if any(_contains(key, norm) for key in keys(option, full=True))
        ]
        if reverse:
            return list(reverse)
    return []


def _parse_choice(question: Question, norm: str, raw: str) -> ParseResult:
    hits = _option_hits(question, norm)
    if len(hits) == 1:
        return ParseResult("accept", value=hits[0]["value"], as_entered=raw)
    if len(hits) > 1:
        return ParseResult(
            "ask_again",
            reason="ambiguous_choice",
            candidates=tuple(option["value"] for option in hits),
            as_entered=raw,
        )
    if _any_phrase(norm, DONT_KNOW_PHRASES):
        return ParseResult("skip", reason="dont_know", as_entered=raw)
    if _any_phrase(norm, DECIDE_PHRASES):
        return ParseResult("default", reason="user_delegated", as_entered=raw)
    return ParseResult("escalate", reason="unrecognised_choice", as_entered=raw)


def _parse_multi_choice(question: Question, norm: str, raw: str) -> ParseResult:
    parts = [part.strip() for part in re.split(r"[,;]|\band\b|\bএবং\b|\bআর\b", norm) if part.strip()]
    if not parts:
        return ParseResult("ask_again", reason="empty", as_entered=raw)
    picked: list[str] = []
    for part in parts:
        hits = _option_hits(question, part)
        if len(hits) != 1:
            return ParseResult("escalate", reason="unrecognised_choice", as_entered=raw)
        if hits[0]["value"] not in picked:
            picked.append(hits[0]["value"])
    return ParseResult("accept", value=picked, as_entered=raw)


def _parse_yes_no(norm: str, raw: str) -> ParseResult:
    if _any_phrase(norm, DONT_KNOW_PHRASES):
        return ParseResult("skip", reason="dont_know", as_entered=raw)
    yes = any(_contains(norm, normalize(word)) for word in YES_WORDS)
    no = any(_contains(norm, normalize(word)) for word in NO_WORDS)
    if yes and no:
        # "করব না" / "yes, no" — a trailing negation settles the answer.
        if re.search(r"(?:^|\s)(না|na|no|nah|nope)$", norm):
            return ParseResult("accept", value=False, as_entered=raw)
        return ParseResult("ask_again", reason="ambiguous_yesno", as_entered=raw)
    if yes:
        return ParseResult("accept", value=True, as_entered=raw)
    if no:
        return ParseResult("accept", value=False, as_entered=raw)
    if _any_phrase(norm, DECIDE_PHRASES):
        return ParseResult("default", reason="user_delegated", as_entered=raw)
    return ParseResult("escalate", reason="unrecognised_yesno", as_entered=raw)


def _display_unit(question: Question, area_display: str, length_display: str) -> str | None:
    dimension = CANONICAL_DIMENSION.get(question.unit_code or "")
    if dimension == "area":
        return area_display if area_display in units.AREA_TO_M2 else "sqm"
    if dimension == "length":
        return length_display if length_display in units.LENGTH_TO_M else "m"
    if dimension == "pressure":
        return "kPa"
    if dimension == "money":
        return "BDT"
    if question.unit_code == "mm":
        return "mm"
    return None


def canonical_value(question: Question, value: Decimal | int | float, unit: str) -> float:
    canonical = question.unit_code
    if canonical in (None, ""):
        return float(units.quantize(value, 2))
    if canonical == "m2":
        return float(units.quantize(units.area_to_m2(value, unit), 2))
    if canonical == "m":
        return float(units.quantize(units.length_to_m(value, unit), 3))
    if canonical == "mm":
        return float(units.quantize(units.length_to_m(value, "mm") * 1000, 2))
    # kPa and BDT are canonical as-is (no conversion factor exists in v0).
    return float(units.quantize(value, _CANONICAL_DECIMALS.get(canonical, 2)))


def _parse_number(
    question: Question,
    norm: str,
    raw: str,
    *,
    area_display: str,
    length_display: str,
) -> ParseResult:
    if _any_phrase(norm, DONT_KNOW_PHRASES):
        return ParseResult("skip", reason="dont_know", as_entered=raw)
    norm = _expand_fractions(norm)
    if any(_contains(norm, hint) for hint in _FRACTION_HINTS):
        return ParseResult("escalate", reason="unparseable_fraction", as_entered=raw)

    norm = _leading_number_word(norm)
    integer = question.type == "integer"
    if integer and question.maps_to == "/building/storeys/count":
        storeys = _storey_count(norm)
        if storeys is not None:
            bounds = INTEGER_RANGES.get(question.maps_to)
            if bounds and not (bounds[0] <= storeys <= bounds[1]):
                return ParseResult(
                    "ask_again", reason="out_of_range", bounds=bounds, as_entered=raw
                )
            return ParseResult("accept", value=storeys, as_entered=f"{storeys} floors")

    if re.search(r"-\s*\d", norm):
        return ParseResult("ask_again", reason="out_of_range", as_entered=raw)

    value: Decimal | None = None
    entered_unit: str | None = None
    if question.unit_code == "m":
        feet = _feet_inches(norm)
        if feet is not None:
            value = feet[0]
            entered_unit = "ft"

    if value is None:
        numbers = _numbers(norm)
        if not numbers:
            if _any_phrase(norm, DECIDE_PHRASES):
                return ParseResult("default", reason="user_delegated", as_entered=raw)
            return ParseResult("escalate", reason="unparseable_number", as_entered=raw)
        if len(numbers) > 1:
            return ParseResult("ask_again", reason="multiple_numbers", as_entered=raw)
        value = numbers[0]

    found_unit = _find_unit(norm)
    if found_unit is not None:
        entered_unit = found_unit
    used_display = False
    if entered_unit is None:
        entered_unit = _display_unit(question, area_display, length_display)
        used_display = entered_unit is not None

    if integer:
        if entered_unit is not None and found_unit is not None:
            return ParseResult("ask_again", reason="unexpected_unit", as_entered=raw)
        if value != value.to_integral_value():
            return ParseResult("ask_again", reason="whole_number", as_entered=raw)
        number = int(value)
        bounds = INTEGER_RANGES.get(question.maps_to)
        if bounds and not (bounds[0] <= number <= bounds[1]):
            return ParseResult("ask_again", reason="out_of_range", bounds=bounds, as_entered=raw)
        if number <= 0:
            return ParseResult("ask_again", reason="out_of_range", as_entered=raw)
        return ParseResult("accept", value=number, unit=None, as_entered=str(number))

    dimension = CANONICAL_DIMENSION.get(question.unit_code or "")
    if entered_unit is not None and dimension is not None:
        if DIMENSION.get(entered_unit) != dimension:
            return ParseResult(
                "ask_again",
                reason="wrong_dimension",
                unit=entered_unit,
                as_entered=raw,
            )

    if value <= 0:
        return ParseResult("ask_again", reason="out_of_range", as_entered=raw)

    unit_code = entered_unit or question.unit_code or ""
    canonical = canonical_value(question, value, unit_code) if question.unit_code else float(value)
    word = units.UNIT_WORDS.get(unit_code, (unit_code, unit_code))[0]
    as_entered = f"{units.format_number(value, 2)} {word}".strip() if unit_code else units.format_number(value)
    return ParseResult(
        "accept",
        value=canonical,
        unit=unit_code,
        as_entered=as_entered,
        used_display_unit=used_display,
    )


def parse_answer(
    question: Question,
    text: str,
    *,
    area_display: str = "sqm",
    length_display: str = "m",
) -> ParseResult:
    """Parse one free-text answer against a flow-book question.

    The result never raises on user input: it says ``accept``, ``skip`` (don't know),
    ``default`` (user delegated), ``ask_again`` (clarification with candidates/bounds) or
    ``escalate`` (the model seam). Only a programming error (unknown question type) raises.
    """
    raw = " ".join(str(text).split()).strip()
    norm = normalize(text)
    if not norm:
        return ParseResult("ask_again", reason="empty")

    kind = question.type
    if kind == "choice":
        return _parse_choice(question, norm, raw)
    if kind == "multi_choice":
        return _parse_multi_choice(question, norm, raw)
    if kind == "yes_no":
        return _parse_yes_no(norm, raw)
    if kind in ("number", "integer"):
        return _parse_number(
            question, norm, raw, area_display=area_display, length_display=length_display
        )
    if kind in ("text", "file"):
        if _any_phrase(norm, DONT_KNOW_PHRASES):
            return ParseResult("skip", reason="dont_know", as_entered=raw)
        limit = TEXT_LIMITS.get(question.maps_to)
        if limit is not None and len(raw) > limit:
            return ParseResult("ask_again", reason="too_long", bounds=(0, limit), as_entered=raw)
        if kind == "file" and len(raw) > 500:
            return ParseResult("ask_again", reason="too_long", bounds=(0, 500), as_entered=raw)
        return ParseResult("accept", value=raw, as_entered=raw)
    raise ParseError(f"{question.id}: unsupported question type {kind!r}")
