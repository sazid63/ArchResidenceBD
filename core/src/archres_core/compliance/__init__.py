"""Compliance (rule engine v0, W1.2) - verdicts from a Building Spec + a pinned pack.

Home of the W1.2 rule engine: pure table evaluators (``tables``), spec-level checks
(``checks``), pack access with sha256 pinning (``pack``) and the public engine
(``engine``): evaluate -> verdict set, restore-to-compliant, deviation register sync.

See docs/spec/rule-engine-v0.md (semantics + coverage) and ADR-0008.
"""

from __future__ import annotations

from .checks import CHECKS
from .engine import (
    ENGINE_ID,
    ComplianceError,
    apply_register,
    coverage,
    evaluate_spec,
    register_ops,
    restore_patch,
    run_vectors,
)
from .pack import RulePackError, entities, load_pack, pack_sha256, rule_ref
from .tables import far_row, in_band, parking_row, parking_spaces, setback_row

__all__ = [
    "CHECKS",
    "ENGINE_ID",
    "ComplianceError",
    "RulePackError",
    "apply_register",
    "coverage",
    "entities",
    "evaluate_spec",
    "far_row",
    "in_band",
    "load_pack",
    "pack_sha256",
    "parking_row",
    "parking_spaces",
    "register_ops",
    "restore_patch",
    "rule_ref",
    "run_vectors",
    "setback_row",
]
