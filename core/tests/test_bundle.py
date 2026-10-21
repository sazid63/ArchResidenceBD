"""The project bundle (W5.5): one file, verified before it is trusted.

The laws these tests hold:

- **a bundle is one file** — the plan's word — and it carries the whole project;
- **a bundle is verified before it is trusted** — a corrupt backup is refused, not silently
  imported;
- **nothing is lost** — the whole revision history travels, not just the tip;
- **the import is a copy** — the bundle file stays where it is.
"""

from __future__ import annotations

import json
import pathlib
import zipfile

import pytest

from archres_core.bundle import (
    BUNDLE_VERSION,
    MANIFEST_NAME,
    BundleError,
    export_bundle,
    import_bundle,
    read_bundle,
)
from archres_core.spec import SpecStore


def _project(root: pathlib.Path, *, name: str = "Mirpur Duplex") -> SpecStore:
    """A project with a couple of revisions ✓ (the autosave's history ✓) ✓."""
    spec = json.loads(
        (pathlib.Path(__file__).resolve().parents[2] / "spec" / "examples" / "two-storey-residential.json").read_text(
            encoding="utf-8"
        )
    )
    spec["project"] = {**spec.get("project", {}), "name": name}
    store = SpecStore.create(root, spec, note="project created")
    changed = json.loads(json.dumps(spec))
    address = dict(changed.get("site", {}).get("address") or {})
    address["areaName"] = "Dhanmondi"
    changed["site"] = {**changed.get("site", {}), "address": address}
    store.commit_snapshot(store.tip().sha256, changed, note="the area changed")
    return store


def test_a_bundle_is_one_file_that_carries_the_project(tmp_path) -> None:
    project = tmp_path / "project"
    _project(project)
    outputs = tmp_path / "outputs"
    outputs.mkdir()
    (outputs / "boq.json").write_text('{"total": 1}', encoding="utf-8")

    bundle = tmp_path / "project.bundle.zip"
    manifest = export_bundle(project, bundle, outputs=outputs)

    assert bundle.is_file()
    assert manifest.version == BUNDLE_VERSION
    assert manifest.project_name == "Mirpur Duplex"
    assert manifest.revision_count == 2
    # the whole store travels, not just the tip
    names = {name for name, _size, _digest in manifest.files}
    assert any(name.startswith("project/revisions/") for name in names)
    assert "project/log.jsonl" in names
    assert "outputs/boq.json" in names
    # and every file is hashed
    for _name, size, digest in manifest.files:
        assert size >= 0
        assert len(digest) == 64


def test_a_bundle_can_be_read_without_importing_it(tmp_path) -> None:
    project = tmp_path / "project"
    _project(project)
    bundle = tmp_path / "project.bundle.zip"
    export_bundle(project, bundle)

    manifest = read_bundle(bundle)
    assert manifest.project_name == "Mirpur Duplex"
    assert manifest.revision_count == 2
    # reading it did not import it
    assert not (tmp_path / "imported").exists()


def test_a_bundle_round_trips(tmp_path) -> None:
    project = tmp_path / "project"
    store = _project(project)
    bundle = tmp_path / "project.bundle.zip"
    export_bundle(project, bundle)

    target = tmp_path / "imported"
    manifest = import_bundle(bundle, target)
    assert manifest.revision_count == 2

    imported = SpecStore(target)
    assert len(imported.revisions()) == 2
    assert imported.tip().sha256 == store.tip().sha256
    assert imported.load(imported.tip().sha256)["site"]["address"]["areaName"] == "Dhanmondi"


def test_a_corrupt_bundle_is_refused(tmp_path) -> None:
    """A corrupt backup is refused, not silently imported."""
    project = tmp_path / "project"
    _project(project)
    bundle = tmp_path / "project.bundle.zip"
    export_bundle(project, bundle)

    # rebuild the archive with one file's bytes changed (the same size, so the size check
    # passes and the hash is what catches it)
    broken = tmp_path / "broken.bundle.zip"
    with zipfile.ZipFile(bundle) as source, zipfile.ZipFile(
        broken, "w", compression=zipfile.ZIP_DEFLATED
    ) as destination:
        for name in source.namelist():
            data = source.read(name)
            if name.startswith("project/revisions/"):
                data = data[:-1] + b" "
            destination.writestr(name, data)

    with pytest.raises(BundleError, match="hash"):
        import_bundle(broken, tmp_path / "imported")
    assert not (tmp_path / "imported").exists()


def test_a_bundle_whose_size_does_not_match_is_refused(tmp_path) -> None:
    """The manifest lies about a file's size - that is caught too."""
    project = tmp_path / "project"
    _project(project)
    bundle = tmp_path / "project.bundle.zip"
    export_bundle(project, bundle)

    broken = tmp_path / "longer.bundle.zip"
    with zipfile.ZipFile(bundle) as source, zipfile.ZipFile(
        broken, "w", compression=zipfile.ZIP_DEFLATED
    ) as destination:
        for name in source.namelist():
            data = source.read(name)
            if name.startswith("project/revisions/"):
                data = data + b" "
            destination.writestr(name, data)

    with pytest.raises(BundleError, match="the manifest says"):
        import_bundle(broken, tmp_path / "imported")
    assert not (tmp_path / "imported").exists()


def test_a_bundle_that_is_not_a_bundle_is_refused(tmp_path) -> None:
    path = tmp_path / "not.bundle.zip"
    path.write_bytes(b"this is not an archive")
    with pytest.raises(BundleError, match="readable archive"):
        read_bundle(path)
    with pytest.raises(BundleError, match="readable archive"):
        import_bundle(path, tmp_path / "imported")


def test_a_bundle_with_no_manifest_is_refused(tmp_path) -> None:
    path = tmp_path / "empty.bundle.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("project/log.jsonl", "{}\n")
    with pytest.raises(BundleError, match="no manifest"):
        read_bundle(path)


def test_importing_over_something_else_is_refused(tmp_path) -> None:
    project = tmp_path / "project"
    _project(project)
    bundle = tmp_path / "project.bundle.zip"
    export_bundle(project, bundle)

    target = tmp_path / "imported"
    target.mkdir()
    (target / "something").write_text("here", encoding="utf-8")
    with pytest.raises(BundleError, match="already something"):
        import_bundle(bundle, target)

    # unless the caller says so
    manifest = import_bundle(bundle, target, overwrite=True)
    assert manifest.revision_count == 2


def test_exporting_a_project_that_is_not_there_is_refused(tmp_path) -> None:
    with pytest.raises(BundleError, match="no project"):
        export_bundle(tmp_path / "nothing", tmp_path / "out.zip")
