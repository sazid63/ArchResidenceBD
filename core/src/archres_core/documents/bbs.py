"""The BBS final (W3.4): the bar schedule as the engineer's two documents.

W2.4 wrote the schedule as **data** ✓ (the marks ✓, the members ✓, the shapes ✓, the lengths ✓,
the weights ✓ — validated against the frozen `bbs.schema.json` ✓). The plan asks for the
**xlsx + PDF** forms (§6: "BBS final - marks, cutting lengths, shapes, xlsx/PDF"), and this is
that: the same data, rendered twice ✓.

Two laws:

- **The documents carry the data, not a second opinion.** Every number in the xlsx and the PDF
  is the schedule's own number ✓ — the lengths, the weights and the totals are the ones the
  engine measured and the BBS computed ✓, never recomputed here ✓.
- **The assumptions travel with the document.** The BBS's authored assumptions (the bar
  diameters, the cover, the laps) are on their own sheet ✓ and on the PDF's last page ✓ — a
  schedule whose numbers appear without their assumptions is a document nobody can check ✓.
"""

from __future__ import annotations

from typing import Any

from .pdf import LINE_HEIGHT, MARGIN, Page
from .xlsx import Sheet

#: The BBS's column names (the order the document reads in).
COLUMNS = (
    ("Mark", "mark"),
    ("Member", "member"),
    ("Role", "role"),
    ("Shape", "shape"),
    ("Dia (mm)", "diameterMm"),
    ("No.", "count"),
    ("Length (mm)", "lengthMm"),
    ("Weight (kg)", "weightKg"),
)

#: The document's title block line (the same status the drawing sheet carries).
STATUS = "Candidate - not for construction"


def _items(bbs: dict[str, Any]) -> list[dict[str, Any]]:
    return list(bbs.get("items") or [])


def render_bbs_sheets(bbs: dict[str, Any], *, drawing_number: str = "ARRB-P3-BBS-001") -> list[Sheet]:
    """The workbook: the schedule, the totals and the assumptions."""
    project = str(bbs.get("projectId") or "unknown")
    issued = "2026-10-21"

    schedule = Sheet(
        name="Schedule",
        header=tuple(label for label, _ in COLUMNS),
        widths=(14, 12, 12, 12, 10, 7, 14, 14),
    )
    for item in _items(bbs):
        schedule.add(*[item.get(key) for _, key in COLUMNS])

    totals = Sheet(name="Totals", header=("Measure", "Value"), widths=(28, 18))
    totals_data = bbs.get("totals") or {}
    totals.add("Bars", totals_data.get("barCount"))
    totals.add("Total weight (kg)", totals_data.get("weightKg"))
    for diameter, weight in sorted(
        (totals_data.get("byDiameterKg") or {}).items(), key=lambda pair: float(pair[0])
    ):
        totals.add(f"Dia {diameter} mm (kg)", weight)
    totals.add("Density (kg/m3)", bbs.get("densityKgPerM3"))

    assumptions = Sheet(name="Assumptions", header=("Assumption", "Why"), widths=(44, 70))
    for item in bbs.get("assumptions") or []:
        assumptions.add(
            f"{item.get('pointer') or item.get('id')}: {item.get('value')} {item.get('unit') or ''}",
            str(item.get("reason") or item.get("basis") or ""),
        )

    cover = Sheet(name="Title block", header=("Field", "Value"), widths=(24, 60))
    cover.add("Project", project)
    cover.add("Drawing number", drawing_number)
    cover.add("Issued", issued)
    cover.add("Status", STATUS)
    cover.add("Note", "the schedule is data (W2.4); the engine measured the steel it describes")

    return [cover, schedule, totals, assumptions]


def render_bbs_pages(bbs: dict[str, Any], *, drawing_number: str = "ARRB-P3-BBS-001") -> list[Page]:
    """The printable schedule: the title block, the schedule (over as many pages as it needs),
    the totals and the assumptions."""
    project = str(bbs.get("projectId") or "unknown")
    totals = bbs.get("totals") or {}

    title = Page()
    title.add("BAR SCHEDULE", size=18, bold=True, y=60)
    title.add(f"Project: {project}", y=90)
    title.add(f"Drawing number: {drawing_number}", y=106)
    title.add("Issued: 2026-10-21", y=122)
    title.add(f"Status: {STATUS}", y=138)
    title.add(
        f"Bars: {totals.get('barCount')}   Total weight: {totals.get('weightKg')} kg",
        y=160,
    )
    title.add(
        "The schedule is data (W2.4); the engine measured the steel it describes.",
        y=180,
        gray=0.35,
    )

    pages: list[Page] = [title]
    header = (
        "Mark          Member  Role         Shape      Dia   No.   Length     Weight"
    )
    rows_per_page = 46
    items = _items(bbs)
    for start in range(0, max(len(items), 1), rows_per_page):
        page = Page()
        page.add("BAR SCHEDULE (continued)", size=12, bold=True, y=48)
        page.add(header, size=8, bold=True, y=64)
        for index, item in enumerate(items[start : start + rows_per_page], start=start + 1):
            y = 64 + LINE_HEIGHT * (index - start + 1)
            page.add(
                f"{str(item.get('mark')):<14} {str(item.get('member')):<8} "
                f"{str(item.get('role')):<13} {str(item.get('shape')):<11} "
                f"{item.get('diameterMm'):>4} {item.get('count'):>4} "
                f"{item.get('lengthMm'):>9} {item.get('weightKg'):>9}",
                size=8,
                y=y,
            )
        pages.append(page)

    summary = Page()
    summary.add("TOTALS", size=12, bold=True, y=48)
    summary.add(f"Bars: {totals.get('barCount')}", y=68)
    summary.add(f"Total weight (kg): {totals.get('weightKg')}", y=84)
    for diameter, weight in sorted(
        (totals.get("byDiameterKg") or {}).items(), key=lambda pair: float(pair[0])
    ):
        summary.add(f"Dia {diameter} mm (kg): {weight}", y=100)
    summary.add("ASSUMPTIONS", size=12, bold=True, y=140)
    y = 160.0
    for item in bbs.get("assumptions") or []:
        summary.add(
            f"{item.get('pointer') or item.get('id')}: {item.get('value')} "
            f"{item.get('unit') or ''}",
            size=8,
            y=y,
        )
        summary.add(str(item.get("reason") or item.get("basis") or ""), size=8, y=y + 10, gray=0.35)
        y += 24
    pages.append(summary)
    return pages


__all__ = ["COLUMNS", "STATUS", "render_bbs_pages", "render_bbs_sheets"]
