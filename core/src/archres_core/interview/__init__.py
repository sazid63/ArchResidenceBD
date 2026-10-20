"""Interview (question) engine v0 — W1.4: chips, deterministic parser, escalation, provenance.

Consumes the Phase Flow Book (``spec/flows/phase-flow-book.yaml``, W0.4) and the spec
engine (W1.3). Answers become provenance-stamped spec patches; free text is parsed here
and only the unreadable cases escalate (the orchestrator, W1.10, owns the model call).
See docs/spec/question-engine-v0.md and ADR-0010.
"""

from __future__ import annotations

from .engine import (
    DISPLAY_UNITS,
    ENGINE_ID,
    FALLBACK_KINDS,
    Interview,
    InterviewError,
    Step,
    Turn,
    answer_writes,
)
from .flow import (
    SKIP_CHIP,
    SKIP_CHIP_ID,
    ConditionError,
    Flow,
    FlowBook,
    FlowBookError,
    Question,
    chips,
    condition_holds,
    load_book,
    parse_when,
    pointer_for,
)
from .parse import (
    DECISIONS,
    INTEGER_RANGES,
    TEXT_LIMITS,
    ParseError,
    ParseResult,
    normalize,
    parse_answer,
    units_in_text,
)
from .seam import validate_external_answer

__all__ = [
    "ConditionError",
    "DECISIONS",
    "DISPLAY_UNITS",
    "ENGINE_ID",
    "FALLBACK_KINDS",
    "Flow",
    "FlowBook",
    "FlowBookError",
    "INTEGER_RANGES",
    "Interview",
    "InterviewError",
    "ParseError",
    "ParseResult",
    "Question",
    "SKIP_CHIP",
    "SKIP_CHIP_ID",
    "Step",
    "TEXT_LIMITS",
    "Turn",
    "answer_writes",
    "chips",
    "condition_holds",
    "load_book",
    "normalize",
    "parse_answer",
    "parse_when",
    "pointer_for",
    "units_in_text",
    "validate_external_answer",
]
