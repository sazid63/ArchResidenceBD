"""W5.1: the project creation, through the channel the app uses."""

from __future__ import annotations

import pathlib

from archres_core.bridge import Bridge

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _bridge() -> Bridge:
    return Bridge(root=ROOT)


def test_a_project_is_created_from_a_template(tmp_path: pathlib.Path) -> None:
    projects = tmp_path / "projects"
    reply = _bridge().handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {
                "name": "Mirpur Duplex",
                "template": "new-project",
                "projects": str(projects),
            },
        }
    )
    result = reply["result"]
    assert result["name"] == "Mirpur Duplex"
    assert (pathlib.Path(result["path"]) / "log.jsonl").is_file()
    # the interview opens with its first question ✓
    assert result["prompt"]["questionId"]
    # and the project is on the machine now ✓
    listed = _bridge().handle(
        {"id": "2", "method": "projects.list", "params": {"projects": str(projects)}}
    )
    assert [row["name"] for row in listed["result"]["projects"]] == ["Mirpur Duplex"]


def test_a_project_name_that_is_taken_is_refused(tmp_path: pathlib.Path) -> None:
    projects = tmp_path / "projects"
    for _ in range(2):
        reply = _bridge().handle(
            {
                "id": "1",
                "method": "project.create",
                "params": {"name": "Mirpur Duplex", "projects": str(projects)},
            }
        )
    assert reply["error"]["code"] == "invalid_params"
    assert "already a project" in reply["error"]["message"]


def test_a_project_needs_a_name(tmp_path: pathlib.Path) -> None:
    reply = _bridge().handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {"projects": str(tmp_path / "projects")},
        }
    )
    assert reply["error"]["code"] == "invalid_params"
    assert "needs a name" in reply["error"]["message"]


def test_the_project_folder_name_is_safe(tmp_path: pathlib.Path) -> None:
    """A name with spaces and marks still makes a usable folder ✓."""
    projects = tmp_path / "projects"
    reply = _bridge().handle(
        {
            "id": "1",
            "method": "project.create",
            "params": {"name": "Mirpur Duplex / বাড়ি ১", "projects": str(projects)},
        }
    )
    folder = pathlib.Path(reply["result"]["path"])
    assert folder.is_dir()
    assert " " not in folder.name
    assert folder.name == folder.name.lower()
