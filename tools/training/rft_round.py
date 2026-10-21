"""Run one RFT round: sample the fleet, verify against the truth, keep the good answers.

    uv run --directory core python ../tools/training/rft_round.py --round r1 --samples 4
    uv run --directory core python ../tools/training/rft_round.py --round r1 --limit 20

**A round is not reproducible**, and the tool does not pretend otherwise: the model's
answers are not a function of the input, so there is nothing to "check" afterwards - the
round's **ledger** is the record, and the next round reads it. That is why this tool has no
``--check``: the freshness law covers the artifacts that are *derived* (the scripted
dataset, the split, the eval case set), and a round is a measurement, not a derivation.

The round samples the **training side only** (``data/training/sft-v1/train.jsonl``) - the
holdout is never read, so it cannot be trained on by accident (ADR-0015).

The fleet must be running (the model artifacts are not in the repo, so the owner runs the
round on the machine that has them). Nothing here touches the network beyond the loopback
router.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.agent.client import LlamaSwapClient, ModelError
from archres_core.stdio import utf8_stdio
from archres_core.training.rft import (
    build_rft_records,
    round_document,
    sample_round,
)
from archres_core.training.records import load_jsonl, write_jsonl

ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAIN = ROOT / "data" / "training" / "sft-v1" / "train.jsonl"
OUT_ROOT = ROOT / "data" / "training" / "rft"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Run one rejection-sampling round over the training side of the split."
    )
    parser.add_argument("--round", default="r1", help="the round's id (r1, r2, ...)")
    parser.add_argument("--train", default=str(TRAIN), help="the training records to sample")
    parser.add_argument("--out", help="where to write the round (default data/training/rft/<round>)")
    parser.add_argument("--samples", type=int, default=4, help="samples per record")
    parser.add_argument("--temperature", type=float, default=0.7, help="the sampling temperature")
    parser.add_argument("--limit", type=int, default=0, help="sample only the first N records")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787", help="the local router")
    parser.add_argument("--model", default="chat", help="the fleet route to sample")
    args = parser.parse_args(argv)

    train = pathlib.Path(args.train)
    if not train.is_file():
        print(f"no training records at {train}", file=sys.stderr)
        return 1
    records = load_jsonl(train)
    if args.limit:
        records = records[: args.limit]
    if not records:
        print(f"no records to sample in {train}", file=sys.stderr)
        return 1

    out = pathlib.Path(args.out) if args.out else OUT_ROOT / args.round

    client = LlamaSwapClient(base_url=args.base_url, model=args.model)
    try:
        samples = sample_round(
            client, records, samples=args.samples, temperature=args.temperature
        )
    except ModelError as exc:
        print(f"the fleet is not answering: {exc}", file=sys.stderr)
        print(
            "start the fleet first (the model artifacts are not in the repo) and try again",
            file=sys.stderr,
        )
        return 1

    if not samples:
        print(
            f"none of the {len(records)} training records is an interview.parse record - "
            "the round samples the parse task (the one the eval gates measure)",
            file=sys.stderr,
        )
        return 1

    unreachable = sum(1 for sample in samples if sample.reason.startswith("unreachable"))
    if unreachable == len(samples):
        print(
            f"every one of the {len(samples)} samples was unreachable - the fleet is not "
            "answering, so this is not a round; nothing was written",
            file=sys.stderr,
        )
        return 1

    out.mkdir(parents=True, exist_ok=True)
    document = round_document(
        samples,
        round_id=args.round,
        model=args.model,
        temperature=args.temperature,
        samples_per_record=args.samples,
    )
    (out / "round.json").write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    kept = build_rft_records(samples, records, round_id=args.round, model=args.model)
    write_jsonl(kept, out / "records.jsonl")

    # the next round's training set: the scripted records plus the round's kept answers.
    write_jsonl(records + kept, out / "dataset.jsonl")

    counts = document["counts"]
    print(
        f"round {args.round}: {counts['sampled']} sampled, {counts['kept']} kept, "
        f"{counts['dropped']} dropped "
        f"({counts['recordsWithAKeptSample']}/{counts['records']} records with a kept answer)"
    )
    if document["dropReasons"]:
        print("  the dropped samples, by reason:", document["dropReasons"])
    print(f"  the round is in {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
