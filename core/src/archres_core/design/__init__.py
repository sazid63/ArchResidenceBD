"""Deterministic design: the Building Spec becomes geometry the engine can measure (W2.2).

Every number carries its provenance (``spec`` / ``rule:<pack>`` / ``derived`` / ``assumed``) and
the assumptions are handed back so the app can record them in the spec. See
``docs/spec/foundation-generator-v0.md`` and ADR-0022.
"""

from __future__ import annotations

from .floor import (
    ASSUMED_BEAM_DEPTH_MM,
    ASSUMED_BEAM_WIDTH_MM,
    ASSUMED_COLUMN_SIZE_MM,
    ASSUMED_SLAB_OVERHANG_MM,
    Beam,
    Column,
    FloorDesign,
    Slab,
    design_typical_floor,
    render_floor_macro,
)
from .rebar import (
    BBS_SCHEMA_VERSION,
    SHAPES,
    STEEL_DENSITY_KG_PER_M3,
    Bar,
    RebarDesign,
    build_bbs,
    design_rebar,
    render_rebar_macro,
)
from .foundation import (
    ASSUMED_EXCAVATION_MARGIN_MM,
    ASSUMED_FOOTING_DEPTH_MM,
    ASSUMED_FOOTING_SIZE_MM,
    ASSUMED_FOOTING_SPACING_MM,
    ASSUMED_GRADE_BEAM_DEPTH_MM,
    ASSUMED_GRADE_BEAM_WIDTH_MM,
    Assumption,
    DesignError,
    Excavation,
    Footing,
    FoundationDesign,
    GradeBeam,
    Value,
    design_foundation,
    render_macro,
)

__all__ = [
    "BBS_SCHEMA_VERSION",
    "SHAPES",
    "STEEL_DENSITY_KG_PER_M3",
    "Bar",
    "RebarDesign",
    "ASSUMED_BEAM_DEPTH_MM",
    "ASSUMED_BEAM_WIDTH_MM",
    "ASSUMED_COLUMN_SIZE_MM",
    "ASSUMED_EXCAVATION_MARGIN_MM",
    "ASSUMED_FOOTING_DEPTH_MM",
    "ASSUMED_FOOTING_SIZE_MM",
    "ASSUMED_FOOTING_SPACING_MM",
    "ASSUMED_GRADE_BEAM_DEPTH_MM",
    "ASSUMED_GRADE_BEAM_WIDTH_MM",
    "ASSUMED_SLAB_OVERHANG_MM",
    "Assumption",
    "Beam",
    "Column",
    "DesignError",
    "Excavation",
    "FloorDesign",
    "Footing",
    "FoundationDesign",
    "GradeBeam",
    "Slab",
    "Value",
    "build_bbs",
    "design_foundation",
    "design_rebar",
    "design_typical_floor",
    "render_floor_macro",
    "render_macro",
    "render_rebar_macro",
]
