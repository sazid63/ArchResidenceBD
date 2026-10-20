#!/usr/bin/env python
"""Run the CAD execution-verify harness (W1.8).

The app's judge for CAD generation:
1. ``--check``: offline validation of the case set (scripts exist, expectations are honest). Runs with no engine.
2. ``--run``: execute cases headless, measure the document, grade against expectations, and run determinism checks where requested. Needs ``freecadcmd`` or ``--engine``/``ARCHRES_FREECADCMD``. A missing engine is an error, never a silent pass.
3. ``--json``/``--markdown``: write the report somewhere.

Exit code 1 on any failure.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(ROOT / "core" / "src") not in sys.path:
    sys.path.insert(0, str(ROOT / "core" / "src"))

from archres_core.cad import (  # noqa: E402
    CadError,
    check_cases,
    dumps_report,
    find_engine,
    load_cases,
    render_markdown,
    run_execution,
)
from archres_core.stdio import utf8_stdio  # noqa: E402

CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="CAD execution-verify harness (W1.8)")
    parser.add_argument("--cases", default=str(CASES), help="case file (JSON or YAML)")
    parser.add_argument("--check", action="store_true", help="offline check only, no engine needed")
    parser.add_argument("--run", action="store_true", help="execute cases headless (needs a CAD engine)")
    parser.add_argument("--engine", help="path to freecadcmd")
    parser.add_argument("--workdir", help="keep run artifacts here")
    parser.add_argument("--json", help="write JSON report")
    parser.add_argument("--markdown", help="write Markdown report")
    parser.add_argument("--quiet", action="store_true", help="suppress stdout report")
    args = parser.parse_args(argv)

    if args.check and args.run:
        parser.error("--check and --run are mutually exclusive")
    if not args.check and not args.run:
        args.check = True

    try:
        if args.check:
            report = check_cases(args.cases, root=ROOT)
            print(render_markdown(report), end="")
            if args.json:
                pathlib.Path(args.json).write_bytes(dumps_report(report).encode("utf-8"))
            if args.markdown:
                pathlib.Path(args.markdown).write_bytes(render_markdown(report).encode("utf-8"))
            return 0 if report.ok else 1

        engine = find_engine(args.engine)
        cases = load_cases(args.cases, root=ROOT)
        report = run_execution(cases, engine=engine, workdir=args.workdir, keep=bool(args.workdir))
        if not args.quiet:
            print(render_markdown(report), end="")
        if args.json:
            pathlib.Path(args.json).write_bytes(dumps_report(report).encode("utf-8"))
        if args.markdown:
            pathlib.Path(args.markdown).write_bytes(render_markdown(report).encode("utf-8"))
        if report.errors:
            for error in report.errors:
                print(error, file=sys.stderr)
            return 1
        return 0 if report.ok else 1
    except CadError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
