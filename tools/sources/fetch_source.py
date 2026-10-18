"""Fetch one Source Registry entry into the cache (W0.10 dev/ops tool).

Validates the registry against its schema, then fetches a single source and prints the
provenance record. The product's price service (W2.7) calls archres_core.sources directly.

Usage (from the repo root):

    uv run --directory core python ../tools/sources/fetch_source.py --list
    uv run --directory core python ../tools/sources/fetch_source.py bwdb-schedule-of-rates
    uv run --directory core python ../tools/sources/fetch_source.py <id> --allow-candidate
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.sources import SourceFetchError, fetch_source, load_registry, validate_registry

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_REGISTRY = ROOT / "spec" / "sources" / "registry.yaml"
DEFAULT_SCHEMA = ROOT / "spec" / "schemas" / "source-registry.schema.json"
DEFAULT_CACHE = ROOT / "data" / "cache" / "sources"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch one Source Registry entry into the cache.")
    parser.add_argument("source_id", nargs="?", help="registry source id to fetch")
    parser.add_argument("--list", action="store_true", help="list registry entries instead of fetching")
    parser.add_argument("--registry", type=pathlib.Path, default=DEFAULT_REGISTRY)
    parser.add_argument("--schema", type=pathlib.Path, default=DEFAULT_SCHEMA)
    parser.add_argument("--cache-root", type=pathlib.Path, default=DEFAULT_CACHE)
    parser.add_argument("--allow-candidate", action="store_true", help="dev override: fetch a candidate source (product policy fetches active sources only)")
    args = parser.parse_args(argv)

    try:
        registry = load_registry(args.registry)
        validate_registry(registry, args.schema)
    except SourceFetchError as exc:
        print(f"registry error: {exc}", file=sys.stderr)
        return 2
    except Exception as exc:  # jsonschema.ValidationError and friends
        print(f"registry invalid: {exc}", file=sys.stderr)
        return 2

    sources = {entry["id"]: entry for entry in registry["sources"]}

    if args.list or not args.source_id:
        for entry in registry["sources"]:
            url = entry.get("url", "-")
            print(f"{entry['status']:<9} {entry['id']:<26} {','.join(entry['dataTypes']):<44} {url}")
        return 0

    entry = sources.get(args.source_id)
    if entry is None:
        print(f"unknown source id {args.source_id!r} (see --list)", file=sys.stderr)
        return 2
    if entry["status"] != "active" and not args.allow_candidate:
        print(f"source {args.source_id!r} is {entry['status']} - product policy fetches active sources only (use --allow-candidate for dev)", file=sys.stderr)
        return 2

    try:
        record = fetch_source(entry, args.cache_root)
    except SourceFetchError as exc:
        print(f"fetch failed: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(record, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
