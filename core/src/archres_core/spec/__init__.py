"""Building Spec — schema-first (v0.1.0).

Source of truth: spec/schemas/building-spec.schema.json (repo root).
Generated: models.py (pydantic v2) and building-spec.schema.json (packaged copy).
See docs/spec/building-spec-v0.md. Regenerate: python tools/codegen/generate_spec.py
"""

from __future__ import annotations

import json
import pathlib
from typing import Any

from .models import BuildingSpec

SPEC_VERSION = "0.1.0"
PACKAGED_SCHEMA_PATH = pathlib.Path(__file__).with_name("building-spec.schema.json")

__all__ = ["BuildingSpec", "SPEC_VERSION", "PACKAGED_SCHEMA_PATH", "load_schema"]


def load_schema() -> dict[str, Any]:
    """Load the packaged Building Spec JSON Schema."""
    return json.loads(PACKAGED_SCHEMA_PATH.read_text(encoding="utf-8"))
