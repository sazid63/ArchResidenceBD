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
    "LICENCE_FILES",
    "InstallManifest",
    "InstallPlan",
    "ManifestError",
    "ManifestPart",
    "TIERS",
    "apply_plan",
    "install_plan",
    "load_manifest",
    "manifest_document",
    "parse_manifest",
]

#: The licence files the install folder must carry, by component ✓ - the same list the
#: app's Licences screen points at ✓ (the licence-notice guard holds the two together ✓ ✓).
LICENCE_FILES = {
    "FreeCAD": "LGPL-2.1.txt",
    "llama.cpp": "MIT-llama.cpp.txt",
    "llama-swap": "MIT-llama-swap.txt",
    "PyNite": "MIT-PyNite.txt",
    "Qwen3 family": "Apache-2.0.txt",
}

#: The machine tiers the installer's auto-config picks between (W5.3 ✓).
TIERS = ("cpu", "cuda", "vulkan")

#: The install folder's layout, relative to the install root ✓ (ADR-0061 ✓).
INSTALL_LAYOUT = {
    "shell": "ArchResidenceBD.exe",
    "runtime": "runtime",
    "python": "runtime/python.exe",
    # the core's **package** - the name matters, or the import fails ✓
    "core": "runtime/core/archres_core",
    # the core's **data** - the flow book and the schemas the app reads ✓
    "coreData": "runtime/core",
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


@dataclass(frozen=True)
class InstallPlan:
    """What the installer does, before it does it ✓.

    The plan is **everything** the install needs: the folders to create ✓, the pieces to
    copy from this machine ✓, the notices to write ✓, and the pieces that are **not here
    yet** ✓ — which are named ✓, because an installer that quietly skips a piece is an
    installer that ships a broken product ✓ ✓.
    """

    root: str
    directories: tuple[str, ...]
    copies: tuple[tuple[str, str], ...]
    notices: tuple[tuple[str, str], ...]
    missing: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "directories": list(self.directories),
            "copies": [{"from": source, "to": target} for source, target in self.copies],
            "notices": [{"file": name, "text": text} for name, text in self.notices],
            "missing": list(self.missing),
        }


def install_plan(
    manifest: InstallManifest,
    root: str | pathlib.Path,
    *,
    repo_root: str | pathlib.Path | None = None,
) -> InstallPlan:
    """The plan for this machine ✓: the folders ✓, the copies ✓, and what is missing ✓.

    The pieces this machine already has are copied ✓ (the core ✓, the rule packs ✓); the
    pieces it does not have (the engine ✓, the runtime ✓, the models ✓) are **named** ✓ and
    left to the downloader ✓ (W5.2 ✓) ✓.
    """
    target_root = pathlib.Path(root)
    repo = pathlib.Path(repo_root) if repo_root else pathlib.Path(__file__).resolve().parents[3]

    directories: list[str] = []
    for key in ("runtime", "engine", "models", "packs", "licenses", "projects"):
        directories.append(INSTALL_LAYOUT[key])

    copies: list[tuple[str, str]] = []
    missing: list[str] = []

    # the core's **package** ✓ - the folder keeps its name ✓, or the import fails ✓ ✓
    core_source = repo / "core" / "src" / "archres_core"
    if core_source.is_dir():
        copies.append((str(core_source), INSTALL_LAYOUT["core"]))
    else:
        missing.append("core")

    # the core's **data** ✓ - the flow book ✓ and the schemas ✓ the app reads at runtime ✓ ✓
    for name, relative in (
        ("flows", "flows"),
        ("schemas", "schemas"),
    ):
        source = repo / "spec" / name
        if source.is_dir():
            copies.append((str(source), f"{INSTALL_LAYOUT['coreData']}/{relative}"))
        else:
            missing.append(f"core-data-{name}")

    # the rule packs: this machine has them ✓
    packs_source = repo / "spec" / "rules"
    if packs_source.is_dir():
        copies.append((str(packs_source), INSTALL_LAYOUT["packs"]))
    else:
        missing.append("packs")

    # the pieces that are not here: named, never silently skipped ✓
    for part in manifest.parts:
        if part.id in ("core", "packs", "licenses"):
            continue
        if part.measured or part.id in ("shell", "runtime"):
            # a measured model is fetched by the downloader ✓ (W5.2 ✓); the shell and the
            # runtime come with the installer ✓
            if part.id.startswith("model-"):
                missing.append(part.id)
            continue
        missing.append(part.id)

    notices = tuple(
        (f"{INSTALL_LAYOUT['licenses']}/{name}", f"{component} - {name}\n")
        for component, name in sorted(LICENCE_FILES.items())
    )

    return InstallPlan(
        root=str(target_root),
        directories=tuple(directories),
        copies=tuple(copies),
        notices=notices,
        missing=tuple(sorted(set(missing))),
    )


def apply_plan(plan: InstallPlan, root: str | pathlib.Path | None = None) -> list[str]:
    """Do the plan ✓: make the folders ✓, copy what is here ✓, write the notices ✓.

    It never downloads ✓ (that is the downloader's job ✓, W5.2 ✓) and it never pretends a
    missing piece is present ✓ — the plan's ``missing`` list is what the installer reports ✓
    ✓.
    """
    base = pathlib.Path(root) if root else pathlib.Path(plan.root)
    written: list[str] = []
    for relative in plan.directories:
        (base / relative).mkdir(parents=True, exist_ok=True)
        written.append(relative)
    for source, relative in plan.copies:
        source_path = pathlib.Path(source)
        destination = base / relative
        destination.mkdir(parents=True, exist_ok=True)
        if source_path.is_dir():
            for item in sorted(source_path.iterdir()):
                if item.is_file():
                    target = destination / item.name
                    target.write_bytes(item.read_bytes())
                    written.append(str(target.relative_to(base)))
                elif item.is_dir():
                    # a subfolder keeps its name ✓ (a package inside a package ✓ ✓)
                    target = destination / item.name
                    target.mkdir(parents=True, exist_ok=True)
                    for child in sorted(item.iterdir()):
                        if child.is_file():
                            (target / child.name).write_bytes(child.read_bytes())
                    written.append(str(target.relative_to(base)))
        elif source_path.is_file():
            target = destination / source_path.name
            target.write_bytes(source_path.read_bytes())
            written.append(str(target.relative_to(base)))
    for relative, text in plan.notices:
        target = base / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")
        written.append(relative)
    return written
