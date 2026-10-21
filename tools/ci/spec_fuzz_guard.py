"""The spec fuzz guard (plan §9): the spec engine must never crash on bad input.

The plan's §9 names four CI guards; this is the one that had no package. The fuzzer mutates
the committed examples and checks the engine's answers:

- the engine may **reject** a document (that is its job ✓) ✓,
- it may **not** raise anything else ✓ — a crash on bad input is a crash a user can cause ✓,
- and a document it accepts must satisfy the schema ✓.

Run from the repo root:  uv run --directory core python ../tools/ci/spec_fuzz_guard.py
"""

from __future__ import annotations

import json
import pathlib
import sys

from archres_core.spec.fuzz import DEFAULT_SEED, fuzz
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLES = ROOT / "spec" / "examples"
ROUNDS = 400


def main() -> int:
    utf8_stdio()
    total = 0
    crashes: list[str] = []
    invalid: list[str] = []
    for path in sorted(EXAMPLES.glob("*.json")):
        spec = json.loads(path.read_text(encoding="utf-8"))
        result = fuzz(spec, rounds=ROUNDS, seed=DEFAULT_SEED)
        total += result.mutants
        crashes.extend(f"{path.name}: {item}" for item in result.crashes)
        invalid.extend(f"{path.name}: {item}" for item in result.invalid)
    for item in crashes + invalid:
        print(f"FAIL {item}", file=sys.stderr)
    if crashes or invalid:
        print(
            f"spec fuzz guard: {len(crashes)} crash(es), {len(invalid)} invalid document(s)",
            file=sys.stderr,
        )
        return 1
    print(f"spec fuzz guard clean - {total} mutants, no crash, no invalid document")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
