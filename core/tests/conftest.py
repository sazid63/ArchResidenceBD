"""Shared fixtures for the core test suite (introspection-free, repo-relative)."""

from __future__ import annotations

import hashlib
import json
import pathlib

import pytest

from archres_core.interview import load_book

ROOT = pathlib.Path(__file__).resolve().parents[2]
BOOK_PATH = ROOT / "spec" / "flows" / "phase-flow-book.yaml"
SPEC_SCHEMA_PATH = ROOT / "spec" / "schemas" / "building-spec.schema.json"


@pytest.fixture(scope="session")
def book():
    return load_book(BOOK_PATH)


@pytest.fixture(scope="session")
def spec_schema() -> dict:
    return json.loads(SPEC_SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def base_spec():
    """A minimal valid Building Spec for interview tests (2 storeys, no answers)."""

    def make(*, storeys: int = 2, name: str = "Interview Test", area: str = "sqm", length: str = "m") -> dict:
        phases = [
            {"id": "site-excavation", "kind": "site_excavation", "status": "not_started", "data": {}},
            {"id": "foundation", "kind": "foundation", "status": "not_started", "data": {}},
        ]
        for index in range(storeys):
            phases.append(
                {
                    "id": f"floor-{index}",
                    "kind": "floor",
                    "storeyIndex": index,
                    "status": "not_started",
                    "data": {},
                }
            )
        phases += [
            {"id": "roof-boundary", "kind": "roof_boundary", "status": "not_started", "data": {}},
            {"id": "common-services", "kind": "common_services", "status": "not_started", "data": {}},
        ]
        return {
            "schemaVersion": "0.1.0",
            "revision": 0,
            "project": {
                "id": "0f8fad5b-d9cb-469f-a165-70867728950e",
                "name": name,
                "language": "en",
                "displayUnits": {"length": length, "area": area, "currency": "BDT"},
            },
            "site": {
                "address": {"division": "Dhaka", "district": "Dhaka"},
                "plot": {"areaSqm": 100.0},
            },
            "building": {
                "occupancy": "residential",
                "structureType": "rcc_frame",
                "storeys": {"count": storeys},
            },
            "phases": phases,
        }

    return make


# --- W5.1: the installer copies the models, and the real GGUFs are gigabytes -------------
# A test that laid the install folder down with the real models would copy six gigabytes
# and take minutes, so these fixtures point the installer at a **small stand-in** whose
# hashes the test's own manifest carries - which is what makes the copy's check meaningful.


@pytest.fixture()
def models_home(tmp_path: pathlib.Path, monkeypatch: pytest.MonkeyPatch) -> pathlib.Path:
    """A small stand-in for the build machine's model folder."""
    home = tmp_path / "models"
    home.mkdir()
    (home / "archie-chat-v0-Q4_K_M.gguf").write_bytes(b"a small stand-in for the chat model")
    monkeypatch.setenv("ARCHRES_MODELS", str(home))
    return home


@pytest.fixture()
def install_manifest(models_home: pathlib.Path) -> "InstallManifest":
    """The real manifest with the test's small models (and their real hashes)."""
    from archres_core.install import InstallManifest, ManifestPart, the_manifest

    parts: list[ManifestPart] = []
    for part in the_manifest().parts:
        if not part.id.startswith("model-"):
            parts.append(part)
            continue
        source = models_home / pathlib.Path(part.path).name
        if not source.is_file():
            continue
        data = source.read_bytes()
        parts.append(
            ManifestPart(
                id=part.id,
                role=part.role,
                licence=part.licence,
                tier=part.tier,
                path=part.path,
                size_bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(),
                source=part.source,
            )
        )
    return InstallManifest(parts=tuple(parts))
