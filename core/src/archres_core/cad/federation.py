"""The federation (W2.9): a shared datum, one file per phase, and a master that links them.

The plan's deliverable is a **federated 3D model**: per-phase models plus a combined master
(plan §6), and the NativeCAD layer keeps "federation (shared datum; per-phase FCStd files; master
via App::Link; regenerate only changed phases)" (plan §5.3).

Three laws shape this module:

- **One datum.** Every phase's model is built in the project's datum, so the parts agree by
  construction instead of by a later nudge. The datum is a small JSON document - the origin, the
  axes, the unit, the project - and it is written into every phase file and into the master, so
  a reader of the file knows which datum the geometry is in.
- **One file per phase.** A phase is a document: the foundation, the first floor. Keeping them
  apart is what makes "regenerate only the phase that changed" possible (that gate is W2.11).
- **The master links; it does not copy.** The master holds App::Link objects to the phase files.
  A link shows the phase's geometry and keeps the phase's file as the single source of truth -
  copying the shapes would create a second building that has to be kept in step by hand.

The export is a *view* of the documents the design macros build, exactly like the mesh export
(W2.8): the phase files are the engine's own documents, saved where the design put them.
"""

from __future__ import annotations

import json
from typing import Any

#: The datum document's name (written next to the phase files).
DATUM_FILE = "datum.json"

#: The phase file's name inside a job's output directory.
PHASE_FILE = "phase.FCStd"

#: The master file's name inside a job's output directory.
MASTER_FILE = "master.FCStd"

#: The master's measurement document.
MASTER_MEASUREMENT = "master.json"


def build_datum(spec: dict[str, Any]) -> dict[str, Any]:
    """The project's shared datum: the origin every phase's model is built in.

    The Building Spec is the single source of truth (plan §5.4); the datum is read from it, not
    invented. v0's datum is the project origin with millimetre axes - the same coordinate system
    the design chain already builds in, which is why the floor sits on the foundation's grid by
    construction.
    """
    project = spec.get("project") or {}
    site = spec.get("site") or {}
    address = site.get("address") or {}
    return {
        "schemaVersion": "0.1.0",
        "projectId": str(project.get("id") or "unknown"),
        "name": "project-origin",
        "units": "mm",
        "origin": [0.0, 0.0, 0.0],
        "axes": {"x": [1.0, 0.0, 0.0], "y": [0.0, 1.0, 0.0], "z": [0.0, 0.0, 1.0]},
        "upAxis": "z",
        "location": {
            "division": address.get("division"),
            "district": address.get("district"),
        },
        "note": (
            "every phase's model is built in this datum; the master links the phase files "
            "without moving them"
        ),
    }


def phase_macro(design_macro: str) -> str:
    """The design's macro plus the federation epilogue (write the datum, save this phase)."""
    return design_macro.rstrip("\n") + "\n" + PHASE_EPILOGUE


def master_macro() -> str:
    """The master macro: link every phase file into one document and measure the result."""
    return MASTER_MACRO


#: The epilogue appended to a design macro. It runs inside the engine, after the design macro
#: has built the document.
PHASE_EPILOGUE = '''
# --- the federation (W2.9): this phase's file, in the shared datum ---
import json as _json
import os as _os
import pathlib as _pathlib

import FreeCAD as _App

_params = _json.loads(
    _pathlib.Path(_os.environ["ARCHRES_JOB_PARAMS"]).read_text(encoding="utf-8")
)["params"]
_out = _pathlib.Path(_os.environ["ARCHRES_JOB_OUTDIR"])
_document = _App.ActiveDocument
_document.addProperty(
    "App::PropertyString", "ArchresDatum", "ArchResidenceBD", "the shared datum"
)
_document.addProperty(
    "App::PropertyString", "ArchresPhase", "ArchResidenceBD", "the phase this file holds"
)
_document.ArchresDatum = _json.dumps(_params.get("datum") or {}, sort_keys=True)
_document.ArchresPhase = str(_params.get("phase") or "")
_document.saveAs(str(_out / ''' + repr(PHASE_FILE) + '''))
'''

