"""The install manifest (W5.1): the install is declared, and nothing is invented.

The laws these tests hold:

- **every bundled piece carries its licence** — a piece without one is refused;
- **an unmeasured hash is absent, not a fake** — a placeholder that looks like a fact is
  the thing the repo's law is about;
- **the ids are unique** — two parts with one id would make the installer's counting a lie;
- **the layout is one folder** — the user installs one thing and never meets a toolchain.
"""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.install import (
    INSTALL_LAYOUT,
    TIERS,
    InstallManifest,
    ManifestError,
    ManifestPart,
    manifest_document,
    parse_manifest,
    the_manifest,
)


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

    measured = parse_manifest(
        {"parts": [_part(sha256="a" * 64, sizeBytes=1234)]}
    )
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
