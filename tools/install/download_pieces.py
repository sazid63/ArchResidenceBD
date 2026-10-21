"""Run the install's download slice: the pieces the plan names, in order, checked.

    uv run --directory core python ../tools/install/download_pieces.py --plan plan.json
    uv run --directory core python ../tools/install/download_pieces.py --plan plan.json --dry-run

The plan is a JSON file: ``{"urls": {"<piece id>": "https://..."}}`` — the installer's list
of where each piece comes from ✓ (the source registry's law: fetching is explicit ✓, never a
side effect ✓ ✓).

The download writes into the install folder ✓ and reports what it verified ✓ and what it did
not ✓ — and an unverified piece is **not** installed ✓ ✓.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.downloads import download_document, download_plan, fetch_piece
from archres_core.install import the_manifest
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_INSTALL = ROOT / "data" / "install"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Fetch the install's pieces: the core pack first, resumable and checked."
    )
    parser.add_argument("--plan", required=True, help="the plan: {urls: {piece id: url}}")
    parser.add_argument("--install", default=str(DEFAULT_INSTALL), help="the install folder")
    parser.add_argument("--dry-run", action="store_true", help="print the plan and stop")
    parser.add_argument("--record", help="where to write the download's record")
    args = parser.parse_args(argv)

    plan_path = pathlib.Path(args.plan)
    if not plan_path.is_file():
        print(f"no plan at {plan_path}", file=sys.stderr)
        return 1
    document = json.loads(plan_path.read_text(encoding="utf-8"))
    urls = document.get("urls")
    if not isinstance(urls, dict) or not urls:
        print("the plan carries no urls", file=sys.stderr)
        return 1

    manifest = the_manifest()
    try:
        plan = download_plan(manifest, urls)
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(f"the plan: {len(plan.entries)} piece(s), in this order:")
    for part_id, url, path in plan.entries:
        print(f"   {part_id:16} {path:52} {url}")

    if args.dry_run:
        return 0

    install = pathlib.Path(args.install)
    results = []
    for part_id, url, path in plan.entries:
        part = manifest.by_id(part_id)
        try:
            result = fetch_piece(part, url, install / path)
        except Exception as exc:
            print(f"  {part_id}: {exc}", file=sys.stderr)
            continue
        results.append(result)
        mark = "verified" if result.verified else "NOT verified"
        print(f"  {part_id}: {mark} - {result.reason}")

    record = download_document(plan, results)
    record_path = (
        pathlib.Path(args.record)
        if args.record
        else install / "downloads.json"
    )
    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(
        json.dumps(record, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"  the record is in {record_path}")
    return 0 if record["counts"]["unverified"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
