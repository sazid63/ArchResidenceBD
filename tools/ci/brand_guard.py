"""The brand guard - the product's surfaces never name the upstream project.

The product is **ArchResidenceBD** and the CAD inside it is **NativeCAD**; the open-source
engine underneath is bundled, unmodified and invisible (ADR-0004). This guard enforces that on
every surface a user can reach:

- ``app/`` and ``installer/`` - the shipped product surfaces (this check);
- the **generated documents** - the drawing set, the documents, the compliance reports, the
  prices and the engineer pack. Each generator also strips its own output (the DXF writer stamps
  the engine's name into the file header), but a generator that forgets is caught here, so the
  check does not depend on every generator remembering.

The one place the upstream name belongs is the licence notice, which the owner places on the
app's Licences screen; ``app/src/legal/**`` is skipped by design (ADR-0004).

Run from the repo root:  python tools/ci/brand_guard.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[2]

# The guard runs from the repo root with a plain interpreter, so the package is put on the path
# here rather than asking for `uv run --directory core`.
sys.path.insert(0, str(ROOT / "core" / "src"))

from archres_core.cad.brand import (  # noqa: E402 - the path is set above
    SURFACE_SUFFIXES,
    document_problems,
    dxf_problems,
)
from archres_core.stdio import utf8_stdio  # noqa: E402

#: The shipped product surfaces.
SCOPE = [ROOT / "app", ROOT / "installer"]  # installer/ will appear later

#: The generated documents a user can receive: the shippable set, by name.
GENERATED = [
    ROOT / "data" / "cad" / "generated" / "drawing-set",
    ROOT / "data" / "documents",
    ROOT / "data" / "compliance",
    ROOT / "data" / "prices",
]

#: The engineer pack: the handoff file itself (its parts are checked by the folders above).
PACK = ROOT / "data" / "handoff" / "engineer-review-pack.zip"

TEXT_SUFFIXES = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".htm",
    ".css", ".md", ".txt", ".svg", ".yml", ".yaml", ".xml", ".iss",
}
SKIP_DIRS = {
    "node_modules",
    "dist",
    "build",
    ".vite",
    "coverage",
    ".turbo",
    "target",  # the Rust build output (the shell, W5.1)
}
LEGAL_PART = "legal"  # ship path allowed to carry required licence notices (ADR-0004)


def main() -> int:
    utf8_stdio()
    problems: list[str] = []
    scanned = 0
    for base in SCOPE:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if any(part in SKIP_DIRS for part in path.parts) or LEGAL_PART in path.parts:
                continue
            scanned += 1
            text = path.read_text(encoding="utf-8", errors="replace")
            if "freecad" in text.lower():
                problems.append(f"{path.relative_to(ROOT).as_posix()}: names the upstream project")

    for base in GENERATED:
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in SURFACE_SUFFIXES:
                continue
            scanned += 1
            if path.suffix.lower() == ".dxf":
                problems.extend(dxf_problems(path))
            else:
                problems.extend(document_problems(path))

    if PACK.is_file():
        with zipfile.ZipFile(PACK) as archive:
            for name in archive.namelist():
                if not name.lower().endswith((".pdf", ".svg", ".dxf", ".xlsx", ".html", ".md", ".json")):
                    continue
                scanned += 1
                data = archive.read(name)
                text = data.decode("utf-8", errors="replace")
                if "freecad" in text.lower():
                    problems.append(f"{PACK.name}!{name}: names the upstream project")

    for problem in problems:
        print(f"FAIL {problem}", file=sys.stderr)
    if problems:
        print(f"brand guard: {len(problems)} problem(s)", file=sys.stderr)
        return 1
    print(f"brand guard clean - {scanned} file(s) scanned")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
