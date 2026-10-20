"""Build the W1.6 teacher-augmented SFT split (sft-v1).

Inputs are frozen and pinned:

  data/training/sft-v0/{train,holdout}.jsonl   the scripted W1.6 split
  data/training/teacher-review/accepted.jsonl  reviewed teacher paraphrases
  data/eval/chat-v0/cases.jsonl                the W1.9 model.parse holdout cases

The output is the dataset the Kaggle chat kernel consumes. Only accepted teacher records
enter the train side; the holdout side is copied byte-for-byte from sft-v0, so no teacher
paraphrase can cross the frozen eval line. The manifest records the token shortfall
against the plan's ~0.5M target as a declared gap, never a silent omission.

Usage (repo root):
  uv run --directory core python ../tools/training/build_sft_teacher.py
  uv run --directory core python ../tools/training/build_sft_teacher.py --check
"""

from __future__ import annotations

import argparse
import json
import pathlib
import shutil
import sys
import tempfile

from archres_core.stdio import utf8_stdio
from archres_core.training import (
    load_jsonl,
    sha256_file,
    write_jsonl,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
SFT0 = ROOT / "data" / "training" / "sft-v0"
CHAT0_DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
ACCEPTED = ROOT / "data" / "training" / "teacher-review" / "accepted.jsonl"
REVIEW_MANIFEST = ROOT / "data" / "training" / "teacher-review" / "manifest.json"
CASES = ROOT / "data" / "eval" / "chat-v0" / "cases.jsonl"
DEFAULT_OUT = ROOT / "data" / "training" / "sft-v1"
TARGET_TOKENS = 500_000
FILES = ("dataset.jsonl", "train.jsonl", "holdout.jsonl", "cases.jsonl", "manifest.json")


def _pin(path: pathlib.Path) -> dict:
    try:
        shown = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        shown = path.resolve().as_posix()
    return {"path": shown, "sha256": sha256_file(path)}


def _tokens(records: list[dict]) -> int:
    """Plan §7 target uses the char/4 estimate over the full message text."""
    chars = sum(len(message["content"]) for record in records for message in record["messages"])
    return round(chars / 4)


def _by_task(records: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for record in records:
        counts[record["task"]] = counts.get(record["task"], 0) + 1
    return dict(sorted(counts.items()))


def _questions(records: list[dict]) -> int:
    return len(
        {
            record["labels"]["questionId"]
            for record in records
            if record.get("labels", {}).get("questionId")
        }
    )


def _build(out: pathlib.Path) -> dict:
    train0 = load_jsonl(SFT0 / "train.jsonl")
    holdout0 = load_jsonl(SFT0 / "holdout.jsonl")
    accepted = load_jsonl(ACCEPTED)
    if not accepted:
        raise SystemExit("accepted teacher subset is empty")

    for records, side in ((train0, "sft-v0 train"), (holdout0, "sft-v0 holdout"), (accepted, "accepted")):
        bad = [r["id"] for r in records if r.get("status") != "verified" or r.get("kind") != "chat"]
        if bad:
            raise SystemExit(f"{side} contains non-verified/non-chat records: {bad[:3]}")
        ids = [r["id"] for r in records]
        if len(ids) != len(set(ids)):
            raise SystemExit(f"{side} contains duplicate ids")

    train_ids = {record["id"] for record in train0}
    holdout_ids = {record["id"] for record in holdout0}
    accepted_ids = {record["id"] for record in accepted}
    if accepted_ids & (train_ids | holdout_ids):
        raise SystemExit("accepted teacher ids collide with the scripted split")
    for record in accepted:
        source_id = record.get("input", {}).get("sourceRecordId")
        if source_id not in train_ids:
            raise SystemExit(f"{record['id']}: source {source_id} is not on the sft-v0 train side")

    holdout_questions = {
        record["labels"]["questionId"]
        for record in holdout0
        if record.get("labels", {}).get("questionId")
    }
    leaked = sorted(
        record["id"]
        for record in accepted
        if record.get("labels", {}).get("questionId") in holdout_questions
    )
    if leaked:
        raise SystemExit(f"accepted teacher paraphrases touch holdout questions: {leaked[:3]}")

    train = train0 + accepted
    dataset = train + holdout0
    if len({record["id"] for record in dataset}) != len(dataset):
        raise SystemExit("dataset has duplicate ids")

    out.mkdir(parents=True, exist_ok=True)
    files: dict[str, dict] = {}
    for name, rows in (
        ("dataset.jsonl", dataset),
        ("train.jsonl", train),
        ("holdout.jsonl", holdout0),
    ):
        stats = write_jsonl(rows, out / name)
        files[name] = {
            "records": stats["records"],
            "bytes": stats["bytes"],
            "sha256": stats["sha256"],
        }
    # The eval case set is *derived* and grows when a suite is added. The copy here is the
    # snapshot the training run actually consumed, so it is kept, not refreshed: the run's
    # input is a historical fact, not a rebuild. The manifest pins the snapshot it holds.
    snapshot = out / "cases.jsonl"
    if not snapshot.is_file():
        shutil.copyfile(CASES, snapshot)
    cases_stats = {
        "records": len(load_jsonl(snapshot)),
        "bytes": snapshot.stat().st_size,
        "sha256": sha256_file(snapshot),
    }
    files["cases.jsonl"] = cases_stats

    scripted_tokens = _tokens(train0 + holdout0)
    teacher_tokens = _tokens(accepted)
    total_tokens = _tokens(dataset)
    review_manifest = json.loads(REVIEW_MANIFEST.read_text(encoding="utf-8"))
    manifest = {
        "manifestVersion": "1",
        "purpose": (
            "W1.6 teacher-augmented SFT split: scripted sft-v0 plus the reviewed 8B subset; "
            "holdout is byte-identical to sft-v0"
        ),
        "pins": {
            "scriptedDataset": _pin(CHAT0_DATASET),
            "scriptedTrain": _pin(SFT0 / "train.jsonl"),
            "scriptedHoldout": _pin(SFT0 / "holdout.jsonl"),
            "scriptedSplitManifest": _pin(SFT0 / "manifest.json"),
            "acceptedTeacher": _pin(ACCEPTED),
            "teacherReviewManifest": _pin(REVIEW_MANIFEST),
            "cases": {
            "path": "data/training/sft-v1/cases.jsonl",
            "sha256": files["cases.jsonl"]["sha256"],
            "note": (
                "the snapshot the chat run consumed; the live eval set "
                "(data/eval/chat-v0/cases.jsonl) has grown since (the model.safety suite was "
                "added), and the run's input is a historical fact, not a rebuild"
            ),
        },
            "dataset": {"path": "data/training/sft-v1/dataset.jsonl", "sha256": files["dataset.jsonl"]["sha256"]},
        },
        "counts": {
            "train": len(train),
            "holdout": len(holdout0),
            "total": len(dataset),
            "scripted": len(train0) + len(holdout0),
            "teacherAccepted": len(accepted),
            "teacherRejected": review_manifest["review"]["rejected"],
            "byTask": {
                "train": _by_task(train),
                "holdout": _by_task(holdout0),
            },
            "questions": {
                "train": _questions(train),
                "holdout": _questions(holdout0),
            },
        },
        "files": files,
        "tokens": {
            "method": "chars/4 over full message text (plan §7 estimate)",
            "scripted": scripted_tokens,
            "teacherAccepted": teacher_tokens,
            "total": total_tokens,
            "target": TARGET_TOKENS,
            "shortfall": max(0, TARGET_TOKENS - total_tokens),
            "declaredShortfall": total_tokens < TARGET_TOKENS,
            "note": (
                "The shortfall is a reviewed W1.6 decision (path A): the 8B teacher produced "
                "only 111 unique paraphrases from 88 seed questions; seed-only variants cannot "
                "reach 0.5M tokens. It is recorded, not hidden."
            ),
        },
        "teacher": {
            "model": "qwen3-8b-q4",
            "promptVersion": "teacher-paraphrase-v0.3",
            "accepted": len(accepted),
            "rejected": review_manifest["review"]["rejected"],
            "reviewManifest": "data/training/teacher-review/manifest.json",
        },
        "notes": (
            "train/holdout follow data/eval/chat-v0/split.json by source question id. "
            "Regenerate with tools/training/build_sft_teacher.py; the Kaggle kernel consumes "
            "dataset.jsonl, train.jsonl, holdout.jsonl, cases.jsonl and this manifest."
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
    parser = argparse.ArgumentParser(description="Build the teacher-augmented SFT split.")
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    parser.add_argument("--check", action="store_true", help="verify committed outputs are fresh")
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out = out if out.is_absolute() else ROOT / out

    if not args.check:
        manifest = _build(out)
        counts = manifest["counts"]
        tokens = manifest["tokens"]
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {counts['train']} train / "
            f"{counts['holdout']} holdout / {counts['total']} total; "
            f"teacher {counts['teacherAccepted']} accepted; "
            f"tokens {tokens['total']} ({tokens['shortfall']} below {tokens['target']})"
        )
        return 0

    with tempfile.TemporaryDirectory() as temp:
        temp_out = pathlib.Path(temp)
        # The cases snapshot is an input, not a derived file: the check rebuilds against the
        # committed copy, so the run's historical input stays the run's historical input.
        committed_snapshot = out / "cases.jsonl"
        if committed_snapshot.is_file():
            shutil.copyfile(committed_snapshot, temp_out / "cases.jsonl")
        _build(temp_out)
        ok = True
        for name in FILES:
            if name == "cases.jsonl":
                continue
            ok = _compare(temp_out / name, out / name) and ok
        if ok:
            print("teacher-augmented SFT split is fresh")
            return 0
        print(
            "regenerate: uv run --directory core python ../tools/training/build_sft_teacher.py",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
