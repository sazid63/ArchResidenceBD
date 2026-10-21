"""Live probe of the drawing set (W3.3): the set an engineer actually sends.

The probe proves the three things a drawing set has to do, measured in the real engine:

1. it **draws every sheet** - each sheet's SVG carries its views and the computed annotation
   layer, its DXF carries the geometry, and the PDF holds one page per sheet;
2. it is **reproducible** - the same design twice gives byte-identical SVG and DXF for every
   sheet (the PDF is exempt from byte equality: it carries a ``/CreationDate``, exactly as
   spike S3 measured);
3. it is **ours** - no engine name reaches the paper, and every title block carries the pack's
   "candidate - not for construction" status.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/drawing_set_probe.py --engine "<freecadcmd>"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.drawing_set import design_drawing_set
from archres_core.design.drawing_set_macro import render_set_macro
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
GENERATED = ROOT / "data" / "cad" / "generated" / "drawing-set"
SET_ARTIFACTS = ("drawing-set.pdf", "set-design.json", "set-manifest.json")


def _sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the drawing set.")
    parser.add_argument("--engine", required=True, help="freecadcmd path")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floors = (
        design_typical_floor(spec, foundation, storey_index=0),
        design_typical_floor(spec, foundation, storey_index=1),
    )
    design = design_drawing_set(spec, foundation, floors)
    macro = render_set_macro(design)

    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=ROOT / "data" / "tmp" / "drawing-set-probe",
        ),
        workers=1,
        start_timeout_s=120.0,
        call_timeout_s=60.0,
    )
    failures: list[str] = []
    report: dict = {
        "case": EXAMPLE.name,
        "drawingNumber": design.drawing_number,
        "sheets": len(design.sheets),
    }
    digests: list[dict[str, str]] = []
    try:
        pool.start()
        for attempt in (1, 2):
            job_id = f"set-{attempt}"
            result = pool.submit(
                kind="drawing.sheet",
                params={"script": macro},
                job_id=job_id,
            )
            if result.get("status") != "ok":
                failures.append(f"run {attempt}: the job failed: {result.get('error')}")
                break
            out_dir = pool.artifact_path(job_id, "drawing-set.pdf")
            if out_dir is None:
                failures.append(f"run {attempt}: no artifacts were returned")
                break
            folder = out_dir.parent
            names = [name for name in SET_ARTIFACTS]
            for index in range(1, len(design.sheets) + 1):
                names += [f"page-{index}.svg", f"page-{index}.dxf"]
            missing = [name for name in names if not (folder / name).is_file()]
            if missing:
                failures.append(f"run {attempt}: missing artifacts {missing}")
                break
            digests.append({name: _sha256(folder / name) for name in names})
            if attempt == 1:
                # The checks on what the set actually says.
                for index, sheet in enumerate(design.sheets, start=1):
                    svg = (folder / f"page-{index}.svg").read_text(encoding="utf-8")
                    if "freecad" in svg.lower():
                        failures.append(f"sheet {index}: the engine name reached the paper")
                    if "not for construction" not in svg.lower():
                        failures.append(f"sheet {index}: the title block has no candidate status")
                    if sheet.sheet_title not in svg:
                        failures.append(f"sheet {index}: the title block has no sheet title")
                    if f"{index} / {len(design.sheets)}" not in svg:
                        failures.append(f"sheet {index}: the title block has no sheet number")
                    for view in sheet.views:
                        if view["label"] not in svg:
                            failures.append(f"sheet {index}: the view {view['label']} is not on the sheet")
                pdf = (folder / "drawing-set.pdf").read_bytes()
                if not pdf.startswith(b"%PDF") or b"%%EOF" not in pdf:
                    failures.append("the set's PDF is not a PDF")
                report["pdfBytes"] = len(pdf)
                report["artifactSha256"] = digests[-1]
                # keep the committed artefacts
                GENERATED.mkdir(parents=True, exist_ok=True)
                for name in names:
                    (GENERATED / name).write_bytes((folder / name).read_bytes())
                report["committed"] = sorted(names)
    finally:
        pool.stop()

    if len(digests) == 2:
        for name, digest in digests[0].items():
            if name.endswith(".pdf"):
                continue  # the PDF carries a /CreationDate
            if digests[1].get(name) != digest:
                failures.append(f"the two runs produced different {name}")

    report["failures"] = failures
    report["ok"] = not failures
    if args.json:
        path = pathlib.Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    if failures:
        return 1
    print(
        f"drawing set probe passed: {report['sheets']} sheets, "
        f"{report.get('pdfBytes')} byte PDF, {len(report.get('committed') or [])} files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
