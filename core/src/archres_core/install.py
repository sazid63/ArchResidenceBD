"""The install manifest (W5.1): what the installer lays down, and where each piece came from.

A commercial install is a promise: *this folder is the whole product* ✓. So the folder is
**declared** ✓ — every piece of it, its role ✓, its licence ✓, the tier it belongs to ✓ and
its hash ✓ — and the shell, the core and the installer all read the same declaration ✓ ✓.

The laws:

- **Nothing is invented** ✓. A hash that has not been measured is **absent** ✓, not a
  placeholder that looks like a fact ✓ — the same law the price cards follow ✓ (a fetched
  number is a candidate until someone verifies it ✓ ✓).
- **Every bundled piece carries its licence** ✓ — the notices travel with the install ✓
  (ADR-0004 ✓) ✓.
- **The layout is one folder** ✓ — the user installs one thing ✓ and never meets a
  toolchain ✓ (ADR-0061 ✓) ✓.
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

__all__ = [
    "INSTALL_LAYOUT",
    "InstallManifest",
    "ManifestError",
    "ManifestPart",
    "TIERS",
    "load_manifest",
    "manifest_document",
    "parse_manifest",
]

#: The machine tiers the installer's auto-config picks between (W5.3 ✓).
TIERS = ("cpu", "cuda", "vulkan")

#: The install folder's layout, relative to the install root ✓ (ADR-0061 ✓).
INSTALL_LAYOUT = {
    "shell": "ArchResidenceBD.exe",
    "runtime": "runtime",
    "python": "runtime/python.exe",
    "core": "runtime/core",
    "engine": "engine",
    "models": "models",
    "packs": "packs",
    "licenses": "licenses",
    "projects": "projects",
}


class ManifestError(ValueError):
    """The manifest is not a manifest (never a silent gap ✓)."""


@dataclass(frozen=True)
class ManifestPart:
    """One piece of the install: what it is, and what is known about it."""

    id: str
    role: str
    licence: str
    tier: str
    path: str
    size_bytes: int | None = None
    sha256: str | None = None
    source: str | None = None

    @property
    def measured(self) -> bool:
        """Whether this piece's bytes have been measured ✓ (a hash and a size ✓)."""
        return bool(self.sha256 and self.size_bytes is not None)

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "role": self.role,
            "licence": self.licence,
            "tier": self.tier,
            "path": self.path,
            "sizeBytes": self.size_bytes,
            "sha256": self.sha256,
            "source": self.source,
            "measured": self.measured,
        }


@dataclass(frozen=True)
class InstallManifest:
    """The whole install, declared."""

    parts: tuple[ManifestPart, ...]

    def by_id(self, part_id: str) -> ManifestPart:
        for part in self.parts:
            if part.id == part_id:
                return part
        raise ManifestError(f"the manifest has no part {part_id!r}")

    def by_tier(self, tier: str) -> tuple[ManifestPart, ...]:
        return tuple(part for part in self.parts if part.tier == tier)

    def unmeasured(self) -> tuple[ManifestPart, ...]:
        """The pieces whose bytes are not measured yet ✓ — a candidate, not a fact ✓."""
        return tuple(part for part in self.parts if not part.measured)


def parse_manifest(document: dict[str, Any]) -> InstallManifest:
    """Read a manifest document ✓ and check it ✓."""
    if not isinstance(document, dict):
        raise ManifestError("the manifest must be an object")
    parts = document.get("parts")
    if not isinstance(parts, list) or not parts:
        raise ManifestError("the manifest carries no parts")
    parsed: list[ManifestPart] = []
    seen: set[str] = set()
    for index, entry in enumerate(parts):
        if not isinstance(entry, dict):
            raise ManifestError(f"parts[{index}] must be an object")
        part_id = str(entry.get("id") or "")
        if not part_id:
            raise ManifestError(f"parts[{index}] has no id")
        if part_id in seen:
            raise ManifestError(f"two parts share the id {part_id!r}")
        seen.add(part_id)
        licence = str(entry.get("licence") or "")
        if not licence:
            raise ManifestError(f"{part_id}: a bundled piece carries its licence")
        tier = str(entry.get("tier") or "")
        if tier not in TIERS:
            raise ManifestError(f"{part_id}: the tier is {tier!r}, not one of {TIERS}")
        path = str(entry.get("path") or "")
        if not path:
            raise ManifestError(f"{part_id}: the piece has no path in the install")
        sha256 = entry.get("sha256")
        if sha256 is not None:
            sha256 = str(sha256)
            if len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256):
                raise ManifestError(f"{part_id}: the hash is not a sha256")
        size = entry.get("sizeBytes")
        if size is not None:
            size = int(size)
            if size < 0:
                raise ManifestError(f"{part_id}: the size is negative")
        parsed.append(
            ManifestPart(
                id=part_id,
                role=str(entry.get("role") or ""),
                licence=licence,
                tier=tier,
                path=path,
                size_bytes=size,
                sha256=sha256,
                source=(str(entry["source"]) if entry.get("source") else None),
            )
        )
    return InstallManifest(parts=tuple(parsed))


