"""Packaged Building Spec schema access (kept import-cycle-free)."""

from __future__ import annotations

import json
import pathlib
from typing import Any

PACKAGED_SCHEMA_PATH = pathlib.Path(__file__).with_name("building-spec.schema.json")


def load_schema() -> dict[str, Any]:
    """Load the packaged Building Spec JSON Schema."""
    return json.loads(PACKAGED_SCHEMA_PATH.read_text(encoding="utf-8"))
