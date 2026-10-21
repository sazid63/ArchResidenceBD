"""The BOQ final (W3.5): the priced schedule as the engineer's two documents.

W2.6 built the Bill of Quantities as **data** ✓ — the lines ✓, the phases ✓, the cost types ✓,
the subtotals ✓, the grand total ✓, the unpriced lines ✓ and the rate card's identity ✓ — and
W2.7 made the prices live ✓. The plan asks for the **xlsx + PDF** forms, divided by phase, with
the **deviation notes on the lines** (§6: "BOQ final - per phase + single phase-divided page;
xlsx/PDF; deviation notes").

Three laws:

- **The document is the data.** Every number in the workbook and the PDF is the BOQ's own ✓ —
  the quantities ✓, the rates ✓, the amounts ✓ and the totals ✓ are the ones the design
  measured and the card priced ✓, never recomputed here ✓. The arithmetic stays re-derivable
  from the document ✓ (W2.6's check ✓).
- **A deviation is flagged on its line.** The Deviation Register's entries (W1.2 ✓, the price
  service's `cost_risk` entries ✓ among them ✓) are matched to the lines they price ✓, and the
  line says so ✓ — "deviation-flagged line notes where relevant" ✓ (plan §6 ✓). A line nobody
  flags is a line nobody reviews ✓.
- **The card's identity and the candidate status travel with the document.** A BOQ that does not
  say which price list priced it — and whether that list is verified — is a number without a
  source ✓.
"""

from __future__ import annotations

from typing import Any

from .pdf import LINE_HEIGHT, Page
from .xlsx import Sheet

#: The document's status (the same line the drawing sheet and the BBS carry).
STATUS = "Candidate - not for construction"

#: The workbook's schedule columns.
COLUMNS = (
    ("Phase", "phase"),
    ("Description", "description"),
    ("Type", "costType"),
    ("Unit", "unit"),
    ("Quantity", "quantity"),
    ("Rate (BDT)", "rateBdt"),
    ("Amount (BDT)", "amountBdt"),
    ("Rate key", "rateKey"),
    ("Note", "note"),
)


def _description(line: dict[str, Any]) -> str:
    label = line.get("label") or {}
    if isinstance(label, dict):
        return str(label.get("en") or label.get("bn") or "")
    return str(label)


