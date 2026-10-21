"""Spec-level checks (W1.2): one Building Spec revision -> verdict rows (W0.9 shape).

Every check returns ``(verdicts, unevaluated)``:

- ``verdicts`` rows conform to spec/schemas/verdict.schema.json; **deviation rows always
  carry a machine-applicable specPatch** (the one-click "restore to compliant", plan
  §5.6), compliant/impossible rows never do (schema-enforced).
- ``unevaluated`` rows use the frozen reasons: ``missing_input`` (the spec lacks data;
  the exact pointers are named in ``detail``), ``not_applicable`` (the rule does not
  apply to this building) and ``pack_gap`` (the pack itself cannot decide - e.g. no
  table row for this input combination). Coverage is never silent (plan §9).

Checks never invent values: an absent design input becomes an unevaluated row, not a
default. The v0 design-payload keys live in ``/phases/site-excavation/data/`` - the
question engine (W1.4) and the design phases write them; this module only reads.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal
from typing import Any, Callable

from ..bengali import bn_number
from ..spec import PointerError, resolve
from . import tables
from .pack import rule_ref

ENGINE_VERSION = "0.1.0"
ENGINE_ID = f"compliance-engine@{ENGINE_VERSION}"

#: v0 design-payload keys (phase data extension point, W0.9-sanctioned).
DESIGN_PHASE = "/phases/site-excavation/data"
PLANNED_FLOOR_AREA_KEY = "plannedTotalFloorAreaSqm"
PARKING_SPACES_KEY = "parkingSpaces"
SETBACK_KEYS = {
    "front": "setbackFrontM",
    "rear": "setbackRearM",
    "sideLeft": "setbackSideLeftM",
    "sideRight": "setbackSideRightM",
}
_SETBACK_FIELD = {"front": "frontM", "rear": "rearM", "sideLeft": "sideM", "sideRight": "sideM"}
_SETBACK_TITLES = {
    "front": ("Front", "সামনের"),
    "rear": ("Rear", "পিছনের"),
    "sideLeft": ("Left-side", "বাম পাশের"),
    "sideRight": ("Right-side", "ডান পাশের"),
}

#: occupancy -> FAR/coverage table class (v0: the Building Spec only allows residential).
OCCUPANCY_CLASS = {"residential": "A1-A4"}

#: Hand-authored fallback titles for entities whose pack entry has no title block.
_FALLBACK_TITLES = {
    "schedule4-parking": {
        "bn": "পার্কিং (সূচি-৪)",
        "en": "Parking (Schedule 4)",
    },
}

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_EPSILON = 1e-9


class CheckError(RuntimeError):
    """A check could not run (engine bug or unusable pack - never a design problem)."""


def _value(spec: dict[str, Any], pointer: str) -> Any:
    try:
        return resolve(spec, pointer)
    except PointerError:
        return None


def _num(value: Any) -> str:
    """Deterministic English number: up to 2 decimals, no trailing zeros (render_pack law)."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text or "0"
    return str(value)


#: The Bangla display number: the core owns it (core/src/archres_core/bengali.py), so the
#: documents, the reports and the cost meter cannot disagree about how a number is written.
_bn = bn_number


