"""Agent layer v0 (W1.10) — orchestrator, context builder, tools/permissions, injection watch.

Consumes the interview engine (W1.4) and the spec store (W1.3). The session owns the one
model call (escalation only), commits each writing turn as a revision, fences external
text as data, and answers every tool request with allow / ask / deny.
See docs/spec/orchestrator-v0.md and ADR-0011.
"""

from __future__ import annotations

from .client import (
    LlamaSwapClient,
    ModelClient,
    ModelError,
    ModelValueError,
    ScriptedClient,
    parse_model_value,
)
from .context import (
    CONTEXT_VERSION,
    ContextBuilder,
    BuiltContext,
    Section,
    build_escalation_context,
    estimate_tokens,
    project_card,
)
from .injection import (
    HIGH_RULES,
    Finding,
    fence,
    has_high,
    scan,
    strip_hidden,
    worst_severity,
)
from .law import LawAnswer, LawDesk
from .orchestrator import ORCHESTRATOR_ID, OrchestratorError, Result, Session
from .tools import (
    TOOLS,
    TRUST_LEVELS,
    Call,
    Decision,
    PermissionError,
    PermissionPolicy,
    ToolKind,
    ToolSpec,
)

__all__ = [
    "BuiltContext",
    "CONTEXT_VERSION",
    "Call",
    "ContextBuilder",
    "Decision",
    "Finding",
    "HIGH_RULES",
    "LawAnswer",
    "LawDesk",
    "LlamaSwapClient",
    "ModelClient",
    "ModelError",
    "ModelValueError",
    "ORCHESTRATOR_ID",
    "OrchestratorError",
    "PermissionError",
    "PermissionPolicy",
    "Result",
    "Section",
    "Session",
    "ScriptedClient",
    "TOOLS",
    "TRUST_LEVELS",
    "ToolKind",
    "ToolSpec",
    "build_escalation_context",
    "estimate_tokens",
    "fence",
    "has_high",
    "parse_model_value",
    "project_card",
    "scan",
    "strip_hidden",
    "worst_severity",
]
