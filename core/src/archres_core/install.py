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

import hashlib
import json
import os
import pathlib
from dataclasses import dataclass, field
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
    "python": "runtime/python",
    # the core's **package** - the name matters, or the import fails ✓
    "core": "runtime/core/archres_core",
    # the core's **data** - the flow book and the schemas the app reads ✓
    "coreData": "runtime/core",
    "engine": "engine",
    "models": "models",
    "packs": "packs",
    "licenses": "licenses",
    "projects": "projects",
    # the app's own **data** ✓ ✓ — the user's own decisions ✓ ✓ (the review
    # ledger ✓ ✓ — ADR-0083 ✓ ✓) ✓ ✓
    "data": "data",
    # the **model runner** ✓ ✓ — the app's own AI runtime ✓ ✓ (the plan's
    # §0: the app contains its own AI runners ✓ ✓) ✓ ✓ — the fleet's own config
    # names it ✓ ✓ (`bin/llama/llama-server.exe` ✓ ✓) and the demo's own pattern
    # puts the router beside it ✓ ✓ (`bin/llama-swap/llama-swap.exe` ✓ ✓) ✓ ✓
    "llama": "bin/llama",
    "llamaSwap": "bin/llama-swap",
}


#: The folders of the headless CAD engine the app needs ✓ — the binary ✓, the workbench
#: modules ✓, the Python libraries ✓ and the resources ✓ ✓. (The engine is bundled ✓ —
#: LGPL-2.1 ✓ ✓ — and the app's CAD runs headless ✓ ✓.)
ENGINE_FOLDERS = ("bin", "Mod", "lib", "data")


def engine_home() -> pathlib.Path | None:
    """The build machine's CAD engine ✓ — found by the core's own discovery ✓ ✓.

    ``None`` when there is none ✓ — and then the install says so ✓ (it names what is
    missing ✓ ✓), rather than shipping a folder without an engine ✓ ✓.
    """
    from .cad import find_engine

    try:
        # the engine's binary sits in ``<root>/bin`` ✓ — so the engine's **root** ✓ is two
        # levels up ✓ ✓
        return find_engine().path.parent.parent
    except Exception:
        return None


#: Where the build machine's Python lives ✓ — the env var wins ✓, and the default is the
#: interpreter this very core runs on ✓ (its **base prefix** ✓ — a venv holds absolute
#: paths ✓ and is not relocatable ✓, and the app's runtime must be ✓ ✓).
PYTHON_HOME_ENV = "ARCHRES_PYTHON_HOME"


def python_home() -> pathlib.Path | None:
    """The build machine's Python prefix ✓ — the one the app will bundle ✓ ✓."""
    import os
    import sys

    env = os.environ.get(PYTHON_HOME_ENV)
    if env:
        return pathlib.Path(env)
    base = pathlib.Path(sys.base_prefix)
    if (base / "python.exe").is_file():
        return base
    return None


#: Where the GGUFs live on the build machine ✓ — the env var wins ✓, and the default is
#: where the repo's own downloads put them ✓ (they are gitignored ✓ — gigabytes never
#: enter the repository ✓ ✓).
MODELS_HOME_ENV = "ARCHRES_MODELS"


