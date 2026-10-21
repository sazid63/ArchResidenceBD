"""The mesh export (W2.8): the engine's geometry, in the shape the workspace draws."""

from __future__ import annotations

import json
import pathlib

from archres_core.cad.mesh import (
    MESH_ARTIFACT,
    MESH_EPILOGUE,
    MESH_SCHEMA_VERSION,
    merge_meshes,
    mesh_bytes,
    mesh_macro,
    summarize,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
MESH_PATH = ROOT / "data" / "cad" / "generated" / "two-storey-residential.mesh.json"


def test_the_export_is_appended_to_the_design_macro() -> None:
    macro = mesh_macro("build()\n")
    assert macro.startswith("build()\n")
    assert "_export_mesh(App.ActiveDocument" in macro
    assert MESH_ARTIFACT in macro


def test_the_export_reads_only_the_document() -> None:
    # The export adds no geometry of its own: it tessellates what the design macro built.
    assert "document.Objects" in MESH_EPILOGUE
    assert "shape.tessellate" in MESH_EPILOGUE
    assert "makeBox" not in MESH_EPILOGUE
    assert "makeCylinder" not in MESH_EPILOGUE


def test_the_summary_counts_what_the_document_holds() -> None:
    mesh = {
        "schemaVersion": MESH_SCHEMA_VERSION,
        "units": "mm",
        "objects": [
            {
                "id": "Footing_F1",
                "kind": "footing",
                "phase": "foundation",
                "volumeMm3": 432_000_000.0,
                "positions": [0.0] * 9,
                "normals": [0.0] * 9,
                "indices": [0, 1, 2],
            },
            {
                "id": "Column_C1",
                "kind": "column",
                "phase": "floor",
                "volumeMm3": 270_000_000.0,
                "positions": [0.0] * 9,
                "normals": [0.0] * 9,
                "indices": [0, 1, 2],
            },
        ],
    }
    summary = summarize(mesh)
    assert summary["objects"] == 2
    assert summary["triangles"] == 2
    assert summary["volumeM3"] == 0.702
    assert summary["byPhase"] == {"floor": 1, "foundation": 1}


def test_two_meshes_merge_into_one_document() -> None:
    merged = merge_meshes(
        [
            {"objects": [{"id": "Footing_F1"}]},
            {"objects": [{"id": "Column_C1"}]},
        ]
    )
    assert [item["id"] for item in merged["objects"]] == ["Footing_F1", "Column_C1"]
    assert merged["units"] == "mm"


def test_the_committed_mesh_agrees_with_the_design() -> None:
    """The committed mesh is the engine's measurement - and it still matches the design."""
    from archres_core.design import design_foundation, design_typical_floor

    spec = json.loads(
        (ROOT / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    mesh = json.loads(MESH_PATH.read_text(encoding="utf-8"))
    summary = summarize(mesh)
    assert summary["objects"] == len(foundation.expected_objects()) + len(floor.expected_objects())
    # The volume the engine measured is the volume the design declared.
    designed = sum(
        float(item["volumeM3"]) for item in foundation.expected_objects() + floor.expected_objects()
    )
    assert abs(summary["volumeM3"] - designed) <= 0.01 * designed
    assert mesh_bytes(mesh) == MESH_PATH.stat().st_size
