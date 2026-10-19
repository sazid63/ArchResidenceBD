"""Rule pack CLI (W1.2): the rule engine replaces the pre-W1.2 demo evaluator.

Two modes:

- vector mode (default): every ``testVectors`` entry embedded in a pack is evaluated
  through ``archres_core.compliance`` and compared with its expectation. This is the
  pack's self-test and the engine's semantic contract (W1.2 froze the demo semantics).
- spec mode (``--spec``): evaluate one Building Spec revision against the pack and
  print (or write) the W0.9 verdict set JSON.

Usage (from the repo root):
  uv run --directory core python ../tools/rules/eval_spec.py [pack] [--spec SPEC.json] [--out OUT.json]

Exit codes: 0 = every vector passes / a verdict set was produced; 1 = mismatch or error.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys

from archres_core.compliance import (
    RulePackError,
    evaluate_spec,
    load_pack,
    pack_sha256,
    run_vectors,
)
from archres_core.stdio import utf8_stdio
from archres_core.spec import SpecEngineError, validate_spec

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_PACK = ROOT / "spec" / "rules" / "rajuk-2008.yaml"


def _path(argument: str) -> pathlib.Path:
    """Repo-root-relative paths (the way this repo talks about files); absolutes pass through."""
    path = pathlib.Path(argument)
    return path if path.is_absolute() else ROOT / path


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Rule pack CLI: test vectors or a spec evaluation.")
    parser.add_argument(
        "pack", nargs="?", default=str(DEFAULT_PACK), help="rule pack YAML (default: rajuk-2008.yaml)"
    )
    parser.add_argument("--spec", help="evaluate this Building Spec file instead of the test vectors")
    parser.add_argument("--out", help="write the verdict set here (default: stdout)")
    parser.add_argument("--at", help="evaluatedAt timestamp (default: now)")
    args = parser.parse_args()
    pack_file = _path(args.pack)

    try:
        pack = load_pack(pack_file)
    except RulePackError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    if args.spec:
        try:
            spec = json.loads(_path(args.spec).read_text(encoding="utf-8"))
            validate_spec(spec)
            verdict_set = evaluate_spec(spec, pack, pack_path=pack_file, evaluated_at=args.at)
        except (OSError, json.JSONDecodeError, SpecEngineError) as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        text = json.dumps(verdict_set, ensure_ascii=False, indent=2) + "\n"
        if args.out:
            out = _path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {out}")
        else:
            print(text, end="")
        summary = verdict_set["summary"]
        print(
            f"{pack['id']} [{pack['status']}]@{pack_sha256(pack_file)[:12]}: "
            f"compliant {summary['compliant']}, deviation {summary['deviation']}, "
            f"impossible {summary['impossible']}, unevaluated {len(verdict_set['unevaluated'])}",
            file=sys.stderr,
        )
        return 0

    results = run_vectors(pack)
    for row in results:
        if not row["ok"]:
            print(f"FAIL {row['id']}: got {row['got']!r}, want {row['expect']!r}")
    failed = sum(1 for row in results if not row["ok"])
    print(f"{pack['id']} [{pack['status']}]: {len(results) - failed}/{len(results)} vectors pass")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
