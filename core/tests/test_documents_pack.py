"""The handoff (W3.7): the engineer pack and the project bundle."""

from __future__ import annotations

import json
import pathlib
import zipfile

import pytest

from archres_core.documents.pack import (
    PackError,
    PackManifest,
    PackPart,
    import_bundle,
    read_pack,
    write_pack,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
HANDOFF = ROOT / "data" / "handoff"
PACK = HANDOFF / "engineer-review-pack.zip"
BUNDLE = HANDOFF / "project-bundle.zip"


def _parts() -> list[PackPart]:
    return [
        PackPart(name="spec.json", data=b'{"project": {"id": "x"}}', role="spec"),
        PackPart(name="drawings/page-1.svg", data=b"<svg/>", role="drawing"),
    ]


def _manifest(parts: list[PackPart]) -> PackManifest:
    return PackManifest(
        project_id="x",
        project_name="A project",
        created="2026-10-21T00:00:00+00:00",
        parts=[
            {"name": part.name, "bytes": len(part.data), "sha256": part.sha256, "role": part.role}
            for part in parts
        ],
    )


def test_the_pack_is_a_readable_archive_with_its_manifest(tmp_path: pathlib.Path) -> None:
    parts = _parts()
    path = write_pack(tmp_path / "pack.zip", parts, _manifest(parts), readme="# A pack\n")
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        names = set(archive.namelist())
    assert {"spec.json", "drawings/page-1.svg", "manifest.json", "README.md"} <= names


def test_the_manifest_records_every_part_and_its_hash(tmp_path: pathlib.Path) -> None:
    parts = _parts()
    path = write_pack(tmp_path / "pack.zip", parts, _manifest(parts))
    manifest, read = read_pack(path)
    assert len(manifest["parts"]) == len(parts)
    for part in parts:
        assert read[part.name] == part.data
        entry = next(item for item in manifest["parts"] if item["name"] == part.name)
        assert entry["sha256"] == part.sha256


def test_the_pack_is_deterministic(tmp_path: pathlib.Path) -> None:
    parts = _parts()
    one = write_pack(tmp_path / "a.zip", parts, _manifest(parts))
    two = write_pack(tmp_path / "b.zip", parts, _manifest(parts))
    assert one.read_bytes() == two.read_bytes()


def test_a_changed_part_is_refused(tmp_path: pathlib.Path) -> None:
    parts = _parts()
    path = write_pack(tmp_path / "pack.zip", parts, _manifest(parts))
    # Somebody edits a part in the archive: the manifest's hash no longer matches.
    with zipfile.ZipFile(path) as archive:
        contents = {name: archive.read(name) for name in archive.namelist()}
    contents["spec.json"] = b'{"project": {"id": "tampered"}}'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, data in contents.items():
            archive.writestr(name, data)
    with pytest.raises(PackError, match="does not match the hash"):
        read_pack(path)


def test_the_bundle_imports_back_to_the_spec(tmp_path: pathlib.Path) -> None:
    parts = _parts()
    path = write_pack(tmp_path / "bundle.zip", parts, _manifest(parts))
    imported = import_bundle(path)
    assert imported["spec"]["project"]["id"] == "x"
    assert "drawings/page-1.svg" in imported["outputs"]


def test_a_file_that_is_not_an_archive_is_refused(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "not-a-bundle.zip"
    path.write_bytes(b"just text")
    with pytest.raises(PackError, match="not an archive"):
        read_pack(path)


def test_the_committed_handoff_files_carry_the_documents() -> None:
    assert PACK.is_file() and BUNDLE.is_file()
    manifest, parts = read_pack(PACK)
    names = {str(part["name"]) for part in manifest["parts"]}
    assert "spec.json" in names
    assert any(name.startswith("drawings/") for name in names)
    assert any(name.startswith("bbs/") for name in names)
    assert any(name.startswith("boq/") for name in names)
    assert any(name.startswith("compliance/") for name in names)
    imported = import_bundle(BUNDLE)
    assert imported["spec"]["project"]["id"]
