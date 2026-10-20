"""Candidate: build foundations in the CAD document (W1.8).

This is the *first real CAD generator* the app has, and the reason W1.8 exists: from here on,
"the model wrote a script that builds a foundation" is a claim that can be executed and
measured instead of argued about. The candidate only builds; the harness measures (volume,
bounding box, solids, validity) and compares against the case.

Params (all optional, defaults give a 2-pad footing line):

```json
{"pads": 6, "columnsPerPad": 3, "padMm": [1200, 1200, 300], "columnMm": [300, 300, 2700]}
```

Geometry: each pad is a rectangular footing; ``columnsPerPad`` columns stand on it in a row,
fused into one solid; the pads are laid out along X with a gap. Every dimension is in
millimetres and comes from the params - no magic numbers - and the script writes a small JSON
summary of what it built so a human can diff two runs. It never writes into the repository:
output goes to ``ARCHRES_JOB_OUTDIR`` when the harness set one.

Deliberately *not* here: number derivation from a Building Spec (that is W2.2) and any rebar
(W2.4). This is the verify seam's first subject, and it is honest about being small.
"""

from __future__ import annotations

import json
import os
import pathlib

import FreeCAD as App  # noqa: N813 - the engine's canonical import name
import Part


def _mm(params: dict, key: str, default: list[float], count: int) -> list[float]:
    raw = params.get(key, default)
    if not isinstance(raw, (list, tuple)) or len(raw) != count:
        raise ValueError(f"params.{key} must be a list of {count} numbers")
    values = [float(item) for item in raw]
    if any(value <= 0 for value in values):
        raise ValueError(f"params.{key} must be positive, got {values}")
    return values


def _count(params: dict, key: str, default: int, minimum: int = 1) -> int:
    raw = params.get(key, default)
    if not isinstance(raw, int) or isinstance(raw, bool):
        raise ValueError(f"params.{key} must be an integer")
    if raw < minimum:
        raise ValueError(f"params.{key} must be at least {minimum}, got {raw}")
    return raw


def _params() -> dict:
    path = os.environ.get("ARCHRES_JOB_PARAMS")
    if not path:
        return {}
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return raw.get("params") or {}


def build(params: dict) -> list[Part.Shape]:
    pads = _count(params, "pads", 2)
    columns = _count(params, "columnsPerPad", 3)
    pad_x, pad_y, pad_z = _mm(params, "padMm", [1200.0, 1200.0, 300.0], 3)
    col_x, col_y, col_z = _mm(params, "columnMm", [300.0, 300.0, 2700.0], 3)
    gap = float(params.get("gapMm", 600.0))
    if gap < 0:
        raise ValueError("params.gapMm must not be negative")
    if columns * col_x > pad_x:
        raise ValueError("the columns do not fit on the pad: reduce columnsPerPad")

    step = pad_x + gap
    spacing = pad_x / columns
    solids: list[Part.Shape] = []
    for index in range(pads):
        origin_x = index * step
        pad = Part.makeBox(pad_x, pad_y, pad_z, App.Vector(origin_x, 0.0, -pad_z))
        fused = pad
        for column in range(columns):
            centre = origin_x + spacing * (column + 0.5)
            column_box = Part.makeBox(
                col_x,
                col_y,
                col_z,
                App.Vector(centre - col_x / 2.0, (pad_y - col_y) / 2.0, 0.0),
            )
            fused = fused.fuse(column_box)
        solids.append(fused.removeSplitter())
    return solids


def main() -> None:
    params = _params()
    document = App.ActiveDocument
    if document is None:
        raise RuntimeError("no active document: the launcher always creates one")
    shapes = build(params)
    for index, shape in enumerate(shapes, start=1):
        obj = document.addObject("Part::Feature", f"Pad_{index}")
        obj.Shape = shape
        # A padded name keeps the layout readable in the tree without leaking into the case.
        obj.Label = f"Pad {index}"
    document.recompute()

    out_dir = os.environ.get("ARCHRES_JOB_OUTDIR")
    if out_dir:
        summary = {
            "pads": len(shapes),
            "columnsPerPad": _count(params, "columnsPerPad", 3),
            "volumeM3": round(sum(shape.Volume for shape in shapes) / 1e9, 6),
            "objects": [obj.Name for obj in document.Objects],
        }
        target = pathlib.Path(out_dir) / "foundation-summary.json"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(summary, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
            encoding="utf-8",
        )


if __name__ == "__main__":  # noqa: SIM108 - freecadcmd sets __name__ to the stem, so also:
    main()
else:  # pragma: no cover - the path freecadcmd takes
    main()
