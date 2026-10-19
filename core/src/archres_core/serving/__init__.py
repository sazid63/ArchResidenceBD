"""Model serving v0 (W1.11): fleet config, generated llama-swap YAML, modes, launcher.

The registry is the fleet manifest; `spec/models/fleet.json` adds router policy and
interview/design modes; the YAML next to it is generated and freshness-checked. The
launcher starts the bundled router on loopback and warms a mode through real requests.
See docs/spec/model-serving-v0.md and ADR-0012.
"""

from __future__ import annotations

from .fleet import (
    ROLE_ORDER,
    Fleet,
    FleetError,
    GroupPolicy,
    Mode,
    ModelRoute,
    is_fresh,
    load_fleet,
    render_llama_swap,
    write_fleet,
)
from .launcher import FleetLauncher, LauncherError, WARMUP

__all__ = [
    "Fleet",
    "FleetError",
    "FleetLauncher",
    "GroupPolicy",
    "LauncherError",
    "Mode",
    "ModelRoute",
    "ROLE_ORDER",
    "WARMUP",
    "is_fresh",
    "load_fleet",
    "render_llama_swap",
    "write_fleet",
]
