"""The full-CAD tab's boot probe (W2.13): does the engine actually carry our brand?

The app launches the engine with a boot script; this probe launches it the same way and
**measures** what happened: the title, the theme, the icon and the engine's brand actions. A
"the branding should work" claim is not a measurement, so the probe reads the engine's own
facts file and fails when the engine still names itself.

It needs the engine's **GUI** (the branding is a GUI property) and a desktop session, so it is
a **dev-machine** probe — the CI runs the contract's tests instead (the pure half: the command
line, the environment, the fallback decision and the branding catalogue).

Usage (from the repo root):
  uv run --directory core python ../tools/cad/boot_probe.py --engine "<freecad.exe>"
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
from typing import Any

from archres_core.cad.launch_contract import (
    BOOT_SCRIPT,
    MODE_WINDOWED,
    branding_report,
    decide_mode,
    is_branded,
    launch_command,
    launch_env,
    read_facts,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORK = ROOT / "data" / "tmp" / "boot-probe"
REPORT = ROOT / "data" / "cad" / "generated" / "boot-report.json"
#: How long the engine's GUI may take to come up and write its facts.
START_TIMEOUT_S = 90.0


def _relative(path: str | pathlib.Path) -> str:
    """A repo-relative path (the committed report must not carry a machine's directory)."""
    candidate = pathlib.Path(path)
    try:
        return candidate.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return candidate.as_posix()


def _icon() -> pathlib.Path | None:
    """The generated icon, if the maker can produce one."""
    maker = ROOT / "cad" / "boot" / "make_nativecad_icon.py"
    target = WORK / "nativecad.ico"
    try:
        subprocess.run(
            [sys.executable, str(maker), str(target)],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, OSError):
        return None
    return target if target.is_file() else None


def _run(engine: pathlib.Path, workdir: pathlib.Path) -> dict[str, Any]:
    profile = workdir / "profile"
    out = workdir / "out"
    if profile.exists():
        shutil.rmtree(profile, ignore_errors=True)
    profile.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    facts_path = out / "ui_facts.json"
    # A stale facts file must never pass as a fresh run: the engine's report is the evidence,
    # so the evidence starts empty.
    if facts_path.exists():
        facts_path.unlink()

    icon = _icon()
    env = dict(os.environ)
    env.update(launch_env(profile, out, icon=icon))
    command = launch_command(engine)

    report: dict[str, Any] = {
        # The report is development evidence, not a product document: it records what the
        # engine called itself before the branding, and the engine's *name* only - never a
        # machine's path.
        "evidence": "the engine's own UI facts, before the branding was applied",
        "engine": pathlib.Path(command[0]).name,
        "command": [_relative(part) for part in command[1:]],
        "bootScript": _relative(BOOT_SCRIPT),
    }
    failures: list[str] = []
    facts: dict[str, Any] = {}
    process: subprocess.Popen | None = None
    started = time.monotonic()
    try:
        process = subprocess.Popen(  # noqa: S603 - the engine path is the operator's choice
            command,
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        while time.monotonic() - started < START_TIMEOUT_S:
            if facts_path.is_file():
                try:
                    facts = read_facts(facts_path)
                except (json.JSONDecodeError, OSError):
                    facts = {}
                if facts:
                    break
            if process.poll() is not None:
                failures.append("the engine exited before it reported its UI facts")
                break
            time.sleep(1.0)
        else:
            failures.append(f"the engine reported no UI facts within {START_TIMEOUT_S:.0f} s")
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
    report["elapsedSeconds"] = round(time.monotonic() - started, 2)

    if facts:
        # The committed report keeps the *evidence* (what was branded, what was hidden, the
        # counts, the mode) and not the engine's raw action census - a measurement file does
        # not need to carry the engine's own strings.
        report["facts"] = {
            key: facts.get(key)
            for key in (
                "title_before",
                "title_after",
                "title_applied",
                "theme_applied",
                "theme_bytes",
                "icon_applied",
                "brand_actions_hidden",
                "actions_total",
                "winid",
                "ok",
            )
        }
        report["branding"] = branding_report(facts)
        report["mode"] = decide_mode(facts)
        failures.extend(is_branded(facts))
        if report["mode"]["mode"] == MODE_WINDOWED:
            report["fallbackReasons"] = report["mode"]["reasons"]
    report["failures"] = failures
    report["ok"] = not failures
    return report


def main() -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(description="Probe the branded engine (the full-CAD tab).")
    parser.add_argument("--engine", help="freecad.exe path (the GUI engine)")
    parser.add_argument("--json", help="write the measured report here")
    args = parser.parse_args()
    if not args.engine:
        print("pass --engine (the GUI engine)", file=sys.stderr)
        return 1
    engine = pathlib.Path(args.engine)
    if not engine.is_file():
        print(f"no engine at {engine}", file=sys.stderr)
        return 1
    if engine.name.lower() not in ("freecad.exe", "freecad"):
        # The branding is a GUI property: the command-line engine has no window to brand, and
        # a report from it would be a claim about nothing.
        print(
            f"{engine.name} is the command-line engine; the full-CAD tab needs the GUI engine "
            "(freecad.exe)",
            file=sys.stderr,
        )
        return 1

    report = _run(engine, WORK)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    if args.json:
        path = pathlib.Path(args.json)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    for failure in report["failures"]:
        print(f"FAIL {failure}", file=sys.stderr)
    if report["failures"]:
        return 1
    branding = report.get("branding") or {}
    print(
        f"boot probe passed: title {branding.get('title')!r}, theme "
        f"{branding.get('themeApplied')}, icon {branding.get('iconApplied')}, "
        f"{len(branding.get('hiddenBrandActions') or [])} brand actions hidden, mode "
        f"{(report.get('mode') or {}).get('mode')}, {report['elapsedSeconds']}s"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
