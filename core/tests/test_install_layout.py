"""The installed folder must actually run the app.

This is the question the commercial path depends on: *can the installed folder start the
core and answer?* — and it is the question the layout and the code that reads it disagreed
about.

The bugs this test holds against:

1. **the installer copied the core's files, not the package** — so the installed folder held
   ``bridge.py`` loose in ``runtime/core`` and the core was **not importable as
   ``archres_core``**, and the shell's sidecar could never have started;
2. **the bridge looked for the flow book and the packs in ``spec/``** — a folder the install
   does not have.

And the **models** and the **CAD engine** are **bundled** (the owner's decision · 2026-10-22
·) — so the installer **copies** them ✓, and a copy whose hash is not the promised one is
**refused** ✓ ✓.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.install import (
    INSTALL_LAYOUT,
    ManifestError,
    apply_plan,
    install_plan,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _install(tmp_path: pathlib.Path, install_manifest) -> pathlib.Path:
    """Lay the install folder down ✓ ✓ (the stand-ins ✓ — the real engine and the real
    models are gigabytes ✓, and a test that copied them would copy eight ✓ ✓)."""
    install = tmp_path / "install"
    plan = install_plan(install_manifest, install, repo_root=ROOT)
    apply_plan(plan, install)
    return install


def _isolated_env(python_path: str) -> dict[str, str]:
    """An environment where the **installed** core cannot answer for the install ✓.

    ``-S`` keeps the site-packages' *hooks* out (the editable install's ``.pth`` ✓ — which
    is how the venv's copy of the core sneaks in ✓) ✓, while the site's *packages* stay on
    the path ✓ — the core's dependencies (yaml ✓, jsonschema ✓) live there ✓ ✓.
    """
    import site

    environment = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    paths = [python_path]
    for folder in site.getsitepackages() if hasattr(site, "getsitepackages") else []:
        if folder and str(folder) not in paths:
            paths.append(str(folder))
    environment["PYTHONPATH"] = os.pathsep.join(paths)
    return environment


def test_the_installed_core_is_importable_as_the_package(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The package keeps its name ✓ — or the sidecar never starts ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    package = install / INSTALL_LAYOUT["core"]
    assert (package / "__init__.py").is_file(), "the package's files are loose in the folder"
    assert (package / "bridge.py").is_file()
    assert (package / "importer.py").is_file()


def test_the_installed_core_imports_in_isolation(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The import is real ✓ — proven without the venv's installed core ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    result = subprocess.run(
        [sys.executable, "-S", "-c", "import archres_core.bridge"],
        env=_isolated_env(str(install / INSTALL_LAYOUT["coreData"])),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr.strip()[-400:]


def test_the_installed_core_answers(tmp_path: pathlib.Path, install_manifest) -> None:
    """The whole thing: the installed core starts ✓ and answers a ping ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    process = subprocess.Popen(
        [sys.executable, "-S", "-m", "archres_core.bridge", "--root", str(install)],
        env=_isolated_env(str(install / INSTALL_LAYOUT["coreData"])),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
    )
    try:
        assert process.stdin is not None and process.stdout is not None
        process.stdin.write('{"id":"1","method":"ping"}\n')
        process.stdin.flush()
        line = process.stdout.readline()
        assert line, "the installed core did not answer"
        reply = json.loads(line)
        assert reply["result"]["name"] == "archres-core"
    finally:
        if process.stdin is not None:
            process.stdin.close()
        process.wait(timeout=30)


def test_the_installed_core_finds_its_flow_book_and_its_packs(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The bridge's data is in the install's places ✓ — not in a ``spec/`` ✗ ✓."""
    install = _install(tmp_path, install_manifest)
    assert (install / INSTALL_LAYOUT["coreData"] / "flows" / "phase-flow-book.yaml").is_file()
    assert (install / INSTALL_LAYOUT["packs"] / "rajuk-2008.yaml").is_file()
    # and the bridge finds them from the install root ✓
    from archres_core.bridge import Bridge

    bridge = Bridge(root=install)
    assert bridge._book_path().is_file()
    assert bridge._pack_paths(), "the installed packs are found"


def test_the_models_are_bundled_with_the_app(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The owner decided it ✓: the user downloads the app and the models are there ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    models = install / INSTALL_LAYOUT["models"]
    assert models.is_dir(), "the models folder is in the install"
    assert (models / "archie-chat-v0-Q4_K_M.gguf").is_file()


def test_the_engine_is_bundled_with_the_app(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The geometry has to work after an install ✓ — so the engine travels too ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    engine = install / INSTALL_LAYOUT["engine"]
    assert (engine / "bin" / "freecadcmd.exe").is_file()
    for folder in ("Mod", "lib", "data"):
        assert (engine / folder).is_dir(), folder


def test_a_model_whose_hash_is_wrong_is_refused(
    tmp_path: pathlib.Path, install_manifest, models_home: pathlib.Path
) -> None:
    """A bundled model is verified before it is installed ✓ — a wrong one is refused ✓ ✓."""
    install = tmp_path / "install"
    # a model that is not the one the manifest promises ✓
    (models_home / "archie-chat-v0-Q4_K_M.gguf").write_bytes(b"a different model entirely")
    plan = install_plan(install_manifest, install, repo_root=ROOT)
    with pytest.raises(ManifestError, match="hash"):
        apply_plan(plan, install)
