"""Teacher augmentation CLI (W1.5) - candidates only, never part of the scripted dataset.

The teacher rephrases flow-book questions through an OpenAI-compatible endpoint
(llama-server exposes one at /v1/chat/completions). Only ask records on the frozen
**train** side are eligible; holdout questions are never paraphrased (ADR-0015). Every
output is a candidate: the deterministic verifier runs schema/labels/language checks,
but meaning preservation needs the W1.6 eval/human gate. Duplicate paraphrases of the
same source are dropped. Candidates are written outside the committed dataset tree
(data/training/teacher-candidates/ is gitignored).

Usage (from the repo root):
  uv run --directory core python ../tools/training/teacher_augment.py \
      --endpoint http://127.0.0.1:8787/v1/chat/completions --model chat --variants 1

Exit codes: 0 = candidates written and all passed deterministic checks;
            1 = endpoint/build failure or some candidates failed verification.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

from archres_core.stdio import utf8_stdio
from archres_core.training import (
    ChatCompletionClient,
    TeacherError,
    VerifyContext,
    build_chat_dataset,
    build_teacher_records,
    dedupe_teacher_records,
    load_flow_book,
    train_ask_records,
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
DEFAULT_OUT = ROOT / "data" / "training" / "teacher-candidates"


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Rephrase flow-book questions through a teacher model.")
    parser.add_argument("--endpoint", default="http://127.0.0.1:8787/v1/chat/completions")
    parser.add_argument("--model", default="chat")
    parser.add_argument("--variants", type=int, default=1)
    parser.add_argument("--temperature", type=float, default=0.7)
    parser.add_argument(
        "--limit", type=int, help="use only the first N train-split ask records (smoke run)"
    )
    parser.add_argument("--out", default=str(DEFAULT_OUT))
    args = parser.parse_args()
    out = pathlib.Path(args.out)
    out = out if out.is_absolute() else ROOT / out

    try:
        dataset = build_chat_dataset(
            flow_book_path=FLOW_BOOK,
            pack_path=PACK,
            examples_dir=EXAMPLES,
            sft_schema_path=SFT_SCHEMA,
            building_spec_schema_path=SPEC_SCHEMA,
        )
        train_ids = {
            json.loads(line)["id"]
            for line in SFT_TRAIN.read_text(encoding="utf-8").splitlines()
            if line.strip()
        }
        all_sources = train_ask_records(dataset.by_task("interview.ask"), train_ids)
        sources = all_sources[: args.limit] if args.limit else all_sources
        client = ChatCompletionClient(endpoint=args.endpoint, model=args.model)
        raw_candidates = build_teacher_records(
            sources,
            client,
            variants=args.variants,
            temperature=args.temperature,
            batch=f"teacher-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        )
        candidates = dedupe_teacher_records(raw_candidates)
    except (TeacherError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    schema = json.loads(SFT_SCHEMA.read_text(encoding="utf-8"))
    questions = {question.id: question_dict(question) for question in load_flow_book(FLOW_BOOK)}
    context = VerifyContext(questions=questions)
    failures: list[str] = []
    for record in candidates:
        ok, _checks, problems = verify_record(record, schema, context)
        if not ok:
            failures.extend(f"{record['id']}: {problem}" for problem in problems)

    stats = write_jsonl(candidates, out / "candidates.jsonl")
    manifest = {
        "purpose": "teacher candidates - unverified until the W1.6 eval/human gate",
        "source": {
            "split": "train",
            "splitManifest": "data/training/sft-v0/manifest.json",
            "trainFile": "data/training/sft-v0/train.jsonl",
            "trainFileSha256": hashlib.sha256(SFT_TRAIN.read_bytes()).hexdigest(),
            "trainAskRecords": len(all_sources),
            "usedAskRecords": len(sources),
        },
        "teacher": {
            "endpoint": args.endpoint,
            "model": args.model,
            "variants": args.variants,
            "temperature": args.temperature,
        },
        "records": stats["records"],
        "rawRecords": len(raw_candidates),
        "duplicatesDropped": len(raw_candidates) - len(candidates),
        "sha256": stats["sha256"],
        "failures": len(failures),
    }
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(f"wrote {out.relative_to(ROOT).as_posix()}: {stats['records']} candidates")
    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
