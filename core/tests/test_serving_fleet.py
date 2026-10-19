"""Model fleet config (W1.11): registry coherence, deterministic render, freshness.

The generated llama-swap YAML is a committed product artifact, so the render is pinned:
same inputs → same bytes. Validation must refuse a config that would break the S2
invariants (one GPU resident, CPU services pinned, loopback-only, no path escapes).
"""

from __future__ import annotations

import json
import pathlib

import pytest
import yaml

from archres_core.serving import (
    FleetError,
    is_fresh,
    load_fleet,
    render_llama_swap,
    write_fleet,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
FLEET_PATH = ROOT / "spec" / "models" / "fleet.json"


@pytest.fixture(scope="module")
def fleet():
    return load_fleet(FLEET_PATH)


def _mutated(tmp_path: pathlib.Path, mutate) -> pathlib.Path:
    data = json.loads(FLEET_PATH.read_text(encoding="utf-8"))
    mutate(data)
    (tmp_path / "registry.json").write_text(
        (FLEET_PATH.parent / "registry.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    path = tmp_path / "fleet.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def _mutated_registry(path: pathlib.Path, mutate) -> pathlib.Path:
    data = json.loads((FLEET_PATH.parent / "registry.json").read_text(encoding="utf-8"))
    mutate(data)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


# -- the real fleet --------------------------------------------------------


def test_fleet_matches_the_registry_pins(fleet) -> None:
    registry = json.loads((FLEET_PATH.parent / "registry.json").read_text(encoding="utf-8"))
    by_role = {entry["role"]: entry for entry in registry["models"]}
    assert set(fleet.routes) == {"chat", "repair", "embed", "rerank"}
    for role, route in fleet.routes.items():
        entry = by_role[role]
        assert route.id == entry["id"]
        assert route.artifact_file == entry["artifact"]["file"]
        assert route.sha256 == entry["artifact"]["sha256"]
        assert route.display_name == entry["displayName"]["en"]
        assert route.group == entry["swapGroup"]
        assert route.flags == tuple(entry["runtime"]["flags"])


def test_modes_are_the_two_workflows(fleet) -> None:
    assert set(fleet.modes) == {"interview", "design"}
    assert fleet.mode("interview").primary == "chat"
    assert fleet.mode("design").primary == "repair"
    for mode in fleet.modes.values():
        assert mode.primary in mode.warmup
        assert set(mode.description) == {"en", "bn"}
        assert all(mode.description.values())


def test_render_is_deterministic_and_fresh(fleet) -> None:
    text = render_llama_swap(fleet)
    assert text == render_llama_swap(fleet)
    assert text.endswith("\n") and "\r" not in text
    assert is_fresh(fleet), "spec/models/llama-swap.yaml is stale - run tools/serving/fleet.py"
    assert fleet.generated_path.read_text(encoding="utf-8") == text


def test_rendered_yaml_encodes_the_fleet_law(fleet) -> None:
    data = yaml.safe_load(render_llama_swap(fleet))
    assert data["healthCheckTimeout"] == 500
    assert data["sendLoadingState"] is True
    assert set(data["models"]) == {"chat", "repair", "embed", "rerank"}
    assert data["macros"]["llama-server"] == "${env.ARCHRES_ROOT}/bin/llama/llama-server.exe"
    for route in fleet.routes.values():
        block = data["models"][route.role]
        assert block["name"] == route.display_name
        assert route.artifact_file in block["cmd"]
        assert f"-ngl {route.gpu_layers}" in block["cmd"]
        assert f"-c {route.context}" in block["cmd"]
    assert data["models"]["embed"]["cmd"].count("-ngl 0") == 1
    assert data["models"]["rerank"]["capabilities"] == {"reranker": True}
    groups = data["routing"]["router"]["settings"]["groups"]
    assert groups["gpu-models"]["members"] == ["chat", "repair"]
    assert groups["gpu-models"]["exclusive"] is True
    assert groups["cpu-services"]["persistent"] is True


def test_render_carries_pins_in_comments(fleet) -> None:
    text = render_llama_swap(fleet)
    for route in fleet.routes.values():
        assert f"# {route.id} | sha256 {route.sha256}" in text


def test_write_fleet_round_trips(tmp_path: pathlib.Path, fleet) -> None:
    copy = tmp_path / "models"
    copy.mkdir()
    (copy / "fleet.json").write_text(FLEET_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    (copy / "registry.json").write_text(
        (FLEET_PATH.parent / "registry.json").read_text(encoding="utf-8"), encoding="utf-8"
    )
    local = load_fleet(copy / "fleet.json")
    assert not is_fresh(local)
    path = write_fleet(local)
    assert path == local.generated_path
    assert is_fresh(local)
    assert path.read_bytes().count(b"\r\n") == 0


# -- refusals --------------------------------------------------------------


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (lambda data: data.__setitem__("schemaVersion", "9.9.9"), "schemaVersion"),
        (lambda data: data["macros"].__setitem__("models", "/abs/models"), "relative path"),
        (lambda data: data["macros"].__setitem__("models", "../models"), "escapes"),
        (lambda data: data["router"].__setitem__("listen", "0.0.0.0:8787"), "loopback"),
        (lambda data: data["defaults"].__setitem__("host", "192.168.1.4"), "loopback"),
        (lambda data: data["modes"]["interview"].__setitem__("primary", "nope"), "unknown route"),
        (lambda data: data["modes"]["interview"].__setitem__("warmup", ["embed"]), "include the primary"),
        (lambda data: data["modes"]["interview"].__setitem__("warmup", ["chat", "chat"]), "duplicate"),
        (lambda data: data["modes"]["interview"].__setitem__("warmup", ["chat", "nope"]), "unknown route"),
        (lambda data: data["modes"]["interview"]["description"].pop("bn"), "description"),
        (lambda data: data["groups"].update({"extra": {"swap": False, "exclusive": False, "persistent": False}}), "unused"),
        (lambda data: data["groups"]["gpu-models"].__setitem__("swap", False), "exclusive requires swap"),
        (lambda data: data["groups"]["gpu-models"].__setitem__("persistent", True), "cannot swap"),
        (lambda data: data.__setitem__("generated", "sub/out.yaml"), "sibling"),
        (lambda data: data.__setitem__("installRootEnv", "archres root"), "environment variable"),
        (lambda data: data.__setitem__("surprise", True), "unknown key"),
    ],
)
def test_fleet_refusals(tmp_path: pathlib.Path, mutate, match: str) -> None:
    with pytest.raises(FleetError, match=match):
        load_fleet(_mutated(tmp_path, mutate))


def test_registry_refusals(tmp_path: pathlib.Path) -> None:
    cases = [
        (lambda reg: reg["models"][0].__setitem__("role", "chat2"), "unknown role"),
        (lambda reg: reg["models"][1].__setitem__("role", "chat"), "duplicate role"),
        (lambda reg: reg["models"][0]["artifact"].__setitem__("file", "../evil.gguf"), "unsafe file"),
        (lambda reg: reg["models"][0]["artifact"].__setitem__("sha256", "ABC"), "sha256"),
        (lambda reg: reg["models"][2]["runtime"].__setitem__("gpuLayers", 99), "CPU services"),
        (lambda reg: reg["models"][0]["runtime"].__setitem__("gpuLayers", 0), "GPU models"),
        (lambda reg: reg["models"][0]["runtime"].__setitem__("flags", ["--no-webui", "; rm -rf"]), "unsafe token"),
        (lambda reg: reg["models"][0].__setitem__("swapGroup", "nowhere"), "undeclared"),
        (lambda reg: reg["models"].pop(), "exactly the fleet roles"),
    ]
    for index, (mutate, match) in enumerate(cases):
        registry = _mutated_registry(tmp_path / f"registry-{index}.json", mutate)
        with pytest.raises(FleetError, match=match):
            load_fleet(FLEET_PATH, registry_path=registry)


def test_missing_files_are_clear(tmp_path: pathlib.Path) -> None:
    with pytest.raises(FleetError, match="fleet config not found"):
        load_fleet(tmp_path / "nope.json")
    with pytest.raises(FleetError, match="model registry not found"):
        load_fleet(FLEET_PATH, registry_path=tmp_path / "nope.json")
