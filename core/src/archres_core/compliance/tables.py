"""Pure rule-table evaluators (W1.2).

Frozen semantics, pinned by the pack's own ``testVectors`` (spec/rules/rajuk-2008.yaml)
and carried over unchanged from the pre-W1.2 demo (tools/rules/eval_spec.py):

- **FAR**: pick the exact ``roadWidthM`` row and the area band
  (``areaSqmFrom`` < a <= ``areaSqmTo``; missing from = 0, missing to = open).
  Prohibited rows match by area only (road ignored); ``NR`` means no cap.
- **Setback**: same area band; ``heightM`` > ``heightApplicabilityM`` or ``storeys`` >
  ``heightApplicabilityStoreys`` switches to the ``beyondHeight`` values.
- **Parking**: ``max(minSpaces or 0, ceil(units * numerator / denominator))``.

Evaluators return plain JSON-ready dicts or ``None`` when no row applies - they never
guess, interpolate or round. Exactness is integer arithmetic (no floats where it counts).
"""

from __future__ import annotations

from typing import Any

__all__ = [
    "far_row",
    "in_band",
    "parking_row",
    "parking_spaces",
    "run_vector",
    "setback_row",
]


def in_band(area_sqm: float, row: dict[str, Any]) -> bool:
    """Area band test shared by FAR and setback tables: (from, to], open ends."""
    low = row.get("areaSqmFrom", 0)
    high = row.get("areaSqmTo")
    return area_sqm > low if high is None else low < area_sqm <= high


def far_row(
    far_tables: list[dict[str, Any]],
    class_id: str | None,
    area_sqm: float,
    road_width_m: float,
) -> dict[str, Any] | None:
    """Select the applicable FAR row: ``{"far", "mgcPercent", "footnotes"}`` or
    ``{"prohibited": True, "footnotes": [...]}``; ``None`` when no row applies."""
    table = next((item for item in far_tables if item.get("classId") == class_id), None)
    if table is None:
        return None
    rows = table.get("rows") or []
    for row in rows:  # prohibited rows match by area only (road width is irrelevant)
        if row.get("prohibited") and in_band(area_sqm, row):
            return {"prohibited": True, "footnotes": list(row.get("footnotes") or [])}
    for row in rows:  # "any plot" rows (printed for the widest roads) ignore the area band
        if row.get("anyPlot") and row.get("roadWidthM") == road_width_m:
            return {
                "far": row.get("far"),
                "mgcPercent": row.get("mgcPercent"),
                "footnotes": list(row.get("footnotes") or []),
                "row": dict(row),
            }
    for row in rows:
        if row.get("prohibited") or row.get("anyPlot"):
            continue
        if row.get("roadWidthM") == road_width_m and in_band(area_sqm, row):
            return {
                "far": row.get("far"),
                "mgcPercent": row.get("mgcPercent"),
                "footnotes": list(row.get("footnotes") or []),
                "row": dict(row),
            }
    return None


def setback_row(
    table: dict[str, Any],
    area_sqm: float,
    *,
    height_m: float | None = None,
    storeys: int | None = None,
) -> dict[str, Any] | None:
    """Applicable setbacks ``{"frontM", "rearM", "sideM"}``; ``None`` when no row applies.

    ``height_m`` / ``storeys`` above the table's applicability limit switch to the
    ``beyondHeight`` values (the same semantic the pack vector sb-height34 pins).
    """
    if (height_m or 0) > table.get("heightApplicabilityM", 0) or (
        (storeys or 0) > table.get("heightApplicabilityStoreys", 0)
    ):
        beyond = table.get("beyondHeight") or {}
        return {
            "frontM": beyond.get("frontM"),
            "rearM": beyond.get("rearM"),
            "sideM": beyond.get("sideM"),
            "beyond": True,
        }
    for row in table.get("rows") or []:
        if in_band(area_sqm, row):
            return {"frontM": row.get("frontM"), "rearM": row.get("rearM"), "sideM": row.get("sideM")}
    return None


def parking_row(schedule: dict[str, Any], row_id: str) -> dict[str, Any] | None:
    """The Schedule-4 row with this id, or ``None``."""
    return next((row for row in schedule.get("rows") or [] if row.get("id") == row_id), None)


def parking_spaces(row: dict[str, Any], units: int) -> int:
    """``max(minSpaces or 0, ceil(units * numerator / denominator))`` - integer-exact."""
    spaces = row.get("spaces") or {}
    numerator = spaces.get("numerator")
    denominator = spaces.get("denominator")
    required = 0
    if units and numerator and denominator:
        required = -(-int(units) * int(numerator) // int(denominator))  # ceil division
    return max(int(row.get("minSpaces") or 0), required)


def run_vector(pack: dict[str, Any], vector: dict[str, Any]) -> dict[str, Any] | None:
    """Evaluate one pack test vector through the engine evaluators.

    Raises ``ValueError`` for an unknown kind; returns ``None`` when no row applies.
    """
    kind = vector.get("kind")
    given = vector.get("given") or {}
    if kind == "far":
        return far_row(
            pack.get("farTables") or [],
            given.get("classId"),
            given["areaSqm"],
            given["roadWidthM"],
        )
    if kind == "setback":
        return setback_row(
            pack.get("setbackTable") or {},
            given["areaSqm"],
            height_m=given.get("heightM"),
            storeys=given.get("storeys"),
        )
    if kind == "parking":
        row = parking_row(pack.get("parkingSchedule") or {}, given.get("rowId"))
        if row is None:
            return None
        return {"spaces": parking_spaces(row, given.get("units", 1))}
    raise ValueError(f"unknown test-vector kind: {kind!r}")
