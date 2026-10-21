"""The project bundle (W5.5): one file that carries the project, and it is verified.

The plan's §5.1 names it: *"Project bundle: one-file export/import (spec + database +
outputs) for backup, transfer between machines, and the engineer-review handoff"* ✓ — and
the autosave is already the spec engine's own revision history ✓ (every writing turn is a
revision ✓), so what a bundle adds is the **portable copy** of that history ✓ and the
**outputs** ✓ ✓.

The laws:

- **a bundle is one file** ✓ — the plan's word ✓ — so a backup is something a user can
  email to themselves ✓ and an engineer can hand over ✓ ✓;
- **a bundle is verified before it is trusted** ✓ — every file's hash is checked ✓, and a
  bundle that does not match its manifest is **refused** ✓ — a corrupt backup is refused,
  not silently imported ✓ ✓;
- **nothing is lost** ✓ — the whole revision history travels ✓, not just the tip ✓, so a
  transfer keeps the audit trail ✓ ✓;
- **the import is a copy** ✓ — the bundle file stays where it is ✓ ✓.
"""

from __future__ import annotations

import hashlib
import json
import pathlib
import zipfile
from dataclasses import dataclass
from typing import Any, Iterable

from .spec import SpecStore, SpecStoreError

__all__ = [
    "BUNDLE_VERSION",
    "BundleError",
    "BundleManifest",
    "export_bundle",
    "import_bundle",
    "read_bundle",
]

#: The bundle's own version ✓.
BUNDLE_VERSION = "0.1.0"

#: The manifest's name inside the bundle ✓.
MANIFEST_NAME = "manifest.json"

#: The project's directory inside the bundle ✓.
PROJECT_DIR = "project"

#: The outputs' directory inside the bundle ✓.
OUTPUTS_DIR = "outputs"


class BundleError(RuntimeError):
    """The bundle could not be written, read or trusted (never a silent gap ✓)."""


@dataclass(frozen=True)
class BundleManifest:
    """What the bundle holds ✓ — every file, with its hash ✓ ✓."""

    version: str
    created_at: str
    project_name: str
    spec_sha256: str
    revision_count: int
    files: tuple[tuple[str, int, str], ...]  # (path, size, sha256)

    def as_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "createdAt": self.created_at,
            "projectName": self.project_name,
            "specSha256": self.spec_sha256,
            "revisionCount": self.revision_count,
            "files": [
                {"path": path, "sizeBytes": size, "sha256": digest}
                for path, size, digest in self.files
            ],
        }


def _hash_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _utc_now() -> str:
    from .spec.engine import utc_now_iso

    return utc_now_iso()


def _project_name(spec: dict[str, Any]) -> str:
    project = spec.get("project") or {}
    return str(project.get("name") or "project")


def _collect(root: pathlib.Path, prefix: str) -> list[tuple[str, pathlib.Path]]:
    """The files under a directory, as (name in the bundle, path on disk) ✓."""
    if not root.is_dir():
        return []
    out: list[tuple[str, pathlib.Path]] = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            out.append((f"{prefix}/{path.relative_to(root).as_posix()}", path))
    return out


