"""W5.1: the engineer pack's contents, through the channel the app uses."""

from __future__ import annotations

import json
import pathlib
import zipfile

from archres_core.bridge import Bridge

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK = ROOT / "data" / "handoff" / "engineer-review-pack.zip"


def _pack(tmp_path: pathlib.Path) -> pathlib.Path:
    """An engineer pack with a manifest ✓ ✓."""
    path = tmp_path / "engineer-review-pack.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("spec.json", '{"project": {"name": "Mirpur Duplex"}}')
        archive.writestr("drawings/page-1.svg", "<svg/>")
        archive.writestr("bbs/bar-schedule.pdf", "%PDF-")
        archive.writestr(
            "manifest.json",
            json.dumps(
                {
                    "schemaVersion": "0.1.0",
                    "created": "2026-10-22T00:00:00+00:00",
                    "projectName": "Mirpur Duplex",
                    "projectId": "p1",
                    "parts": [
                        {"name": "spec.json", "role": "spec", "bytes": 10, "sha256": "a" * 64},
                        {
                            "name": "drawings/page-1.svg",
                            "role": "drawing",
                            "bytes": 6,
                            "sha256": "b" * 64,
                        },
                        {
                            "name": "bbs/bar-schedule.pdf",
                            "role": "bbs",
                            "bytes": 5,
                            "sha256": "c" * 64,
                        },
                    ],
                }
            ),
        )
    return path


def test_the_packs_parts_are_grouped_by_their_role(tmp_path: pathlib.Path) -> None:
    """The user sees the handover before they hand it over ✓ ✓."""
    pack = _pack(tmp_path)
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "documents.list", "params": {"pack": str(pack)}}
    )
    result = reply["result"]
    assert result["projectName"] == "Mirpur Duplex"
    assert result["count"] == 3
    assert result["groups"]["spec"] == ["spec.json"]
    assert result["groups"]["drawing"] == ["drawings/page-1.svg"]
    assert result["groups"]["bbs"] == ["bbs/bar-schedule.pdf"]


def test_the_committed_engineer_pack_is_readable() -> None:
    """The pack the repo ships ✓ — the one the app would show ✓ ✓."""
    if not PACK.is_file():
        return
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "documents.list", "params": {"pack": str(PACK)}}
    )
    result = reply["result"]
    assert result["count"] > 0
    assert "drawing" in result["groups"]
    assert "boq" in result["groups"]
    assert "compliance" in result["groups"]


def test_a_pack_that_is_not_there_is_refused(tmp_path: pathlib.Path) -> None:
    reply = Bridge(root=ROOT).handle(
        {
            "id": "1",
            "method": "documents.list",
            "params": {"pack": str(tmp_path / "nothing.zip")},
        }
    )
    assert reply["error"]["code"] == "invalid_params"


def test_a_file_that_is_not_an_archive_is_refused(tmp_path: pathlib.Path) -> None:
    path = tmp_path / "not-a-pack.zip"
    path.write_bytes(b"not an archive")
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "documents.list", "params": {"pack": str(path)}}
    )
    assert reply["error"]["code"] == "internal"
