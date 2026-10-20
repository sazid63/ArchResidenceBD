"""In-engine launcher: run one candidate script and measure what it actually built (W1.8).

This file is executed **inside the CAD engine** (``freecadcmd``), not by the app. It is
deliberately plain: standard library plus the engine's own modules. The harness passes
everything through the environment:

======================  ==========================================================
``ARCHRES_CANDIDATE``   absolute path of the candidate script (a FreeCAD macro)
``ARCHRES_JOB_PARAMS``  absolute path of the JSON params file for this job
``ARCHRES_JOB_OUT``     absolute path the launcher must write ``result.json`` to
``ARCHRES_JOB_OUTDIR``  directory the candidate may write artifacts into
======================  ==========================================================

The candidate only *builds geometry in the document*; it never reports its own volume or
bounding box. The launcher walks the resulting document afterwards and measures every
shape, so a candidate cannot pass by claiming a number. Artifacts are hashed the same way.
The launcher writes ``result.json`` even when the candidate fails and exits 0 in that case:
a candidate error is *data* for the verifier (and for repair traces), not an engine failure.
Exit code 3 means the launcher itself could not produce a result (missing engine module,
unreadable params) - the harness reports that as ``no_result`` rather than as a pass.

FreeCAD quirk (spike S4): ``freecadcmd`` sets ``__name__`` to the *file stem*, so a script
must not rely on ``if __name__ == "__main__"``. This launcher runs at module level, and it
runs the candidate through ``runpy.run_path(..., run_name="__main__")`` so candidate macros
behave exactly as they do when a user opens them.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import runpy
import sys
import time
import traceback

OUT_MARKER = "ARCHRES_JOB_OUT"
RESULT_NAME = "result.json"


def _env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"missing environment variable {name}")
    return value


def _write(out_path: pathlib.Path, payload: dict) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _artifacts(out_dir: pathlib.Path) -> list[dict]:
    if not out_dir.is_dir():
        return []
    items: list[dict] = []
    for path in sorted(out_dir.rglob("*")):
        if not path.is_file() or path.name == RESULT_NAME:
            continue
        payload = path.read_bytes()
        items.append(
            {
                "name": path.relative_to(out_dir).as_posix(),
                "sizeBytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
            }
        )
    return items


def _objects(doc) -> list[dict]:
    measured: list[dict] = []
    for obj in doc.Objects:
        shape = getattr(obj, "Shape", None)
        if shape is None:
            continue
        box = shape.BoundBox
        measured.append(
            {
                "name": obj.Name,
                "volumeM3": round(shape.Volume / 1_000_000_000.0, 9),
                "bboxMm": [
                    round(box.XLength, 6),
                    round(box.YLength, 6),
                    round(box.ZLength, 6),
                ],
                "solids": len(shape.Solids),
                "valid": bool(shape.isValid()),
            }
        )
    return measured


def _frames(exc: BaseException, limit: int = 6) -> list[dict]:
    frames = traceback.extract_tb(exc.__traceback__)
    return [
        {"file": pathlib.Path(frame.filename).name, "line": frame.lineno, "source": frame.line}
        for frame in frames[-limit:]
    ]


def execute(candidate: pathlib.Path, out_dir: pathlib.Path, params: dict) -> dict:
    """Run one candidate in a fresh document and measure what it actually built.

    Returns the result payload instead of writing it: the one-shot launcher writes it to
    ``result.json`` (W1.8), and the persistent worker (W2.1) returns it over the frozen job
    protocol. Same measurement, same shape, one implementation.
    """
    started = time.monotonic()
    result: dict = {
        "status": "ok",
        "engine": "freecad",
        "engineVersion": None,
        "jobKind": params.get("kind"),
        "params": params.get("params") or {},
        "objects": [],
        "artifacts": [],
        "warnings": [],
        "notes": [],
    }
    doc = None
    try:
        import FreeCAD  # noqa: PLC0415 - only exists inside the engine

        result["engineVersion"] = ".".join(str(part) for part in FreeCAD.Version()[:3])
        doc = FreeCAD.newDocument("job")
        runpy.run_path(str(candidate), run_name="__main__")
        doc = FreeCAD.ActiveDocument or doc
        doc.recompute()
        result["objects"] = _objects(doc)
    except BaseException as exc:  # the candidate may raise anything, incl. SystemExit
        result["status"] = "error"
        result["errorCode"] = "engine_error"
        result["errorType"] = type(exc).__name__
        result["message"] = str(exc) or type(exc).__name__
        result["traceback"] = traceback.format_exc()
        result["frames"] = _frames(exc)
    finally:
        try:
            if doc is not None:
                result["documentObjects"] = [obj.Name for obj in doc.Objects]
                import FreeCAD  # noqa: PLC0415

                FreeCAD.closeDocument(doc.Name)
        except Exception:  # closing is best effort; never mask the candidate's error
            result["warnings"].append("document could not be closed cleanly")
        result["artifacts"] = _artifacts(out_dir)
        result["durationMs"] = round((time.monotonic() - started) * 1000.0, 3)
    return result


def main() -> int:
    out_path = pathlib.Path(_env(OUT_MARKER))
    out_dir = pathlib.Path(os.environ.get("ARCHRES_JOB_OUTDIR"))
    params_path = pathlib.Path(_env("ARCHRES_JOB_PARAMS"))
    candidate = pathlib.Path(_env("ARCHRES_CANDIDATE"))

    try:
        params = json.loads(params_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"cannot read job params: {exc}", file=sys.stderr)
        return 3

    result = execute(candidate, out_dir, params)
    _write(out_path, result)
    return 0


if os.environ.get("ARCHRES_CANDIDATE"):
    # freecadcmd sets __name__ to the file stem, so this module-level guard (not
    # `__name__ == "__main__"`) is what actually runs inside the engine. A plain import
    # (tests, tooling) has no candidate in the environment and does nothing.
    sys.exit(main())
