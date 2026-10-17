"""Render the RAJUK rule pack from its YAML source (plan §5.6, ADR-0003).

Source (edited by hand):  spec/rules/rajuk-2008.yaml
Schema:                   spec/schemas/rule-pack.schema.json
Rendered (committed):     docs/rules/rajuk-pack-v0.md

Usage (from the repo root):
  uv run --directory core python ../tools/rules/render_pack.py          # render in place
  uv run --directory core python ../tools/rules/render_pack.py --check  # verify freshness (CI)

The render is a pure function of the YAML: the same pack always produces byte-identical
Markdown (UTF-8, LF, one trailing newline). Schema validation lives with the pack tests
(core/tests/test_rajuk_pack.py); this script only reads the pack and formats it for
engineer review. Optional blocks are skipped and never fail the render.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
PACK_REL = "spec/rules/rajuk-2008.yaml"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
OUT = ROOT / "docs" / "rules" / "rajuk-pack-v0.md"
REGEN = "uv run --directory core python ../tools/rules/render_pack.py"

BANNER = (
    f"<!-- AUTO-GENERATED from {PACK_REL} - do not edit. -->\n"
    f"<!-- Regenerate: {REGEN} -->\n"
    f"<!-- Check freshness: {REGEN} --check -->"
)

DOC_LINE = f"Generated from {PACK_REL} - do not edit by hand; regenerate with: `{REGEN}`"

BASIS_LABEL = {
    "dwelling": "per dwelling",
    "unit": "per unit",
    "room": "per room",
    "bed": "per bed",
    "seat": "per seat",
    "sqm_gross": "per sqm gross floor area",
    "site": "per site",
}

VEHICLE_LABEL = {
    "car": "car",
    "motorcycle": "motorcycle",
    "truck": "truck",
    "bus_truck": "bus / truck",
    "multi_axle": "multi-axle vehicle",
}

EMPTY = "—"


def _load_pack() -> dict:
    if not PACK.exists():
        sys.exit(f"error: rule pack not found at {PACK}")
    data = yaml.safe_load(PACK.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        sys.exit(f"error: {PACK_REL} did not parse as a mapping")
    return data


def _num(value: object) -> str:
    """Format a YAML number deterministically: up to 2 decimals, no trailing zeros.

    6.0 -> "6", 3.50 -> "3.5", 0.05 -> "0.05"; non-numbers pass through as text.
    """
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text if text else "0"
    return str(value)


def _value(value: object) -> str:
    return EMPTY if value is None or value == "" else _num(value)


def _cell(value: object) -> str:
    return _value(value).replace("|", "\\|").replace("\n", " ")


def _code(value: object) -> str:
    text = _value(value)
    return text if "`" in text else f"`{text}`"


def _json_ready(value: object) -> object:
    """Normalise numbers for JSON cells so the whole doc uses one number style."""
    if isinstance(value, float):
        return int(value) if value.is_integer() else value
    if isinstance(value, dict):
        return {key: _json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    return value


def _jsonish(value: object) -> str:
    """Compact one-line JSON with a fixed (sorted) key order."""
    return json.dumps(_json_ready(value), ensure_ascii=False, sort_keys=True, separators=(", ", ": "))


def _band(low: object, high: object) -> str:
    has_low = low is not None and low != 0
    if has_low and high is not None:
        return f"{_num(low)}-{_num(high)}"
    if high is not None:
        return f"≤ {_num(high)}"
    if has_low:
        return f"> {_num(low)}"
    return EMPTY


def _localized_lines(label: str, localized: object) -> list[str]:
    if not isinstance(localized, dict):
        return []
    out: list[str] = []
    for lang, tag in (("bn", "বাংলা"), ("en", "EN")):
        text = localized.get(lang)
        if text:
            out.append(f"- **{label} ({tag}):** {text}")
    return out


def _nested(localized_lines: list[str]) -> list[str]:
    return [f"  {line}" for line in localized_lines]


def render(data: dict) -> str:
    title = data.get("title") or {}
    lines: list[str] = [BANNER, ""]

    lines.append(f"# {title.get('bn') or data.get('id') or 'Rule pack'}")
    lines.append("")
    if title.get("en"):
        lines.append(f"**{title['en']}**")
        lines.append("")
    lines.append(DOC_LINE)
    lines.append("")

    # Header -----------------------------------------------------------------
    lines.append("## Header")
    lines.append("")
    for key in ("packVersion", "id", "authority", "regime", "revision", "status"):
        if data.get(key) is not None:
            lines.append(f"- **{key}:** {_code(data[key])}")
    langs = data.get("langs") or []
    if langs:
        lines.append("- **langs:** " + ", ".join(_code(lang) for lang in langs))
    lines.append("")

    # Source -----------------------------------------------------------------
    source = data.get("source") or {}
    if source:
        lines.append("## Source")
        lines.append("")
        lines += _localized_lines("Document", source.get("document"))
        if source.get("gazettePages"):
            lines.append(f"- **Gazette pages:** {_cell(source['gazettePages'])}")
        if source.get("fileName"):
            lines.append(f"- **File name:** {_code(source['fileName'])}")
        if source.get("pdfPages") is not None:
            lines.append(f"- **PDF pages:** {_num(source['pdfPages'])}")
        if source.get("sha256"):
            lines.append(f"- **SHA-256:** {_code(source['sha256'])}")
        if source.get("retrievedAt"):
            lines.append(f"- **Retrieved:** {_cell(source['retrievedAt'])}")
        lines.append("")

    # Verification + citations ----------------------------------------------
    verification = data.get("verification") or {}
    citations = data.get("citations") or {}
    if verification or citations:
        lines.append("## Verification")
        lines.append("")
        tiers = verification.get("tiers") or []
        if tiers:
            lines.append("- **Tiers:** " + ", ".join(_code(tier) for tier in tiers))
        if verification.get("method"):
            lines.append(f"- **Method:** {verification['method']}")
        lines.append("")
        if citations:
            lines.append("| Citation key | Gazette page | PDF page | Tier | Note |")
            lines.append("|---|---|---|---|---|")
            for key, citation in citations.items():
                citation = citation or {}
                lines.append(
                    "| "
                    + " | ".join(
                        [
                            _code(key),
                            _cell(citation.get("gazettePage")),
                            _cell(citation.get("pdfPage")),
                            _cell(citation.get("tier")),
                            _cell(citation.get("note")),
                        ]
                    )
                    + " |"
                )
            lines.append("")

    # Review -----------------------------------------------------------------
    review = data.get("review") or {}
    if review:
        lines.append("## Review")
        lines.append("")
        if review.get("label"):
            lines.append(f"- **Label:** {review['label']}")
        if review.get("openItems") is not None:
            lines.append(f"- **Open items:** {_num(review['openItems'])}")
        if review.get("openItemsFile"):
            lines.append(f"- **Open items file:** {_code(review['openItemsFile'])}")
        lines.append("")

    # Use classes ------------------------------------------------------------
    use_classes = data.get("useClasses") or []
    if use_classes:
        lines.append("## Use classes")
        lines.append("")
        lines.append("| Id | Name (বাংলা) | Name (EN) |")
        lines.append("|---|---|---|")
        for use_class in use_classes:
            lines.append(
                "| "
                + " | ".join(
                    [
                        _code(use_class.get("id", "")),
                        _cell(use_class.get("useBn", "")),
                        _cell(use_class.get("useEn", "")),
                    ]
                )
                + " |"
            )
        lines.append("")

    # FAR tables -------------------------------------------------------------
    far_tables = data.get("farTables") or []
    if far_tables:
        lines.append("## FAR tables")
        lines.append("")
        for table in far_tables:
            lines.append(f"### {table.get('tableBn', '')} ({table.get('tableEn', '')})")
            lines.append("")
            meta: list[str] = []
            if table.get("id"):
                meta.append(f"**Id:** {_code(table['id'])}")
            if table.get("clause"):
                meta.append(f"**Clause:** {_cell(table['clause'])}")
            if table.get("cite"):
                meta.append(f"**Cite:** {_code(table['cite'])}")
            if table.get("classId"):
                meta.append(f"**Class:** {_code(table['classId'])}")
            if meta:
                lines.append("- " + " · ".join(meta))
            lines += _localized_lines("Note", table.get("note"))
            lines.append("")
            lines.append(
                "| Road width (m) | Plot area (katha) | Plot area (sqm) | FAR | MGC % | Footnotes |"
            )
            lines.append("|---|---|---|---|---|---|")
            for row in table.get("rows") or []:
                if row.get("prohibited"):
                    far_text = "prohibited"
                    mgc_text = EMPTY
                else:
                    far_text = _value(row.get("far"))
                    if row.get("anyPlot"):
                        far_text += " (any plot)"
                    mgc_text = _value(row.get("mgcPercent"))
                footnotes = ", ".join(_code(fn) for fn in row.get("footnotes") or []) or EMPTY
                lines.append(
                    "| "
                    + " | ".join(
                        [
                            _value(row.get("roadWidthM")),
                            _band(row.get("areaKathaFrom"), row.get("areaKathaTo")),
                            _band(row.get("areaSqmFrom"), row.get("areaSqmTo")),
                            far_text,
                            mgc_text,
                            footnotes,
                        ]
                    )
                    + " |"
                )
            lines.append("")

    # Footnotes --------------------------------------------------------------
    footnotes = data.get("footnotes") or []
    if footnotes:
        lines.append("## Footnotes")
        lines.append("")
        for footnote in footnotes:
            head = [f"**{_code(footnote.get('id', ''))}**"]
            if footnote.get("mark"):
                head.append(f"**Mark:** {_code(footnote['mark'])}")
            applies_to = footnote.get("appliesTo") or []
            if applies_to:
                head.append("**Applies to:** " + ", ".join(_code(item) for item in applies_to))
            if footnote.get("cite"):
                head.append(f"**Cite:** {_code(footnote['cite'])}")
            lines.append("- " + " · ".join(head))
            lines += _nested(_localized_lines("Text", footnote.get("text")))
            lines.append("")

    # Setback table ----------------------------------------------------------
    setback = data.get("setbackTable") or {}
    if setback:
        heading = "## Setback table"
        if setback.get("id"):
            heading += f" — {_code(setback['id'])}"
        lines.append(heading)
        lines.append("")
        meta = []
        applies = []
        if setback.get("heightApplicabilityM") is not None:
            applies.append(f"{_num(setback['heightApplicabilityM'])} m")
        if setback.get("heightApplicabilityStoreys") is not None:
            applies.append(f"{_num(setback['heightApplicabilityStoreys'])} storeys")
        if applies:
            meta.append("**Banded rows apply up to:** " + " / ".join(applies))
        if setback.get("cite"):
            meta.append(f"**Cite:** {_code(setback['cite'])}")
        if meta:
            lines.append("- " + " · ".join(meta))
        lines.append("")
        lines.append("| Area (katha) | Area (sqm) | Front (m) | Rear (m) | Side (m) |")
        lines.append("|---|---|---|---|---|")
        for row in setback.get("rows") or []:
            lines.append(
                "| "
                + " | ".join(
                    [
                        _band(row.get("areaKathaFrom"), row.get("areaKathaTo")),
                        _band(row.get("areaSqmFrom"), row.get("areaSqmTo")),
                        _value(row.get("frontM")),
                        _value(row.get("rearM")),
                        _value(row.get("sideM")),
                    ]
                )
                + " |"
            )
        lines.append("")
        beyond = setback.get("beyondHeight") or {}
        if beyond:
            thresholds = []
            if beyond.get("overHeightM") is not None:
                thresholds.append(f"{_num(beyond['overHeightM'])} m")
            if beyond.get("overStoreys") is not None:
                thresholds.append(f"{_num(beyond['overStoreys'])} storeys")
            text = "**Above " + (" / ".join(thresholds) if thresholds else "the banded rows") + ":** "
            text += " · ".join(
                [
                    f"front {_num(beyond.get('frontM', EMPTY))} m",
                    f"rear {_num(beyond.get('rearM', EMPTY))} m",
                    f"side {_num(beyond.get('sideM', EMPTY))} m",
                ]
            )
            if beyond.get("cite"):
                text += f" · **Cite:** {_code(beyond['cite'])}"
            lines.append(text)
            lines.append("")

    # Parking schedule -------------------------------------------------------
    parking = data.get("parkingSchedule") or {}
    if parking:
        heading = "## Parking schedule"
        if parking.get("id"):
            heading += f" — {_code(parking['id'])}"
        lines.append(heading)
        lines.append("")
        if parking.get("cite"):
            lines.append(f"- **Cite:** {_code(parking['cite'])}")
            lines.append("")
        lines.append("| Id | Use (বাংলা) | Use (EN) | Basis | Rate (spaces) | Min |")
        lines.append("|---|---|---|---|---|---|")
        for row in parking.get("rows") or []:
            spaces = row.get("spaces") or {}
            numerator = spaces.get("numerator")
            denominator = spaces.get("denominator")
            rate = EMPTY if numerator is None or denominator is None else f"{_num(numerator)}/{_num(denominator)}"
            basis = BASIS_LABEL.get(spaces.get("basis"), spaces.get("basis") or EMPTY)
            lines.append(
                "| "
                + " | ".join(
                    [
                        _code(row.get("id", "")),
                        _cell(row.get("useBn", "")),
                        _cell(row.get("useEn", "")),
                        _cell(basis),
                        rate,
                        _value(row.get("minSpaces")),
                    ]
                )
                + " |"
            )
        lines.append("")
        noted = [row for row in parking.get("rows") or [] if row.get("note")]
        if noted:
            lines.append("### Row notes")
            lines.append("")
            for row in noted:
                lines.append(f"- **{_code(row.get('id', ''))}**")
                lines += _nested(_localized_lines("Note", row.get("note")))
            lines.append("")
        notes = parking.get("notes") or []
        if notes:
            lines.append("### Notes")
            lines.append("")
            for note in notes:
                head = f"- **{_code(note.get('id', ''))}**"
                if note.get("cite"):
                    head += f" · **Cite:** {_code(note['cite'])}"
                lines.append(head)
                lines += _nested(_localized_lines("Text", note.get("text")))
            lines.append("")

    # Parking geometry -------------------------------------------------------
    geometry = data.get("parkingGeometry") or {}
    if geometry:
        heading = "## Parking geometry"
        if geometry.get("id"):
            heading += f" — {_code(geometry['id'])}"
        lines.append(heading)
        lines.append("")
        if geometry.get("cite"):
            lines.append(f"- **Cite:** {_code(geometry['cite'])}")
            lines.append("")
        stalls = geometry.get("stalls") or []
        if stalls:
            lines.append("### Stalls")
            lines.append("")
            lines.append("| Vehicle | Width (m) | Length (m) | Inner turn radius (m) | Outer turn radius (m) |")
            lines.append("|---|---|---|---|---|")
            for stall in stalls:
                vehicle = VEHICLE_LABEL.get(stall.get("vehicle"), stall.get("vehicle") or EMPTY)
                lines.append(
                    "| "
                    + " | ".join(
                        [
                            _cell(vehicle),
                            _value(stall.get("widthM")),
                            _value(stall.get("lengthM")),
                            _value(stall.get("innerTurnRadiusM")),
                            _value(stall.get("outerTurnRadiusM")),
                        ]
                    )
                    + " |"
                )
            lines.append("")
        if geometry.get("packedBayWidthM") is not None:
            lines.append(f"Packed bay width: {_num(geometry['packedBayWidthM'])} m")
            lines.append("")
        driveway = geometry.get("drivewayWidths") or []
        if driveway:
            lines.append("### Driveway widths")
            lines.append("")
            lines.append("| Angle (deg) | Single-loaded (m) | Double-loaded (m) | Two-way (m) |")
            lines.append("|---|---|---|---|")
            for width in driveway:
                lines.append(
                    "| "
                    + " | ".join(
                        [
                            _value(width.get("angleDeg")),
                            _value(width.get("singleLoadedM")),
                            _value(width.get("doubleLoadedM")),
                            _value(width.get("twoWayM")),
                        ]
                    )
                    + " |"
                )
            lines.append("")
        rules = geometry.get("rules") or []
        if rules:
            lines.append("### Rules")
            lines.append("")
            for rule in rules:
                lines.append(f"#### {_code(rule.get('id', ''))} — {_cell(rule.get('clause', ''))}")
                lines.append("")
                lines += _localized_lines("Title", rule.get("title"))
                lines += _localized_lines("Summary", rule.get("summary"))
                if rule.get("cite"):
                    lines.append(f"- **Cite:** {_code(rule['cite'])}")
                lines.append("")

    # Provisions -------------------------------------------------------------
    provisions = data.get("provisions") or []
    if provisions:
        lines.append("## Provisions")
        lines.append("")
        for provision in provisions:
            lines.append(f"### {_code(provision.get('id', ''))} — {_cell(provision.get('clause', ''))}")
            lines.append("")
            lines += _localized_lines("Title", provision.get("title"))
            lines += _localized_lines("Summary", provision.get("summary"))
            if provision.get("cite"):
                lines.append(f"- **Cite:** {_code(provision['cite'])}")
            if provision.get("data"):
                lines.append(f"- **Data:** {_code(_jsonish(provision['data']))}")
            lines.append("")

    # Open items (gaps) ------------------------------------------------------
    gaps = data.get("gaps") or []
    if gaps:
        lines.append("## Open items (gaps)")
        lines.append("")
        lines.append("| Id | Candidate | What | Why |")
        lines.append("|---|---|---|---|")
        for gap in gaps:
            lines.append(
                "| "
                + " | ".join(
                    [
                        _code(gap.get("id", "")),
                        _cell(gap.get("candidateRef", "")),
                        _cell(gap.get("what", "")),
                        _cell(gap.get("why", "")),
                    ]
                )
                + " |"
            )
        lines.append("")
        open_items_file = (data.get("review") or {}).get("openItemsFile") or "spec/rules/rajuk-2008-candidates.md"
        lines.append(
            f"Full working notes: {_code(open_items_file)} — open items are tracked there and "
            "never dropped silently (plan §9)."
        )
        lines.append("")

    # Test vectors -----------------------------------------------------------
    vectors = data.get("testVectors") or []
    if vectors:
        lines.append("## Test vectors")
        lines.append("")
        lines.append("| Id | Kind | Given | Expect | Note |")
        lines.append("|---|---|---|---|---|")
        for vector in vectors:
            given = _jsonish(vector.get("given")) if vector.get("given") is not None else EMPTY
            expect = _jsonish(vector.get("expect")) if vector.get("expect") is not None else EMPTY
            lines.append(
                "| "
                + " | ".join(
                    [
                        _code(vector.get("id", "")),
                        _cell(vector.get("kind", "")),
                        _code(given),
                        _code(expect),
                        _cell(vector.get("note")),
                    ]
                )
                + " |"
            )
        lines.append("")

    return "\n".join(lines).rstrip("\n") + "\n"


def _brief(line: object, width: int = 160) -> str:
    if line is None:
        return "(no line)"
    text = str(line)
    return text if len(text) <= width else text[:width] + " …"


def _first_difference(on_disk: str, rendered: str) -> str:
    disk_lines = on_disk.splitlines()
    render_lines = rendered.splitlines()
    for index in range(max(len(disk_lines), len(render_lines))):
        disk_line = disk_lines[index] if index < len(disk_lines) else None
        render_line = render_lines[index] if index < len(render_lines) else None
        if disk_line != render_line:
            return (
                f"first difference at line {index + 1}:\n"
                f"  on disk:  {_brief(disk_line)}\n"
                f"  rendered: {_brief(render_line)}"
            )
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Render the RAJUK rule pack (or verify freshness).")
    parser.add_argument("--check", action="store_true", help="verify the committed render is fresh; write nothing")
    args = parser.parse_args()

    text = render(_load_pack())
    rel = OUT.relative_to(ROOT).as_posix()

    if args.check:
        if not OUT.exists():
            print(f"STALE {rel} is missing - regenerate: {REGEN}", file=sys.stderr)
            return 1
        on_disk = OUT.read_bytes().replace(b"\r\n", b"\n")
        if on_disk != text.encode("utf-8"):
            print(f"STALE {rel} - regenerate: {REGEN}", file=sys.stderr)
            hint = _first_difference(OUT.read_text(encoding="utf-8"), text)
            if hint:
                print(hint, file=sys.stderr)
            return 1
        print("rajuk pack render is fresh")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    print(f"rendered {rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
