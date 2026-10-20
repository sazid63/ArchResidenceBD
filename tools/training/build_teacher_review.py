"""Apply the W1.6 teacher review ledger and write the accepted subset.

The raw teacher batch stays outside the committed dataset tree (it is gitignored).
This tool is the gate between that batch and training:

  * every candidate must have exactly one review decision (accept or reject);
  * a rejected candidate must say why;
  * an accepted candidate must still pass the deterministic verifier;
  * an accepted candidate's source record must be on the frozen train side;
  * the committed accepted file and manifest are byte-reproducible.

The review is meaning review, not a label/fact change. One accepted record may carry
``normalizedText`` (currently only an echoed ``প্রশ্ন:`` label); the original text is
pinned by sha256 in the review ledger and the normalized text is recorded in the
accepted record's ``input.review`` block.

Usage (repo root):
  uv run --directory core python ../tools/training/build_teacher_review.py
  uv run --directory core python ../tools/training/build_teacher_review.py --check
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import sys
import tempfile

from archres_core.stdio import utf8_stdio
from archres_core.training import (
    VerifyContext,
    build_chat_dataset,
    load_flow_book,
    load_jsonl,
    sha256_file,
    verify_record,
    write_jsonl,
)
from archres_core.training.generators import question_dict

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLOW_BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
EXAMPLES = ROOT / "spec" / "examples"
SFT_SCHEMA = ROOT / "spec" / "schemas" / "sft-record.schema.json"
SPEC_SCHEMA = ROOT / "spec" / "schemas" / "building-spec.schema.json"
SFT_TRAIN = ROOT / "data" / "training" / "sft-v0" / "train.jsonl"
CANDIDATES = ROOT / "data" / "training" / "teacher-candidates" / "candidates.jsonl"
CANDIDATE_MANIFEST = ROOT / "data" / "training" / "teacher-candidates" / "manifest.json"
REVIEW = ROOT / "data" / "training" / "teacher-review" / "review.jsonl"
OUT = ROOT / "data" / "training" / "teacher-review"
ACCEPTED = OUT / "accepted.jsonl"
MANIFEST = OUT / "manifest.json"
REVIEWED_AT = "2026-10-20"
REVIEWER = "agent-assisted review (DeepSeek V4.1 Flash); owner selected path A"
OWNER_DECISION = "A - reviewed 8B subset, declared shortfall, targeted fractional coverage"


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _pin(path: pathlib.Path) -> dict:
    try:
        shown = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        shown = path.resolve().as_posix()
    return {"path": shown, "sha256": sha256_file(path)}


def _review_rows(path: pathlib.Path) -> list[dict]:
    rows = load_jsonl(path)
    seen: set[str] = set()
    for row in rows:
        rid = str(row.get("id", ""))
        if not rid:
            raise SystemExit("review row without an id")
        if rid in seen:
            raise SystemExit(f"duplicate review decision for {rid}")
        seen.add(rid)
        if row.get("decision") not in ("accept", "reject"):
            raise SystemExit(f"{rid}: unknown decision {row.get('decision')!r}")
        if row["decision"] == "reject" and not str(row.get("reason", "")).strip():
            raise SystemExit(f"{rid}: a rejection needs a reason")
        if not str(row.get("textSha256", "")).strip():
            raise SystemExit(f"{rid}: review row does not pin the candidate text")
    return rows


def _apply(
    candidates: list[dict],
    reviews: list[dict],
    *,
    schema: dict,
    context: VerifyContext,
    train_ids: set[str],
) -> tuple[list[dict], dict]:
    by_id = {record["id"]: record for record in candidates}
    if len(by_id) != len(candidates):
        raise SystemExit("candidate file contains duplicate ids")
    review_by_id = {row["id"]: row for row in reviews}
    missing = sorted(set(by_id) - set(review_by_id))
    extra = sorted(set(review_by_id) - set(by_id))
    if missing:
        raise SystemExit(f"{len(missing)} candidates have no review: {missing[:5]}")
    if extra:
        raise SystemExit(f"{len(extra)} review rows name missing candidates: {extra[:5]}")

    accepted: list[dict] = []
    rejected = 0
    by_lang: dict[str, dict[str, int]] = {}
    for rid in sorted(by_id):
        candidate = by_id[rid]
        review = review_by_id[rid]
        text = candidate["messages"][-1]["content"]
        if _sha256_text(text) != review["textSha256"]:
            raise SystemExit(f"{rid}: candidate text does not match the review pin")
        lang = candidate["lang"]
        bucket = by_lang.setdefault(lang, {"accepted": 0, "rejected": 0})
        if review["decision"] == "reject":
            rejected += 1
            bucket["rejected"] += 1
            continue

        source_id = candidate["input"]["sourceRecordId"]
        if source_id not in train_ids:
            raise SystemExit(f"{rid}: source {source_id} is not on the frozen train side")

        record = copy.deepcopy(candidate)
        if review.get("normalizedText"):
            record["messages"][-1]["content"] = str(review["normalizedText"])
        record["status"] = "verified"
        checks = list(record.get("verifyChecks") or [])
        if "review.meaning" not in checks:
            checks.append("review.meaning")
        record["verifyChecks"] = checks
        record.setdefault("input", {})["review"] = {
            "decision": "accept",
            "reviewer": REVIEWER,
            "reviewedAt": REVIEWED_AT,
            "ownerDecision": OWNER_DECISION,
            "candidateTextSha256": review["textSha256"],
            "reason": review.get("reason", ""),
            "note": review.get("note", ""),
        }
        ok, _checks, problems = verify_record(record, schema, context)
        if not ok:
            raise SystemExit(f"{rid}: accepted record still fails verification: {problems}")
        accepted.append(record)
        bucket["accepted"] += 1

    stats = {
        "records": len(reviews),
        "accepted": len(accepted),
        "rejected": rejected,
        "byLang": by_lang,
    }
    return accepted, stats


def _build(
    candidates_path: pathlib.Path,
    review_path: pathlib.Path,
    out: pathlib.Path,
) -> dict:
    schema = json.loads(SFT_SCHEMA.read_text(encoding="utf-8"))
    dataset = build_chat_dataset(
        flow_book_path=FLOW_BOOK,
        pack_path=PACK,
        examples_dir=EXAMPLES,
        sft_schema_path=SFT_SCHEMA,
        building_spec_schema_path=SPEC_SCHEMA,
    )
    questions = {question.id: question_dict(question) for question in load_flow_book(FLOW_BOOK)}
    context = VerifyContext(questions=questions)
    train_ids = {record["id"] for record in load_jsonl(SFT_TRAIN)}
    candidates = load_jsonl(candidates_path)
    reviews = _review_rows(review_path)
    accepted, stats = _apply(
        candidates, reviews, schema=schema, context=context, train_ids=train_ids
    )
    accepted_path = out / "accepted.jsonl"
    accepted_stats = write_jsonl(accepted, accepted_path)
    manifest = {
        "manifestVersion": "1",
        "purpose": (
            "teacher paraphrases accepted after meaning review; candidate-only until the "
            "W1.6/W1.9 promotion gate and owner spot-check"
        ),
        "reviewedAt": REVIEWED_AT,
        "reviewer": REVIEWER,
        "ownerDecision": OWNER_DECISION,
        "candidates": {
            **_pin(candidates_path),
            "records": len(candidates),
        },
        "candidateManifest": _pin(CANDIDATE_MANIFEST),
        "review": {
            **_pin(review_path),
            **stats,
        },
        "accepted": {
            "path": "accepted.jsonl",
            "records": accepted_stats["records"],
            "bytes": accepted_stats["bytes"],
            "sha256": accepted_stats["sha256"],
        },
        "promotionGate": (
            "Every accepted record passed the deterministic verifier; meaning was reviewed "
            "against its source. The resulting SFT candidate still has to pass the W1.9 "
            "floors and a live probe before the model is registered."
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
    parser = argparse.ArgumentParser(description="Apply the teacher review ledger.")
    parser.add_argument("--candidates", default=str(CANDIDATES))
    parser.add_argument("--review", default=str(REVIEW))
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--check", action="store_true", help="verify committed outputs are fresh")
    args = parser.parse_args()

    def _resolve(value: str) -> pathlib.Path:
        path = pathlib.Path(value)
        return path if path.is_absolute() else ROOT / path

    candidates_path = _resolve(args.candidates)
    review_path = _resolve(args.review)
    out = _resolve(args.out)
    if not args.check:
        manifest = _build(candidates_path, review_path, out)
        print(
            f"wrote {out.relative_to(ROOT).as_posix()}: {manifest['accepted']['records']} accepted / "
            f"{manifest['review']['rejected']} rejected"
        )
        return 0

    with tempfile.TemporaryDirectory() as temp:
        _build(candidates_path, review_path, pathlib.Path(temp))
        ok = _compare(pathlib.Path(temp) / "accepted.jsonl", out / "accepted.jsonl")
        ok = _compare(pathlib.Path(temp) / "manifest.json", out / "manifest.json") and ok
        if ok:
            print("teacher review outputs are fresh")
            return 0
        print(
            "regenerate: uv run --directory core python ../tools/training/build_teacher_review.py",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
