"""Frozen interfaces (W0.9) - schema-first (v0.1.0).

Source of truth: spec/schemas/{job-protocol,model-registry,rate-card,verdict}.schema.json.
Generated: models (pydantic v2) + packaged schema copies live beside this file.
See docs/spec/interfaces-v0.md. Regenerate: python tools/codegen/generate_interfaces.py
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

from .job_protocol import JobMessage, JobRequest, JobResult, PingReply, StatsReply
from .model_registry import ModelEntry, ModelRegistry
from .rate_card import RateCard, RateLine
from .verdict import Verdict, VerdictSet

INTERFACES_VERSION = "0.1.0"
SCHEMA_NAMES = ("job-protocol", "model-registry", "rate-card", "verdict")
PACKAGED_SCHEMAS_DIR = pathlib.Path(__file__).parent

__all__ = [
    "INTERFACES_VERSION",
    "SCHEMA_NAMES",
    "PACKAGED_SCHEMAS_DIR",
    "load_schema",
    "JobMessage",
    "JobRequest",
    "JobResult",
    "PingReply",
    "StatsReply",
    "ModelEntry",
    "ModelRegistry",
    "RateCard",
    "RateLine",
    "Verdict",
    "VerdictSet",
]


def load_schema(name: str) -> dict[str, Any]:
    """Load a packaged interface JSON Schema by stem, e.g. 'verdict'."""
    if name not in SCHEMA_NAMES:
        raise KeyError(f"unknown interface schema: {name!r} (expected one of {SCHEMA_NAMES})")
    return json.loads((PACKAGED_SCHEMAS_DIR / f"{name}.schema.json").read_text(encoding="utf-8"))
