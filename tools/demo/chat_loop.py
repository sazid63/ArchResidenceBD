"""Chat-loop demo CLI (W1.12): interview a dummy project end to end, BN or EN.

Starts the model fleet (unless `--base-url` points at a running router), opens a real
`Session`, walks a scenario through every authored question, commits revisions, and writes
`spec.json` / `transcript.json` / `coverage.json` / `summary.json` under `data/demo/`.

Usage (from the repo root):
  $env:ARCHRES_ROOT = "$PWD\\data\\downloads\\s2"
  uv run --directory core python ../tools/demo/chat_loop.py --scenario tools/demo/scenarios/dhaka-house-bn.json
  uv run --directory core python ../tools/demo/chat_loop.py --scenario tools/demo/scenarios/dhaka-house-en.json --no-model
  uv run --directory core python ../tools/demo/chat_loop.py --scenario ... --base-url http://127.0.0.1:8787

Exit codes: 0 = completed with no open essential; 1 = error, open essential or rejected answer.
"""

from __future__ import annotations

import argparse
import datetime
import json
import os
import pathlib
import sys

from archres_core.agent import LlamaSwapClient, OrchestratorError, Session
from archres_core.demo import DemoError, DemoRunner, load_scenario, write_report
from archres_core.interview import InterviewError, load_book
from archres_core.serving import FleetError, FleetLauncher, LauncherError, load_fleet
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
FLEET = ROOT / "spec" / "models" / "fleet.json"
DEFAULT_SCENARIO = ROOT / "tools" / "demo" / "scenarios" / "dhaka-house-bn.json"


def _path(value: str | None) -> pathlib.Path | None:
    if value is None:
        return None
    path = pathlib.Path(value)
    return path if path.is_absolute() else ROOT / path


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Interview a dummy project with the real brain.")
    parser.add_argument("--scenario", default=str(DEFAULT_SCENARIO), help="scenario JSON (default: Bengali demo)")
    parser.add_argument("--out", help="artifact directory (default: data/demo/<scenario>-<timestamp>)")
    parser.add_argument("--root", help="install root for the fleet (default: $ARCHRES_ROOT)")
    parser.add_argument("--base-url", help="use an already-running router instead of starting one")
    parser.add_argument("--binary", help="llama-swap binary (default: <root>/bin/llama-swap/llama-swap.exe)")
    parser.add_argument("--no-model", action="store_true", help="run without a model (no escalations allowed)")
    parser.add_argument("--timeout", type=float, default=180.0, help="fleet readiness/warmup timeout")
    parser.add_argument("--at", help="fixed revision timestamp (reproducible runs)")
    parser.add_argument("--quiet", action="store_true", help="suppress the per-question narration")
    args = parser.parse_args()

    book = load_book(BOOK)
    try:
        scenario = load_scenario(_path(args.scenario) or DEFAULT_SCENARIO, book)
    except DemoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    out = _path(args.out) or ROOT / "data" / "demo" / f"{scenario.name}-{stamp}"
    if (out / "store").exists():
        print(f"error: {out} already contains a demo store - choose a fresh --out", file=sys.stderr)
        return 1
    out.mkdir(parents=True, exist_ok=True)

    launcher: FleetLauncher | None = None
    client = None
    try:
        if args.no_model:
            print("model: none (--no-model) - an escalation will stop the demo", file=sys.stderr)
        elif args.base_url:
            client = LlamaSwapClient(base_url=args.base_url, model="chat", timeout=args.timeout)
            print(f"model: existing router at {args.base_url}", file=sys.stderr)
        else:
            root_value = args.root or os.environ.get("ARCHRES_ROOT")
            if not root_value:
                print(
                    "model: none (pass --root / set ARCHRES_ROOT, --base-url, or --no-model)",
                    file=sys.stderr,
                )
            else:
                # resolved against the repo root, not the shell's cwd: `uv run --directory
                # core` runs every tool from core/, so a bare `--root data/downloads/s2`
                # used to resolve to core/data/downloads/s2 and fail with "binary not found".
                root = (_path(root_value) or pathlib.Path(root_value)).resolve()
                binary = _path(args.binary) or root / "bin" / "llama-swap" / "llama-swap.exe"
                launcher = FleetLauncher(
                    load_fleet(FLEET),
                    binary,
                    root=root,
                    timeout=args.timeout,
                    log_path=out / "fleet.log",
                )
                launcher.start()
                warm = launcher.preload("interview")
                print(
                    f"model: {launcher.base_url} (interview warm in {warm['seconds']}s: "
                    + ", ".join(f"{item['route']} {item['seconds']}s" for item in warm["warmed"])
                    + ")",
                    file=sys.stderr,
                )
                client = LlamaSwapClient(base_url=launcher.base_url, model="chat", timeout=args.timeout)

        spec = scenario.spec()
        spec.setdefault("project", {})["language"] = scenario.language
        session = Session.create(
            book,
            out / "store",
            spec,
            client=client,
            language=scenario.language,
            flows=list(scenario.flows),
            at=args.at,
        )
        print(f"{scenario.title[scenario.language]}", file=sys.stderr)
        print(f"out: {out}", file=sys.stderr)
        runner = DemoRunner(session, scenario, say=None if args.quiet else (lambda line: print(line)))
        report = runner.run()
        write_report(report, out)
        summary = report.summary()
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        if report.open_essential:
            print(f"open essential: {report.open_essential}", file=sys.stderr)
            return 1
        return 0
    except (DemoError, FleetError, LauncherError, OrchestratorError, InterviewError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        if launcher is not None:
            launcher.stop()


if __name__ == "__main__":
    raise SystemExit(main())
