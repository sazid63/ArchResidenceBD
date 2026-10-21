"""The live cost meter (W3.8): what a change costs, in ৳, in Bangla numerals.

The plan's §8: *"Live cost meter: every change shows its ৳ delta (enabled by incremental
BOQ)"* ✓. The board: *"What the price service (W2.7) makes possible: the project's cost moving
as the design changes, in Bangla numerals"* ✓.

Three laws shape this module:

- **The delta is computed from the documents, not estimated.** Two BOQ documents go in — the one
  before the change ✓ and the one after ✓ — and the meter says what moved, line by line ✓ ✓.
  Every amount re-derives from its own line ✓ (the BOQ's own law ✓).
- **The meter's scope is the change.** The incremental build (W2.11) says which phases were
  rebuilt ✓; the meter shows the delta of those phases ✓ and **names the phases it did not
  rebuild** ✓ — a meter that shows the whole project's cost after every change is not a meter,
  it is a total ✓ ✓.
- **A line that moved but has no price says so.** An unpriced line's amount does not move ✓,
  and a meter that showed a flat amount for a line whose quantity changed would be lying ✓ ✓.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from ..bengali import format_bdt, format_delta

#: The currency the meter counts in (the BOQ's currency ✓).
CURRENCY = "BDT"

#: A line that is in the new document and not in the old one.
KIND_ADDED = "added"
#: A line that is in the old document and not in the new one.
KIND_REMOVED = "removed"
#: A line whose amount moved.
KIND_CHANGED = "changed"
#: A line that did not move.
KIND_UNCHANGED = "unchanged"


@dataclass(frozen=True)
class LineDelta:
    """One BOQ line, before and after."""

    key: str
    phase: str
    label: dict[str, str]
    cost_type: str
    unit: str
    before: float | None
    after: float | None
    delta: float
    kind: str
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "phase": self.phase,
            "label": dict(self.label),
            "costType": self.cost_type,
            "unit": self.unit,
            "beforeBdt": None if self.before is None else round(self.before, 2),
            "afterBdt": None if self.after is None else round(self.after, 2),
            "deltaBdt": round(self.delta, 2),
            "kind": self.kind,
            "note": self.note,
        }


@dataclass(frozen=True)
class CostDelta:
    """The project's cost, before and after, and what moved between them."""

    lines: tuple[LineDelta, ...] = ()
    by_phase: dict[str, float] = field(default_factory=dict)
    total_before: float = 0.0
    total_after: float = 0.0
    delta: float = 0.0
    rebuilt_phases: tuple[str, ...] = ()
    untouched_phases: tuple[str, ...] = ()
    currency: str = CURRENCY

    def moved_lines(self) -> tuple[LineDelta, ...]:
        """Only the lines that moved — a meter's job is the change, not the whole bill."""
        return tuple(line for line in self.lines if line.kind != KIND_UNCHANGED)

    def as_dict(self) -> dict[str, Any]:
        return {
            "currency": self.currency,
            "totalBeforeBdt": round(self.total_before, 2),
            "totalAfterBdt": round(self.total_after, 2),
            "deltaBdt": round(self.delta, 2),
            "byPhase": {phase: round(amount, 2) for phase, amount in sorted(self.by_phase.items())},
            "rebuiltPhases": list(self.rebuilt_phases),
            "untouchedPhases": list(self.untouched_phases),
            "lines": [line.as_dict() for line in self.lines],
        }


def _amount(entry: dict[str, Any]) -> float | None:
    """A line's amount, or None when the line carries no price."""
    amount = entry.get("amountBdt")
    if amount is None:
        return None
    return round(float(amount), 2)


def _phase_matches(boq_phase: str, rebuilt_phase: str) -> bool:
    """Whether a rebuilt phase belongs to a BOQ phase ("floor-1" is the BOQ's "floor")."""
    return rebuilt_phase == boq_phase or rebuilt_phase.startswith(f"{boq_phase}-")


