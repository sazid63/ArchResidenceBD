"""The project assembly (W2.10): one spec, one building, every stage declared."""

from __future__ import annotations

import json
import pathlib

from archres_core.design import PIPELINE, UNCOVERED_PHASES, design_project

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _project():
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    return spec, design_project(spec)


def test_the_project_assembles_every_part_v0_covers() -> None:
    _spec, project = _project()
    assert project.foundation.footings
    assert project.floors
    assert project.rebar.bars
    assert project.sheet.views
    assert project.takeoff.lines


def test_the_pipeline_order_is_the_plans() -> None:
    _spec, project = _project()
    assert project.stages == PIPELINE
    phases = [phase for phase, _stage in project.stages]
    assert phases.index("site-excavation") < phases.index("foundation")
    assert phases.index("foundation") < phases.index("floor")
    assert phases.index("floor") < phases.index("drawings")
    assert phases.index("drawings") < phases.index("bbs")
    assert phases.index("bbs") < phases.index("takeoff")


def test_the_uncovered_phases_are_declared_not_implied() -> None:
    _spec, project = _project()
    assert project.uncovered_phases == UNCOVERED_PHASES
    for phase, stage in project.stages:
        if phase in UNCOVERED_PHASES:
            assert "not covered" in stage


def test_the_project_design_is_deterministic() -> None:
    _spec, first = _project()
    _spec2, second = _project()
    assert first.as_dict() == second.as_dict()
