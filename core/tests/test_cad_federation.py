"""The federation (W2.9): the shared datum, the phase files and the linking master."""

from __future__ import annotations

import json
import pathlib

from archres_core.cad.federation import (
    DATUM_FILE,
    MASTER_MACRO,
    PHASE_EPILOGUE,
    build_datum,
    phase_macro,
    summarize_master,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]
GENERATED = ROOT / "data" / "cad" / "generated" / "federation"


def _spec() -> dict:
    return json.loads(
        (ROOT / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )


def test_the_datum_comes_from_the_spec() -> None:
    datum = build_datum(_spec())
    assert datum["projectId"] == _spec()["project"]["id"]
    assert datum["units"] == "mm"
    assert datum["origin"] == [0.0, 0.0, 0.0]
    assert datum["upAxis"] == "z"
    assert datum["location"]["district"] == "Dhaka"


def test_the_phase_epilogue_writes_the_datum_and_saves_the_file() -> None:
    macro = phase_macro("build()\n")
    assert macro.startswith("build()\n")
    assert "ArchresDatum" in macro
    assert "saveAs" in macro
    assert "ARCHRES_JOB_PARAMS" in PHASE_EPILOGUE


def test_the_master_links_and_does_not_copy() -> None:
    assert "App::Link" in MASTER_MACRO
    assert "LinkedObject" in MASTER_MACRO
    # The master must exist on disk before it can hold links to other documents.
    assert MASTER_MACRO.index("saveAs") < MASTER_MACRO.index("App::Link")
    # It must not copy the shapes into itself.
    assert "Part::Feature\"" not in MASTER_MACRO.replace('"Part::Feature"', "")


def test_the_summary_counts_the_links() -> None:
    summary = summarize_master(
        {
            "links": 2,
            "objects": [
                {"phase": "foundation", "id": "Footing_F1", "volumeMm3": 432_000_000.0},
                {"phase": "floor", "id": "Column_C1", "volumeMm3": 270_000_000.0},
            ],
        }
    )
    assert summary["objects"] == 2
    assert summary["volumeM3"] == 0.702
    assert summary["byPhase"] == {"floor": 1, "foundation": 1}


def test_the_committed_master_agrees_with_the_design() -> None:
    from archres_core.design import design_foundation, design_typical_floor

    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    report = json.loads((GENERATED / "master-report.json").read_text(encoding="utf-8"))
    summary = report["summary"]
    designed = sum(
        float(item["volumeM3"])
        for item in foundation.expected_objects() + floor.expected_objects()
    )
    assert summary["objects"] == len(foundation.expected_objects()) + len(floor.expected_objects())
    assert abs(summary["volumeM3"] - designed) <= 0.01 * designed
    assert (GENERATED / DATUM_FILE).is_file()


def test_the_master_carries_the_mep_and_the_clash_report() -> None:
    """The combined master holds the MEP points + schedules and the clash report (§6)."""
    report = json.loads(
        (GENERATED / "master-report.json").read_text(encoding="utf-8")
    )
    mep = report.get("mep")
    assert mep, "the master must carry the MEP"
    storeys = mep["storeys"]
    assert len(storeys) == 2
    for storey in storeys:
        assert storey["points"], "the MEP's points must travel with the master"
        assert storey["schedules"], "the MEP's schedules must travel with the master"
        assert storey["declaredAbsent"], "the MEP's declared gaps travel with it too"
    clash = report.get("clashReport")
    assert clash, "the master must carry the clash and coordination report"
    assert "Clash and coordination report" in clash


def test_the_masters_mep_is_the_designs_mep() -> None:
    """What the master carries is the MEP the design produced - not a copy of it."""
    from archres_core.design import design_foundation, design_mep, design_typical_floor

    spec = _spec()
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    mep = design_mep(spec, floor, storey_index=1)
    report = json.loads(
        (GENERATED / "master-report.json").read_text(encoding="utf-8")
    )
    carried = report["mep"]["storeys"][1]
    assert carried["points"] == [point.as_dict() for point in mep.points]
