"""Build the engineer pack and the project bundle (W3.7).

Both are assembled from the **committed** documents - the drawings the engine measured ✓, the
BBS ✓, the BOQ ✓ and the compliance report ✓ - so the handoff cannot contain a number the
repository does not have ✓.

Usage (from the repo root):
  uv run --directory core python ../tools/documents/render_pack.py --write
  uv run --directory core python ../tools/documents/render_pack.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.design import (
    build_boq,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
)
from archres_core.documents.boq import render_boq_pages, render_boq_sheets
from archres_core.documents.bbs import render_bbs_pages, render_bbs_sheets
from archres_core.documents.pack import PackError, PackManifest, PackPart, import_bundle, write_pack
from archres_core.documents.pdf import write_pdf
from archres_core.documents.xlsx import write_xlsx
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
DOCUMENTS = ROOT / "data" / "documents"
DRAWINGS = ROOT / "data" / "cad" / "generated" / "drawing-set"
COMPLIANCE = ROOT / "data" / "compliance"
OUT = ROOT / "data" / "handoff"
PACK = OUT / "engineer-review-pack.zip"
BUNDLE = OUT / "project-bundle.zip"
CREATED = "2026-10-21T00:00:00+00:00"
AT = "2026-10-21T00:00:00+00:00"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _read(path: pathlib.Path) -> bytes:
    if not path.is_file():
        raise PackError(f"the committed document is missing: {path.relative_to(ROOT).as_posix()}")
    return path.read_bytes()


def _engineer_parts() -> list[PackPart]:
    """The pack's parts: the spec, the drawings, the BBS, the BOQ and the compliance report."""
    parts: list[PackPart] = [
        PackPart(name="spec.json", data=json.dumps(_spec(), ensure_ascii=False, indent=2).encode("utf-8"), role="spec"),
    ]
    for name in ("drawing-set.pdf", "page-1.svg", "page-2.svg", "page-3.svg", "set-manifest.json"):
        parts.append(PackPart(name=f"drawings/{name}", data=_read(DRAWINGS / name), role="drawing"))
    for name in ("bar-schedule.xlsx", "bar-schedule.pdf"):
        parts.append(PackPart(name=f"bbs/{name}", data=_read(DOCUMENTS / name), role="bbs"))
    for name in ("bill-of-quantities.xlsx", "bill-of-quantities.pdf"):
        parts.append(PackPart(name=f"boq/{name}", data=_read(DOCUMENTS / name), role="boq"))
    for name in ("audit.md", "deviation-register.md", "audit.bn.html", "deviation-register.bn.html"):
        parts.append(PackPart(name=f"compliance/{name}", data=_read(COMPLIANCE / name), role="compliance"))
    return parts


def _bundle_parts() -> list[PackPart]:
    """The bundle's parts: the spec (with its deviations) and the outputs."""
    spec = _spec()
    return [
        PackPart(
            name="project/spec.json",
            data=json.dumps(spec, ensure_ascii=False, indent=2).encode("utf-8"),
            role="spec",
        ),
        PackPart(name="project/drawings.pdf", data=_read(DRAWINGS / "drawing-set.pdf"), role="drawing"),
        PackPart(name="project/bbs.xlsx", data=_read(DOCUMENTS / "bar-schedule.xlsx"), role="bbs"),
        PackPart(name="project/boq.xlsx", data=_read(DOCUMENTS / "bill-of-quantities.xlsx"), role="boq"),
        PackPart(
            name="project/compliance-audit.md",
            data=_read(COMPLIANCE / "audit.md"),
            role="compliance",
        ),
    ]


README = """# Engineer review pack

This pack is the project's handoff: the Building Spec, the drawing set, the bar schedule, the
priced BOQ and the compliance audit with the Deviation Register.

**Everything in here is a candidate.** The drawing set, the BBS and the BOQ carry the
"candidate - not for construction" status, and the price list they were priced from is a
candidate card until a human marks it active. The manifest records the sha256 of every part, so
a part that arrived changed can be spotted.

- `manifest.json` - what is in the pack and each part's hash
- `spec.json` - the Building Spec (the source of truth)
- `drawings/` - the drawing set (PDF, the sheets' SVG, the set's manifest)
- `bbs/` - the bar schedule (xlsx + PDF)
- `boq/` - the bill of quantities (xlsx + PDF)
- `compliance/` - the compliance audit and the Deviation Register (markdown + the Bangla HTML)
"""


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the engineer pack and the project bundle.")
    parser.add_argument("--write", action="store_true", help="write the handoff files")
    parser.add_argument("--check", action="store_true", help="verify the committed handoff files")
    args = parser.parse_args()

    spec = _spec()
    project = spec.get("project") or {}
    parts = _engineer_parts()
    manifest = PackManifest(
        project_id=str(project.get("id") or "unknown"),
        project_name=str(project.get("name") or "Untitled project"),
        created=CREATED,
        parts=[
            {"name": part.name, "bytes": len(part.data), "sha256": part.sha256, "role": part.role}
            for part in parts
        ],
        notes="Every part is a candidate; the manifest carries each part's hash.",
    )
    bundle_parts = _bundle_parts()
    bundle_manifest = PackManifest(
        project_id=str(project.get("id") or "unknown"),
        project_name=str(project.get("name") or "Untitled project"),
        created=CREATED,
        parts=[
            {"name": part.name, "bytes": len(part.data), "sha256": part.sha256, "role": part.role}
            for part in bundle_parts
        ],
        notes="The project bundle: the spec and the outputs, for backup and transfer.",
    )

    if args.check:
        problems: list[str] = []
        for target, pack_parts, pack_manifest, readme in (
            (PACK, parts, manifest, README),
            (BUNDLE, bundle_parts, bundle_manifest, ""),
        ):
            if not target.is_file():
                problems.append(f"missing {target.relative_to(ROOT).as_posix()}")
                continue
            # The archive is deterministic, so the same documents give the same bytes.
            rebuilt = target.with_suffix(".rebuilt.zip")
            write_pack(rebuilt, pack_parts, pack_manifest, readme=readme)
            if rebuilt.read_bytes() != target.read_bytes():
                problems.append(f"{target.name} is stale")
            rebuilt.unlink()
        if problems:
            for problem in problems:
                print(f"FAIL {problem}", file=sys.stderr)
            return 1
        print("the committed handoff files are fresh")
        return 0

    write_pack(PACK, parts, manifest, readme=README)
    write_pack(BUNDLE, bundle_parts, bundle_manifest)
    imported = import_bundle(BUNDLE)
    print(
        f"wrote {PACK.relative_to(ROOT).as_posix()} ({PACK.stat().st_size} B, {len(parts)} parts) "
        f"and {BUNDLE.relative_to(ROOT).as_posix()} ({BUNDLE.stat().st_size} B, "
        f"{len(bundle_parts)} parts); the bundle imports back to spec "
        f"{imported['spec']['project']['id']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
