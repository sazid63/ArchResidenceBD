"""Building Spec — schema-first (v0.1.0) + the spec engine v0 (W1.3).

Source of truth: spec/schemas/building-spec.schema.json (repo root).
Generated: models.py (pydantic v2) and building-spec.schema.json (packaged copy).
See docs/spec/building-spec-v0.md and docs/spec/spec-engine-v0.md.
Regenerate: python tools/codegen/generate_spec.py
"""

from __future__ import annotations

from ._schema import PACKAGED_SCHEMA_PATH, load_schema
from .engine import (
    RESERVED_TOP_LEVEL,
    SpecEngineError,
    SpecPatchError,
    SpecValidationError,
    apply_patch,
    diff_specs,
    ops_summary,
    spec_sha256,
    utc_now_iso,
    validate_spec,
)
from .models import BuildingSpec
from .pointers import PointerError, escape_token, parse_pointer, resolve
from .store import Revision, SpecStore, SpecStoreError

SPEC_VERSION = "0.1.0"

__all__ = [
    "BuildingSpec",
    "PointerError",
    "RESERVED_TOP_LEVEL",
    "Revision",
    "SPEC_VERSION",
    "PACKAGED_SCHEMA_PATH",
    "SpecEngineError",
    "SpecPatchError",
    "SpecStore",
    "SpecStoreError",
    "SpecValidationError",
    "apply_patch",
    "diff_specs",
    "escape_token",
    "load_schema",
    "ops_summary",
    "parse_pointer",
    "resolve",
    "spec_sha256",
    "utc_now_iso",
    "validate_spec",
]

