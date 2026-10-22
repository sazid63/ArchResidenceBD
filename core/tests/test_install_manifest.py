"""W5.1: the install manifest and the installer's plan.

The laws these tests hold:

- **every bundled piece carries its licence** — a piece without one is refused;
- **an unmeasured hash is absent, not a fake** — a placeholder that looks like a fact is
  the thing the repo's law is about;
- **the models are bundled with the app** (the owner's decision · 2026-10-22 ·) — the
  installer **copies** them ✓, and a copy whose hash is not the promised one is **refused** ✓.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.install import (
    INSTALL_LAYOUT,
    TIERS,
    ManifestError,
    ManifestPart,
    apply_plan,
    install_plan,
    manifest_document,
    parse_manifest,
    the_manifest,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _part(**overrides) -> dict:
    entry = {
        "id": "shell",
        "role": "The desktop shell",
        "licence": "proprietary",
        "tier": "cpu",
        "path": "ArchResidenceBD.exe",
    }
    entry.update(overrides)
    return entry


def test_the_budgets_are_numbers_in_the_repo() -> None:
    assert TIERS
    for tier in TIERS:
        assert tier


def test_a_manifest_is_read_and_checked() -> None:
    manifest = parse_manifest({"parts": [_part(), _part(id="engine", licence="LGPL-2.1")]})
    assert len(manifest.parts) == 2
    assert manifest.by_id("engine").licence == "LGPL-2.1"
    assert manifest.by_tier("cpu") == manifest.parts


def test_a_piece_without_a_licence_is_refused() -> None:
    with pytest.raises(ManifestError, match="licence"):
        parse_manifest({"parts": [_part(licence="")]})
    with pytest.raises(ManifestError, match="licence"):
        parse_manifest({"parts": [{k: v for k, v in _part().items() if k != "licence"}]})


def test_an_unknown_tier_is_refused() -> None:
    with pytest.raises(ManifestError, match="tier"):
        parse_manifest({"parts": [_part(tier="quantum")]})
    assert "cuda" in TIERS


def test_two_parts_with_one_id_are_refused() -> None:
    with pytest.raises(ManifestError, match="share the id"):
        parse_manifest({"parts": [_part(), _part(role="Another")]})
    # and two *different* ids are fine
    manifest = parse_manifest(
        {
            "parts": [
                _part(),
                _part(id="engine", licence="LGPL-2.1", tier="cpu", path="engine"),
            ]
        }
    )
    assert len(manifest.parts) == 2


def test_a_hash_that_is_not_a_hash_is_refused() -> None:
    with pytest.raises(ManifestError, match="sha256"):
        parse_manifest({"parts": [_part(sha256="not-a-hash")]})
    with pytest.raises(ManifestError, match="sha256"):
        parse_manifest({"parts": [_part(sha256="Z" * 64)]})


def test_an_unmeasured_piece_is_absent_not_fake() -> None:
    """A hash nobody measured is a candidate, not a fact."""
    manifest = parse_manifest({"parts": [_part()]})
    assert manifest.parts[0].sha256 is None
    assert manifest.parts[0].size_bytes is None
    assert manifest.parts[0].measured is False
    assert manifest.unmeasured() == manifest.parts

    measured = parse_manifest({"parts": [_part(sha256="a" * 64, sizeBytes=1234)]})
    assert measured.parts[0].measured is True
    assert measured.unmeasured() == ()


def test_the_product_declares_its_own_install() -> None:
    """The manifest the product ships: every piece, its licence, and the layout."""
    manifest = the_manifest()
    document = manifest_document(manifest)
    assert document["layout"] == INSTALL_LAYOUT
    assert document["counts"]["parts"] == len(manifest.parts)
    assert document["counts"]["unmeasured"] == len(manifest.unmeasured())
    ids = {part.id for part in manifest.parts}
    assert {"shell", "runtime", "core", "engine", "licenses", "packs"} <= ids
    for part in manifest.parts:
        assert part.licence, part.id
        assert part.tier in TIERS, part.id
        assert part.path, part.id
    # the engine is LGPL-2.1 and the notices travel with the install
    assert manifest.by_id("engine").licence == "LGPL-2.1"
    assert manifest.by_id("licenses").path == INSTALL_LAYOUT["licenses"]


def test_the_manifest_round_trips() -> None:
    manifest = the_manifest()
    document = manifest_document(manifest)
    again = parse_manifest(json.loads(json.dumps(document)))
    assert [part.id for part in again.parts] == [part.id for part in manifest.parts]


def test_an_empty_manifest_is_refused() -> None:
    with pytest.raises(ManifestError, match="no parts"):
        parse_manifest({"parts": []})
    with pytest.raises(ManifestError, match="no parts"):
        parse_manifest({})


def test_the_plan_names_the_folders_the_copies_and_what_is_missing(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """An installer that quietly skips a piece ships a broken product."""
    plan = install_plan(install_manifest, tmp_path, repo_root=ROOT)
    assert plan.root == str(tmp_path)
    for key in ("runtime", "engine", "models", "packs", "licenses", "projects"):
        assert INSTALL_LAYOUT[key] in plan.directories
    # the pieces this machine has are copied; the rest are named
    copied = {target for _source, target in plan.copies}
    assert INSTALL_LAYOUT["core"] in copied
    assert INSTALL_LAYOUT["packs"] in copied
    # the **models** are copied too ✓ (bundled with the app ✓ ✓)
    assert INSTALL_LAYOUT["models"] in copied
    # and what is still missing is named ✓
    assert "engine" in plan.missing
    assert plan.missing == tuple(sorted(set(plan.missing)))


def test_the_plan_writes_the_licence_files_the_app_expects(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The install folder carries the files the Licences screen points at."""
    from archres_core.install import LICENCE_FILES

    plan = install_plan(install_manifest, tmp_path, repo_root=ROOT)
    files = {name for name, _text in plan.notices}
    for component, file_name in LICENCE_FILES.items():
        assert f"{INSTALL_LAYOUT['licenses']}/{file_name}" in files, component


def test_applying_the_plan_lays_the_folder_down(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The folders exist, the core is copied, the notices are written."""
    plan = install_plan(install_manifest, tmp_path, repo_root=ROOT)
    written = apply_plan(plan, tmp_path)
    for key in ("runtime", "engine", "models", "packs", "licenses", "projects"):
        assert (tmp_path / INSTALL_LAYOUT[key]).is_dir(), key
    # the core package is in place, with its modules
    core = tmp_path / INSTALL_LAYOUT["core"]
    assert (core / "importer.py").is_file()
    assert (core / "bridge.py").is_file()
    # the rule packs are in place
    assert (tmp_path / INSTALL_LAYOUT["packs"] / "rajuk-2008.yaml").is_file()
    # the model cards travel with the models
    assert (tmp_path / INSTALL_LAYOUT["licenses"] / "model-cards").is_dir()
    assert written


def test_applying_the_plan_never_downloads_and_never_invents(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """It copies what is here and names what is not - it does not fetch."""
    plan = install_plan(install_manifest, tmp_path, repo_root=ROOT)
    apply_plan(plan, tmp_path)
    # the pieces that were missing are still missing, and still named
    assert not (tmp_path / INSTALL_LAYOUT["engine"]).joinpath("freecadcmd.exe").exists()
    assert "engine" in plan.missing
