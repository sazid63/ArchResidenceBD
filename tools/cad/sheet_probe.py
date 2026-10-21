"""Live probe of the drawing sheet (W2.5): the design becomes a sheet a human can read.

The probe proves the three things a sheet has to do, measured in the real engine:

1. it **draws** - the composed SVG carries the two views and the annotation layer, the DXF
   carries the geometry, the PDF is a real vector PDF (header + EOF);
2. it is **reproducible** - the same design twice gives byte-identical SVG and DXF (the PDF is
   exempt from byte equality: it carries a ``/CreationDate``, exactly as spike S3 measured);
3. it is **ours** - no engine name reaches the sheet, and the title block carries the pack's
   "candidate - not for construction" status.

Usage (from the repo root):
  uv run --directory core python ../tools/cad/sheet_probe.py --engine "<freecadcmd>"
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core.cad.brand import dxf_problems
from archres_core.cad.pool import WorkerConfig, WorkerPool
from archres_core.design import (
    design_foundation,
    design_sheet,
    design_typical_floor,
    render_sheet_macro,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "cad" / "worker" / "worker.py"
LAUNCHER = ROOT / "core" / "src" / "archres_core" / "cad" / "launcher.py"
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
SHEET_ARTIFACTS = ("page.svg", "page.dxf", "page.pdf", "sheet-design.json")


def _sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the drawing sheet generator.")
    parser.add_argument("--engine", required=True, help="freecadcmd path")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()

    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1

    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    design = design_sheet(spec, foundation, floor)
    macro = render_sheet_macro(design)

    pool = WorkerPool(
        WorkerConfig(
            command=[str(engine), str(WORKER)],
            launcher_path=LAUNCHER,
            workdir=ROOT / "data" / "tmp" / "sheet-probe",
        ),
        workers=1,
        start_timeout_s=120.0,
        call_timeout_s=30.0,
    )
    failures: list[str] = []
    report: dict = {"case": EXAMPLE.name, "drawingNumber": design.drawing_number}
    digests: list[dict[str, str]] = []
    try:
        pool.start()
        for attempt in (1, 2):
            job_id = f"sheet-{attempt}"
            result = pool.submit(
                kind="drawing.sheet",
                params={"script": macro},
                job_id=job_id,
            )
            if result.get("status") != "ok":
                failures.append(f"run {attempt}: the job failed: {result.get('error')}")
                break
            out_dir = pool.artifact_path(job_id, "page.svg")
            if out_dir is None:
                failures.append(f"run {attempt}: no artifacts were returned")
                break
            folder = out_dir.parent
            digests.append({name: _sha256(folder / name) for name in SHEET_ARTIFACTS if (folder / name).is_file()})
            missing = [name for name in SHEET_ARTIFACTS if not (folder / name).is_file()]
            if missing:
                failures.append(f"run {attempt}: missing artifacts {missing}")
                continue
            svg = (folder / "page.svg").read_text(encoding="utf-8")
            if "freecad" in svg.lower():
                failures.append(f"run {attempt}: the engine name leaked into the sheet")
            # The DXF is a document the app ships: the upstream name must not be in it, and the
            # strip that removes it must leave the file a readable DXF.
            for problem in dxf_problems(folder / "page.dxf"):
                failures.append(f"run {attempt}: {problem}")
            if svg.count("<g") < 2:
                failures.append(f"run {attempt}: the sheet carries no views")
            if "not for construction" not in svg:
                failures.append(f"run {attempt}: the sheet does not carry the candidate status")
            pdf = (folder / "page.pdf").read_bytes()
            if not pdf.startswith(b"%PDF") or b"%%EOF" not in pdf[-2048:]:
                failures.append(f"run {attempt}: the PDF is not a complete document")
            dxf = (folder / "page.dxf").read_text(encoding="utf-8", errors="replace")
            if "LINE" not in dxf:
                failures.append(f"run {attempt}: the DXF carries no geometry")
            if attempt == 1:
                report["artifacts"] = {
                    name: {"bytes": (folder / name).stat().st_size, "sha256": _sha256(folder / name)}
                    for name in SHEET_ARTIFACTS
                }
        if len(digests) == 2:
            for name in ("page.svg", "page.dxf"):
                if digests[0].get(name) != digests[1].get(name):
                    failures.append(f"{name} is not byte-identical across two runs")
            report["reproducible"] = digests[0] == digests[1] or all(
                digests[0].get(name) == digests[1].get(name)
                for name in ("page.svg", "page.dxf")
            )
    finally:
        pool.stop()

    report["ok"] = not failures
    report["failures"] = failures
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
        "sheet probe passed: "
        + ", ".join(f"{name} {info['bytes']} B" for name, info in report["artifacts"].items())
        + f" (reproducible: {report.get('reproducible')})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
