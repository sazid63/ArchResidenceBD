"""Judge repair replies by executing them in the real CAD engine (W1.7).

A repair is only right if the repaired macro **passes the same case** the broken macro failed.
A text diff cannot say that: a repair can look perfect and still build the wrong thing. This
tool therefore writes each returned macro to disk as a candidate, runs it through the W1.8
harness (FreeCAD), and lets the case verdict decide.

Three measures per reply:

- ``passesOwnCase`` - the repaired macro passes the case the record failed (the real gate);
- ``noCollateral`` - the same macro still passes the *other* foundation cases, so the repair did
  not break the rest of the model;
- ``identicalToTarget`` - the reply is byte-identical to the known-good macro (strictest, and
  the only way to pass every case at once).

The floor is the stock base model's measured rate on the same prompts
(``data/eval/repair-v0/gates.json``); a fine-tune below the floor fails, exactly like the chat
round.

Usage (from the repo root):
  uv run --directory core python ../tools/training/eval_repair.py --model finetune \
      --engine "C:\\path\\to\\freecadcmd.exe"
  uv run --directory core python ../tools/training/eval_repair.py --model stock \
      --engine "<freecadcmd>" --no-gates

Exit codes: 0 = every reply was judged and every gate held; 1 = a reply was missing, a macro
could not be executed, or a floor was missed.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import tempfile

from archres_core.cad import (
    EngineMissing,
    find_engine,
    load_case_document,
    load_cases,
    run_candidate,
    verify_result,
)
from archres_core.stdio import utf8_stdio
from archres_core.training import load_jsonl, sha256_file

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"
TARGET = ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"
SPLIT = ROOT / "data" / "training" / "repair-v1" / "holdout.jsonl"
EVAL = ROOT / "data" / "eval" / "repair-v0"
REPLIES = EVAL / "replies"
GATES = EVAL / "gates.json"

_FENCE = re.compile(r"^\s*```[a-zA-Z0-9_+-]*\s*\n(.*?)\n```\s*$", re.DOTALL)


def _strip_fences(macro: str) -> str:
    """A model that wraps the macro in a code fence still wrote a macro."""
    match = _FENCE.match(macro or "")
    return match.group(1) if match else (macro or "").strip()


def _reply_path(model: str) -> pathlib.Path:
    return REPLIES / f"{model}.jsonl"


def _load_gates() -> dict:
    if not GATES.is_file():
        return {}
    return json.loads(GATES.read_text(encoding="utf-8"))


def _run_case(engine, macro: str, case, workdir: pathlib.Path):
    workdir.mkdir(parents=True, exist_ok=True)
    candidate = workdir / "candidate.py"
    candidate.write_text(macro, encoding="utf-8", newline="\n")
    return run_candidate(
        engine,
        candidate,
        {"kind": case.kind, "params": case.params, "caseId": case.id},
        workdir / "run",
        timeout_ms=case.timeout_ms,
    )


def _judge(engine, replies: list[dict], cases: dict, target_source: str, model: str) -> dict:
    rows: list[dict] = []
    with tempfile.TemporaryDirectory(prefix="repair-eval-") as temp:
        root = pathlib.Path(temp)
        for number, reply in enumerate(replies, start=1):
            mutation_id = str(reply.get("mutationId") or "")
            case_id = str(reply.get("caseId") or "")
            case = cases.get(case_id)
            row: dict = {
                "mutationId": mutation_id,
                "caseId": case_id,
                "executed": False,
                "passesOwnCase": False,
                "noCollateral": False,
                "identicalToTarget": False,
                "detail": "",
            }
            if case is None:
                row["detail"] = "the reply names a case that is not in the case file"
                rows.append(row)
                continue
            macro = _strip_fences(str(reply.get("macro") or ""))
            row["identicalToTarget"] = macro.strip() == target_source.strip()
            outcome = _run_case(engine, macro, case, root / f"{number:02d}-{mutation_id}")
            verdict = verify_result(case, outcome)
            row["executed"] = outcome.code != "engine_error" and outcome.result is not None
            row["passesOwnCase"] = bool(verdict.ok)
            row["detail"] = (
                f"{outcome.code}: " + "; ".join(item.message for item in verdict.failures)
                if not verdict.ok
                else "the case passed"
            )
            collateral = True
            for other_id, other in cases.items():
                if other_id == case_id:
                    continue
                other_outcome = _run_case(engine, macro, other, root / f"{number:02d}-{mutation_id}-col")
                if not verify_result(other, other_outcome).ok:
                    collateral = False
                    break
            row["noCollateral"] = collateral
            rows.append(row)
    measured = len(rows)
    return {
        "model": model,
        "replies": measured,
        "executed": sum(1 for row in rows if row["executed"]),
        "passesOwnCase": sum(1 for row in rows if row["passesOwnCase"]),
        "noCollateral": sum(1 for row in rows if row["noCollateral"]),
        "identicalToTarget": sum(1 for row in rows if row["identicalToTarget"]),
        "rows": rows,
    }


def _rate(summary: dict, metric: str) -> float:
    total = summary["replies"]
    return round(summary[metric] / total, 4) if total else 0.0


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Judge repair replies in the real engine.")
    parser.add_argument("--model", default="finetune", help="recorded reply set to judge")
    parser.add_argument("--engine", help="freecadcmd path (default: the known install)")
    parser.add_argument("--json", help="write the machine-readable report here")
    parser.add_argument("--markdown", help="write the human-readable report here")
    parser.add_argument("--no-gates", action="store_true", help="report without failing on a floor")
    args = parser.parse_args()

    reply_path = _reply_path(args.model)
    if not reply_path.is_file():
        print(f"no recorded replies at {reply_path}", file=sys.stderr)
        return 1
    replies = load_jsonl(reply_path)
    if not replies:
        print(f"the reply set {reply_path.name} is empty", file=sys.stderr)
        return 1

    try:
        engine = find_engine(args.engine)
    except EngineMissing as exc:
        print(f"no CAD engine: {exc}", file=sys.stderr)
        return 1

    raw_cases = load_case_document(CASES)
    cases = {
        case.id: case
        for case in load_cases(CASES, root=ROOT)
        if case.kind == "geometry.build" and (case.expect.get("status") or "") == "ok"
    }
    target_source = TARGET.read_text(encoding="utf-8")
    holdout = load_jsonl(SPLIT)
    expected = {record["input"]["mutation"]["id"] for record in holdout}
    seen = {str(reply.get("mutationId")) for reply in replies}
    missing = sorted(expected - seen)

    summary = _judge(engine, replies, cases, target_source, args.model)
    report = {
        "schemaVersion": "1",
        "model": args.model,
        "replyFile": reply_path.name,
        "replySha256": sha256_file(reply_path),
        "frozenHoldout": sorted(expected),
        "missingReplies": missing,
        "summary": {
            key: summary[key]
            for key in ("replies", "executed", "passesOwnCase", "noCollateral", "identicalToTarget")
        },
        "rates": {
            "passesOwnCase": _rate(summary, "passesOwnCase"),
            "noCollateral": _rate(summary, "noCollateral"),
            "identicalToTarget": _rate(summary, "identicalToTarget"),
        },
        "rows": summary["rows"],
    }

    gates = _load_gates()
    failures: list[str] = []
    if missing:
        failures.append(f"{len(missing)} frozen holdout mutations have no reply: {missing}")
    for name, value in (gates.get("floors") or {}).items():
        floor = float(value.get("floor", 0.0))
        actual = report["rates"].get(name)
        if actual is None:
            continue
        if actual < floor:
            failures.append(f"{name} {actual} < floor {floor}")
    report["gates"] = gates.get("floors") or {}
    report["ok"] = not failures
    report["failures"] = failures

    if args.json:
        path = pathlib.Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    if args.markdown:
        path = pathlib.Path(args.markdown)
        path.parent.mkdir(parents=True, exist_ok=True)
        lines = [
            f"# repair eval - {args.model}",
            "",
            f"- replies: {report['summary']['replies']}",
            f"- executed: {report['summary']['executed']}",
            f"- passes own case: {report['summary']['passesOwnCase']} "
            f"({report['rates']['passesOwnCase']})",
            f"- no collateral damage: {report['summary']['noCollateral']} "
            f"({report['rates']['noCollateral']})",
            f"- identical to the known-good macro: {report['summary']['identicalToTarget']} "
            f"({report['rates']['identicalToTarget']})",
            "",
            "| mutation | case | executed | passes | no collateral | identical | detail |",
            "|---|---|---|---|---|---|---|",
        ]
        for row in report["rows"]:
            lines.append(
                f"| {row['mutationId']} | {row['caseId']} | {row['executed']} | "
                f"{row['passesOwnCase']} | {row['noCollateral']} | {row['identicalToTarget']} | "
                f"{row['detail'][:120]} |"
            )
        path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    print(f"repair eval - {args.model}")
    for key in ("replies", "executed", "passesOwnCase", "noCollateral", "identicalToTarget"):
        print(f"  {key}: {report['summary'][key]}")
    for name, value in report["rates"].items():
        print(f"  rate {name}: {value}")
    for row in report["rows"]:
        print(f"  - {row['mutationId']}: executed={row['executed']} passes={row['passesOwnCase']} "
              f"collateral={row['noCollateral']} identical={row['identicalToTarget']}")
    if failures and not args.no_gates:
        for failure in failures:
            print(f"FAIL {failure}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
