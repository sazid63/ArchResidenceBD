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
import tempfile
from typing import Any

from archres_core.agent.client import LlamaSwapClient, ModelError
from archres_core.cad import find_engine, load_cases, run_candidate, verify_result
from archres_core.stdio import utf8_stdio
from archres_core.training.rft import (
    build_rft_records,
    judge_answer,
    judge_repair,
    round_document,
    sample_round,
)
from archres_core.training.records import load_jsonl, write_jsonl

ROOT = pathlib.Path(__file__).resolve().parents[2]
TRAIN = ROOT / "data" / "training" / "sft-v1" / "train.jsonl"
REPAIR_TRAIN = ROOT / "data" / "training" / "repair-v1" / "train.jsonl"
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"
OUT_ROOT = ROOT / "data" / "training" / "rft"

#: The tasks a round may sample, and where each one's training side lives. The **holdout** of
#: each split is never read (ADR-0015), so it cannot be trained on by accident.
TASKS = {
    "interview.parse": {"train": TRAIN, "checks": ("rft.truth",)},
    "repair.fix": {"train": REPAIR_TRAIN, "checks": ("rft.case",)},
}


def _verifier(engine, cases):  # noqa: ANN001, ANN202
    """Run a candidate macro against its case, and report the engine's verdict."""

    def verify(source: str, case_id: str, params: dict[str, Any]) -> tuple[bool, str]:
        case = cases.get(case_id)
        if case is None:
            return False, f"the case {case_id!r} is not in the case file"
        with tempfile.TemporaryDirectory(prefix="rft-repair-") as temp:
            root = pathlib.Path(temp)
            candidate = root / "candidate.py"
            candidate.write_text(source, encoding="utf-8", newline="\n")
            outcome = run_candidate(
                engine,
                candidate,
                {"kind": case.kind, "params": case.params, "caseId": case.id},
                root / "run",
                timeout_ms=case.timeout_ms,
            )
            verdict = verify_result(case, outcome)
            if verdict.ok:
                return True, ""
            failures = "; ".join(
                f"{row.check}: {row.message}" for row in verdict.failures
            )
            return False, failures or f"the run ended as {outcome.code!r}"

    return verify


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Run one rejection-sampling round over the training side of the split."
    )
    parser.add_argument("--round", default="r1", help="the round's id (r1, r2, ...)")
    parser.add_argument(
        "--task",
        default="interview.parse",
        choices=sorted(TASKS),
        help="the task to sample (the parse task or the repair task)",
    )
    parser.add_argument("--train", help="the training records to sample (the split's train side)")
    parser.add_argument("--out", help="where to write the round (default data/training/rft/<round>)")
    parser.add_argument("--samples", type=int, default=4, help="samples per record")
    parser.add_argument("--temperature", type=float, default=0.7, help="the sampling temperature")
    parser.add_argument("--limit", type=int, default=0, help="sample only the first N records")
    parser.add_argument("--base-url", default="http://127.0.0.1:8787", help="the local router")
    parser.add_argument("--model", default="chat", help="the fleet route to sample")
    parser.add_argument("--engine", help="the CAD engine (the repair task runs macros)")
    args = parser.parse_args(argv)

    task = TASKS[args.task]
    train = pathlib.Path(args.train) if args.train else task["train"]
    if not train.is_file():
        print(f"no training records at {train}", file=sys.stderr)
        return 1
    records = load_jsonl(train)
    if args.limit:
        records = records[: args.limit]
    if not records:
        print(f"no records to sample in {train}", file=sys.stderr)
        return 1

    judge = judge_answer
    if args.task == "repair.fix":
        try:
            engine = find_engine(args.engine)
        except Exception as exc:  # the engine's own error
            print(f"the CAD engine could not be found: {exc}", file=sys.stderr)
            return 1
        cases = {case.id: case for case in load_cases(CASES, root=ROOT)}
        verifier = _verifier(engine, cases)
        judge = lambda record, answer: judge_repair(  # noqa: E731
            record, answer, verify=verifier
        )

    out = pathlib.Path(args.out) if args.out else OUT_ROOT / args.round

    client = LlamaSwapClient(base_url=args.base_url, model=args.model)
    try:
        samples = sample_round(
            client,
            records,
            samples=args.samples,
            temperature=args.temperature,
            tasks=(args.task,),
            judge=judge,
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

    kept = build_rft_records(
        samples,
        records,
        round_id=args.round,
        model=args.model,
        verify_checks=task["checks"],
    )
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
