"""The clash and coordination checks (W3.2): the report must be honest.

The laws these tests hold:

- a clash is a **fact about the design** ✓ - the same design gives the same report ✓;
- a clash carries **its reason** ✓ - a report that cannot say why would be a complaint, not a
  report ✓;
- the **known** clashes are named as known ✓ (the slabs carry no openings ✓, the v0 model puts
  the beams and the footings at the floor's level ✓) and are not hidden ✓;
- what the checks do **not** cover is declared ✓ ✓.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.design import design_foundation, design_typical_floor
from archres_core.design.clash import (
    SEVERITY_DECLARED,
    SEVERITY_OPEN,
    clash_report,
    find_clashes,
    members_from_commons,
    members_from_floor,
    members_from_foundation,
    render_clash_markdown,
)
from archres_core.design.commons import design_common_services
from archres_core.design.mep import design_mep

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _build():
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    foundation = design_foundation(spec)
    members = list(members_from_foundation(foundation))
    points = []
    for index in range(2):
        floor = design_typical_floor(spec, foundation, storey_index=index)
        commons = design_common_services(spec, floor, storey_index=index)
        mep = design_mep(spec, floor, storey_index=index)
        members.extend(members_from_floor(floor))
        members.extend(members_from_commons(commons))
        points.extend(mep.points)
    return tuple(members), tuple(points)


def test_the_members_carry_the_shared_datum() -> None:
    members, _ = _build()
    assert members
    phases = {member.phase for member in members}
    assert "foundation" in phases
    assert "floor-0" in phases
    assert "services-0" in phases


def test_a_clash_carries_its_reason() -> None:
    members, points = _build()
    clashes = find_clashes(members, points)
    assert clashes, "the example's design is not coordinated, so there must be clashes"
    for clash in clashes:
        assert clash.severity in (SEVERITY_DECLARED, SEVERITY_OPEN)
        assert clash.note, "a clash without a reason is a complaint, not a report"
        assert clash.detail
        assert clash.a and clash.b


def test_the_known_clashes_are_named_as_known() -> None:
    members, points = _build()
    clashes = find_clashes(members, points)
    declared = [clash for clash in clashes if clash.severity == SEVERITY_DECLARED]
    assert declared, "the v0 gaps must show up as declared, not as open"
    joined = " ".join(clash.note for clash in declared)
    assert "openings" in joined or "floor's level" in joined


def test_the_members_of_one_phase_are_not_clashes() -> None:
    """A beam lands on a column: that is a connection, not a clash."""
    members, points = _build()
    clashes = find_clashes(members, points)
    for clash in clashes:
        if clash.kind != "member-over-member":
            continue
        phases = {member.phase for member in members if member.id in (clash.a, clash.b)}
        assert len(phases) == 2, "the members of one phase must not be compared"


def test_the_report_is_deterministic() -> None:
    members, points = _build()
    first = clash_report(members, points).as_dict()
    second = clash_report(members, points).as_dict()
    assert first == second


def test_the_report_says_what_it_does_not_cover() -> None:
    members, points = _build()
    report = clash_report(
        members, points, declared_absent=("the stair flight: it is a sloped slab",)
    )
    markdown = render_clash_markdown(report)
    assert "What the checks do not cover" in markdown
    assert "the stair flight" in markdown
    # every clash is in the report
    for clash in report.clashes:
        assert clash.id in markdown


def test_the_committed_report_is_fresh() -> None:
    committed = ROOT / "data" / "cad" / "generated" / "clash-report.json"
    assert committed.is_file(), committed
    document = json.loads(committed.read_text(encoding="utf-8"))
    assert document["summary"]["members"] > 0
    assert document["summary"]["points"] > 0
    assert document["declaredAbsent"], "the report must say what it does not cover"
    markdown = ROOT / "data" / "cad" / "generated" / "clash-report.md"
    assert markdown.is_file(), markdown
    assert "Clash and coordination report" in markdown.read_text(encoding="utf-8")