def manifest_document(manifest: InstallManifest) -> dict[str, Any]:
    """The manifest as a document ✓ (what the installer reads ✓)."""
    return {
        "schemaVersion": "0.1.0",
        "layout": dict(INSTALL_LAYOUT),
        "tiers": list(TIERS),
        "counts": {
            "parts": len(manifest.parts),
            "measured": sum(1 for part in manifest.parts if part.measured),
            "unmeasured": sum(1 for part in manifest.parts if not part.measured),
        },
        "parts": [part.as_dict() for part in manifest.parts],
    }


def load_manifest(path: str | pathlib.Path) -> InstallManifest:
    """Read a manifest file ✓."""
    target = pathlib.Path(path)
    try:
        document = json.loads(target.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ManifestError(f"the manifest is missing: {target}") from None
    except ValueError as exc:
        raise ManifestError(f"the manifest is not valid JSON: {exc}") from exc
    return parse_manifest(document)


def the_manifest() -> InstallManifest:
    """The install as the product declares it ✓.

    The hashes the repo already knows (the model pack's ✓) are in ✓; the ones nobody has
    measured yet are **absent** ✓ — a candidate, not a fact ✓ — and the installer measures
    them when it fetches ✓ (the plan's law ✓) ✓.
    """
    parts: list[ManifestPart] = [
        ManifestPart(
            id="shell",
            role="The desktop shell (the one thing the user clicks)",
            licence="proprietary",
            tier="cpu",
            path=INSTALL_LAYOUT["shell"],
        ),
        ManifestPart(
            id="runtime",
            role="The bundled Python: the core's runtime",
            licence="PSF-2.0",
            tier="cpu",
            path=INSTALL_LAYOUT["python"],
        ),
        ManifestPart(
            id="core",
            role="The core package (the brain)",
            licence="proprietary",
            tier="cpu",
            path=INSTALL_LAYOUT["core"],
        ),
        ManifestPart(
            id="engine",
            role="The CAD engine (the geometry)",
            licence="LGPL-2.1",
            tier="cpu",
            path=INSTALL_LAYOUT["engine"],
        ),
        ManifestPart(
            id="licenses",
            role="The licence files the install folder must carry",
            licence="mixed",
            tier="cpu",
            path=INSTALL_LAYOUT["licenses"],
        ),
        ManifestPart(
            id="packs",
            role="The rule packs (the law the app applies)",
            licence="proprietary",
            tier="cpu",
            path=INSTALL_LAYOUT["packs"],
        ),
    ]
    # the model pack: the **registry** already knows each artifact's hash and size ✓, and
    # the base model's licence ✓ (the card and the publish recipe agree ✓)
    registry = _registry()
    for entry in (registry or {}).get("models") or []:
        artifact = entry.get("artifact") or {}
        upstream = entry.get("upstream") or {}
        role = str(entry.get("role") or "")
        parts.append(
            ManifestPart(
                id=f"model-{role}",
                role=f"The {role} model (the fleet serves it locally)",
                licence=str(upstream.get("license") or "see the model card"),
                tier="cpu",
                path=f"{INSTALL_LAYOUT['models']}/{artifact.get('file') or (role + '.gguf')}",
                size_bytes=artifact.get("sizeBytes"),
                sha256=artifact.get("sha256"),
                source=entry.get("distribution"),
            )
        )
    return InstallManifest(parts=tuple(parts))


def _registry() -> dict[str, Any] | None:
    """The model registry ✓ (the hashes it pins are the measured ones ✓)."""
    path = pathlib.Path(__file__).resolve().parents[3] / "spec" / "models" / "registry.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