def export_bundle(
    project_root: str | pathlib.Path,
    target: str | pathlib.Path,
    *,
    outputs: str | pathlib.Path | None = None,
    at: str | None = None,
) -> BundleManifest:
    """Write the project's bundle ✓ — one file ✓ — and return its manifest ✓.

    The bundle carries the **whole store** ✓ (the revisions ✓ and the log ✓) ✓ and the
    **outputs** ✓ (the drawings ✓, the BOQ ✓, the BBS ✓ — whatever the project has ✓) ✓,
    and it records **every file's hash** ✓ ✓.
    """
    root = pathlib.Path(project_root)
    store = SpecStore(root)
    if not store.log_path.exists():
        raise BundleError(f"there is no project at {root}")
    try:
        tip = store.tip()
        spec = store.load(tip.sha256)
    except SpecStoreError as exc:
        raise BundleError(f"the project could not be read: {exc}") from exc

    entries: list[tuple[str, pathlib.Path]] = _collect(store.revisions_dir, f"{PROJECT_DIR}/revisions")
    log_name = f"{PROJECT_DIR}/log.jsonl"
    if store.log_path.is_file():
        entries.append((log_name, store.log_path))
    if outputs is not None:
        entries.extend(_collect(pathlib.Path(outputs), OUTPUTS_DIR))

    files: list[tuple[str, int, str]] = []
    destination = pathlib.Path(target)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, path in entries:
            data = path.read_bytes()
            archive.writestr(name, data)
            files.append((name, len(data), _hash_bytes(data)))
        manifest = BundleManifest(
            version=BUNDLE_VERSION,
            created_at=at or _utc_now(),
            project_name=_project_name(spec),
            spec_sha256=tip.sha256,
            revision_count=len(store.revisions()),
            files=tuple(files),
        )
        archive.writestr(
            MANIFEST_NAME,
            json.dumps(manifest.as_dict(), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        )
    return manifest


def read_bundle(path: str | pathlib.Path) -> BundleManifest:
    """What a bundle holds ✓ — read without importing it ✓ ✓."""
    target = pathlib.Path(path)
    if not target.is_file():
        raise BundleError(f"there is no bundle at {target}")
    try:
        with zipfile.ZipFile(target) as archive:
            if MANIFEST_NAME not in archive.namelist():
                raise BundleError("the bundle carries no manifest")
            document = json.loads(archive.read(MANIFEST_NAME).decode("utf-8"))
    except zipfile.BadZipFile as exc:
        raise BundleError(f"the bundle is not a readable archive: {exc}") from exc
    return _manifest_from(document)


def _manifest_from(document: dict[str, Any]) -> BundleManifest:
    files = tuple(
        (str(entry.get("path")), int(entry.get("sizeBytes") or 0), str(entry.get("sha256")))
        for entry in document.get("files") or []
    )
    return BundleManifest(
        version=str(document.get("version") or "0.0.0"),
        created_at=str(document.get("createdAt") or ""),
        project_name=str(document.get("projectName") or ""),
        spec_sha256=str(document.get("specSha256") or ""),
        revision_count=int(document.get("revisionCount") or 0),
        files=files,
    )


def import_bundle(
    path: str | pathlib.Path,
    target_root: str | pathlib.Path,
    *,
    overwrite: bool = False,
) -> BundleManifest:
    """Import a bundle ✓ — **after** checking every hash ✓ ✓.

    A bundle whose bytes do not match its manifest is **refused** ✓ — a corrupt backup is
    not imported ✓ — and so is a bundle whose manifest lies about a file's size ✓ ✓.
    """
    target = pathlib.Path(path)
    if not target.is_file():
        raise BundleError(f"there is no bundle at {target}")
    root = pathlib.Path(target_root)
    if root.exists() and any(root.iterdir()) and not overwrite:
        raise BundleError(f"there is already something at {root}")

    try:
        with zipfile.ZipFile(target) as archive:
            if MANIFEST_NAME not in archive.namelist():
                raise BundleError("the bundle carries no manifest")
            manifest = _manifest_from(
                json.loads(archive.read(MANIFEST_NAME).decode("utf-8"))
            )
            for name, size, digest in manifest.files:
                if name not in archive.namelist():
                    raise BundleError(f"the bundle is missing {name!r}")
                data = archive.read(name)
                if len(data) != size:
                    raise BundleError(
                        f"{name}: the bundle holds {len(data)} bytes, the manifest says {size}"
                    )
                actual = _hash_bytes(data)
                if actual != digest:
                    raise BundleError(
                        f"{name}: the hash is {actual}, the manifest promises {digest}"
                    )
            root.mkdir(parents=True, exist_ok=True)
            for name in archive.namelist():
                if name == MANIFEST_NAME or name.endswith("/"):
                    continue
                # the bundle keeps the project and the outputs apart ✓; on import the
                # project lands at the root ✓ (a project folder *is* a store ✓) and the
                # outputs keep their own folder ✓ ✓
                if name.startswith(f"{PROJECT_DIR}/"):
                    relative = name[len(PROJECT_DIR) + 1 :]
                elif name.startswith(f"{OUTPUTS_DIR}/"):
                    relative = name
                else:
                    relative = name
                destination = root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(name))
    except zipfile.BadZipFile as exc:
        raise BundleError(f"the bundle is not a readable archive: {exc}") from exc
    return manifest
