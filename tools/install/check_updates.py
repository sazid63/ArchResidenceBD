"""Check what an update would do - and what it refuses.

    uv run --directory core python ../tools/install/check_updates.py --offer offer.json
    uv run --directory core python ../tools/install/check_updates.py --offer offer.json --record plan.json

The offer is a JSON file: ``{"app": {"version": "0.2.0"}, "prices": {"version": "0.2.0",
"status": "active"}}`` - what the update service has ✓ (the update service's job ✓) ✓.

The tool **plans** ✓: it says what would change ✓ and what it refuses ✓, and it changes
nothing ✓ - the app's own update act is a separate, deliberate step ✓ ✓.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.stdio import utf8_stdio
from archres_core.updates import check_updates, update_document

ROOT = pathlib.Path(__file__).resolve().parents[2]


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Plan an update: what would change, and what it refuses."
    )
    parser.add_argument("--offer", required=True, help="what the update service has")
    parser.add_argument("--root", default=str(ROOT), help="the installation to read")
    parser.add_argument("--record", help="where to write the plan")
    args = parser.parse_args(argv)

    offer_path = pathlib.Path(args.offer)
    if not offer_path.is_file():
        print(f"no offer at {offer_path}", file=sys.stderr)
        return 1
    offered = json.loads(offer_path.read_text(encoding="utf-8"))
    if not isinstance(offered, dict):
        print("the offer must be an object", file=sys.stderr)
        return 1

    document = update_document(check_updates(args.root, offered=offered))
    for item in document["channels"]:
        mark = {"update": "would update", "none": "unchanged", "refused": "REFUSED"}[item["action"]]
        print(f"  {item['channel']:8} {item['current']:8} -> {item['offered']:8} {mark}")
        print(f"           {item['reason']}")
    print(f"  the pinned versions: {document['pinned']}")
    print(f"  the counts: {document['counts']}")

    if args.record:
        record = pathlib.Path(args.record)
        record.parent.mkdir(parents=True, exist_ok=True)
        record.write_text(
            json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"  the plan is in {record}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