#: The master macro: it opens each phase file, links its shapes, and measures the result.
MASTER_MACRO = '''
# --- the federation master (W2.9): link the phases, do not copy them ---
import json as _json
import os as _os
import pathlib as _pathlib

import FreeCAD as _App

_params = _json.loads(
    _pathlib.Path(_os.environ["ARCHRES_JOB_PARAMS"]).read_text(encoding="utf-8")
)["params"]
_out = _pathlib.Path(_os.environ["ARCHRES_JOB_OUTDIR"])
_master = _App.newDocument("archres-master")
# The owner document must exist on disk before it can hold links to other documents.
_master.saveAs(str(_out / ''' + repr(MASTER_FILE) + '''))
_master.addProperty(
    "App::PropertyString", "ArchresDatum", "ArchResidenceBD", "the shared datum"
)
_master.ArchresDatum = _json.dumps(_params.get("datum") or {}, sort_keys=True)

# The master carries the MEP's points and schedules and the clash report (plan §6: the
# combined master holds the MEP points + schedules and the clash/coordination report). They
# are properties, because the phases' geometry is linked and their data travels with it.
_mep = _params.get("mep")
if _mep:
    _master.addProperty(
        "App::PropertyString",
        "ArchresMep",
        "ArchResidenceBD",
        "the MEP points and schedules",
    )
    _master.ArchresMep = _json.dumps(_mep, ensure_ascii=False, sort_keys=True)
_clashes = _params.get("clashReport")
if _clashes:
    _master.addProperty(
        "App::PropertyString",
        "ArchresClashReport",
        "ArchResidenceBD",
        "the clash and coordination report",
    )
    _master.ArchresClashReport = _clashes

links = []
for entry in _params.get("phases") or []:
    _document = _App.openDocument(str(entry["path"]))
    for _object in list(_document.Objects):
        if _object.TypeId != "Part::Feature":
            continue
        _link = _master.addObject("App::Link", str(_object.Name))
        _link.LinkedObject = _object
        _link.Label = str(_object.Label)
        links.append(
            {
                "phase": str(entry.get("phase") or ""),
                "id": str(_object.Name),
                "label": str(_object.Label),
                "volumeMm3": round(float(_link.Shape.Volume), 3),
            }
        )
    _App.closeDocument(_document.Name)

_master.recompute()
_master.save()
(_out / ''' + repr(MASTER_MEASUREMENT) + ''').write_text(
    _json.dumps(
        {
            "links": len(links),
            "objects": links,
            "master": str(_out / ''' + repr(MASTER_FILE) + '''),
            "mep": _mep or None,
            "clashReport": _clashes or None,
        },
        ensure_ascii=False,
        indent=1,
        sort_keys=True,
    )
    + "\\n",
    encoding="utf-8",
)
'''


def summarize_master(measurement: dict[str, Any]) -> dict[str, Any]:
    """The numbers the master is judged by (links, objects, volume, per phase)."""
    objects = measurement.get("objects") or []
    by_phase: dict[str, int] = {}
    volume = 0.0
    for item in objects:
        phase = str(item.get("phase") or "other")
        by_phase[phase] = by_phase.get(phase, 0) + 1
        volume += float(item.get("volumeMm3") or 0.0)
    return {
        "links": int(measurement.get("links") or 0),
        "objects": len(objects),
        "volumeM3": round(volume / 1_000_000_000.0, 6),
        "byPhase": dict(sorted(by_phase.items())),
    }


__all__ = [
    "DATUM_FILE",
    "MASTER_FILE",
    "MASTER_MACRO",
    "MASTER_MEASUREMENT",
    "PHASE_EPILOGUE",
    "PHASE_FILE",
    "build_datum",
    "master_macro",
    "phase_macro",
    "summarize_master",
]