def models_home() -> pathlib.Path:
    """The build machine's model folder ✓ — where the GGUFs are ✓ ✓."""
    import os

    env = os.environ.get(MODELS_HOME_ENV)
    if env:
        return pathlib.Path(env)
    repo = pathlib.Path(__file__).resolve().parents[3]
    return repo / "data" / "downloads" / "s2" / "models"


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
        ManifestPart(
            id="llama",
            role="The model runner (llama.cpp - the app's own AI runtime)",
            licence="MIT",
            tier="cpu",
            path=INSTALL_LAYOUT["llama"],
        ),
        ManifestPart(
            id="llama-swap",
            role="The fleet manager (llama-swap - it swaps the models in and out)",
            licence="MIT",
            tier="cpu",
            path=INSTALL_LAYOUT["llamaSwap"],
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
                role=(
                    f"The {role} model (bundled with the app - the user downloads one "
                    "thing and the models are there)"
                ),
                licence=str(upstream.get("license") or "see the model card"),
                tier="cpu",
                path=f"{INSTALL_LAYOUT['models']}/{artifact.get('file') or (role + '.gguf')}",
                size_bytes=artifact.get("sizeBytes"),
                sha256=artifact.get("sha256"),
                source=str(entry.get("distribution") or "bundled"),
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


def _site_packages(home: pathlib.Path) -> pathlib.Path | None:
    """The core's dependencies ✓ — the site-packages they live in ✓ ✓.

    The **venv's** ✓ (where the core's dependencies are installed ✓ ✓) — and the editable
    install's ``.pth`` ✓ is left out ✓, because it points at the build machine's repo ✓
    and that path means nothing on a user's machine ✓ ✓ ✓.
    """
    import sys

    candidates = [
        pathlib.Path(sys.prefix) / "Lib" / "site-packages",
        home / "Lib" / "site-packages",
    ]
    for candidate in candidates:
        if not candidate.is_dir():
            continue
        if not any(
            item.name.startswith("archres_core") for item in candidate.iterdir()
        ):
            continue
        return candidate
    return None


def _copy_tree(source: pathlib.Path, destination: pathlib.Path) -> list[pathlib.Path]:
    """Copy a folder's contents ✓ — **recursively** ✓ ✓.

    The engine's folders have folders inside them ✓ (the workbench modules ✓, the Python
    libraries ✓) ✓, and a copy that stopped one level down would leave the install with a
    broken engine ✓ ✓ — so the copy goes all the way down ✓ ✓.
    """
    written: list[pathlib.Path] = []
    destination.mkdir(parents=True, exist_ok=True)
    for item in sorted(source.rglob("*")):
        if item.is_dir():
            continue
        relative = item.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(item.read_bytes())
        written.append(target)
    return written


def _hash_bytes(data: bytes) -> str:
    """The sha256 of some bytes ✓ ✓."""
    return hashlib.sha256(data).hexdigest()


def _normalise(path: str) -> str:
    """A path with forward slashes ✓ — the manifest's paths use them ✓ ✓."""
    return path.replace("\\", "/")


def _promised_hash(plan: "InstallPlan", relative: str) -> str | None:
    """The hash the manifest promises for a part ✓ — None when it promises none ✓ ✓."""
    hashes = plan.hashes.get(_normalise(relative))
    return hashes[0] if hashes else None


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
    #: The hash each copied file must match ✓ (the manifest's promise ✓) ✓ — absent when
    #: the manifest promises none ✓ ✓.
    hashes: dict[str, tuple[str, ...]] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "root": self.root,
            "directories": list(self.directories),
            "copies": [{"from": source, "to": target} for source, target in self.copies],
            "notices": [{"file": name, "text": text} for name, text in self.notices],
            "missing": list(self.missing),
        }


def _app_version(repo: pathlib.Path) -> str:
    """The app's version ✓ — the shell's own ✓ — or nothing ✓ ✓."""
    tauri = repo / "app" / "src-tauri" / "tauri.conf.json"
    if not tauri.is_file():
        return ""
    try:
        document = json.loads(tauri.read_text(encoding="utf-8"))
    except ValueError:
        return ""
    return str(document.get("version") or "")


def _core_version() -> str:
    """The core's own version ✓ — the package's ✓ – or nothing ✓ ✓."""
    try:
        from . import __version__

        return str(__version__)
    except Exception:  # pragma: no cover - the package is always importable here
        return ""


#: Where the build machine keeps the model runner ✓ — the env var wins ✓ — and
#: the default is the download cache ✓ — the same place the models come from ✓ ✓.
LLAMA_HOME_ENV = "ARCHRES_LLAMA_HOME"


