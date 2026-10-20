"""Build the W1.7 repair SFT split: a frozen train/holdout cut of the repair corpus.

The split is **frozen, not drawn**: the holdout mutation ids are written here as a constant and
pinned by sha256 in the manifest, exactly like the chat split's `data/eval/chat-v0/split.json`
(ADR-0015). A mutation is either trained on or judged, never both, and the file that says which
is a reviewed artifact, not a re-run of this tool.

The holdout covers both failure kinds (an exception and a measured rejection) and the rarer
classes, so the round measures the seam - "can the model repair a macro the engine then
accepts?" - instead of re-measuring the two checks the round-1 corpus already covered.

Usage (from the repo root):
  uv run --directory core python ../tools/training/build_repair_split.py
  uv run --directory core python ../tools/training/build_repair_split.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

from archres_core.stdio import utf8_stdio
from archres_core.training import load_jsonl, sha256_file, write_jsonl

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORPUS = ROOT / "data" / "training" / "repair-v0" / "dataset.jsonl"
CORPUS_MANIFEST = ROOT / "data" / "training" / "repair-v0" / "manifest.json"
DEFAULT_OUT = ROOT / "data" / "training" / "repair-v1"
FILES = ("train.jsonl", "holdout.jsonl", "manifest.json")

#: The frozen holdout: four mutations the round must never train on. Chosen for coverage, not
#: convenience: one exception from a class that appears once, one exception from the
#: summary-writing layer, one unit-scale measured rejection and one measured rejection of the
#: object count. Moving a mutation across this line is a reviewed edit of this constant.
HOLDOUT_MUTATIONS = (
    "float-arity",
    "volume-divide-zero",
    "column-unit-slip",
    "pads-hard-coded",
)


def _pin(path: pathlib.Path) -> dict:
    try:
        shown = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        shown = path.resolve().as_posix()
    return {"path": shown, "sha256": sha256_file(path)}


def _build(out: pathlib.Path) -> dict:
    records = load_jsonl(CORPUS)
    if not records:
        raise SystemExit("the repair corpus is empty; build it with the engine first")
    by_mutation = {record["input"]["mutation"]["id"]: record for record in records}
    if len(by_mutation) != len(records):
        raise SystemExit("the corpus contains duplicate mutation ids")
    missing = [name for name in HOLDOUT_MUTATIONS if name not in by_mutation]
    if missing:
        raise SystemExit(f"the frozen holdout names unknown mutations: {missing}")
    holdout = [by_mutation[name] for name in HOLDOUT_MUTATIONS]
    train = [record for record in records if record["input"]["mutation"]["id"] not in HOLDOUT_MUTATIONS]
    if not train or not holdout:
        raise SystemExit("both sides of the repair split must be non-empty")
    overlap = {record["id"] for record in train} & {record["id"] for record in holdout}
    if overlap:
        raise SystemExit(f"train/holdout leakage: {sorted(overlap)}")

    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict] = {}
    for name, rows in (("train.jsonl", train), ("holdout.jsonl", holdout)):
        stats = write_jsonl(rows, out / name)
        files[name] = {
            "records": stats["records"],
            "bytes": stats["bytes"],
            "sha256": stats["sha256"],
        }

    manifest = {
        "manifestVersion": "1",
        "purpose": (
            "W1.7 repair SFT split: the executed repair corpus cut by a frozen holdout of "
            "mutation ids; the holdout is judged by re-executing the repaired macro in FreeCAD"
        ),
        "pins": {
            "corpus": _pin(CORPUS),
            "corpusManifest": _pin(CORPUS_MANIFEST),
        },
        "counts": {
            "train": len(train),
            "holdout": len(holdout),
            "total": len(records),
        },
        "frozenHoldout": {
            "mutations": list(HOLDOUT_MUTATIONS),
            "note": (
                "Frozen before any training run (ADR-0015 law). Moving a mutation across this "
                "line is a reviewed edit of tools/training/build_repair_split.py, never a re-run."
            ),
        },
        "trainMutations": [record["input"]["mutation"]["id"] for record in train],
        "files": files,
        "notes": (
            "Regenerate with tools/training/build_repair_split.py; CI checks freshness. The "
            "Kaggle repair kernel consumes train.jsonl, holdout.jsonl and this manifest; the "
            "holdout is judged by tools/training/eval_repair.py against the real engine."
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
    parser = argparse.ArgumentParser(description="Build the frozen repair SFT split.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--check", action="store_true", help="verify committed outputs are fresh")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out = out if out.is_absolute() else ROOT / out

    if not args.check:
        manifest = _build(out)
        counts = manifest["counts"]
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {counts['train']} train / "
            f"{counts['holdout']} holdout (frozen: {', '.join(HOLDOUT_MUTATIONS)})"
        )
        return 0

    with tempfile.TemporaryDirectory() as temp:
        _build(pathlib.Path(temp))
        ok = True
        for name in FILES:
            ok = _compare(pathlib.Path(temp) / name, out / name) and ok
        if ok:
            print("repair SFT split is fresh")
            return 0
        print(
            "regenerate: uv run --directory core python ../tools/training/build_repair_split.py",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
