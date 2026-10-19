"""Sloppy-input mutation operators (W1.5) - deterministic, seeded, hand-authored.

The plan's sloppy-input class (plan §7): Banglish, typos, unit confusion, "don't know",
off-topic - and the required behaviour: it must trigger defaults or clarification, **never
stall**. Each operator transforms a clean answer text and declares the decision a correct
parse must reach:

===============  =================================================  =================
Operator         What it does                                       Decision
===============  =================================================  =================
bangla_digits    ASCII digits -> Bangla digits                      accept
banglish         romanised Bangla number (integer 1-10) / yes-no   accept
unit_alt         area -> katha/shotok/bigha, length m -> ft        accept
                 (via the units module)
typo             seeded adjacent-letter swap in a word             accept
omit_unit        drops the unit word                                ask_again
absurd           negative / zero value                              ask_again
affirm_sloppy    "yep" / "হুম" style yes-no answers                  accept
maybe            "maybe" / "sometimes"                              ask_again
label_native     choice answered with the Bangla label              accept
partial          truncated choice label                             accept (medium)
typo_label       seeded typo in the choice label                    accept
unknown_choice   an option outside the list                         escalate
as_given         text with a seeded typo, recorded as given        accept
whitespace       padded text                                        accept (trimmed)
dont_know        "don't know" / "জানি না" / "janina"               fallback if the
                                                                    question has one,
                                                                    else ask_again
off_topic        unrelated question                                 escalate
===============  =================================================  =================

Every operator returns ``{"operator", "text", "decision", "detail"}`` where ``detail``
carries everything a verifier needs to recompute the answer's canonical value - so a
scripted sloppy record is checked by re-derivation, not by trust.
"""

from __future__ import annotations

import random
from typing import Any

from ..units import (
    area_from_m2,
    area_to_m2,
    format_number,
    length_from_m,
    length_to_m,
    quantize,
    unit_words,
)

__all__ = [
    "OperatorNotApplicable",
    "alternative_units",
    "applicable_operators",
    "apply_operator",
    "bn_digits",
]

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")

#: Romanised Bangla counting words used by the ``banglish`` operator (1-10). A word
#: table, not a transliterator: only values we can spell unambiguously are generated.
_BN_NUMBERS = {
    1: "ek",
    2: "dui",
    3: "tin",
    4: "char",
    5: "panch",
    6: "choy",
    7: "shat",
    8: "at",
    9: "noy",
    10: "dosh",
}

_DONT_KNOW = {
    "en": ("not sure", "don't know", "no idea", "can't say"),
    "bn": ("জানি না", "জানি না ভাই", "মনে নাই", "ঠিক জানা নাই", "janina", "jani na"),
}
_OFF_TOPIC = {
    "en": ("what's the weather today?", "where is the nearest bank?", "can you book me a car?"),
    "bn": (
        "আজকের আবহাওয়া কেমন?",
        "কাছাকাছি ব্যাংক কোথায়?",
        "গাড়ি বুক করা যায়?",
        "ajker abohawa kemon?",
        "kacher bank kothay?",
    ),
}
_AFFIRM_SLOPPY = {
    "en": ("yep", "yeah", "yes yes", "yup"),
    "bn": ("হুম", "হ্যা", "হ্যাঁ হ্যাঁ", "ওই তো", "ha", "hae"),
}
_MAYBE = {
    "en": ("maybe", "sometimes", "not always"),
    "bn": ("হয়তো", "মাঝে মাঝে", "কখনো কখনো", "hoyto", "majhe majhe"),
}
_UNKNOWN_CHOICE = {
    "en": ("my union office handles it", "someone at the ward office told me", "it is under the old committee"),
    "bn": ("ইউনিয়ন অফিস বলে", "ওয়ার্ড অফিসের লোক বলেছে", "পুরান কমিটির অধীনে"),
}

#: Display codes that mean the same physical unit (``m2`` is canonical; ``sqm`` is display).
_SAME_UNIT = {"m2": {"sqm"}, "sqm": {"m2"}, "m": {"meter", "metre"}, "ft": {"feet", "foot"}}

_OPERATORS_BY_KIND = {
    "number": ("bangla_digits", "unit_alt", "typo", "omit_unit", "absurd", "dont_know", "off_topic"),
    "integer": ("bangla_digits", "banglish", "typo", "dont_know", "absurd", "off_topic"),
    "yes_no": ("affirm_sloppy", "banglish", "maybe", "dont_know", "off_topic"),
    "choice": ("partial", "typo_label", "dont_know", "unknown_choice"),
    "text": ("as_given", "whitespace", "dont_know", "off_topic"),
}


class OperatorNotApplicable(ValueError):
    """This operator does not fit this answer (e.g. unit_alt without alternative units)."""


def bn_digits(text: str) -> str:
    """ASCII digits to Bangla digits (display only - canonical values stay ASCII)."""
    return text.translate(BN_DIGITS)


def _rng(*seed_parts: str) -> random.Random:
    return random.Random("::".join(seed_parts))


def _pick(lang: str, table: dict[str, tuple[str, ...]], seed: str) -> str:
    return _rng(seed).choice(table[lang])


def _number_text(lang: str, raw: str, unit: str | None) -> str:
    if unit is None:
        return raw
    en_word, bn_word = unit_words(unit)
    if lang == "bn":
        return f"{bn_digits(raw)} {bn_word}"
    return f"{raw} {en_word}"


def _letters(text: str) -> list[int]:
    return [index for index, ch in enumerate(text) if ch.isalpha()]


