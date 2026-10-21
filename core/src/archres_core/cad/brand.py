"""The brand law (ADR-0004): the upstream project's name must not reach a product surface.

The product is **ArchResidenceBD** and the CAD inside it is **NativeCAD** ✓. The open-source
engine underneath is bundled, unmodified and invisible ✓ — and its name belongs in the code, the
plan and the ADRs ✓ (provenance ✓), never in what a user sees ✓: not in the app ✓, not in the
drawings ✓, not in the BOQ ✓, not in the pack an engineer hands over ✓.

This module is the **one** implementation of that check ✓, so the CI guard ✓ and the live probes
✓ cannot drift apart ✓ — a generator that forgets to strip its output is caught by the same law
that scans the committed documents ✓.
"""

from __future__ import annotations

import json
import pathlib
import re
from typing import Any

#: The upstream project's name, as it appears in the engine's own output.
ENGINE_NAME = "freecad"

#: The pattern that finds it, in whatever case the engine wrote it.
ENGINE_TOKEN = re.compile(ENGINE_NAME, re.IGNORECASE)

#: The product's name (the software ✓).
PRODUCT_APP = "ArchResidenceBD"

#: The CAD's name (the CAD inside the app ✓) ✓ - what the drawings carry ✓.
PRODUCT_CAD = "NativeCAD"

#: The string that replaces the engine's name in a generated file ✓.
REPLACEMENT = "NativeCAD (ArchResidenceBD)"

#: The file types a product surface can be ✓.
SURFACE_SUFFIXES = {".svg", ".dxf", ".pdf", ".xlsx", ".html", ".htm", ".md", ".txt"}


def find_engine_name(text: str) -> list[str]:
    """The lines that carry the upstream project's name."""
    return [line.strip() for line in text.splitlines() if ENGINE_TOKEN.search(line)]


def document_problems(path: str | pathlib.Path) -> list[str]:
    """The branding problems in one document (empty when it is clean)."""
    target = pathlib.Path(path)
    raw = target.read_bytes()
    problems: list[str] = []
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = raw.decode("latin-1", errors="replace")
    hits = find_engine_name(text)
    if hits:
        problems.append(
            f"{target.name}: the upstream project's name appears in {len(hits)} line(s): "
            + "; ".join(hits[:3])
        )
    return problems


def dxf_problems(path: str | pathlib.Path) -> list[str]:
    """The branding problems in a DXF **and** whether the file is still a DXF.

    The structure check matters as much as the name: stripping a header line could leave a file
    that no longer opens ✓, and a broken export is worse than the name it hides ✓.
    """
    target = pathlib.Path(path)
    problems = document_problems(target)
    text = target.read_bytes().decode("latin-1", errors="replace")
    if "SECTION" not in text or "ENTITIES" not in text:
        problems.append(f"{target.name}: the DXF lost its section structure")
    if text.count("LINE") + text.count("ARC") + text.count("CIRCLE") < 1:
        problems.append(f"{target.name}: the DXF carries no geometry")
    return problems


def product_version(root: str | pathlib.Path | None = None) -> str:
    """The app's version (the product a document is attributed to).

    The drawings are the CAD's and the documents are the app's - and both are shipped by the
    same build, so both carry the same version. A document that says which build produced it is
    how support works.
    """
    base = pathlib.Path(root) if root else pathlib.Path(__file__).resolve().parents[3]
    manifest = base / "app" / "package.json"
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "0.0.0"
    return str(data.get("version") or "0.0.0")


def producer_for(product: str) -> str:
    """The PDF producer line: the product, and the build that made the file."""
    return f"{product} {product_version()}"


def readme_for(path: str | pathlib.Path) -> str:
    """The file's text, for a caller that wants to look at it."""
    return pathlib.Path(path).read_text(encoding="utf-8", errors="replace")


__all__ = [
    "ENGINE_NAME",
    "ENGINE_TOKEN",
    "PRODUCT_APP",
    "PRODUCT_CAD",
    "REPLACEMENT",
    "SURFACE_SUFFIXES",
    "document_problems",
    "producer_for",
    "product_version",
    "dxf_problems",
    "find_engine_name",
    "readme_for",
]
