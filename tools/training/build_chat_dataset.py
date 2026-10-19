"""Build the scripted chat dataset (W1.5) - deterministic, pinned, reviewable.

Outputs (committed under data/training/chat-v0/):

  dataset.jsonl   every verified scripted record, canonical JSONL (sorted by task/id)
  sample.jsonl    the golden review slice (one record per shape)
  manifest.json   generator/prompt versions, artifact pins, counts and file hashes

Nothing here touches the network. Teacher augmentation is a separate, opt-in command
(tools/training/teacher_augment.py) and its candidates are not part of this dataset.

Usage (from the repo root):
  uv run --directory core python ../tools/training/build_chat_dataset.py
  uv run --directory core python ../tools/training/build_chat_dataset.py --check

Exit codes: 0 = written / fresh; 1 = build failure or stale outputs.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

from archres_core.stdio import utf8_stdio
from archres_core.training import build_chat_dataset, sample_records, write_jsonl

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLOW_BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
EXAMPLES = ROOT / "spec" / "examples"
SFT_SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
SPEC_SCHEMA = ROOT / "spec" / "schemas" / "building-spec.schema.json"
DEFAULT_OUT = ROOT / "data" / "training" / "chat-v0"
MANIFEST_VERSION = "1"


def _build(out: pathlib.Path) -> dict:
    dataset = build_chat_dataset(
        flow_book_path=FLOW_BOOK,
        pack_path=PACK,
        examples_dir=EXAMPLES,
        sft_schema_path=SFT_SCHEMA,
        building_spec_schema_path=SPEC_SCHEMA,
    )
    sample = sample_records(dataset)
    out.mkdir(parents=True, exist_ok=True)

    files: dict[str, dict] = {}
    for name, records in (("dataset.jsonl", dataset.records), ("sample.jsonl", sample)):
        stats = write_jsonl(records, out / name)
        files[name] = {
            "records": stats["records"],
            "bytes": stats["bytes"],
            "sha256": stats["sha256"],
        }

    manifest = {
        "manifestVersion": MANIFEST_VERSION,
        "generatorVersion": dataset.pins["generatorVersion"],
        "promptVersion": dataset.pins["promptVersion"],
        "pins": dataset.pins,
        "counts": dataset.counts,
        "coverage": dataset.coverage,
        "files": files,
    }
    text = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (out / "manifest.json").write_text(text, encoding="utf-8", newline="\n")
    return manifest


def _compare(expected: pathlib.Path, actual: pathlib.Path) -> bool:
    if not actual.exists():
        print(f"MISSING {actual.relative_to(ROOT).as_posix()}", file=sys.stderr)
        return False
    if expected.read_bytes() != actual.read_bytes():
        print(f"STALE {actual.relative_to(ROOT).as_posix()}", file=sys.stderr)
        return False
    return True


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the scripted chat dataset (or verify freshness).")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output directory")
    parser.add_argument("--check", action="store_true", help="verify committed outputs are fresh; write nothing")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out = out if out.is_absolute() else ROOT / out

    if not args.check:
        manifest = _build(out)
        counts = manifest["counts"]
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {counts['total']} records "
            f"({counts['byTask']['interview.ask']} ask, {counts['byTask']['interview.parse']} parse, "
            f"{counts['byTask']['rule.explain']} explain, "
            f"{counts['byTask']['deviation.override']} override)"
        )
        return 0

    with tempfile.TemporaryDirectory() as temp:
        temp_dir = pathlib.Path(temp)
        _build(temp_dir)
        ok = True
        for name in ("dataset.jsonl", "sample.jsonl", "manifest.json"):
            ok = _compare(temp_dir / name, out / name) and ok
        if ok:
            print("training dataset is fresh")
            return 0
        print(
            "regenerate: uv run --directory core python ../tools/training/build_chat_dataset.py",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
