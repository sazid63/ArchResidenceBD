#!/usr/bin/env python3
"""ArchResidenceBD - design payload writer

Accept design assumptions and write them to the spec so the rule engine can read them.
"""

import argparse
import json
import pathlib
import sys
from typing import Any

from archres_core.design import design_project
from archres_core.spec import apply_patch
from archres_core.spec.store import SpecStore
from archres_core.design.project import DesignAssumption

# Default basis for design assumptions (closest available)
DESIGN_ASSUMPTION_BASIS = "conservative_default"


def _write_assumption(
    spec: dict[str, Any],
    assumption: "DesignAssumption",
    provenance_source: str = "assumption",
    provenance_detail: str = "design assumption",
) -> dict[str, Any]:
    """Write a single design assumption into the spec.

    Creates a patch that:
    - Adds/replaces the value at the assumption's pointer
    - Adds an entry to the spec's /assumptions array with the required fields
    - Sets provenance for each touched path
    """
    pointer = assumption.pointer
    ops: list[dict[str, Any]] = []

    # 1. Ensure the spec carries the value (add/replace)
    ops.append({"op": "add", "path": pointer, "value": assumption.value})

    # 2. Add assumption entry if not already present
    existing = spec.get("assumptions") or []
    # Use id based on pointer (hash) to deduplicate
    import hashlib
    assumption_id = f"asm-{hashlib.sha256(pointer.encode()).hexdigest()[:8]}"
    # Check if an assumption with this id already exists
    if not any(entry.get("id") == assumption_id for entry in existing if isinstance(entry, dict)):
        assumption_entry = {
            "id": assumption_id,
            "statement": assumption.reason,
            "basis": DESIGN_ASSUMPTION_BASIS,
            "verifyOnSite": True,
            "relatedPath": pointer,
        }
        # Find the assumptions array path (use "/assumptions")
        ops.append({"op": "add", "path": "/assumptions/-", "value": assumption_entry})

    # Apply the patch with provenance
    provenance = {
        "source": provenance_source,
        "detail": provenance_detail,
        "confidence": "assumption",
    }
    return apply_patch(spec, ops, provenance=provenance)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Write design assumptions into the spec.")
    parser.add_argument(
        "project",
        help="Project folder (contains spec/ directory) or path to spec file",
        type=str,
        nargs="?",
        default=".",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Automatically accept all assumptions without prompt",
    )
    args = parser.parse_args(argv)

    project_path = pathlib.Path(args.project).resolve()
    # If it looks like a spec file, extract its parent as the project folder
    if project_path.suffix == ".json" and (project_path.parent / "spec").exists():
        # Assume it's a spec file inside a project store
        # Try to locate its parent directory in the projects/ hierarchy
        # If the parent is a known projects dir (i.e., the path ends with .../projects/...)
        # This is a simplification: we assume the project folder is the parent of the spec store.
        # The spec file is inside a store folder under a projects directory.
        # For simplicity, we treat the parent of the parent as the project folder.
        pass

    # Try to load the spec from the spec store (projects/*/spec store)
    spec_store = None
    for candidate in project_path.glob("*"):
        if candidate.is_dir() and (candidate / "spec").exists():
            try:
                spec_store = SpecStore(candidate)
                break
            except Exception:
                continue
    if spec_store is None:
        print("ERROR: Could not find a spec store in the given project path.", file=sys.stderr)
        return 1

    tip = spec_store.tip()
    spec = spec_store.load(tip.sha256)

    # Get design assumptions
    design = design_project(spec)
    # The design.assumptions is now a tuple of DesignAssumption (we need to import)
    from archres_core.design.project import DesignAssumption
    assumptions = design.assumptions

    if not assumptions:
        print("No design assumptions found in the design.")
        return 0

    # Print summary
    print(f"Found {len(assumptions)} design assumptions:")
    for i, a in enumerate(assumptions, start=1):
        print(f"  {i}. {a.pointer} = {a.value} {a.unit} (source: {a.source})")

    if not args.yes:
        response = input("\nAccept all assumptions? (y/n): ").strip().lower()
        if response not in {"y", "yes"}:
            print("Aborted.")
            return 0

    # Write each assumption
    written_count = 0
    for a in assumptions:
        # Check if the pointer already has a spec value (if so, skip)
        current = spec
        for token in a.pointer.strip("/").split("/"):
            if not isinstance(current, dict):
                current = None
                break
            current = current.get(token)
        if current is not None:
            print(f"Skipping {a.pointer}: already has a spec value.")
            continue
        spec = _write_assumption(spec, a)
        written_count += 1

    # Write back to spec store (create a new revision)
    new_tip = spec_store.create(spec)
    # Also write the bundle export? The spec store takes care of revision tracking.
    print(f"Written {written_count} assumption(s). New revision: {new_tip.revision}")
    print("Spec updated successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(main())