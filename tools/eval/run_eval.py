"""Run the W1.9 eval harness and gate on it.

Offline and deterministic: the rule engine, the parser, the law desk, the demo scenarios and
the deviation register are all exercised with no network and no model. The one model suite
scores a **recorded** reply set (`replies/<model>.jsonl`), so CI measures the same bytes that
were recorded, and a live re-record is a separate, visible step
(`tools/eval/record_baseline.py`).

Usage (repo root):
  uv run --directory core python ../tools/eval/run_eval.py
  uv run --directory core python ../tools/eval/run_eval.py --model stock --json data/eval/last.json
  uv run --directory core python ../tools/eval/run_eval.py --no-gates     # report only

Exit codes: 0 = every gate passed and every case was scored; 1 = a gate failed, coverage was
incomplete, or the harness could not run. There is no "skip" exit code on purpose.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

from archres_core import compliance
from archres_core.agent import LawDesk
from archres_core.eval import (
    EvalCase,
    build_report,
    check_split,
    coverage_probes,
    dumps_report,
    load_authored,
    load_cases,
    load_replies,
    load_split,
    render_markdown,
    run_golden_suite,
    run_model_suite,
    run_model_safety_suite,
    run_parse_suite,
    run_rag_suite,
    run_register_suite,
    run_rule_suite,
    run_scenario_suite,
)
from archres_core.eval.cases import EvalError
from archres_core.interview import load_book
from archres_core.rag import HashingEmbedder, LexicalReranker, service_from_paths
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
CORPUS = ROOT / "spec" / "rag" / "rajuk-2008.corpus.jsonl"
OUT = ROOT / "data" / "eval" / "chat-v0"
CASES = OUT / "cases.jsonl"
SPLIT = OUT / "split.json"
MANIFEST = OUT / "manifest.json"
GATES = OUT / "gates.json"
#: The golden project (plan section 7: "golden projects - BOQ within 8%"): the app's own
#: path on the reference project, compared with the committed reference BOQ.
GOLDEN_SPEC = ROOT / "spec" / "examples" / "two-storey-residential.json"
GOLDEN_REFERENCE = ROOT / "data" / "boq" / "two-storey-residential.boq.json"
GOLDEN_CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"
#: The engineer's check (plan section 7: "drawings engineer-checked") is a human act; the
#: record is where it is written down. Until it is signed the gate is *pending* - named, not
#: silent, and not blocking the build.
ENGINEER_CHECK = OUT / "engineer-check.json"
AUTHORED = OUT / "authored.yaml"
REPLIES = OUT / "replies"


def _golden_case(tolerance_pct: float) -> EvalCase:
    """The golden project's case: the app's path, against the committed reference BOQ."""
    return EvalCase(
        id="golden-two-storey-residential",
        suite="golden",
        lang=None,
        split="engine",
        source={"kind": "golden", "note": "the reference project (plan section 7)"},
        input={
            "spec": str(GOLDEN_SPEC.relative_to(ROOT)),
            "reference": str(GOLDEN_REFERENCE.relative_to(ROOT)),
        },
        expect={"tolerancePct": tolerance_pct},
    )


def _path(value: str | None) -> pathlib.Path | None:
    if value is None:
        return None
    path = pathlib.Path(value)
    return path if path.is_absolute() else ROOT / path


def _load_gates() -> list[dict]:
    if not GATES.is_file():
        raise EvalError(f"gate file not found: {GATES.relative_to(ROOT)}")
    document = json.loads(GATES.read_text(encoding="utf-8"))
    gates = document.get("gates")
    if not isinstance(gates, list) or not gates:
        raise EvalError("gate file has no gates")
    for gate in gates:
        for key in ("suite", "metric"):
            if key not in gate:
                raise EvalError(f"gate {gate!r} is missing {key!r}")
        # A gate carries a floor, a ceiling, or both - a band. "BOQ within 8% of the
        # reference" is a band; "CAD execution success above 90%" is a floor.
        if "floor" not in gate and "max" not in gate:
            raise EvalError(f"gate {gate!r} has neither a 'floor' nor a 'max'")
    return gates


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Run the eval harness (deterministic + recorded model).")
    parser.add_argument("--model", default="stock", help="recorded reply set under data/eval/chat-v0/replies")
    parser.add_argument("--replies", help="explicit reply file (overrides --model)")
    parser.add_argument("--json", help="write the machine-readable report here")
    parser.add_argument("--markdown", help="write the human-readable report here")
    parser.add_argument("--no-gates", action="store_true", help="report without failing on a floor")
    parser.add_argument("--no-probes", action="store_true", help="skip the coverage probes")
    args = parser.parse_args(argv)

    try:
        cases = load_cases(CASES)
        split = load_split(SPLIT)
        problems = check_split(cases, split)
        if problems:
            raise EvalError(
                "the case file disagrees with the frozen split: " + "; ".join(problems[:5])
            )
        book = load_book(ROOT / "spec" / "flows" / "phase-flow-book.yaml")
        pack = compliance.load_pack(PACK)
        pack_path = PACK
        pack_sha = compliance.pack_sha256(PACK)
        service = service_from_paths(
            CORPUS, embedder=HashingEmbedder(), reranker=LexicalReranker()
        )
        desk = LawDesk(service)

        reply_path = _path(args.replies) or (REPLIES / f"{args.model}.jsonl")
        replies = load_replies(reply_path)
    except EvalError as exc:
        print(f"eval harness cannot run: {exc}", file=sys.stderr)
        return 1

    # The golden project (W4.3): the app's own path, against the committed reference BOQ.
    golden_tolerance = 8.0
    cases = [*cases, _golden_case(golden_tolerance)]

    by_suite: dict[str, list] = {}
    for case in cases:
        by_suite.setdefault(case.suite, []).append(case)

    suites = [
        run_rule_suite(by_suite.get("rule.vector", []), pack),
        run_parse_suite(by_suite.get("parse", []), book),
        run_model_suite(by_suite.get("model.parse", []), replies),
        run_model_safety_suite(by_suite.get("model.safety", []), replies, book),
        run_rag_suite(by_suite.get("rag", []), desk),
        run_scenario_suite(by_suite.get("scenario", []), ROOT),
        run_register_suite(by_suite.get("register", []), pack, pack_path, ROOT),
        run_golden_suite(
            by_suite.get("golden", []),
            ROOT,
            json.loads(GOLDEN_REFERENCE.read_text(encoding="utf-8")),
            json.loads(GOLDEN_CARD.read_text(encoding="utf-8")),
            engineer_check=(
                json.loads(ENGINEER_CHECK.read_text(encoding="utf-8"))
                if ENGINEER_CHECK.is_file()
                else {}
            ),
        ),
    ]
    suites = [suite for suite in suites if suite.cases > 0]

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    reply_sha = hashlib.sha256(reply_path.read_bytes()).hexdigest()
    pinned_reply = (manifest.get("replies") or {}).get(args.model, {}).get("sha256")
    if pinned_reply is not None and pinned_reply != reply_sha:
        print(
            f"eval harness cannot run: {reply_path.name} sha256 {reply_sha} "
            f"does not match the manifest pin {pinned_reply}",
            file=sys.stderr,
        )
        return 1
    pins = {
        **manifest["pins"],
        "casesSha256": manifest["cases"]["sha256"],
        "splitSha256": manifest["splitDocument"]["sha256"],
        "replyFile": reply_path.name,
        "replySha256": reply_sha,
        "pinnedReplySha256": pinned_reply,
    }

    try:
        gates = [] if args.no_gates else _load_gates()
        probes = (
            []
            if args.no_probes
            else coverage_probes(load_authored(AUTHORED))
        )
        report = build_report(
            suites=suites,
            cases=cases,
            gates=gates,
            model=args.model,
            pins=pins,
            coverage_probes=probes,
            desk=desk,
        )
    except EvalError as exc:
        print(f"eval harness cannot score: {exc}", file=sys.stderr)
        return 1

    print(
        f"eval: {report['cases']['scored']}/{report['cases']['expected']} cases, "
        f"model {report['model']} -> {'PASS' if report['ok'] else 'FAIL'}"
    )
    for suite in report["suites"]:
        print(
            f"  {suite['name']:14s} {suite['passed']:4d}/{suite['cases']:<4d} "
            f"accuracy {suite['accuracy']:.3f}"
            + ("" if not suite["failed"] else f"  ({suite['failed']} failed)")
        )
    for gate in report["gates"]:
        floor = gate.get("floor")
        ceiling = gate.get("max")
        if floor is not None and ceiling is not None:
            bound = f"{floor:.3f} <= value <= {ceiling:.3f}"
        elif floor is not None:
            bound = f">= {floor:.3f}"
        else:
            bound = f"<= {ceiling:.3f}"
        if gate.get("pending"):
            # a pending gate is named, not hidden: it is waiting on a human or an owner item
            owner = f" (owner item #{gate['ownerItem']})" if gate.get("ownerItem") else ""
            print(
                f"  gate {gate['suite']}/{gate['metric']}: {gate['value']:.3f} {bound} "
                f"[PENDING{owner}]"
            )
            continue
        mark = "ok" if gate["ok"] else "FAIL"
        print(f"  gate {gate['suite']}/{gate['metric']}: {gate['value']:.3f} {bound} [{mark}]")

    json_path = _path(args.json)
    if json_path:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_bytes(dumps_report(report).encode("utf-8"))
        print(f"report: {json_path.relative_to(ROOT) if json_path.is_relative_to(ROOT) else json_path}")
    markdown_path = _path(args.markdown)
    if markdown_path:
        markdown_path.parent.mkdir(parents=True, exist_ok=True)
        markdown_path.write_bytes(render_markdown(report).encode("utf-8"))
        print(
            f"report: {markdown_path.relative_to(ROOT) if markdown_path.is_relative_to(ROOT) else markdown_path}"
        )

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
