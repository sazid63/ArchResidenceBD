"""W5.6: the dashboard's list and the manual's search, through the channel the app uses."""

from __future__ import annotations

import json
import pathlib

from archres_core.bridge import Bridge
from archres_core.spec import SpecStore

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _project(root: pathlib.Path, name: str) -> None:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    spec["project"] = {**spec.get("project", {}), "name": name}
    SpecStore.create(root / name.replace(" ", "-").lower(), spec, note="created")


def test_the_dashboard_lists_this_machines_projects(tmp_path: pathlib.Path) -> None:
    projects = tmp_path / "projects"
    projects.mkdir()
    _project(projects, "Mirpur Duplex")
    _project(projects, "Dhanmondi Flat")

    bridge = Bridge(root=ROOT)
    response = bridge.handle(
        {"id": "1", "method": "projects.list", "params": {"projects": str(projects)}}
    )
    result = response["result"]
    assert result["count"] == 2
    names = {row["name"] for row in result["projects"]}
    assert names == {"Mirpur Duplex", "Dhanmondi Flat"}
    for row in result["projects"]:
        assert row["readable"] is True
        assert row["revision"] == 0
        assert row["sha256"]


def test_a_folder_that_is_not_a_project_is_not_listed(tmp_path: pathlib.Path) -> None:
    projects = tmp_path / "projects"
    projects.mkdir()
    (projects / "scratch").mkdir()
    (projects / "scratch" / "note.txt").write_text("not a project", encoding="utf-8")

    bridge = Bridge(root=ROOT)
    response = bridge.handle(
        {"id": "1", "method": "projects.list", "params": {"projects": str(projects)}}
    )
    assert response["result"]["count"] == 0


def test_a_projects_folder_that_is_not_there_is_empty(tmp_path: pathlib.Path) -> None:
    bridge = Bridge(root=ROOT)
    response = bridge.handle(
        {
            "id": "1",
            "method": "projects.list",
            "params": {"projects": str(tmp_path / "nothing")},
        }
    )
    assert response["result"]["count"] == 0


def test_the_manual_is_searched_through_the_channel() -> None:
    bridge = Bridge(root=ROOT)
    response = bridge.handle(
        {
            "id": "1",
            "method": "manual.search",
            "params": {"query": "soil report", "lang": "en"},
        }
    )
    answers = response["result"]["answers"]
    assert answers
    assert answers[0]["entry"]["id"] == "ask-soil-has-report"
    assert answers[0]["entry"]["source"]


def test_the_manual_needs_a_query() -> None:
    bridge = Bridge(root=ROOT)
    response = bridge.handle({"id": "1", "method": "manual.search", "params": {}})
    assert response["error"]["code"] == "invalid_params"
