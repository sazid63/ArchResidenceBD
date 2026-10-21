"""Build (or check) the committed eval case set for W1.9.

The case set is derived from the rule pack, the training dataset and `authored.yaml`, so it is
generated and committed like the corpus and the flow book: CI runs `--check` and fails when
either side drifted. A pre-trained model must never be able to change what is measured, which
is why the compiled file is reviewed in the diff.

The split is frozen separately (`--init-split`, once): regenerating it moves questions across
the train/holdout line, so that is a review event, not a re-run.

Usage (repo root):
  uv run --directory core python ../tools/eval/build_cases.py --init-split
  uv run --directory core python ../tools/eval/build_cases.py
  uv run --directory core python ../tools/eval/build_cases.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

import yaml

from archres_core import compliance
from archres_core.eval import (
    build_cases,
    build_manifest,
    cases_bytes,
    dataset_parse_records,
    dumps_split,
    load_authored,
    load_pack_set,
    load_split,
    replies_document,
    split_document,
)
from archres_core.eval.cases import EvalError
from archres_core.rag.corpus import load_corpus
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
#: The rule packs, **discovered** (W4.6): every pack in the directory is loaded and every
#: pack's test vectors become cases, so a city pack (W4.5) arrives with its own gate.
PACK_DIR = ROOT / "spec" / "rules"
PACKS = sorted(PACK_DIR.glob("*.yaml"))
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
OUT = ROOT / "data" / "eval" / "chat-v0"
AUTHORED = OUT / "authored.yaml"
SPLIT = OUT / "split.json"
CASES = OUT / "cases.jsonl"
MANIFEST = OUT / "manifest.json"
REPLIES = OUT / "replies"


def _relative(path: pathlib.Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _reply_pins() -> dict[str, dict[str, object]]:
    pins: dict[str, dict[str, object]] = {}
    if REPLIES.is_dir():
        for path in sorted(REPLIES.glob("*.jsonl")):
            pins[path.stem] = replies_document(path)
    return pins


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Build the W1.9 eval case set.")
    parser.add_argument("--check", action="store_true", help="fail when the committed case set is stale")
    parser.add_argument(
        "--init-split",
        action="store_true",
        help="write split.json once from the frozen rule (a reviewed event, not a re-run)",
    )
    args = parser.parse_args(argv)

    try:
        if args.init_split:
            if SPLIT.exists() and not args.check:
                print(
                    f"refusing to overwrite {_relative(SPLIT)}: the split is frozen. "
                    "Delete it deliberately if the eval set must be re-frozen.",
                    file=sys.stderr,
                )
                return 1
            authored = load_authored(AUTHORED)
            raw = yaml.safe_load(AUTHORED.read_text(encoding="utf-8"))
            question_ids = {
                record["input"]["questionId"] for record in dataset_parse_records(DATASET)
            }
            scenario_names = {
                pathlib.Path(item["scenario"]).stem for item in raw.get("scenarios") or []
            }
            document = split_document(question_ids, scenario_names)
            SPLIT.parent.mkdir(parents=True, exist_ok=True)
            SPLIT.write_bytes(dumps_split(document).encode("utf-8"))
            print(
                f"wrote {_relative(SPLIT)}: "
                f"{len(document['questions']['holdout'])} holdout / "
                f"{len(document['questions']['train'])} train questions"
            )
            if args.check:
                return 0

        split = load_split(SPLIT)
        packs = load_pack_set(PACK_DIR)
        corpus_ids = [document.id for document in load_corpus(CORPUS).docs]
        cases = build_cases(
            packs=packs,
            dataset_path=DATASET,
            authored_path=AUTHORED,
            split=split,
            corpus_doc_ids=corpus_ids,
        )
        case_bytes = cases_bytes(cases)
        manifest = build_manifest(
            root=ROOT,
            cases=cases,
            case_bytes=case_bytes,
            case_path=_relative(CASES),
            split_path=SPLIT,
            split=split,
            dataset_path=DATASET,
            pack_path=PACKS[0],
            pack_sha256=compliance.pack_sha256(PACKS[0]),
            pack_set=packs,
            corpus_path=CORPUS,
            replies=_reply_pins(),
        )
        sidecar = json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

        if args.check:
            stale = []
            if not CASES.is_file() or CASES.read_bytes() != case_bytes:
                stale.append(_relative(CASES))
            if not MANIFEST.is_file() or MANIFEST.read_text(encoding="utf-8") != sidecar:
                stale.append(_relative(MANIFEST))
            if stale:
                print(
                    f"eval case set is stale: {', '.join(stale)} - rebuild with tools/eval/build_cases.py",
                    file=sys.stderr,
                )
                return 1
            print(f"eval case set is fresh: {len(cases)} cases")
            return 0

        CASES.parent.mkdir(parents=True, exist_ok=True)
        CASES.write_bytes(case_bytes)
        MANIFEST.write_bytes(sidecar.encode("utf-8"))
        print(
            f"wrote {_relative(CASES)}: {manifest['cases']['count']} cases, "
            f"{manifest['cases']['bytes']} bytes, sha256 {manifest['cases']['sha256'][:16]}"
        )
        print(
            "  suites: " + ", ".join(f"{name} {count}" for name, count in manifest["suites"].items())
        )
        print(
            "  splits: " + ", ".join(f"{name} {count}" for name, count in manifest["splits"].items())
        )
        return 0
    except EvalError as exc:
        print(f"eval case build failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