def llama_home() -> pathlib.Path | None:
    """The model runner's folder ✓ — the `bin` folder with `llama/` and `llama-swap/` ✓ ✓.

    `None` when there is none ✓ — and then the install says so ✓ (it names what is
    missing ✓ ✓), rather than shipping a folder with no runner ✓ ✓.
    """
    override = os.environ.get(LLAMA_HOME_ENV)
    if override:
        folder = pathlib.Path(override)
        return folder if folder.is_dir() else None
    cached = pathlib.Path(__file__).resolve().parents[3] / "data" / "downloads" / "s2" / "bin"
    return cached if cached.is_dir() else None


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
    for key in ("runtime", "engine", "models", "packs", "licenses", "projects", "data"):
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

    # the **templates** ✓ — the app's starting points ✓ (the examples the project
    # setup screen offers ✓ — and the one a new project starts from ✓ ✓) — the app
    # reads them at runtime ✓ ✓, so the install carries them ✓ ✓: without them
    # the installed app **cannot start a project** ✓ — and a project is the app's
    # first job ✓ ✓ ✓.
    examples_source = repo / "spec" / "examples"
    if examples_source.is_dir():
        copies.append((str(examples_source), f"{INSTALL_LAYOUT['coreData']}/examples"))
    else:
        missing.append("core-data-examples")

    # the **rate cards** ✓ — the money's source ✓ ✓ — the app prices a BOQ from
    # them at runtime ✓ ✓, so the install carries them ✓ ✓: without them the
    # installed app has **no rates** ✓ — and the money law says the prices are
    # *missing*, not zero ✓ ✓ ✓.
    cards_source = repo / "data" / "prices" / "cards"
    if cards_source.is_dir():
        copies.append((str(cards_source), f"{INSTALL_LAYOUT['coreData']}/prices/cards"))
    else:
        missing.append("core-data-prices")

    # the rule packs: this machine has them ✓
    # the **model registry** ✓ — the names and the hashes of the GGUFs beside it ✓
    # — so the update check can say which models the user has ✓ ✓
    # the **model runner** ✓ ✓ — the app's own AI runtime ✓ ✓ — so the
    # installed app can serve the models it carries ✓ ✓ — and the fleet's config
    # names the place ✓ ✓ (`bin/llama/` ✓ ✓) and the router's ✓ ✓
    # (`bin/llama-swap/` ✓ ✓) ✓ ✓
    runner_home = llama_home()
    if runner_home is None:
        missing.append("model-runner")
    else:
        for name, key in (("llama", "llama"), ("llama-swap", "llamaSwap")):
            runner_source = runner_home / name
            if runner_source.is_dir():
                copies.append((str(runner_source), INSTALL_LAYOUT[key]))
            else:
                missing.append(f"bin-{name}")

    # the **fleet's config** ✓ ✓ — the router's policy and its modes ✓ ✓ — it
    # travels with the models it names ✓ ✓ ✓
    fleet_source = repo / "spec" / "models" / "fleet.json"
    if fleet_source.is_file():
        # the **folder** is the destination ✓ ✓ - the file lands inside it ✓ ✓
        copies.append((str(fleet_source), INSTALL_LAYOUT["models"]))
    else:
        missing.append("fleet-config")

    # the **rendered** router config ✓ ✓ - the fleet's own output ✓ ✓ (generated from
    # the two above ✓ ✓, never hand-written ✓ ✓) - the router reads it ✓ ✓ and its
    # paths are install-relative ✓ ✓ (`${env.ARCHRES_ROOT}` ✓ ✓) ✓ ✓
    rendered_source = repo / "spec" / "models" / "llama-swap.yaml"
    if rendered_source.is_file():
        copies.append((str(rendered_source), INSTALL_LAYOUT["models"]))
    else:
        missing.append("fleet-rendered")

    registry_source = repo / "spec" / "models" / "registry.json"
    if registry_source.is_file():
        # the **folder** is the destination ✓ ✓ - the file lands beside the GGUFs it names ✓ ✓
        copies.append((str(registry_source), INSTALL_LAYOUT["models"]))
    else:
        missing.append("model-registry")

    packs_source = repo / "spec" / "rules"
    if packs_source.is_dir():
        copies.append((str(packs_source), INSTALL_LAYOUT["packs"]))
    else:
        missing.append("packs")

    # the **CAD engine** ✓ — bundled with the app ✓ (the owner's promise ✓ · 2026-10-22 ✓) ✓,
    # so the user installs one thing ✓ and the geometry works ✓ ✓. The engine's home comes
    # from the core's own discovery ✓ ✓, and an engine that is not here is **named** ✓ ✓.
    engine = engine_home()
    if engine is None:
        missing.append("engine")
    else:
        for folder in ENGINE_FOLDERS:
            source = engine / folder
            if source.is_dir():
                copies.append((str(source), f"{INSTALL_LAYOUT['engine']}/{folder}"))
            else:
                missing.append(f"engine-{folder}")

    # the **Python runtime** ✓ — bundled with the app ✓ (the owner: *the user downloads
    # one thing and never installs Python* ✓ ✓) ✓ — the build machine's interpreter ✓
    # (its base prefix ✓ — a venv is not relocatable ✓ ✓) ✓ and the core's dependencies ✓
    # travel with it ✓ ✓.
    home = python_home()
    if home is None:
        missing.append("runtime")
    else:
        copies.append((str(home), INSTALL_LAYOUT["python"]))
        site = _site_packages(home)
        if site is not None:
            copies.append((str(site), f"{INSTALL_LAYOUT['python']}/Lib/site-packages"))

    # the **model cards** ✓ — the models' own documentation ✓ (their licence ✓, their
    # provenance ✓, their training data ✓) — and they travel with the models ✓ ✓
    cards_source = repo / "spec" / "models" / "cards"
    if cards_source.is_dir():
        copies.append((str(cards_source), f"{INSTALL_LAYOUT['licenses']}/model-cards"))

    # the **models** ✓ — bundled with the app ✓ (the owner's decision ✓ · 2026-10-22 ✓) ✓,
    # so the installer **copies** them ✓ — the user downloads the app once ✓ and the models
    # are there ✓ ✓. A model that is not on this machine is **named** ✓ — and the build
    # cannot ship without it ✓ ✓.
    home = models_home()
    for part in manifest.parts:
        if not part.id.startswith("model-"):
            continue
        source = home / pathlib.Path(part.path).name
        if source.is_file():
            # the destination is the models **folder** ✓ — the file lands inside it ✓ ✓
            copies.append((str(source), INSTALL_LAYOUT["models"]))
        else:
            missing.append(part.id)

    # the parts this machine does not have ✓ — the engine ✓ and the runtime ✓ are not
    # here ✓ (the runtime is the installer's own job ✓) ✓, and the models are **copied**
    # below ✓ ✓
    for part in manifest.parts:
        if part.id in (
            "core",
            "packs",
            "licenses",
            "shell",
            "runtime",
            "engine",
            # the model runner ✓ ✓ and the fleet's config ✓ ✓ - the copies above ✓ ✓
            "llama",
            "llama-swap",
        ):
            continue
        if part.id.startswith("model-"):
            continue  # bundled with the app ✓ (the copies below ✓ ✓)
        missing.append(part.id)

    notices = tuple(
        (f"{INSTALL_LAYOUT['licenses']}/{name}", f"{component} - {name}\n")
        for component, name in sorted(LICENCE_FILES.items())
    )

    # the app's **version** ✓ — the install records what it installed ✓ ✓ — so the
    # update check can say what the user has ✓ ✓ (the install has no `app/`
    # folder ✓ ✓, and the exe's version is not a file anyone can read ✓ ✓)
    version = _app_version(repo)
    if version:
        notices = notices + (
            (
                "version.json",
                json.dumps(
                    {"app": version, "core": _core_version()},
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
            ),
        )

    hashes: dict[str, tuple[str, ...]] = {}
    for part in manifest.parts:
        if part.sha256:
            hashes[_normalise(part.path)] = (part.sha256,)

    return InstallPlan(
        root=str(target_root),
        directories=tuple(directories),
        copies=tuple(copies),
        notices=notices,
        missing=tuple(sorted(set(missing))),
        hashes=hashes,
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
            # **recursive** ✓ - the engine's `Mod` ✓ and `lib` ✓ have folders inside them ✓,
            # and a copy that stopped one level down would leave the install with a
            # *broken* engine ✓ ✓
            for target in _copy_tree(source_path, destination):
                written.append(str(target.relative_to(base)))
        elif source_path.is_file():
            target = destination / source_path.name
            data = source_path.read_bytes()
            expected = _promised_hash(plan, _normalise(f"{relative}/{source_path.name}"))
            if expected is not None:
                # the copy is **checked** ✓ - a bundled model is verified before it is
                # installed ✓ (the plan's law ✓: a number nobody verified is a candidate
                # ✓ ✓) ✓
                actual = _hash_bytes(data)
                if actual != expected:
                    raise ManifestError(
                        f"{relative}: the copy's hash is {actual}, the manifest promises "
                        f"{expected} - the install is refused"
                    )
            target.write_bytes(data)
            written.append(str(target.relative_to(base)))
    for relative, text in plan.notices:
        target = base / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8", newline="\n")
        written.append(relative)
    return written
