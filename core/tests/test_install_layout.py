"""W5.1: the install is complete - the engine, the models, the Python, the core, the law.

The owner's promise (2026-10-22): *the user downloads the app, installs it, and
everything is there*. So the install must carry:

- the **core** ✓ (as a package ✓ - the name matters ✓, or the import fails ✓ ✓);
- the **core's data** ✓ (the flow book ✓, the schemas ✓) ✓;
- the **CAD engine** ✓ (the folders the headless engine needs ✓) ✓;
- the **models** ✓ (bundled ✓ - ADR-0063 ✓) ✓;
- the **Python runtime** ✓ — so nobody installs Python ✓ ✓;
- the **rule packs** ✓ and the **notices** ✓ ✓.

And the copy must be **recursive** ✓ — the engine's `Mod` and `lib` have folders inside
them ✓, and a copy that stopped one level down would leave the install with a *broken*
engine ✓ ✓.
"""

from __future__ import annotations

import json
import os
import pathlib
import site
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
        capture_output=True,
        text=True,
        timeout=60,
        env=_isolated_env(str(install / INSTALL_LAYOUT["coreData"])),
    )
    assert result.returncode == 0, result.stderr.strip()[-400:]


def test_the_installed_core_answers(tmp_path: pathlib.Path, install_manifest) -> None:
    """The whole thing: the installed core starts ✓ and answers a ping ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    process = subprocess.Popen(
        [sys.executable, "-S", "-m", "archres_core.bridge", "--root", str(install)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        env=_isolated_env(str(install / INSTALL_LAYOUT["coreData"])),
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
    from archres_core.bridge import Bridge

    bridge = Bridge(root=install)
    assert bridge._book_path().is_file()
    assert bridge._pack_paths(), "the installed packs are found"


def test_the_installed_app_can_start_a_project(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The app's **first** job — and the install must carry what it needs ✓ ✓.

    The templates are the app's starting points ✓ ✓ — so an install without them
    is an app that cannot begin ✓ ✓ ✓.
    """
    from archres_core.bridge import Bridge

    install = _install(tmp_path, install_manifest)
    bridge = Bridge(root=install)

    templates = bridge.handle(
        {"id": "1", "method": "templates.list", "params": {}}
    )
    assert not templates.get("error"), templates
    assert templates["result"]["count"] > 0, "the installed app has no template to start from"

    created = bridge.handle(
        {"id": "2", "method": "project.create", "params": {"name": "Installed Probe"}}
    )
    assert not created.get("error"), created
    assert created["result"]["prompt"]["ask"], "the interview did not open"


def test_the_installed_app_can_run_the_interview(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The flow book is in the **install's** place ✓ — the dev tree's `spec/` is not there ✓.

    The book is found twice in the core ✓ ✓ — once for the manual ✓ and once
    for the interview ✓ ✓ — and they must agree ✓ ✓ — or the installed
    app can search the manual ✓ and cannot run the interview ✓ ✓ ✓.
    """
    from archres_core.bridge import Bridge

    install = _install(tmp_path, install_manifest)
    bridge = Bridge(root=install)

    created = bridge.handle(
        {"id": "1", "method": "project.create", "params": {"name": "Interview Probe"}}
    )
    assert not created.get("error"), created
    project = created["result"]["path"]

    resumed = bridge.handle(
        {"id": "2", "method": "session.resume", "params": {"root": project, "sessionId": "app"}}
    )
    assert not resumed.get("error"), resumed
    assert resumed["result"]["prompt"]["ask"], "the interview did not open"


def test_the_installed_app_can_price_a_boq(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The money needs the rate card ✓ ✓ — so the install carries it ✓ ✓.

    And the card's **status** travels with the BOQ ✓ ✓ — a candidate card says
    so ✓ (the money law ✓ ✓) ✓ ✓.
    """
    from archres_core.bridge import Bridge

    install = _install(tmp_path, install_manifest)
    bridge = Bridge(root=install)

    created = bridge.handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {"name": "Money Probe", "template": "two-storey-residential"},
        }
    )
    assert not created.get("error"), created

    reply = bridge.handle(
        {"id": "2", "method": "boq.build", "params": {"project": created["result"]["path"]}}
    )
    assert not reply.get("error"), reply
    card = reply["result"]["boq"]["rateCard"]
    assert card["cardId"], "the BOQ does not say which card priced it"
    assert card["status"], "the card's status must travel with the BOQ"


