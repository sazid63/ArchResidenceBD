"""BOQ v0 (W2.6): the quantities we measured become priced lines.

The plan's BOQ is xlsx + PDF (P3 renders it); this is the **data** behind it: a Bill of
Quantities whose lines carry a quantity, a rate and an amount, grouped by phase and by the
plan's four cost types (material / labour / machinery / subcontract).

Two laws shape it:

- **The quantities come from the design, the prices come from the rate card.** The concrete is
  the volume the engine measured; the steel is the weight the BBS scheduled; the rates are the
  frozen rate-card interface (W0.9), never a number typed into this module.
- **Every line says where it came from.** A quantity carries its provenance (derived from the
  design, or an authored assumption), a line carries the rate key it priced itself from, and the
  document carries the rate card's id, region, date and source. A *candidate* card says so on the
  document: an unverified price list is not a verified price list, and the BOQ must not hide it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from .floor import FloorDesign
from .foundation import PROVENANCE_ASSUMED, PROVENANCE_DERIVED, FoundationDesign, Value
from .rebar import RebarDesign, build_bbs

#: The assumed concrete mix and productivity (v0). The pack has no mix or productivity rule, so
#: these are authored assumptions and the BOQ says so on every line that uses one.
ASSUMED_CEMENT_BAGS_PER_M3 = 7.5
ASSUMED_SAND_CFT_PER_M3 = 1.77
ASSUMED_MASON_M3_PER_DAY = 2.5
ASSUMED_MIXER_M3_PER_DAY = 8.0
ASSUMED_EXCAVATOR_M3_PER_HOUR = 12.0

COST_TYPES = ("material", "labour", "machinery", "subcontract", "other")

#: The phases a line can belong to (plan §6: per-phase, with a grand total).
PHASES = ("site-excavation", "foundation", "floor")


@dataclass(frozen=True)
class TakeoffLine:
    """One measured quantity, with the provenance of the number."""

    key: str
    label: dict[str, str]
    phase: str
    cost_type: str
    unit: str
    quantity: float
    rate_key: str
    provenance: str
    source: str
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": dict(self.label),
            "phase": self.phase,
            "costType": self.cost_type,
            "unit": self.unit,
            "quantity": round(self.quantity, 4),
            "rateKey": self.rate_key,
            "provenance": self.provenance,
            "source": self.source,
            "note": self.note,
        }


@dataclass(frozen=True)
class Takeoff:
    """The quantities, before any price is applied."""

    project_id: str
    lines: tuple[TakeoffLine, ...]
    values: dict[str, Value] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "projectId": self.project_id,
            "lines": [line.as_dict() for line in self.lines],
            "values": {key: value.as_dict() for key, value in sorted(self.values.items())},
        }


def design_takeoff(
    spec: dict[str, Any],
    foundation: FoundationDesign,
    floor: FloorDesign,
    rebar: RebarDesign,
) -> Takeoff:
    """Measure the quantities the BOQ will price (no price is touched here)."""
    project = spec.get("project") or {}
    project_id = str(project.get("id") or "unknown")

    footing_concrete = foundation.footing_volume_m3
    column_concrete = sum(
        column.size_mm * column.size_mm * column.height_mm / 1_000_000_000.0
        for column in floor.columns
    )
    beam_concrete = sum(
        beam.length_mm * beam.width_mm * beam.depth_mm / 1_000_000_000.0 for beam in floor.beams
    )
    slab_concrete = (
        floor.slab.size_x_mm * floor.slab.size_y_mm * floor.slab.thickness_mm / 1_000_000_000.0
    )
    foundation_concrete = footing_concrete
    floor_concrete = column_concrete + beam_concrete + slab_concrete
    excavation = foundation.excavation.volume_m3
    steel_kg = build_bbs(rebar)["totals"]["weightKg"]

    formwork_foundation = sum(
        2.0 * (footing.size_x_mm + footing.size_y_mm) * footing.depth_mm / 1_000_000.0
        for footing in foundation.footings
    )
    formwork_floor = sum(
        2.0 * (column.size_mm + column.size_mm) * column.height_mm / 1_000_000.0
        for column in floor.columns
    ) + floor.slab.size_x_mm * floor.slab.size_y_mm / 1_000_000.0

    values: dict[str, Value] = {
        "takeoff.foundationConcreteM3": Value(
            round(foundation_concrete, 6),
            "m3",
            PROVENANCE_DERIVED,
            "foundation design",
            "the footings' volume",
        ),
        "takeoff.floorConcreteM3": Value(
            round(floor_concrete, 6),
            "m3",
            PROVENANCE_DERIVED,
            "floor design",
            "the columns', beams' and slab's volume",
        ),
        "takeoff.excavationM3": Value(
            round(excavation, 6),
            "m3",
            PROVENANCE_DERIVED,
            "foundation design",
            "the declared excavation prism",
        ),
        "takeoff.steelKg": Value(
            round(steel_kg, 4), "kg", PROVENANCE_DERIVED, "BBS (W2.4)", "the scheduled steel"
        ),
        "takeoff.cementBagsPerM3": Value(
            ASSUMED_CEMENT_BAGS_PER_M3,
            "bag/m3",
            PROVENANCE_ASSUMED,
            "v0 default",
            "the rule pack has no mix rule; v0 assumes a 1:2:4 mix at 7.5 bags/m3",
        ),
    }

    lines = [
        TakeoffLine(
            key="excavation",
            label={"bn": "খনন (যন্ত্র)", "en": "Excavation (machinery)"},
            phase="site-excavation",
            cost_type="machinery",
            # The card prices the excavator per hour, so the line is measured in hours: a
            # volume priced with an hourly rate is a wrong number, not a rounding.
            unit="hour",
            quantity=excavation / ASSUMED_EXCAVATOR_M3_PER_HOUR,
            rate_key="excavator",
            provenance=PROVENANCE_ASSUMED,
            source="v0 productivity assumption (12 m3/hour)",
            note=(
                f"the declared excavation prism ({excavation:.3f} m3) at an assumed "
                f"{ASSUMED_EXCAVATOR_M3_PER_HOUR} m3/hour"
            ),
        ),
        TakeoffLine(
            key="cement-foundation",
            label={"bn": "সিমেন্ট (ভিত্তি)", "en": "Cement (foundation)"},
            phase="foundation",
            cost_type="material",
            unit="bag",
            quantity=foundation_concrete * ASSUMED_CEMENT_BAGS_PER_M3,
            rate_key="cement-opc-43",
            provenance=PROVENANCE_ASSUMED,
            source="v0 mix assumption (7.5 bags/m3)",
            note="the mix is an assumption, not a pack rule",
        ),
        TakeoffLine(
            key="cement-floor",
            label={"bn": "সিমেন্ট (তলা)", "en": "Cement (floor)"},
            phase="floor",
            cost_type="material",
            unit="bag",
            quantity=floor_concrete * ASSUMED_CEMENT_BAGS_PER_M3,
            rate_key="cement-opc-43",
            provenance=PROVENANCE_ASSUMED,
            source="v0 mix assumption (7.5 bags/m3)",
            note="the mix is an assumption, not a pack rule",
        ),
        TakeoffLine(
            key="sand-foundation",
            label={"bn": "বালি (ভিত্তি)", "en": "Sand (foundation)"},
            phase="foundation",
            cost_type="material",
            unit="cft",
            quantity=foundation_concrete * ASSUMED_SAND_CFT_PER_M3,
            rate_key="sand-fine",
            provenance=PROVENANCE_ASSUMED,
            source="v0 mix assumption (1.77 cft/m3)",
        ),
        TakeoffLine(
            key="sand-floor",
            label={"bn": "বালি (তলা)", "en": "Sand (floor)"},
            phase="floor",
            cost_type="material",
            unit="cft",
            quantity=floor_concrete * ASSUMED_SAND_CFT_PER_M3,
            rate_key="sand-fine",
            provenance=PROVENANCE_ASSUMED,
            source="v0 mix assumption (1.77 cft/m3)",
        ),
        TakeoffLine(
            key="steel",
            label={"bn": "স্টিল রিড", "en": "Steel reinforcement"},
            phase="floor",
            cost_type="material",
            unit="ton",
            quantity=steel_kg / 1000.0,
            rate_key="rod-60g",
            provenance=PROVENANCE_DERIVED,
            source="BBS (W2.4)",
            note="the scheduled steel, not an estimate",
        ),
        TakeoffLine(
            key="mason",
            label={"bn": "মেসন", "en": "Mason (labour)"},
            phase="foundation",
            cost_type="labour",
            unit="day",
            quantity=foundation_concrete / ASSUMED_MASON_M3_PER_DAY,
            rate_key="mason",
            provenance=PROVENANCE_ASSUMED,
            source="v0 productivity assumption (2.5 m3/day)",
        ),
        TakeoffLine(
            key="mason-floor",
            label={"bn": "মেসন (তলা)", "en": "Mason (floor, labour)"},
            phase="floor",
            cost_type="labour",
            unit="day",
            quantity=floor_concrete / ASSUMED_MASON_M3_PER_DAY,
            rate_key="mason",
            provenance=PROVENANCE_ASSUMED,
            source="v0 productivity assumption (2.5 m3/day)",
        ),
        TakeoffLine(
            key="mixer",
            label={"bn": "মিক্সার", "en": "Concrete mixer"},
            phase="foundation",
            cost_type="machinery",
            unit="day",
            quantity=foundation_concrete / ASSUMED_MIXER_M3_PER_DAY,
            rate_key="mixer-diesel",
            provenance=PROVENANCE_ASSUMED,
            source="v0 productivity assumption (8 m3/day)",
        ),
        TakeoffLine(
            key="formwork-foundation",
            label={"bn": "ফর্মওয়ার্ক (ভিত্তি)", "en": "Formwork (foundation)"},
            phase="foundation",
            cost_type="other",
            unit="sqm",
            quantity=formwork_foundation,
            rate_key="",
            provenance=PROVENANCE_DERIVED,
            source="foundation design",
            note="no formwork rate in the v0 card: the line is measured, not priced",
        ),
        TakeoffLine(
            key="formwork-floor",
            label={"bn": "ফর্মওয়ার্ক (তলা)", "en": "Formwork (floor)"},
            phase="floor",
            cost_type="other",
            unit="sqm",
            quantity=formwork_floor,
            rate_key="",
            provenance=PROVENANCE_DERIVED,
            source="floor design",
            note="no formwork rate in the v0 card: the line is measured, not priced",
        ),
    ]

    return Takeoff(project_id=project_id, lines=tuple(lines), values=values)


def build_boq(takeoff: Takeoff, rate_card: dict[str, Any]) -> dict[str, Any]:
    """Price the takeoff with a rate card and group it by phase and cost type."""
    rates = {line["key"]: line for line in rate_card.get("lines") or []}
    priced: list[dict[str, Any]] = []
    for line in takeoff.lines:
        entry = line.as_dict()
        rate = rates.get(line.rate_key) if line.rate_key else None
        if rate is None:
            entry["rateBdt"] = None
            entry["amountBdt"] = None
            entry["priced"] = False
        elif str(rate.get("unit")) != line.unit:
            # A rate in another unit is not a price for this line: the line stays visible and
            # unpriced rather than carrying a wrong amount.
            entry["rateBdt"] = None
            entry["amountBdt"] = None
            entry["priced"] = False
            entry["note"] = (
                f"{entry['note']} | the card prices {rate.get('key')} per {rate.get('unit')}, "
                f"this line is measured per {line.unit}"
            ).strip(" |")
        else:
            rate_bdt = float(rate["rateBdt"])
            entry["rateBdt"] = rate_bdt
            # The amount is computed from the *document's* quantity, so anyone can re-derive it
            # from the line itself (the check in tools/boq/build_boq.py does exactly that).
            entry["amountBdt"] = round(entry["quantity"] * rate_bdt, 2)
            entry["priced"] = True
            entry["rateCostType"] = rate["costType"]
        priced.append(entry)

    by_phase: dict[str, float] = {}
    by_cost_type: dict[str, float] = {}
    total = 0.0
    for entry in priced:
        amount = entry["amountBdt"]
        if amount is None:
            continue
        by_phase[entry["phase"]] = round(by_phase.get(entry["phase"], 0.0) + amount, 2)
        by_cost_type[entry["costType"]] = round(by_cost_type.get(entry["costType"], 0.0) + amount, 2)
        total = round(total + amount, 2)

    unpriced = [entry["key"] for entry in priced if not entry["priced"]]
    return {
        "schemaVersion": "0.1.0",
        "projectId": takeoff.project_id,
        "currency": "BDT",
        "rateCard": {
            "cardId": rate_card.get("cardId"),
            "region": rate_card.get("region"),
            "status": rate_card.get("status"),
            "effectiveFrom": rate_card.get("effectiveFrom"),
            "source": rate_card.get("source"),
        },
        "lines": priced,
        "subtotals": {
            "byPhase": dict(sorted(by_phase.items())),
            "byCostType": dict(sorted(by_cost_type.items())),
        },
        "totals": {
            "amountBdt": total,
            "pricedLines": sum(1 for entry in priced if entry["priced"]),
            "unpricedLines": unpriced,
        },
        "notes": (
            "the quantities are measured from the design; the rates come from the rate card "
            f"({rate_card.get('cardId')}, status {rate_card.get('status')})"
        ),
    }


def render_boq_markdown(boq: dict[str, Any]) -> str:
    """A readable BOQ (the xlsx/PDF renderers are P3; this is the reviewable text)."""
    card = boq["rateCard"]
    lines = [
        "# Bill of Quantities",
        "",
        f"- Project: `{boq['projectId']}`",
        f"- Rate card: `{card['cardId']}` ({card['region']}, from {card['effectiveFrom']}, "
        f"status **{card['status']}**)",
        f"- Source: {card['source'].get('name')} ({card['source'].get('kind')})",
        "",
        "| Phase | Description | Type | Qty | Unit | Rate BDT | Amount BDT |",
        "|---|---|---|---:|---|---:|---:|",
    ]
    for entry in boq["lines"]:
        rate = "-" if entry["rateBdt"] is None else f"{entry['rateBdt']:,.2f}"
        amount = "-" if entry["amountBdt"] is None else f"{entry['amountBdt']:,.2f}"
        lines.append(
            f"| {entry['phase']} | {entry['label']['en']} | {entry['costType']} | "
            f"{entry['quantity']:,.3f} | {entry['unit']} | {rate} | {amount} |"
        )
    lines += ["", "## Subtotals", ""]
    for phase, amount in boq["subtotals"]["byPhase"].items():
        lines.append(f"- {phase}: {amount:,.2f} BDT")
    lines += ["", "## By cost type", ""]
    for cost_type, amount in boq["subtotals"]["byCostType"].items():
        lines.append(f"- {cost_type}: {amount:,.2f} BDT")
    lines += [
        "",
        f"**Total: {boq['totals']['amountBdt']:,.2f} BDT** "
        f"({boq['totals']['pricedLines']} priced lines"
        + (
            f", {len(boq['totals']['unpricedLines'])} unpriced: "
            + ", ".join(boq["totals"]["unpricedLines"])
            if boq["totals"]["unpricedLines"]
            else ""
        )
        + ")",
        "",
        f"_{boq['notes']}_",
    ]
    if card.get("status") == "candidate":
        lines += [
            "",
            "> **The rate card is a candidate**: it has not been verified against its source, so "
            "these prices are not a quotation. Acknowledge it before this BOQ is used.",
        ]
    return "\n".join(lines) + "\n"
