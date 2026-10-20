"""Record a model reply set for the eval harness (W1.9).

The eval never calls a model during scoring: it scores a **recorded** reply set, so a number
is reproducible from committed bytes and a new model round is a visible new file
(`replies/<name>.jsonl`). This tool is what produces that file, against the real fleet.

The prompt comes from the training dataset record itself (`source.recordId`), not from a
second copy: the eval then measures exactly the task the SFT data defines.

Usage (repo root):
  # against a running router
  uv run --directory core python ../tools/eval/record_baseline.py --base-url http://127.0.0.1:8787
  # or let it start the fleet
  uv run --directory core python ../tools/eval/record_baseline.py --root data/downloads/s2

Exit codes: 0 = every sampled case recorded; 1 = the fleet/model could not be used.
A partial file is valid JSON but the harness gate will fail on the missing cases - on purpose.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

from archres_core.agent import LlamaSwapClient, ModelError
from archres_core.eval import load_cases
from archres_core.eval.cases import EvalError
from archres_core.serving import FleetLauncher, LauncherError, load_fleet
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "data" / "eval" / "chat-v0" / "cases.jsonl"
DATASET = ROOT / "data" / "training" / "chat-v0" / "dataset.jsonl"
OUT = ROOT / "data" / "eval" / "chat-v0" / "replies"
FLEET = ROOT / "spec" / "models" / "fleet.json"


def _path(value: str | None) -> pathlib.Path | None:
    if value is None:
        return None
    path = pathlib.Path(value)
    return path if path.is_absolute() else ROOT / path


def _dataset_prompts() -> dict[str, list[dict[str, str]]]:
    prompts: dict[str, list[dict[str, str]]] = {}
    for line in DATASET.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        if record.get("task") != "interview.parse":
            continue
        messages = record.get("messages") or []
        prompts[record["id"]] = [
            {"role": message["role"], "content": message["content"]}
            for message in messages
            if message.get("role") != "assistant"
        ]
    return prompts


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Record model replies for the eval harness.")
    parser.add_argument("--name", default="stock", help="reply-set name (file stem), default: stock")
    parser.add_argument("--base-url", help="use an already-running router")
    parser.add_argument("--root", help="install root; the tool starts the fleet itself")
    parser.add_argument("--binary", help="llama-swap binary (default: <root>/bin/llama-swap/llama-swap.exe)")
    parser.add_argument("--timeout", type=float, default=300.0, help="per-call and fleet timeout")
    parser.add_argument("--limit", type=int, help="record only the first N cases (debugging; the gate will fail)")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    try:
        cases = [case for case in load_cases(CASES) if case.suite == "model.parse"]
        prompts = _dataset_prompts()
    except EvalError as exc:
        print(f"cannot record: {exc}", file=sys.stderr)
        return 1
    if args.limit:
        cases = cases[: args.limit]
    missing = [case.source["recordId"] for case in cases if case.source["recordId"] not in prompts]
    if missing:
        print(f"cannot record: no dataset prompt for {missing[:3]}", file=sys.stderr)
        return 1

    launcher: FleetLauncher | None = None
    try:
        if args.base_url:
            client = LlamaSwapClient(base_url=args.base_url, model="chat", timeout=args.timeout)
        else:
            root_value = args.root or os.environ.get("ARCHRES_ROOT")
            if not root_value:
                print(
                    "no model: pass --base-url or --root (or set ARCHRES_ROOT)",
                    file=sys.stderr,
                )
                return 1
            root = (_path(root_value) or pathlib.Path(root_value)).resolve()
            binary = _path(args.binary) or root / "bin" / "llama-swap" / "llama-swap.exe"
            launcher = FleetLauncher(load_fleet(FLEET), binary, root=root, timeout=args.timeout)
            launcher.start()
            launcher.preload("interview")
            client = LlamaSwapClient(base_url=launcher.base_url, model="chat", timeout=args.timeout)

        rows: list[dict[str, str]] = []
        for number, case in enumerate(cases, start=1):
            try:
                reply = client.complete(prompts[case.source["recordId"]])
            except ModelError as exc:
                print(f"model failed on {case.id}: {exc}", file=sys.stderr)
                return 1
            rows.append({"caseId": case.id, "reply": reply})
            if not args.quiet and number % 10 == 0:
                print(f"  {number}/{len(cases)} recorded", file=sys.stderr)
    except (LauncherError, ModelError) as exc:
        print(f"fleet error: {exc}", file=sys.stderr)
        return 1
    finally:
        if launcher is not None:
            launcher.stop()

    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / f"{args.name}.jsonl"
    payload = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows)
    target.write_bytes(payload.encode("utf-8"))
    print(f"wrote {target.relative_to(ROOT)}: {len(rows)} replies")
    print(
        "next: rebuild the case manifest (tools/eval/build_cases.py) so the reply sha is pinned, "
        "then run tools/eval/run_eval.py --model " + args.name
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
