"""The mesh export (W2.8): what the engine measured, in the shape the workspace can draw.

The plan's NativeCAD workspace is a **3D viewport streaming from the engine** (plan §5.3). The
engine's own answer is a FreeCAD shape; the app's viewport wants triangles. This module is the
bridge, and it is deliberately boring: the **same** document the design macro builds is
tessellated, so what the user sees is the geometry the engine measured — not a picture of it,
not an approximation of the design, not a mock.

Two laws:

- **The engine measures, the app draws.** The mesh carries the *measured* volume and the
  measured bounding box of every object, so the app's tree can show the same numbers the
  design does, and a reviewer can compare them.
- **The export is derived, never authored.** The mesh is a *view* of the document the design
  macro builds; the design module does not know that a viewport exists, and the export adds no
  geometry of its own. A shape that is not in the document is not in the mesh.

The transport is a plain JSON document (``mesh.json``): positions, per-triangle normals and
indices per object, plus the object's id, label, kind, phase, measured volume and bounding box.
It is deliberately *not* glTF: a glTF exporter is a format decision that belongs with the
export story (FCStd / DXF / IFC, plan §6), while the viewport needs a payload it can draw
without a parser it does not have yet.
"""

from __future__ import annotations

import json
from typing import Any

#: The artifact the worker writes next to the geometry.
MESH_ARTIFACT = "mesh.json"

#: The document's schema version (the app checks it before it draws).
MESH_SCHEMA_VERSION = "0.1.0"

#: The object-name prefix -> the kind the workspace shows.
OBJECT_KINDS = {
    "Footing": "footing",
    "GradeBeam": "grade-beam",
    "Column": "column",
    "Beam": "beam",
    "Slab": "slab",
}

#: The object-name prefix -> the phase the object belongs to.
OBJECT_PHASES = {
    "Footing": "foundation",
    "GradeBeam": "foundation",
    "Column": "floor",
    "Beam": "floor",
    "Slab": "floor",
}

#: The tessellation deviation in millimetres. The shapes v0 builds are boxes, so the
#: tessellation is exact; the tolerance is here for the shapes that are not (a pile, a curved
#: footing) and is small enough that the measured volume stays the shape's volume.
TESSELLATION_DEVIATION_MM = 0.5

#: The epilogue appended to a design macro. It runs **inside** the engine, after the design
#: macro has built the document, and writes the mesh next to the other artifacts.
MESH_EPILOGUE = '''
# --- the mesh export (W2.8): the workspace draws what the engine measured ---
import json as _json
import os as _os
import pathlib as _pathlib

_KINDS = ''' + repr(OBJECT_KINDS) + '''
_PHASES = ''' + repr(OBJECT_PHASES) + '''
_DEVIATION = ''' + repr(TESSELLATION_DEVIATION_MM) + '''


def _export_mesh(document, out_dir):
    objects = []
    for obj in document.Objects:
        shape = getattr(obj, "Shape", None)
        if shape is None or shape.isNull():
            continue
        points, facets = shape.tessellate(_DEVIATION)
        positions = []
        normals = []
        for facet in facets:
            if len(facet) != 3:
                continue
            p0, p1, p2 = points[facet[0]], points[facet[1]], points[facet[2]]
            ux, uy, uz = p1.x - p0.x, p1.y - p0.y, p1.z - p0.z
            vx, vy, vz = p2.x - p0.x, p2.y - p0.y, p2.z - p0.z
            nx = uy * vz - uz * vy
            ny = uz * vx - ux * vz
            nz = ux * vy - uy * vx
            length = (nx * nx + ny * ny + nz * nz) ** 0.5
            if length <= 0.0:
                continue
            nx, ny, nz = nx / length, ny / length, nz / length
            for index in facet:
                point = points[index]
                positions.extend([point.x, point.y, point.z])
                normals.extend([nx, ny, nz])
        box = shape.BoundBox
        prefix = obj.Name.split("_")[0]
        objects.append(
            {
                "id": obj.Name,
                "label": obj.Label,
                "kind": _KINDS.get(prefix, "other"),
                "phase": _PHASES.get(prefix, "other"),
                "volumeMm3": round(shape.Volume, 3),
                "bboxMinMm": [round(box.XMin, 4), round(box.YMin, 4), round(box.ZMin, 4)],
                "bboxMaxMm": [round(box.XMax, 4), round(box.YMax, 4), round(box.ZMax, 4)],
                "positions": [round(value, 4) for value in positions],
                "normals": [round(value, 6) for value in normals],
                "indices": list(range(len(positions) // 3)),
            }
        )
    payload = {"schemaVersion": ''' + repr(MESH_SCHEMA_VERSION) + ''', "units": "mm", "objects": objects}
    target = _pathlib.Path(out_dir) / ''' + repr(MESH_ARTIFACT) + '''
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        _json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\\n", encoding="utf-8"
    )


_export_mesh(App.ActiveDocument, _os.environ["ARCHRES_JOB_OUTDIR"])
'''


def mesh_macro(design_macro: str) -> str:
    """The design's macro plus the mesh export (the workspace's view of the same document)."""
    return design_macro.rstrip("\n") + "\n" + MESH_EPILOGUE


def merge_meshes(meshes: list[dict[str, Any]]) -> dict[str, Any]:
    """One mesh document out of several (the foundation's mesh and the floor's mesh)."""
    objects: list[dict[str, Any]] = []
    for mesh in meshes:
        objects.extend(mesh.get("objects") or [])
    return {
        "schemaVersion": MESH_SCHEMA_VERSION,
        "units": "mm",
        "objects": objects,
    }


def summarize(mesh: dict[str, Any]) -> dict[str, Any]:
    """The numbers the probe and the workspace both quote (objects, triangles, volume)."""
    objects = mesh.get("objects") or []
    triangles = 0
    vertices = 0
    volume = 0.0
    kinds: dict[str, int] = {}
    phases: dict[str, int] = {}
    for item in objects:
        indices = item.get("indices") or []
        triangles += len(indices) // 3
        vertices += len(item.get("positions") or []) // 3
        volume += float(item.get("volumeMm3") or 0.0)
        kind = str(item.get("kind") or "other")
        kinds[kind] = kinds.get(kind, 0) + 1
        phase = str(item.get("phase") or "other")
        phases[phase] = phases.get(phase, 0) + 1
    return {
        "objects": len(objects),
        "triangles": triangles,
        "vertices": vertices,
        "volumeM3": round(volume / 1_000_000_000.0, 6),
        "byKind": dict(sorted(kinds.items())),
        "byPhase": dict(sorted(phases.items())),
    }


def mesh_bytes(mesh: dict[str, Any]) -> int:
    """The document's size in bytes (what the app downloads)."""
    return len(json.dumps(mesh, ensure_ascii=False, sort_keys=True).encode("utf-8")) + 1


__all__ = [
    "MESH_ARTIFACT",
    "MESH_EPILOGUE",
    "MESH_SCHEMA_VERSION",
    "OBJECT_KINDS",
    "OBJECT_PHASES",
    "TESSELLATION_DEVIATION_MM",
    "merge_meshes",
    "mesh_bytes",
    "mesh_macro",
    "summarize",
]
