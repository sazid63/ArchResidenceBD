"""CAD verify case model (W1.8) - a case that cannot say what it expects cannot verify."""

from __future__ import annotations

import json
import pathlib

import pytest

from archres_core.cad import Bounds, CadError, load_cases

ROOT = pathlib.Path(__file__).resolve().parents[2]
CASES = ROOT / "tools" / "cad" / "cases" / "foundation.json"


def _case(**overrides) -> dict:
    case = {
        "id": "case-1",
        "kind": "geometry.build",
        "script": "tools/cad/candidates/geometry_build.py",
        "params": {"pads": 1},
        "expect": {"status": "ok", "objects": [{"name": "Pad_1"}]},
        "determinism": True,
        "timeoutMs": 180000,
        "notes": "why this case exists",
    }
    case.update(overrides)
    return case


def _write(tmp_path: pathlib.Path, cases: list[dict] | dict) -> pathlib.Path:
    path = tmp_path / "cases.json"
    path.write_bytes(json.dumps(cases).encode("utf-8"))
    return path


def test_the_committed_case_file_loads() -> None:
    cases = load_cases(CASES, root=ROOT)
    assert [case.id for case in cases] == [
        "foundation.pads.1x1",
        "foundation.pads.6x3",
        "foundation.broken.missing-column",
    ]
    first = cases[0]
    assert first.kind == "geometry.build"
    assert first.script == ROOT / "tools" / "cad" / "candidates" / "geometry_build.py"
    assert first.determinism is True
    assert first.expect["status"] == "ok"
    assert first.expect["documentObjects"] == Bounds(1.0, float("inf"))
    assert first.objects[0].name == "Pad_1"
    assert first.objects[0].volume_m3 is not None
    assert first.objects[0].volume_m3.holds(0.675)
    assert cases[2].expect["status"] == "error"
    assert cases[2].determinism is False


def test_a_min_only_count_is_a_real_expectation(tmp_path: pathlib.Path) -> None:
    path = _write(tmp_path, [_case(expect={"status": "ok", "documentObjects": {"min": 2}})])
    (case,) = load_cases(path, root=ROOT)
    assert case.expect["documentObjects"] == Bounds(2.0, float("inf"))


def test_a_bare_number_is_exact(tmp_path: pathlib.Path) -> None:
    path = _write(tmp_path, [_case(expect={"status": "ok", "documentObjects": 3})])
    (case,) = load_cases(path, root=ROOT)
    assert case.expect["documentObjects"] == Bounds(3.0, 3.0)


def test_an_empty_expectation_is_a_load_error(tmp_path: pathlib.Path) -> None:
    with pytest.raises(CadError, match="must demand something"):
        load_cases(_write(tmp_path, [_case(expect={})]), root=ROOT)


def test_an_unknown_key_is_a_load_error(tmp_path: pathlib.Path) -> None:
    with pytest.raises(CadError, match="unknown key"):
        load_cases(_write(tmp_path, [_case(expectationtypo={})]), root=ROOT)
    with pytest.raises(CadError, match="unknown expect key"):
        load_cases(
            _write(tmp_path, [_case(expect={"status": "ok", "tolernce": 0.1})]), root=ROOT
        )


def test_a_duplicate_id_is_refused(tmp_path: pathlib.Path) -> None:
    with pytest.raises(CadError, match="duplicate case id"):
        load_cases(_write(tmp_path, [_case(), _case()]), root=ROOT)


@pytest.mark.parametrize("timeout", [0, 999, -1])
def test_the_deadline_must_be_usable(tmp_path: pathlib.Path, timeout: int) -> None:
    with pytest.raises(CadError, match="timeoutMs"):
        load_cases(_write(tmp_path, [_case(timeoutMs=timeout)]), root=ROOT)


def test_bounds_must_contain_something(tmp_path: pathlib.Path) -> None:
    with pytest.raises(CadError, match="min"):
        load_cases(
            _write(
                tmp_path,
                [_case(expect={"status": "ok", "totals": {"volumeM3": {"min": 2, "max": 1}}})],
            ),
            root=ROOT,
        )


def test_a_status_outside_the_vocabulary_is_refused(tmp_path: pathlib.Path) -> None:
    with pytest.raises(CadError, match="expect.status"):
        load_cases(
            _write(tmp_path, [_case(expect={"status": "maybe"})]), root=ROOT
        )


def test_a_script_path_is_resolved_against_the_repo_root(tmp_path: pathlib.Path) -> None:
    path = _write(tmp_path, [_case(script="tools/cad/candidates/geometry_build.py")])
    (case,) = load_cases(path, root=ROOT)
    assert case.script.is_file()


def test_bounds_describe_one_sided_intervals() -> None:
    assert Bounds(1.0, float("inf")).describe() == ">= 1"
    assert Bounds(0.0, 6.0).describe() == "0..6"
    assert Bounds(0.675, 0.675).describe() == "0.675"
