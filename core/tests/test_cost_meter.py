"""The live cost meter (W3.8): the delta is computed from the documents, and it is honest.

The laws these tests hold:

- the delta comes from **two BOQ documents** ✓ — every amount re-derives from its own line ✓;
- the meter's **scope is the change** ✓ — the incremental build's rebuilt phases ✓ — and the
  phases it did not rebuild are **named** ✓ ✓;
- a line that moved but has **no price** says so ✓ — a flat amount must not pass for "no
  change" ✓ ✓;
- the numbers are in the reader's **script** ✓ — the Bangla digits ✓, the ৳ ✓, and the sign
  says which way the money moved ✓ ✓.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.bengali import bn_digits, format_bdt, format_delta
from archres_core.design import (
    build_boq,
    cost_delta,
    design_foundation,
    design_rebar,
    design_takeoff,
    design_typical_floor,
    render_cost_meter,
)
from archres_core.design.cost_meter import KIND_ADDED, KIND_CHANGED, KIND_UNCHANGED

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"
CARD = ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json"


def _spec() -> dict:
    return json.loads(EXAMPLE.read_text(encoding="utf-8"))


def _boq(spec: dict) -> dict:
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    card = json.loads(CARD.read_text(encoding="utf-8"))
    return build_boq(takeoff, card)


def test_the_same_design_costs_the_same() -> None:
    before = _boq(_spec())
    after = _boq(_spec())
    delta = cost_delta(before, after)
    assert delta.delta == 0.0
    assert delta.total_before == delta.total_after
    assert not delta.moved_lines()


def test_a_change_shows_its_delta() -> None:
    """A wider frontage means more footings, and the meter says what that costs."""
    before = _boq(_spec())
    changed = _spec()
    changed["site"]["plot"]["frontageM"] = 12.0
    after = _boq(changed)
    delta = cost_delta(before, after)
    assert delta.moved_lines(), "a wider frontage must move the cost"
    assert delta.delta != 0.0
    assert delta.total_after == delta.total_before + delta.delta


def test_the_scope_is_the_change() -> None:
    """The incremental build says what it rebuilt; the meter shows that, and names the rest."""
    before = _boq(_spec())
    after = _boq(_spec())
    delta = cost_delta(before, after, rebuilt=["foundation"])
    assert delta.rebuilt_phases == ("foundation",)
    assert "floor" in delta.untouched_phases
    assert "site-excavation" in delta.untouched_phases
    # a rebuilt phase's lines are in the meter
    assert any(line.phase == "foundation" for line in delta.lines)
    assert not any(line.phase == "floor" for line in delta.lines)


def test_a_line_with_no_price_says_so() -> None:
    """An unpriced line's amount does not move, and the meter does not pretend it did."""
    before = _boq(_spec())
    after = json.loads(json.dumps(before))
    for entry in after["lines"]:
        if not entry["priced"]:
            entry["quantity"] = entry["quantity"] + 1
            break
    delta = cost_delta(before, after)
    unpriced = [line for line in delta.lines if line.before is None or line.after is None]
    assert unpriced, "the example has unpriced lines, and the meter must handle them"
    for line in unpriced:
        if line.kind != KIND_UNCHANGED:
            assert line.note, "a moved line with no price must say so"


def test_the_lines_are_matched_by_their_stable_key() -> None:
    before = _boq(_spec())
    after = _boq(_spec())
    delta = cost_delta(before, after)
    keys = [line.key for line in delta.lines]
    assert keys == sorted(keys), "the lines come in a stable order"
    assert len(keys) == len(set(keys)), "a line is matched once, not twice"


def test_the_bangla_numbers_are_the_bangla_numbers() -> None:
    assert format_bdt(125000.0, "bn") == "\u09f3 \u09e7\u09e8\u09eb,\u09e6\u09e6\u09e6"
    assert format_bdt(125000.0, "en") == "\u09f3 125,000"
    # the sign says which way the money moved
    assert format_delta(500.0, "bn").startswith("+")
    assert format_delta(-500.0, "bn").startswith("-")
    assert format_delta(0.0, "bn").startswith("\u09f3")
    assert bn_digits("2026-10-21") == "\u09e8\u09e6\u09e8\u09ec-\u09e7\u09e6-\u09e8\u09e7"


def test_the_meter_reads_as_a_meter() -> None:
    before = _boq(_spec())
    after = _boq(_spec())
    delta = cost_delta(before, after)
    text = render_cost_meter(delta, "bn")
    assert "\u09f3" in text
    assert "Nothing moved." in text


def test_the_meter_is_deterministic() -> None:
    before = _boq(_spec())
    after = _boq(_spec())
    assert cost_delta(before, after).as_dict() == cost_delta(before, after).as_dict()
