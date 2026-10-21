"""The installed folder must actually run the app.

This is the question the commercial path depends on: *can the installed folder start the
core and answer?* — and it is the question the layout and the code that reads it disagreed
about.

The two bugs this test holds against:

1. **the installer copied the core's files, not the package** — so the installed folder held
   ``bridge.py`` loose in ``runtime/core`` and the core was **not importable as
   ``archres_core``**, and the shell's sidecar could never have started;
2. **the bridge looked for the flow book and the packs in ``spec/``** — a folder the install
   does not have.
"""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys

import pytest

from archres_core.install import INSTALL_LAYOUT, apply_plan, install_plan, the_manifest

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _install(tmp_path: pathlib.Path) -> pathlib.Path:
    """Lay the install folder down ✓ ✓."""
    install = tmp_path / "install"
    plan = install_plan(the_manifest(), install, repo_root=ROOT)
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


def test_the_installed_core_is_importable_as_the_package(tmp_path: pathlib.Path) -> None:
    """The package keeps its name ✓ — or the sidecar never starts ✓ ✓."""
    install = _install(tmp_path)
    package = install / INSTALL_LAYOUT["core"]
    assert (package / "__init__.py").is_file(), "the package's files are loose in the folder"
    assert (package / "bridge.py").is_file()
    assert (package / "importer.py").is_file()


def test_the_installed_core_imports_in_isolation(tmp_path: pathlib.Path) -> None:
    """The import is real ✓ — proven without the venv's installed core ✓ ✓."""
    install = _install(tmp_path)
    result = subprocess.run(
        [sys.executable, "-S", "-c", "import archres_core.bridge"],
        env=_isolated_env(str(install / INSTALL_LAYOUT["coreData"])),
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == 0, result.stderr.strip()[-400:]


def test_the_installed_core_answers(tmp_path: pathlib.Path) -> None:
    """The whole thing: the installed core starts ✓ and answers a ping ✓ ✓."""
    install = _install(tmp_path)
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
        import json

        reply = json.loads(line)
        assert reply["result"]["name"] == "archres-core"
    finally:
        if process.stdin is not None:
            process.stdin.close()
        process.wait(timeout=30)


def test_the_installed_core_finds_its_flow_book_and_its_packs(tmp_path: pathlib.Path) -> None:
    """The bridge's data is in the install's places ✓ — not in a ``spec/`` ✗ ✓."""
    install = _install(tmp_path)
    assert (install / INSTALL_LAYOUT["coreData"] / "flows" / "phase-flow-book.yaml").is_file()
    assert (install / INSTALL_LAYOUT["packs"] / "rajuk-2008.yaml").is_file()
    # and the bridge finds them from the install root ✓
    from archres_core.bridge import Bridge

    bridge = Bridge(root=install)
    assert bridge._book_path().is_file()
    assert bridge._pack_paths(), "the installed packs are found"