def _floor2(value: float) -> float:
    """Round down to 2 decimals, deterministically (patch values must never re-breach)."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_DOWN))


def _citations(pack: dict[str, Any], *keys: str) -> list[str]:
    known = pack.get("citations") or {}
    return [key for key in keys if key in known]


def _entity_title(pack: dict[str, Any], entity_id: str, fallback: dict[str, str]) -> dict[str, str]:
    provisions = pack.get("provisions") or []
    entry = next((item for item in provisions if item.get("id") == entity_id), None)
    title = (entry or {}).get("title") or {}
    return {
        "bn": title.get("bn") or fallback["bn"],
        "en": title.get("en") or fallback["en"],
    }


def _missing(rule_ref: str, detail: str) -> dict[str, Any]:
    return {"ruleRef": rule_ref, "reason": "missing_input", "detail": detail}


def _pack_gap(rule_ref: str, detail: str) -> dict[str, Any]:
    return {"ruleRef": rule_ref, "reason": "pack_gap", "detail": detail}


# --------------------------------------------------------------------------- FAR


def check_far_tables(spec: dict[str, Any], pack: dict[str, Any]) -> tuple[list, list]:
    """FAR + ground coverage (provision ``far-tables``, tables 3(ka)-(cha))."""
    ref = rule_ref(pack, "far-tables")
    area = _value(spec, "/site/plot/areaSqm")
    road = _value(spec, "/site/plot/roadWidthM")
    occupancy = _value(spec, "/building/occupancy")
    if area is None or road is None:
        return [], [
            _missing(
                ref,
                "needs /site/plot/areaSqm and /site/plot/roadWidthM to select the FAR table row",
            )
        ]
    class_id = OCCUPANCY_CLASS.get(occupancy)
    if class_id is None:
        return [], [_missing(ref, f"occupancy {occupancy!r} has no FAR class mapping in engine v0")]
    result = tables.far_row(pack.get("farTables") or [], class_id, area, road)
    if result is None:
        return [], [
            _pack_gap(
                ref,
                f"no FAR table row for class {class_id}, area {_num(area)} sqm, road {_num(road)} m",
            )
        ]
    table = next(
        item for item in pack.get("farTables") or [] if item.get("classId") == class_id
    )
    cite = table.get("cite")
    cites = _citations(pack, cite, f"{cite}-fn") if result.get("footnotes") else _citations(pack, cite)
    title = _entity_title(pack, "far-tables", {"bn": "FAR ও ভূমি আচ্ছাদন", "en": "FAR and ground coverage"})
    if result.get("prohibited"):
        return [
            {
                "ruleRef": ref,
                "status": "impossible",
                "title": title,
                "summary": {
                    "bn": (
                        f"এই প্লটে ({_bn(area)} বর্গমিটার, {class_id} শ্রেণি, {_bn(road)} মিটার সড়ক) "
                        f"{class_id} শ্রেণির ব্যবহার নিষিদ্ধ; FAR প্রদান করা যাইবে না।"
                    ),
                    "en": (
                        f"Class {class_id} is prohibited on this plot ({_num(area)} sqm, "
                        f"{_num(road)} m road); no FAR can be granted."
                    ),
                },
                "citations": cites,
            }
        ], []
    far_limit = result.get("far")
    if far_limit == "NR":
        return [], [
            {
                "ruleRef": ref,
                "reason": "not_applicable",
                "detail": (
                    f"table row prints NR for class {class_id}, area {_num(area)} sqm, "
                    f"road {_num(road)} m: there is no FAR cap to evaluate"
                ),
            }
        ]
    planned_pointer = f"{DESIGN_PHASE}/{PLANNED_FLOOR_AREA_KEY}"
    planned = _value(spec, planned_pointer)
    if planned is None:
        return [], [
            _missing(
                ref,
                f"needs {planned_pointer} (planned total floor area) to measure the proposed FAR",
            )
        ]
    proposed = planned / area
    measured = {"value": round(proposed, 4), "unit": "FAR", "path": planned_pointer}
    limit = {"value": far_limit, "unit": "FAR", "comparator": "max", "note": f"Table row: {cite}"}
    within = proposed <= far_limit + _EPSILON
    if within:
        summary = {
            "bn": (
                f"প্রস্তাবিত FAR {_bn(proposed)} — {_bn(area)} বর্গমিটার প্লট ({class_id} শ্রেণি, "
                f"{_bn(road)} মিটার সড়ক) এর জন্য অনুমোদিত সীমা {_bn(far_limit)} এর মধ্যে আছে।"
            ),
            "en": (
                f"Proposed FAR {_num(round(proposed, 4))} is within the limit {_num(far_limit)} "
                f"for this plot ({_num(area)} sqm, class {class_id}, {_num(road)} m road)."
            ),
        }
        return [
            {
                "ruleRef": ref,
                "status": "compliant",
                "title": title,
                "summary": summary,
                "measured": measured,
                "limit": limit,
                "citations": cites,
            }
        ], []
    patch_value = _floor2(far_limit * area)
    summary = {
        "bn": (
            f"প্রস্তাবিত FAR {_bn(proposed)} — {_bn(area)} বর্গমিটার প্লট ({class_id} শ্রেণি, "
            f"{_bn(road)} মিটার সড়ক) এর অনুমোদিত সীমা {_bn(far_limit)} ছাড়াইয়া গিয়াছে; "
            f"পরিকল্পিত মোট তলা-ক্ষেত্রফল {_bn(patch_value)} বর্গমিটার বা তাহার কম করিতে হইবে।"
        ),
        "en": (
            f"Proposed FAR {_num(round(proposed, 4))} exceeds the limit {_num(far_limit)} for this "
            f"plot ({_num(area)} sqm, class {class_id}, {_num(road)} m road); reduce the planned "
            f"total floor area to {_num(patch_value)} sqm or less."
        ),
    }
    return [
        {
            "ruleRef": ref,
            "status": "deviation",
            "title": title,
            "summary": summary,
            "measured": measured,
            "limit": limit,
            "alternative": {
                "description": {
                    "bn": f"পরিকল্পিত মোট তলা-ক্ষেত্রফল {_bn(patch_value)} বর্গমিটার করিয়া দিন (FAR {_bn(far_limit)} সীমার মধ্যে)।",
                    "en": f"Set the planned total floor area to {_num(patch_value)} sqm (FAR within the {_num(far_limit)} limit).",
                },
                "specPatch": [{"op": "add", "path": planned_pointer, "value": patch_value}],
            },
            "citations": cites,
        }
    ], []


# ----------------------------------------------------------------------- Setback


def check_setback_schedule(spec: dict[str, Any], pack: dict[str, Any]) -> tuple[list, list]:
    """Mandatory setbacks (provision ``setback-schedule``, §46(1)-(2))."""
    ref = rule_ref(pack, "setback-schedule")
    area = _value(spec, "/site/plot/areaSqm")
    storeys = _value(spec, "/building/storeys/count")
    if area is None:
        return [], [_missing(ref, "needs /site/plot/areaSqm to select the setback table row")]
    required = tables.setback_row(pack.get("setbackTable") or {}, area, storeys=storeys)
    if required is None:
        return [], [
            _pack_gap(ref, f"no setback table row for area {_num(area)} sqm")
        ]
    table = pack.get("setbackTable") or {}
    beyond = bool(required.get("beyond"))
    note = (
        "Rows above 33 m / 10 storeys (beyondHeight)."
        if beyond
        else "Banded row up to 33 m / 10 storeys."
    )
    cites = _citations(pack, table.get("cite"), "s46-3-4")
    title = _entity_title(
        pack, "setback-schedule", {"bn": "সীমানা হইতে আবশ্যক সেটব্যাক", "en": "Mandatory setbacks"}
    )
    verdicts: list[dict[str, Any]] = []
    missing: list[str] = []
    for side, key in SETBACK_KEYS.items():
        pointer = f"{DESIGN_PHASE}/{key}"
        offered = _value(spec, pointer)
        if offered is None:
            missing.append(key)
            continue
        need = required[_SETBACK_FIELD[side]]
        side_en, side_bn = _SETBACK_TITLES[side]
        measured = {"value": offered, "unit": "m", "path": pointer}
        limit = {"value": need, "unit": "m", "comparator": "min", "note": note}
        if offered + _EPSILON >= need:
            summary = {
                "bn": (
                    f"{side_bn} সেটব্যাক {_bn(offered)} মিটার — আবশ্যক ন্যূনতম {_bn(need)} মিটার "
                    f"পূরণ করিয়াছে।"
                ),
                "en": f"{side_en} setback {_num(offered)} m meets the required minimum {_num(need)} m.",
            }
            verdicts.append(
                {
                    "ruleRef": ref,
                    "status": "compliant",
                    "title": title,
                    "summary": summary,
                    "measured": measured,
                    "limit": limit,
                    "citations": cites,
                }
            )
        else:
            summary = {
                "bn": (
                    f"{side_bn} সেটব্যাক {_bn(offered)} মিটার — আবশ্যক ন্যূনতম {_bn(need)} মিটার "
                    f"অপেক্ষা কম; {_bn(need)} মিটার করিতে হইবে।"
                ),
                "en": (
                    f"{side_en} setback {_num(offered)} m is below the required minimum "
                    f"{_num(need)} m; increase it to {_num(need)} m."
                ),
            }
            verdicts.append(
                {
                    "ruleRef": ref,
                    "status": "deviation",
                    "title": title,
                    "summary": summary,
                    "measured": measured,
                    "limit": limit,
                    "alternative": {
                        "description": {
                            "bn": f"{side_bn} সেটব্যাক {_bn(need)} মিটার করিয়া দিন।",
                            "en": f"Set the {side_en.lower()} setback to {_num(need)} m.",
                        },
                        "specPatch": [{"op": "add", "path": pointer, "value": need}],
                    },
                    "citations": cites,
                }
            )
    unevaluated: list[dict[str, Any]] = []
    if missing:
        unevaluated.append(
            _missing(
                ref,
                "offered setback value(s) absent in "
                + DESIGN_PHASE
                + ": "
                + ", ".join(missing),
            )
        )
    return verdicts, unevaluated


# ----------------------------------------------------------------------- Parking


def _flat_row_id(unit_area_sqm: float) -> str:
    if unit_area_sqm > 200:
        return "park-flat-over-200"
    if unit_area_sqm > 140:
        return "park-flat-140-to-200"
    if unit_area_sqm > 90:
        return "park-flat-90-to-140"
    if unit_area_sqm > 60:
        return "park-flat-60-to-90"
    return "park-flat-up-to-60"


def check_schedule4_parking(spec: dict[str, Any], pack: dict[str, Any]) -> tuple[list, list]:
    """Car parking (Schedule 4, table id ``schedule4-parking``) - car spaces only.

    Flats: requirement = units x per-unit fraction from the typical unit area bracket
    (row s4-n-fraction: a remaining fraction needs one more). Single-family: the
    site-area row (minSpaces carries the floor). Motorcycle parking (flat rows up to
    90 sqm) is additive and stays unevaluated until the input exists.
    """
    ref = rule_ref(pack, "schedule4-parking")
    area = _value(spec, "/site/plot/areaSqm")
    units_per_floor = _value(spec, "/building/unitsPerFloor")
    storeys = _value(spec, "/building/storeys/count")
    schedule = pack.get("parkingSchedule") or {}
    title = _entity_title(pack, "schedule4-parking", _FALLBACK_TITLES["schedule4-parking"])
    cites = _citations(pack, "schedule4", "schedule4-notes")

    if area is None and (units_per_floor or 1) <= 1:
        return [], [_missing(ref, "needs /site/plot/areaSqm to select the single-family parking row")]
    units = 1
    summary_extra_bn = ""
    summary_extra_en = ""
    motorcycle = False
    if (units_per_floor or 1) <= 1:
        row_id = "park-single-family-up-to-200" if area <= 200 else "park-single-family-over-200"
    else:
        unit_area = _value(spec, "/building/typicalUnitAreaSqm")
        if unit_area is None or storeys is None:
            return [], [
                _missing(
                    ref,
                    "flats: needs /building/typicalUnitAreaSqm and /building/storeys/count "
                    f"to size the Schedule 4 requirement for {units_per_floor} units per floor",
                )
            ]
        row_id = _flat_row_id(unit_area)
        units = int(units_per_floor) * int(storeys)
        motorcycle = unit_area <= 90
        summary_extra_bn = f" (সাধারণ ফ্ল্যাটের ক্ষেত্রফল {_bn(unit_area)} বর্গমিটার × {_bn(units)} ইউনিট হিসাবে।)"
        summary_extra_en = f" (typical flat area {_num(unit_area)} sqm x {units} units.)"
    row = tables.parking_row(schedule, row_id)
    if row is None:
        return [], [
            _pack_gap(ref, f"Schedule 4 row {row_id!r} is missing from the pack")
        ]
    required = max(1, tables.parking_spaces(row, units))
    unevaluated: list[dict[str, Any]] = []
    if motorcycle:
        unevaluated.append(
            _missing(
                ref,
                "motorcycle parking is additive for flats up to 90 sqm "
                f"(row park-flat-up-to-90-motorcycle); needs {DESIGN_PHASE}/motorcycleSpaces",
            )
        )
    pointer = f"{DESIGN_PHASE}/{PARKING_SPACES_KEY}"
    provided = _value(spec, pointer)
    if provided is None:
        unevaluated.append(_missing(ref, f"needs {pointer} (car spaces provided)"))
        return [], unevaluated
    measured = {"value": provided, "unit": "spaces", "path": pointer}
    limit = {
        "value": required,
        "unit": "spaces",
        "comparator": "min",
        "note": f"Schedule 4 row {row_id} ({row.get('useEn', '')}); units={units}",
    }
    if provided + _EPSILON >= required:
        summary = {
            "bn": (
                f"{_bn(provided)}টি কার পার্কিং — সূচি-৪ অনুযায়ী আবশ্যক ন্যূনতম {_bn(required)}টি "
                f"পূরণ করিয়াছে।{summary_extra_bn}"
            ),
            "en": (
                f"{provided} car space(s) meet the required minimum {required} (Schedule 4)."
                f"{summary_extra_en}"
            ),
        }
        return [
            {
                "ruleRef": ref,
                "status": "compliant",
                "title": title,
                "summary": summary,
                "measured": measured,
                "limit": limit,
                "citations": cites,
            }
        ], unevaluated
    summary = {
        "bn": (
            f"{_bn(provided)}টি কার পার্কিং — সূচি-৪ অনুযায়ী আবশ্যক {_bn(required)}টির কম; "
            f"{_bn(required)}টি প্রদান করিতে হইবে।{summary_extra_bn}"
        ),
        "en": (
            f"{provided} car space(s) are fewer than the required {required} (Schedule 4); "
            f"provide {required}.{summary_extra_en}"
        ),
    }
    return [
        {
            "ruleRef": ref,
            "status": "deviation",
            "title": title,
            "summary": summary,
            "measured": measured,
            "limit": limit,
            "alternative": {
                "description": {
                    "bn": f"কার পার্কিং {_bn(required)}টি করিয়া দিন।",
                    "en": f"Provide {required} car space(s).",
                },
                "specPatch": [{"op": "add", "path": pointer, "value": required}],
            },
            "citations": cites,
        }
    ], unevaluated


#: ruleRef entity id -> spec-level check. The union with the pack's provisions defines
#: engine coverage; anything outside it is visible in docs/spec/rule-engine-v0.md.
CHECKS: dict[str, Callable[[dict[str, Any], dict[str, Any]], tuple[list, list]]] = {
    "far-tables": check_far_tables,
    "setback-schedule": check_setback_schedule,
    "schedule4-parking": check_schedule4_parking,
}