def _deviation_for(line: dict[str, Any], register: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The register entry that priced this line, if there is one."""
    rate_key = str(line.get("rateKey") or "")
    if not rate_key:
        return None
    for entry in register:
        if str(entry.get("id")) == f"price-{rate_key}":
            return entry
    return None


def _flag(line: dict[str, Any], register: list[dict[str, Any]]) -> str:
    """The line's note, with the deviation it carries named."""
    notes = [str(line.get("note") or "").strip()]
    entry = _deviation_for(line, register)
    if entry is not None:
        notes.append(
            f"DEVIATION ({entry.get('riskTier')}): {entry.get('ruleTitle') or entry.get('ruleRef')}"
            f" - {entry.get('actual')} against {entry.get('expected')}"
            f" - acknowledged: {entry.get('acknowledged')}"
        )
    return " | ".join(note for note in notes if note)


def render_boq_sheets(
    boq: dict[str, Any],
    register: list[dict[str, Any]] | None = None,
    *,
    drawing_number: str = "ARRB-P3-BOQ-001",
) -> list[Sheet]:
    """The workbook: the title block, the schedule (with the deviations flagged), the
    subtotals and the totals."""
    register = register or []
    card = boq.get("rateCard") or {}
    totals = boq.get("totals") or {}

    cover = Sheet(name="Title block", header=("Field", "Value"), widths=(26, 66))
    cover.add("Project", boq.get("projectId"))
    cover.add("Document number", drawing_number)
    cover.add("Issued", "2026-10-21")
    cover.add("Status", STATUS)
    cover.add("Rate card", f"{card.get('cardId')} ({card.get('region')}, {card.get('status')})")
    source = card.get("source") or {}
    cover.add("Rate source", f"{source.get('name')} ({source.get('kind')})")
    cover.add("Effective from", card.get("effectiveFrom"))
    cover.add("Currency", boq.get("currency"))
    cover.add("Note", str(boq.get("notes") or ""))

    schedule = Sheet(
        name="Schedule",
        header=tuple(label for label, _ in COLUMNS),
        widths=(16, 46, 12, 8, 12, 14, 16, 18, 60),
    )
    for line in boq.get("lines") or []:
        row = []
        for label, key in COLUMNS:
            if key == "description":
                row.append(_description(line))
            elif key == "note":
                row.append(_flag(line, register))
            else:
                row.append(line.get(key))
        schedule.add(*row)

    phases = Sheet(name="By phase", header=("Phase", "Amount (BDT)"), widths=(22, 18))
    for phase, amount in (boq.get("subtotals") or {}).get("byPhase", {}).items():
        phases.add(phase, amount)

    cost_types = Sheet(name="By cost type", header=("Cost type", "Amount (BDT)"), widths=(22, 18))
    for cost_type, amount in (boq.get("subtotals") or {}).get("byCostType", {}).items():
        cost_types.add(cost_type, amount)

    summary = Sheet(name="Totals", header=("Measure", "Value"), widths=(30, 20))
    summary.add("Grand total (BDT)", totals.get("amountBdt"))
    summary.add("Priced lines", totals.get("pricedLines"))
    summary.add("Unpriced lines", len(totals.get("unpricedLines") or []))
    for key in totals.get("unpricedLines") or []:
        summary.add("Unpriced", key)

    deviations = Sheet(name="Deviations", header=("Entry", "Rule", "Tier", "Expected", "Actual"), widths=(26, 34, 16, 18, 18))
    for entry in register:
        deviations.add(
            entry.get("id"),
            entry.get("ruleRef"),
            entry.get("riskTier"),
            entry.get("expected"),
            entry.get("actual"),
        )

    return [cover, schedule, phases, cost_types, summary, deviations]


def render_boq_pages(
    boq: dict[str, Any],
    register: list[dict[str, Any]] | None = None,
    *,
    drawing_number: str = "ARRB-P3-BOQ-001",
) -> list[Page]:
    """The printable BOQ: the title block, one page per phase with its lines, and the totals."""
    register = register or []
    card = boq.get("rateCard") or {}
    totals = boq.get("totals") or {}
    source = card.get("source") or {}

    title = Page()
    title.add("BILL OF QUANTITIES", size=18, bold=True, y=60)
    title.add(f"Project: {boq.get('projectId')}", y=92)
    title.add(f"Document number: {drawing_number}", y=108)
    title.add("Issued: 2026-10-21", y=124)
    title.add(f"Status: {STATUS}", y=140)
    title.add(
        f"Rate card: {card.get('cardId')} ({card.get('region')}, status {card.get('status')})",
        y=162,
    )
    title.add(f"Rate source: {source.get('name')} ({source.get('kind')})", y=178, gray=0.35)
    title.add(f"Effective from: {card.get('effectiveFrom')}", y=194, gray=0.35)
    title.add(
        f"Grand total: {totals.get('amountBdt')} BDT "
        f"({totals.get('pricedLines')} priced, {len(totals.get('unpricedLines') or [])} unpriced)",
        y=216,
    )
    title.add(str(boq.get("notes") or ""), y=236, gray=0.35)

    pages = [title]
    lines = boq.get("lines") or []
    by_phase: dict[str, list[dict[str, Any]]] = {}
    for line in lines:
        by_phase.setdefault(str(line.get("phase")), []).append(line)
    for phase, phase_lines in by_phase.items():
        page = Page()
        page.add(f"PHASE: {phase}", size=12, bold=True, y=48)
        page.add(
            "Description                                Type       Unit      Qty        Rate        Amount",
            size=8,
            bold=True,
            y=64,
        )
        y = 64 + LINE_HEIGHT
        for line in phase_lines:
            flag = _flag(line, register)
            page.add(
                f"{_description(line)[:44]:<44} {str(line.get('costType')):<10} "
                f"{str(line.get('unit')):<9} {line.get('quantity'):>9} "
                f"{line.get('rateBdt') if line.get('rateBdt') is not None else '-':>10} "
                f"{line.get('amountBdt') if line.get('amountBdt') is not None else '-':>12}",
                size=8,
                y=y,
            )
            if flag:
                page.add(f"    {flag[:150]}", size=7, y=y + 9, gray=0.35)
                y += 9
            y += LINE_HEIGHT
        subtotal = (boq.get("subtotals") or {}).get("byPhase", {}).get(phase)
        page.add(f"Subtotal ({phase}): {subtotal} BDT", size=9, bold=True, y=y + 4)
        pages.append(page)

    summary = Page()
    summary.add("TOTALS", size=12, bold=True, y=48)
    summary.add(f"Grand total: {totals.get('amountBdt')} BDT", y=68, bold=True)
    summary.add(f"Priced lines: {totals.get('pricedLines')}", y=84)
    unpriced = totals.get("unpricedLines") or []
    summary.add(f"Unpriced lines: {len(unpriced)}", y=100)
    for key in unpriced:
        summary.add(f"  unpriced: {key}", y=116, gray=0.35)
    summary.add("BY PHASE", size=12, bold=True, y=150)
    y = 170.0
    for phase, amount in (boq.get("subtotals") or {}).get("byPhase", {}).items():
        summary.add(f"{phase}: {amount} BDT", y=y)
        y += 14
    summary.add("BY COST TYPE", size=12, bold=True, y=y + 10)
    y += 30
    for cost_type, amount in (boq.get("subtotals") or {}).get("byCostType", {}).items():
        summary.add(f"{cost_type}: {amount} BDT", y=y)
        y += 14
    if register:
        summary.add("DEVIATIONS", size=12, bold=True, y=y + 10)
        y += 30
        for entry in register:
            summary.add(
                f"{entry.get('id')} ({entry.get('riskTier')}): {entry.get('actual')} against "
                f"{entry.get('expected')}",
                size=8,
                y=y,
            )
            y += 12
    pages.append(summary)
    return pages


__all__ = ["COLUMNS", "STATUS", "render_boq_pages", "render_boq_sheets"]
