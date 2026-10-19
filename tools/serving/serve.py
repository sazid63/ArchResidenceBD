"""Serve the model fleet for development and the E2E demo (W1.11).

Starts the bundled llama-swap router on loopback, proves readiness, warms the requested
mode (interview = chat first, design = repair first) and stays in the foreground until
Ctrl+C. `--once` starts, warms, reports and stops - the CI/smoke form.

The install root must contain `bin/llama/llama-server.exe` and the pinned GGUFs under
`models/` (the S2 download layout works as a dev root). The router binary defaults to
`<root>/bin/llama-swap/llama-swap.exe`.

Usage (from the repo root):
  $env:ARCHRES_ROOT = "$PWD\\data\\downloads\\s2"
  uv run --directory core python ../tools/serving/serve.py --mode interview
  uv run --directory core python ../tools/serving/serve.py --mode design --once
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import time

from archres_core.serving import FleetError, FleetLauncher, LauncherError, load_fleet
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLEET = ROOT / "spec" / "models" / "fleet.json"


def _path(value: str | None, *, base: pathlib.Path) -> pathlib.Path | None:
    if value is None:
        return None
    path = pathlib.Path(value)
    return path if path.is_absolute() else base / path


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Start the model fleet on loopback and warm a mode.")
    parser.add_argument("--fleet", default=str(FLEET), help="fleet JSON (default: spec/models/fleet.json)")
    parser.add_argument("--root", help="install root (default: $ARCHRES_ROOT)")
    parser.add_argument("--binary", help="llama-swap binary (default: <root>/bin/llama-swap/llama-swap.exe)")
    parser.add_argument("--base-url", help="loopback router URL (default: fleet listen)")
    parser.add_argument("--mode", default="interview", help="mode to warm (default: interview)")
    parser.add_argument("--log", default="data/logs/llama-swap.log", help="router log path (repo-relative)")
    parser.add_argument("--timeout", type=float, default=180.0, help="readiness/warmup timeout in seconds")
    parser.add_argument("--no-preload", action="store_true", help="do not warm the mode")
    parser.add_argument("--once", action="store_true", help="start, warm, report, stop (smoke test)")
    args = parser.parse_args()

    try:
        fleet = load_fleet(_path(args.fleet, base=ROOT) or args.fleet)
    except FleetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    root_arg = args.root or os.environ.get(fleet.install_root_env)
    if not root_arg:
        print(f"error: pass --root or set {fleet.install_root_env}", file=sys.stderr)
        return 1
    # resolved against the repo root, not the shell's cwd: `uv run --directory core` runs
    # every tool from core/, so a bare `--root data/downloads/s2` used to resolve under core/.
    root = (_path(root_arg, base=ROOT) or pathlib.Path(root_arg)).resolve()
    binary = _path(args.binary, base=root) if args.binary else root / "bin" / "llama-swap" / "llama-swap.exe"
    log_path = _path(args.log, base=ROOT)

    launcher = FleetLauncher(
        fleet,
        binary,
        root=root,
        base_url=args.base_url,
        timeout=args.timeout,
        log_path=log_path,
    )
    try:
        launcher.start()
        print(json.dumps({"ready": True, **launcher.status(), "models": launcher.models()}, ensure_ascii=False))
        if not args.no_preload:
            print(json.dumps(launcher.preload(args.mode), ensure_ascii=False))
    except LauncherError as exc:
        print(f"error: {exc}", file=sys.stderr)
        launcher.stop()
        return 1

    if args.once:
        launcher.stop()
        print("stopped")
        return 0

    print(f"serving on {launcher.base_url} - Ctrl+C to stop", file=sys.stderr)
    try:
        while True:
            time.sleep(1)
            if not launcher.running:
                print("error: router exited", file=sys.stderr)
                return 1
    except KeyboardInterrupt:
        launcher.stop()
        print("stopped")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
