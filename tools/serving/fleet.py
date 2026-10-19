"""Fleet CLI (W1.11): render or verify the llama-swap config, or print the fleet summary.

Source of truth: spec/models/fleet.json + spec/models/registry.json
Rendered (committed): spec/models/llama-swap.yaml

Usage (from the repo root):
  uv run --directory core python ../tools/serving/fleet.py              # render in place
  uv run --directory core python ../tools/serving/fleet.py --check      # verify freshness (CI)
  uv run --directory core python ../tools/serving/fleet.py --summary    # routes, groups, modes
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from archres_core.serving import FleetError, is_fresh, load_fleet, write_fleet

ROOT = Path(__file__).resolve().parents[2]
FLEET = ROOT / "spec" / "models" / "fleet.json"


def main() -> int:
    parser = argparse.ArgumentParser(description="Render or verify the model fleet config.")
    parser.add_argument("--fleet", default=str(FLEET), help="fleet JSON (default: spec/models/fleet.json)")
    parser.add_argument("--check", action="store_true", help="verify the committed config is fresh; write nothing")
    parser.add_argument("--summary", action="store_true", help="print the validated fleet summary as JSON")
    args = parser.parse_args()

    try:
        fleet = load_fleet(args.fleet)
    except FleetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.summary:
        print(json.dumps(fleet.to_dict(), ensure_ascii=False, indent=2))
        return 0

    if args.check:
        if not is_fresh(fleet):
            print(
                f"STALE {fleet.generated_path.relative_to(ROOT).as_posix()} - regenerate: "
                "uv run --directory core python ../tools/serving/fleet.py",
                file=sys.stderr,
            )
            return 1
        print(f"fleet config is fresh ({len(fleet.routes)} routes, {len(fleet.modes)} modes)")
        return 0

    path = write_fleet(fleet)
    print(f"rendered {path.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
