"""CI sanity: byte-compile every Python file in the repo (syntax level only)."""

from __future__ import annotations

import pathlib
import py_compile
import sys

SKIP_DIRS = {".venv", "node_modules", "target", ".git", "out", "artifacts"}


def main() -> int:
    root = pathlib.Path(__file__).resolve().parents[2]
    files = sorted(
        p
        for p in root.rglob("*.py")
        if not any(part in SKIP_DIRS for part in p.parts)
    )
    for f in files:
        py_compile.compile(str(f), doraise=True)
    print(f"{len(files)} Python file(s) compile clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