def _typo(text: str, seed: str) -> tuple[str, int]:
    """Swap two adjacent letters at a seeded position; returns (text, position)."""
    positions = _letters(text)
    swaps = [index for index in positions if index + 1 in positions and text[index].isalpha()]
    if not swaps:
        if positions:
            at = positions[-1]
            return text[: at + 1] + text[at] + text[at + 1 :], at
        raise OperatorNotApplicable("no letters to typo")
    at = _rng(seed).choice(swaps)
    return text[:at] + text[at + 1] + text[at] + text[at + 2 :], at


def applicable_operators(question: dict[str, Any], base: dict[str, Any]) -> list[str]:
    """The operators that fit this (question, clean answer) pair, in a stable order."""
    return list(_OPERATORS_BY_KIND.get(base["kind"], ()))


def alternative_units(question: dict[str, Any], base: dict[str, Any]) -> list[str]:
    """Display units that are genuinely different from the base unit, in flow-book order."""
    unit = base.get("unit")
    if unit is None:
        return []
    same = _SAME_UNIT.get(unit, set())
    return [
        item
        for item in (question.get("display") or [])
        if item != unit and item not in same
    ]


def apply_operator(
    operator: str,
    *,
    question: dict[str, Any],
    base: dict[str, Any],
    lang: str,
    seed: str,
    unit_target: str | None = None,
) -> dict[str, Any]:
    """Run one sloppy-input operator; raises OperatorNotApplicable when it does not fit."""
    if operator not in applicable_operators(question, base):
        raise OperatorNotApplicable(f"{operator!r} does not fit a {base['kind']!r} answer")
    fallback_kind = (question.get("fallback") or {}).get("kind")
    detail: dict[str, Any] = {}
    decision = "accept"
    text = base["text"]

    if operator == "bangla_digits":
        text = bn_digits(text)

    elif operator == "banglish":
        if base["kind"] == "integer":
            number = int(base["value"])
            word = _BN_NUMBERS.get(number)
            if word is None:
                raise OperatorNotApplicable("Banglish number outside the v0 word table (1-10)")
            text = word
            detail = {"number": number}
        elif base["kind"] == "yes_no":
            text = "ha" if base["value"] else "na"
            detail = {"answer": base["value"]}
        else:  # pragma: no cover - guarded by the applicability table
            raise OperatorNotApplicable(f"banglish does not fit a {base['kind']!r} answer")

    elif operator == "unit_alt":
        unit = base.get("unit")
        display = alternative_units(question, base)
        if unit is None or not display:
            raise OperatorNotApplicable("no alternative display units")
        if unit_target is not None:
            if unit_target not in display:
                raise OperatorNotApplicable(f"{unit_target!r} is not an alternative display unit")
            target = unit_target
        else:
            target = display[_rng(seed).randrange(len(display))]
        if unit == "m2":
            raw = format_number(quantize(area_from_m2(base["value"], target), 2))
            canonical = float(quantize(area_to_m2(raw, target), 2))
        elif unit == "m":
            raw = format_number(quantize(length_from_m(base["value"], target), 2))
            canonical = float(quantize(length_to_m(raw, target), 2))
        else:
            raise OperatorNotApplicable(f"no known conversion {unit} -> {target}")
        text = _number_text(lang, raw, target)
        detail = {"unit": target, "raw": raw, "canonical": canonical}

    elif operator == "typo":
        word_start = 0
        text_part = base["text"]
        if base["kind"] in ("number", "integer") and " " in text_part:
            word_start = text_part.index(" ") + 1
        head, tail = text_part[:word_start], text_part[word_start:]
        tail, at = _typo(tail, seed)
        text = head + tail
        detail = {"position": word_start + at}

    elif operator == "omit_unit":
        if base.get("unit") is None:
            raise OperatorNotApplicable("nothing to omit")
        en_word, bn_word = unit_words(base["unit"])
        for word in (en_word, bn_word):
            text = text.replace(word, "").strip()
        text = " ".join(text.split())
        decision = "ask_again"
        detail = {"omitted": base["unit"]}

    elif operator == "absurd":
        text = "-5" if lang == "en" else "-৫"
        decision = "ask_again"
        detail = {"why": "non-positive"}

    elif operator == "affirm_sloppy":
        text = _pick(lang, _AFFIRM_SLOPPY, seed)

    elif operator == "maybe":
        text = _pick(lang, _MAYBE, seed)
        decision = "ask_again"

    elif operator == "partial":
        option = base.get("option")
        if not option:
            raise OperatorNotApplicable("not a choice answer")
        label = option["label"]["en" if lang == "en" else "bn"]
        keep = 4 if lang == "en" else 3
        if len(label) <= keep:
            raise OperatorNotApplicable("label too short to truncate")
        text = label[:keep]
        detail = {"option": option["value"]}

    elif operator == "typo_label":
        option = base.get("option")
        if not option:
            raise OperatorNotApplicable("not a choice answer")
        label = option["label"]["en" if lang == "en" else "bn"]
        text, at = _typo(label, seed)
        detail = {"option": option["value"], "position": at}

    elif operator == "unknown_choice":
        text = _pick(lang, _UNKNOWN_CHOICE, seed)
        decision = "escalate"

    elif operator == "as_given":
        text, at = _typo(base["text"], seed)
        detail = {"asGiven": text, "position": at}

    elif operator == "whitespace":
        text = f"  {base['text']}  "
        detail = {"trimmed": base["text"]}

    elif operator == "dont_know":
        text = _pick(lang, _DONT_KNOW, seed)
        if fallback_kind:
            decision = "fallback"
            detail = {"fallbackKind": fallback_kind}
        else:
            decision = "ask_again"

    elif operator == "off_topic":
        text = _pick(lang, _OFF_TOPIC, seed)
        decision = "escalate"

    else:  # pragma: no cover - guarded by the applicability table
        raise OperatorNotApplicable(f"unknown operator {operator!r}")

    return {"operator": operator, "text": text, "decision": decision, "detail": detail}