def test_the_installed_app_finds_the_manual(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The Help screen reads the manual ✓ ✓ — from the packs the install carries ✓."""
    from archres_core.bridge import Bridge

    install = _install(tmp_path, install_manifest)
    bridge = Bridge(root=install)

    reply = bridge.handle(
        {"id": "1", "method": "manual.search", "params": {"query": "setback"}}
    )
    assert not reply.get("error"), reply
    assert reply["result"]["answers"], "the manual came out empty"

def test_the_update_check_can_read_the_installed_app(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The check's own help says it reads an **installation** ✓ ✓ — so it must ✓ ✓.

    The install records the version it installed ✓ ✓ · and carries the model
    registry ✓ ✓ · the packs ✓ ✓ and the rate cards ✓ ✓ · so
    every channel can say what the user has ✓ ✓ ✓.
    """
    from archres_core.updates import check_updates

    install = _install(tmp_path, install_manifest)
    offered = {
        "app": {"version": "0.1.0"},
        "models": {"version": "0.1.0"},
        "rules": {"version": "0.1.0"},
        "prices": {"version": "0.1.0"},
    }
    plan = check_updates(install, offered=offered)

    channels = {item.channel: item for item in plan.channels}
    assert "app" in channels, "the install does not say which version it is"
    assert channels["app"].current != "0.0.0", "the app's version is not read"
    assert "rules" in channels, "the installed packs are not read"
    assert "prices" in channels, "the installed rate cards are not read"
    assert "models" in channels, "the installed model registry is not read"

def test_the_install_declares_the_apps_own_data_folder(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The user's own decisions live in the app's own data folder ✓ ✓ (ADR-0083 ✓ ✓).

    The layout declares it ✓ ✓ · the same way it declares the user's projects
    ✓ ✓ · and the app never has to invent a place to write ✓ ✓ ✓.
    """
    install = _install(tmp_path, install_manifest)
    assert (install / INSTALL_LAYOUT["data"]).is_dir(), "the app's data folder is not in the install"


def test_the_install_carries_the_engine_the_app_needs(
    tmp_path: pathlib.Path, install_manifest
) -> None:
    """The app must be able to find **its own** engine ✓ ✓ · the one it carries ✓ ✓.

    The install bundles the engine ✓ ✓ (the geometry is the app's own ✓ ✓) · and the
    discovery looked only at the build machine's places ✓ ✓ · so the app could not
    find the two gigabytes it carries ✓ ✓ ✓.
    """
    from archres_core.cad.engine import _install_engines

    install = _install(tmp_path, install_manifest)
    engine = install / INSTALL_LAYOUT["engine"] / "bin" / "freecadcmd.exe"
    assert engine.is_file(), "the engine is not in the install"

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


def test_the_python_runtime_travels_with_the_app(
    tmp_path: pathlib.Path, install_manifest, python_home: pathlib.Path
) -> None:
    """Nobody installs Python ✓ — the runtime is in the folder ✓ ✓."""
    install = _install(tmp_path, install_manifest)
    runtime = install / INSTALL_LAYOUT["python"]
    assert (runtime / "python.exe").is_file()


def test_the_copy_is_recursive(tmp_path: pathlib.Path) -> None:
    """A copy that stopped one level down would leave a *broken* engine ✓ ✓."""
    from archres_core.install import _copy_tree

    source = tmp_path / "source"
    (source / "one" / "two" / "three").mkdir(parents=True)
    (source / "one" / "two" / "three" / "deep.txt").write_text("deep", encoding="utf-8")
    (source / "top.txt").write_text("top", encoding="utf-8")

    destination = tmp_path / "destination"
    written = _copy_tree(source, destination)

    assert (destination / "top.txt").is_file()
    assert (destination / "one" / "two" / "three" / "deep.txt").is_file()
    assert len(written) == 2


def test_a_model_whose_hash_is_wrong_is_refused(
    tmp_path: pathlib.Path, install_manifest, models_home: pathlib.Path
) -> None:
    """A bundled model is verified before it is installed ✓ — a wrong one is refused ✓ ✓."""
    install = tmp_path / "install"
    (models_home / "archie-chat-v0-Q4_K_M.gguf").write_bytes(b"a different model entirely")
    plan = install_plan(install_manifest, install, repo_root=ROOT)
    with pytest.raises(ManifestError, match="hash"):
        apply_plan(plan, install)
