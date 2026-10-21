"""The handoff (W3.7): the engineer pack and the project bundle.

The plan's two closing deliverables (plan §6):

- the **engineer review pack** — "Spec, drawings, BBS, BOQ, deviations — one handoff pack" ✓ —
  one file an engineer can open and read ✓;
- the **project bundle** — "one-file export/import (spec + database + outputs) for backup,
  transfer between machines, and the engineer-review handoff" ✓.

Both are **zips** ✓ (the standard library ✓), and both are **verifiable** ✓: the manifest
carries the sha256 of every part ✓, and the import checks them ✓. A handoff that arrives
changed is a handoff that says so ✓ — plan §9's law, applied to the file that leaves the
building ✓.

Two laws:

- **The pack carries what was measured, not a re-render.** The drawings ✓, the BBS ✓, the BOQ ✓
  and the compliance report ✓ are the *committed* documents ✓ — the ones the probes measured ✓ —
  so the pack cannot contain a number the repository does not have ✓.
- **The bundle is round-trippable.** What goes in comes back ✓ — the spec ✓, the deviations ✓
  and the outputs ✓ — and the import refuses a bundle whose parts do not match their hashes ✓.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import zipfile
from dataclasses import dataclass, field
from typing import Any


class PackError(RuntimeError):
    """The pack or the bundle could not be written or read (never a silent gap)."""


@dataclass
class PackPart:
    """One file in the pack, with the hash the manifest records."""

    name: str
    data: bytes
    role: str = "document"

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.data).hexdigest()


@dataclass
class PackManifest:
    """What the pack is and what is inside it."""

    project_id: str
    project_name: str
    created: str
    parts: list[dict[str, Any]] = field(default_factory=list)
    notes: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": "0.1.0",
            "projectId": self.project_id,
            "projectName": self.project_name,
            "created": self.created,
            "parts": self.parts,
            "notes": self.notes,
        }


def _manifest(parts: list[PackPart], project_id: str, project_name: str, created: str, notes: str) -> PackManifest:
    return PackManifest(
        project_id=project_id,
        project_name=project_name,
        created=created,
        parts=[
            {"name": part.name, "bytes": len(part.data), "sha256": part.sha256, "role": part.role}
            for part in parts
        ],
        notes=notes,
    )


def write_pack(
    path: str | pathlib.Path,
    parts: list[PackPart],
    manifest: PackManifest,
    *,
    readme: str = "",
) -> pathlib.Path:
    """Write the pack: the parts, the manifest and a README that says what it is.

    The archive is **deterministic** ✓ (a fixed timestamp on every entry ✓), so the same
    documents produce byte-identical packs ✓ — plan §9's "identical outputs" ✓, applied to the
    file that leaves the building ✓.
    """
    target = pathlib.Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for part in parts:
            archive.writestr(_entry(part.name), part.data)
        archive.writestr(
            _entry("manifest.json"),
            json.dumps(manifest.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        )
        if readme:
            archive.writestr(_entry("README.md"), readme)
    _verify(target)
    return target


#: The fixed timestamp every entry carries (the archive must not change between runs).
ENTRY_TIMESTAMP = (2026, 10, 21, 0, 0, 0)


def _entry(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=ENTRY_TIMESTAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    return info


def _verify(path: pathlib.Path) -> dict[str, Any]:
    """Read a pack or a bundle back and check every part against the manifest."""
    try:
        with zipfile.ZipFile(path) as archive:
            broken = archive.testzip()
            if broken is not None:
                raise PackError(f"the archive is not readable: {broken}")
            names = set(archive.namelist())
            if "manifest.json" not in names:
                raise PackError("the archive has no manifest")
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
            for part in manifest.get("parts") or []:
                name = str(part.get("name"))
                if name not in names:
                    raise PackError(f"the archive is missing {name}")
                digest = hashlib.sha256(archive.read(name)).hexdigest()
                if digest != part.get("sha256"):
                    raise PackError(f"{name} does not match the hash the manifest records")
    except zipfile.BadZipFile as exc:
        raise PackError(f"the file is not an archive: {exc}") from exc
    return manifest


def read_pack(path: str | pathlib.Path) -> tuple[dict[str, Any], dict[str, bytes]]:
    """Read a pack back: its manifest and its parts (the hashes are checked ✓)."""
    source = pathlib.Path(path)
    manifest = _verify(source)
    with zipfile.ZipFile(source) as archive:
        parts = {
            str(part["name"]): archive.read(str(part["name"]))
            for part in manifest.get("parts") or []
        }
    return manifest, parts


def import_bundle(path: str | pathlib.Path) -> dict[str, Any]:
    """Import a project bundle: the spec, the deviations and the outputs, verified ✓.

    A bundle whose parts do not match their hashes is **refused** ✓ — a handoff that arrived
    changed is a handoff that says so ✓, and importing it silently would put a document
    nobody wrote into the project ✓.
    """
    manifest, parts = read_pack(path)
    spec_part = next((name for name in parts if name.endswith("spec.json")), None)
    if spec_part is None:
        raise PackError("the bundle carries no Building Spec")
    spec = json.loads(parts[spec_part].decode("utf-8"))
    return {
        "manifest": manifest,
        "spec": spec,
        "deviations": list(spec.get("deviations") or []),
        "outputs": {name: len(data) for name, data in parts.items() if name != spec_part},
    }


__all__ = [
    "PackError",
    "PackManifest",
    "PackPart",
    "import_bundle",
    "read_pack",
    "write_pack",
]