def cost_delta(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    rebuilt: Sequence[str] | None = None,
) -> CostDelta:
    """The delta between two BOQ documents.

    `rebuilt` is the list of phases the incremental build (W2.11) rebuilt ✓. When it is given,
    only those phases' lines are in the delta ✓ and the other phases are **named** ✓ ✓.
    """
    before_lines = {str(entry.get("key")): entry for entry in before.get("lines") or []}
    after_lines = {str(entry.get("key")): entry for entry in after.get("lines") or []}
    phases = sorted(
        {str(entry.get("phase")) for entry in list(before_lines.values()) + list(after_lines.values())}
    )
    scope = set(phases)
    if rebuilt is not None:
        scope = {
            phase
            for phase in phases
            if any(_phase_matches(phase, rebuilt_phase) for rebuilt_phase in rebuilt)
        }

    lines: list[LineDelta] = []
    by_phase: dict[str, float] = {}
    for key in sorted(set(before_lines) | set(after_lines)):
        old = before_lines.get(key)
        new = after_lines.get(key)
        entry = new or old or {}
        phase = str(entry.get("phase") or "")
        if phase not in scope:
            continue
        old_amount = _amount(old) if old else None
        new_amount = _amount(new) if new else None
        delta = round((new_amount or 0.0) - (old_amount or 0.0), 2)
        if old is None:
            kind = KIND_ADDED
        elif new is None:
            kind = KIND_REMOVED
        elif delta != 0.0:
            kind = KIND_CHANGED
        else:
            kind = KIND_UNCHANGED
        note = ""
        if kind != KIND_UNCHANGED and (old_amount is None or new_amount is None):
            # The line's quantity may well have moved; its amount did not, because the line
            # carries no price. Saying nothing would let a flat amount pass for "no change".
            note = (
                "the line carries no price, so its amount did not move; the quantity may have"
            )
        lines.append(
            LineDelta(
                key=key,
                phase=phase,
                label=dict(entry.get("label") or {}),
                cost_type=str(entry.get("costType") or ""),
                unit=str(entry.get("unit") or ""),
                before=old_amount,
                after=new_amount,
                delta=delta,
                kind=kind,
                note=note,
            )
        )
        by_phase[phase] = round(by_phase.get(phase, 0.0) + delta, 2)

    total_before = round(sum(line.before or 0.0 for line in lines), 2)
    total_after = round(sum(line.after or 0.0 for line in lines), 2)
    return CostDelta(
        lines=tuple(lines),
        by_phase=by_phase,
        total_before=total_before,
        total_after=total_after,
        delta=round(total_after - total_before, 2),
        rebuilt_phases=tuple(rebuilt or ()),
        untouched_phases=tuple(phase for phase in phases if phase not in scope),
    )


def render_cost_meter(delta: CostDelta, lang: str = "bn") -> str:
    """The meter, as a reader sees it: the total, the change, and what moved."""
    lines: list[str] = []
    lines.append("The project's cost")
    lines.append("")
    lines.append(f"- before: {format_bdt(delta.total_before, lang)}")
    lines.append(f"- after: {format_bdt(delta.total_after, lang)}")
    lines.append(f"- the change: {format_delta(delta.delta, lang)}")
    if delta.rebuilt_phases:
        lines.append(f"- the phases that were rebuilt: {', '.join(delta.rebuilt_phases)}")
    if delta.untouched_phases:
        lines.append(f"- the phases that were not rebuilt: {', '.join(delta.untouched_phases)}")
    moved = delta.moved_lines()
    lines.append("")
    if moved:
        lines.append("| Line | Phase | Before | After | Change |")
        lines.append("|---|---|---|---|---|")
        for line in moved:
            label = line.label.get(lang) or line.label.get("en") or line.key
            before = "-" if line.before is None else format_bdt(line.before, lang)
            after = "-" if line.after is None else format_bdt(line.after, lang)
            lines.append(
                f"| {label} | {line.phase} | {before} | {after} | "
                f"{format_delta(line.delta, lang)} |"
            )
    else:
        lines.append("Nothing moved.")
    for line in moved:
        if line.note:
            lines.append(f"- {line.label.get(lang) or line.key}: {line.note}")
    return "\n".join(lines) + "\n"


__all__ = [
    "CURRENCY",
    "KIND_ADDED",
    "KIND_CHANGED",
    "KIND_REMOVED",
    "KIND_UNCHANGED",
    "CostDelta",
    "LineDelta",
    "cost_delta",
    "render_cost_meter",
]
