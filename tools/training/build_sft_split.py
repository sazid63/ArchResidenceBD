"""Build the SFT train/holdout split from the frozen eval split (W1.6 preparation).

Outputs (committed under data/training/sft-v0/):

  train.jsonl     verified chat records whose source question is on the eval train side
  holdout.jsonl   verified chat records whose source question is an eval holdout question
  manifest.json   pins (dataset + split sha256), counts, file hashes

`holdout.jsonl` is the eval set's training-side mirror: **it is never trained on.** The split
is derived, not re-drawn - moving a question across the line is an edit to
`data/eval/chat-v0/split.json`, a reviewed event (ADR-0015), never a re-run of this tool.

Usage (from the repo root):
  uv run --directory core python ../tools/training/build_sft_split.py
  uv run --directory core python ../tools/training/build_sft_split.py --check

Exit codes: 0 = written / fresh; 1 = build failure or stale outputs.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

from archres_core.stdio import utf8_stdio
from archres_core.training import (
    SPLITTER_VERSION,
    load_jsonl,
    sha256_file,
    split_sft_records,
    write_jsonl,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
DEFAULT_SPLIT = ROOT / "data" / "eval" / "chat-v0" / "split.json"
DEFAULT_OUT = ROOT / "data" / "training" / "sft-v0"
MANIFEST_VERSION = "1"
FILES = ("train.jsonl", "holdout.jsonl", "manifest.json")


def _pin(path: pathlib.Path) -> dict[str, str]:
    try:
        shown = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:  # a path outside the repo (tests, experiments) is still pinnable
        shown = path.resolve().as_posix()
    return {"path": shown, "sha256": sha256_file(path)}


def _build(
    out: pathlib.Path,
    dataset_path: pathlib.Path = DEFAULT_DATASET,
    split_path: pathlib.Path = DEFAULT_SPLIT,
) -> dict:
    records = load_jsonl(dataset_path)
    split = json.loads(split_path.read_text(encoding="utf-8"))
    result = split_sft_records(records, split)
    out.mkdir(parents=True, exist_ok=True)

    files: dict[str, dict] = {}
    for name, side in (("train.jsonl", result.train), ("holdout.jsonl", result.holdout)):
        stats = write_jsonl(side, out / name)
        files[name] = {
            "records": stats["records"],
            "bytes": stats["bytes"],
            "sha256": stats["sha256"],
        }

    manifest = {
        "manifestVersion": MANIFEST_VERSION,
        "splitterVersion": SPLITTER_VERSION,
        "pins": {"dataset": _pin(dataset_path), "evalSplit": _pin(split_path)},
        "counts": result.counts(),
        "files": files,
        "notes": (
            "train/holdout follow data/eval/chat-v0/split.json by source question id; "
            "holdout.jsonl is never trained on. Regenerate with "
            "tools/training/build_sft_split.py; CI checks freshness."
        ),
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
    parser = argparse.ArgumentParser(
        description="Build the SFT train/holdout split (or verify freshness)."
    )
    parser.add_argument("--dataset", default=str(DEFAULT_DATASET), help="verified chat dataset")
    parser.add_argument("--split", default=str(DEFAULT_SPLIT), help="frozen eval split")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="output directory")
    parser.add_argument("--check", action="store_true", help="verify committed outputs are fresh")
    args = parser.parse_args()

    def _resolve(value: str) -> pathlib.Path:
        path = pathlib.Path(value)
        return path if path.is_absolute() else ROOT / path

    dataset_path = _resolve(args.dataset)
    split_path = _resolve(args.split)
    out = _resolve(args.out)

    if not args.check:
        manifest = _build(out, dataset_path, split_path)
        counts = manifest["counts"]
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {counts['train']} train / "
            f"{counts['holdout']} holdout ({counts['total']} verified records, "
            f"{counts['noSource']} without a source question)"
        )
        return 0

    with tempfile.TemporaryDirectory() as temp:
        _build(pathlib.Path(temp), dataset_path, split_path)
        ok = True
        for name in FILES:
            ok = _compare(pathlib.Path(temp) / name, out / name) and ok
        if ok:
            print("SFT split is fresh")
            return 0
        print(
            "regenerate: uv run --directory core python ../tools/training/build_sft_split.py",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
