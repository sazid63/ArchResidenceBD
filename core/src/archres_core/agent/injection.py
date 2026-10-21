"""Prompt-injection watch v0 (W1.10, plan §5.8).

External content — fetched pages, imported PDFs, pasted text, retrieved clauses — is
**data, never instructions**. This module provides the two halves of that law:

1. ``scan()`` flags the classic instruction patterns with spans, so a hit is visible and
   can be shown to the user / written to the transcript. A finding never silently refuses
   the user's own request (plan §9: advise, record, proceed) — it raises the guard level
   used by the permission layer (see ``archres_core.agent.tools``).
2. ``fence()`` wraps untrusted text in a quoted block with an explicit trust label and
   neutralizes line-leading role markers, so the model sees a quoted document rather than
   a new turn. Hidden/bidi characters are stripped: they are never meaningful in a price
   list or a clause. The **joiners** are not hidden characters - U+200D is the Bangla
   virama and U+200C the explicit non-joiner - so they are kept in the text and removed
   only for matching, where they must not be able to hide an instruction.

Bengali and Banglish variants are first-class (the product speaks both), and a pattern
must match an imperative, not a bare keyword — "system design" and "the rule says to
ignore setbacks" are not attacks.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Severity order, highest last.
SEVERITIES = ("low", "medium", "high")

#: The **joiners**. In the scripts this product speaks they are letters, not hiding marks:
#: U+200D is the Bangla virama (it forms the conjuncts) and U+200C is the explicit
#: non-joiner. Stripping them would break every conjunct in a Bangla clause, so they are
#: kept in the text - and removed for *matching*, so a joiner cannot hide an instruction
#: from the scanner either.
_JOINERS = re.compile("[\u200c\u200d]")

#: Characters that hide text from a human but not from a model.
_HIDDEN = re.compile(
    "[\u200b\u2060\ufeff\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069]"
)

#: Rule id -> (severity, pattern). Patterns run on the raw text (case-insensitive where noted).
_RULES: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    (
        "instruction_override",
        "high",
        re.compile(
            r"\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,60}"
            r"\b(?:instructions?|prompts?|rules?|directions?|guardrails?)\b"
            r"|(?:আগের|পূর্বের)\s*(?:নির্দেশ|নিয়ম)[^\n]{0,40}(?:উপেক্ষা|ভুলে)"
            r"|(?:উপেক্ষা|ভুলে যাও)[^\n]{0,40}(?:নির্দেশ|নিয়ম)",
            re.IGNORECASE,
        ),
    ),
    (
        "role_marker",
        "medium",
        re.compile(
            r"^[ \t]*(?:system|developer|assistant|tool)[ \t]*:"
            r"|<\|\s*(?:im_start|im_end|system|endoftext)\s*\|>"
            r"|\[/?INST\]"
            r"|^[ \t]*###[ \t]*(?:system|instructions?)\b",
            re.IGNORECASE | re.MULTILINE,
        ),
    ),
    (
        "prompt_exfiltration",
        "high",
        re.compile(
            r"\b(?:show|print|reveal|repeat|output|leak|tell me)\b[^\n]{0,40}"
            r"\b(?:system prompt|your instructions|prompt above|hidden rules|initial prompt)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "tool_bait",
        "high",
        re.compile(
            r"\b(?:run|execute|invoke|call|use)\b[^\n]{0,40}"
            r"\b(?:command|shell|terminal|powershell|bash|tool|script)\b"
            r"|\brm\s+-rf\b"
            r"|\bcurl\s+https?://"
            r"|\bInvoke-WebRequest\b"
            r"|\bos\.system\b",
            re.IGNORECASE,
        ),
    ),
    (
        "credential_request",
        "high",
        re.compile(
            r"\b(?:send|paste|enter|provide|share|type)\b[^\n]{0,40}"
            r"\b(?:password|api[ _-]?key|access token|seed phrase|otp|pin code)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "data_exfiltration",
        "high",
        re.compile(
            r"\b(?:send|post|upload|forward)\b[^\n]{0,60}\bhttps?://",
            re.IGNORECASE,
        ),
    ),
    (
        "encoded_payload",
        "medium",
        re.compile(
            r"\b(?:base64\s+(?:-d|--decode)|frombase64string|atob\s*\()"
            r"|[A-Za-z0-9+/]{80,}={0,2}"
        ),
    ),
    (
        "hidden_text",
        "medium",
        _HIDDEN,
    ),
)

#: Rules whose hit means external content tried to act like a turn.
HIGH_RULES = frozenset(
    {"instruction_override", "prompt_exfiltration", "tool_bait", "credential_request", "data_exfiltration"}
)

EXCERPT_CHARS = 80


@dataclass(frozen=True)
class Finding:
    """One rule hit: what fired, how bad, where, and enough text to review it."""

    rule: str
    severity: str
    start: int
    end: int
    excerpt: str

    def to_dict(self) -> dict:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "start": self.start,
            "end": self.end,
            "excerpt": self.excerpt,
        }


def scan(text: str) -> list[Finding]:
    """All rule hits in ``text``, ordered by position (one finding per rule per match).

    The patterns run against a copy with the **joiners removed** - a joiner inside a word
    must not hide an instruction from the scanner - and the reported spans are the
    **original's**, so an excerpt points at the text the caller holds.
    """
    if not isinstance(text, str) or not text:
        return []
    normalized, offsets = _without_joiners(text)
    findings: list[Finding] = []
    for rule, severity, pattern in _RULES:
        for match in pattern.finditer(normalized):
            start = offsets[match.start()] if match.start() < len(offsets) else len(text)
            end = offsets[match.end() - 1] + 1 if 0 < match.end() <= len(offsets) else len(text)
            findings.append(
                Finding(
                    rule=rule,
                    severity=severity,
                    start=start,
                    end=end,
                    excerpt=_excerpt(text, start, end),
                )
            )
    findings.sort(key=lambda item: (item.start, item.end, item.rule))
    return findings


def _without_joiners(text: str) -> tuple[str, list[int]]:
    """The text with the joiners removed, and the original offset of every kept character."""
    if not _JOINERS.search(text):
        return text, list(range(len(text)))
    out: list[str] = []
    offsets: list[int] = []
    for index, char in enumerate(text):
        if char in "\u200c\u200d":
            continue
        out.append(char)
        offsets.append(index)
    return "".join(out), offsets


def _excerpt(text: str, start: int, end: int) -> str:
    lead = max(0, start - 20)
    tail = min(len(text), end + 20)
    snippet = text[lead:tail].replace("\n", " ")
    snippet = _HIDDEN.sub("", snippet)
    if len(snippet) > EXCERPT_CHARS:
        snippet = snippet[: EXCERPT_CHARS - 1] + "…"
    return snippet


def worst_severity(findings: list[Finding] | tuple[Finding, ...]) -> str | None:
    """Highest severity present, or ``None`` for a clean scan."""
    if not findings:
        return None
    return max((item.severity for item in findings), key=SEVERITIES.index)


def has_high(findings: list[Finding] | tuple[Finding, ...]) -> bool:
    return any(item.severity == "high" for item in findings)


def strip_hidden(text: str) -> str:
    """Remove zero-width/bidi controls (they only exist to hide text from humans).

    The **joiners stay**: they are letters in Bangla, and a clause without its conjuncts is
    not the clause.
    """
    return _HIDDEN.sub("", text)


def fence(text: str, *, source: str) -> str:
    """Wrap untrusted text as a quoted data block the model is told not to obey.

    Each line is prefixed with ``| `` — a role marker at the start of a line becomes
    ordinary quoted text, while the content itself stays readable. Fence markers inside
    the content are defanged so a document cannot close its own block.
    """
    if not isinstance(text, str):
        raise TypeError("fence() expects text")
    cleaned = strip_hidden(text).replace("<|", "< |").replace("|>", "| >")
    cleaned = re.sub(r"<<\s*(end-)?untrusted", r"<< \1untrusted", cleaned, flags=re.IGNORECASE)
    quoted = "\n".join(f"| {line}" for line in cleaned.splitlines()) or "| "
    label = re.sub(r"[^a-z0-9._-]+", "-", source.lower()).strip("-") or "external"
    return f'<<untrusted source="{label}">>\n{quoted}\n<<end-untrusted>>'
