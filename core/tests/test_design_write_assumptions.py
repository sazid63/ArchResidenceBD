"""Tests for the design.write_assumptions bridge method.

Ensures that accepted design assumptions are correctly written into the spec
as values and assumption entries.
"""

from __future__ import annotations

import pathlib

from archres_core.bridge import Bridge
from archres_core.spec import SpecStore

ROOT = pathlib.Path(__file__).resolve().parents[2]

def _create_project(tmp_path: pathlib.Path) -> str:
    """Create a fresh project with a full example spec and return its folder path."""
    bridge = Bridge(root=ROOT)
    reply = bridge.handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {
                "name": "WriteAssumpTest",
                "projects": str(tmp_path / "projects"),
                "template": "new-project",
            },
        }
    )
    assert not reply.get("error"), reply
    project_path = reply["result"]["path"]
    # Load a full example spec and commit it as the initial revision
    import json
    example_spec_path = ROOT / "spec" / "examples" / "two-storey-residential.json"
    example_spec = json.loads(example_spec_path.read_text(encoding="utf-8"))
    store = SpecStore(project_path)
    parent_sha = store.tip().sha256
    store.commit_snapshot(parent_sha, example_spec)
    return project_path

def test_write_assumptions_round_trip(tmp_path: pathlib.Path) -> None:
    """Run design, write its assumptions, and verify they land in the spec."""
    project_path = _create_project(tmp_path)
    bridge = Bridge(root=ROOT)

    # Run design to get the assumption list
    run_reply = bridge.handle({"id": "2", "method": "design.run", "params": {"project": project_path}})
    assert not run_reply.get("error"), run_reply
    assumptions = run_reply["result"]["assumptions"]
    assert assumptions, "design.run should return some assumptions"

    # Collect the pointers to write back
    pointers = [a["pointer"] for a in assumptions]

    # Invoke the write method
    write_reply = bridge.handle(
        {
            "id": "3",
            "method": "design.write_assumptions",
            "params": {"project": project_path, "assumptions": pointers},
        }
    )
    assert not write_reply.get("error"), write_reply
    assert write_reply["result"]["assumptionsWritten"] == len(pointers)

    # Load the spec and verify values and assumption entries exist
    store = SpecStore(project_path)
    tip = store.tip()
    spec = store.load(tip.sha256)

    # Every pointer should now have a value in the spec
    def _resolve_path(spec: dict, pointer: str) -> Any:
        """Resolve a JSON pointer that may traverse lists identified by 'id' keys."""
        parts = pointer.strip("/").split("/")
        cur: Any = spec
        for part in parts:
            if isinstance(cur, dict):
                cur = cur.get(part)
            elif isinstance(cur, list):
                cur = next((item for item in cur if isinstance(item, dict) and item.get("id") == part), None)
            else:
                cur = None
                break
        return cur

    for ptr in pointers:
        cur = _resolve_path(spec, ptr)
        assert cur is not None, f"Pointer {ptr} missing in spec after write"

    # The spec's /assumptions array should contain entries for each pointer
    recorded = spec.get("assumptions") or []
    recorded_ptrs = {entry.get("relatedPath") for entry in recorded if isinstance(entry, dict)}
    for ptr in pointers:
        assert ptr in recorded_ptrs, f"Assumption entry for {ptr} not recorded"

    # The spec's /assumptions array should contain entries for each pointer
    recorded = spec.get("assumptions") or []
    recorded_ptrs = {entry.get("relatedPath") for entry in recorded if isinstance(entry, dict)}
    for ptr in pointers:
        assert ptr in recorded_ptrs, f"Assumption entry for {ptr} not recorded"

