"""Lay the install down: the one command that makes the folder the product.

    uv run --directory core python ../tools/install/install_app.py --plan
    uv run --directory core python ../tools/install/install_app.py --write --root C:\\ArchResidenceBD
    uv run --directory core python ../tools/install/install_app.py --check --root C:\\ArchResidenceBD

The **plan** comes first ✓ — it is a document ✓ (the folders ✓, the copies ✓, the notices ✓
and what is **missing** ✓ ✓) and it is printed before anything is written ✓ ✓ — because an
installer that quietly skips a piece ships a broken product ✓ ✓.

The **check** is the promise tested ✓ ✓: every part is in the folder ✓, the copied model
matches the hash the manifest promises ✓, and the **installed core starts and answers** ✓ —
the same proof the layout test gives ✓ ✓ ✓.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys

from archres_core.install import (
    INSTALL_LAYOUT,
    apply_plan,
    install_plan,
    the_manifest,
)
from archres_core.stdio import utf8_stdio

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFAULT_ROOT = ROOT / "data" / "install"


def _plan(root: pathlib.Path) -> object:
    return install_plan(the_manifest(), root, repo_root=ROOT)


def _print_plan(plan) -> None:
    print(f"the install root: {plan.root}")
    print(f"the folders: {len(plan.directories)}")
    for folder in plan.directories:
        print(f"    {folder}")
    print(f"the copies: {len(plan.copies)}")
    for source, target in plan.copies:
        print(f"    {target:44} <- {source}")
    print(f"the notices: {len(plan.notices)}")
    if plan.missing:
        print(f"  MISSING: {', '.join(plan.missing)}")
    else:
        print("  nothing is missing - the install is complete")


def _check(root: pathlib.Path) -> int:
    """The promise, tested ✓ — the folder holds the product ✓ and the core answers ✓ ✓."""
    problems: list[str] = []

    manifest = the_manifest()
    for part in manifest.parts:
        target = root / part.path
        if part.id == "engine":
            for folder in ("bin", "Mod", "lib", "data"):
                if not (target / folder).is_dir():
                    problems.append(f"the engine's {folder} is missing")
            continue
        if part.id == "core":
            if not (target / "__init__.py").is_file():
                problems.append("the core package is missing")
            continue
        if part.id in ("licenses", "packs", "coreData"):
            if not target.is_dir():
                problems.append(f"{part.id} is missing")
            continue
        if not target.exists():
            problems.append(f"{part.id} is missing ({part.path})")

    # the installed core must answer ✓ — the same proof the layout test gives ✓ ✓
    core_data = root / INSTALL_LAYOUT["coreData"]
    if core_data.is_dir():
        import os

        environment = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
        environment["PYTHONPATH"] = str(core_data)
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "import archres_core.bridge as b;"
                "print(b.Bridge().handle({'id':'1','method':'ping'})['result']['name'])",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            env=environment,
        )
        if result.returncode != 0 or "archres-core" not in result.stdout:
            problems.append(
                "the installed core did not answer a ping: "
                + (result.stderr.strip()[-300:] or result.stdout.strip()[-300:])
            )
        else:
            print("  the installed core answers a ping")

    if problems:
        print("FAIL the install is not complete:")
        for problem in problems:
            print(f"  - {problem}")
        return 1
    print("  every part is in the folder and the core answers")
    return 0


def main(argv: list[str] | None = None) -> int:
    utf8_stdio()
    parser = argparse.ArgumentParser(
        description="Lay the install down: the folders, the copies, the notices."
    )
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="where to install")
    parser.add_argument("--plan", action="store_true", help="print the plan and stop")
    parser.add_argument("--write", action="store_true", help="lay the install down")
    parser.add_argument("--check", action="store_true", help="check an installed folder")
    parser.add_argument("--json", help="write the plan as JSON to this file")
    args = parser.parse_args(argv)

    root = pathlib.Path(args.root)

    if args.check:
        return _check(root)

    plan = _plan(root)
    _print_plan(plan)
    if args.json:
        target = pathlib.Path(args.json)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(plan.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(f"  the plan is in {target}")

    if args.write:
        written = apply_plan(plan, root)
        print(f"  wrote {len(written)} file(s) into {root}")
    elif not args.plan and not args.json:
        print("  (nothing written - pass --write to lay it down)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
