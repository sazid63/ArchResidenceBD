"""The perf budgets (W5.8): measured, and a missing measurement is a gap, not a pass.

The laws these tests hold:

- **a budget is a number in the repo** — not a wish in someone's head;
- **a measurement that was not taken is absent** — never a zero, never a pass;
- **the record says what was measured, on what machine, against what budget**;
- **a measurement over its budget says so**.
"""

from __future__ import annotations

import pathlib

from archres_core.perf import (
    BUDGETS,
    Measurement,
    budget_document,
    measure_all,
)

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_the_budgets_are_numbers_in_the_repo() -> None:
    assert BUDGETS
    for name, limit in BUDGETS.items():
        assert limit > 0, name
        assert isinstance(name, str) and name


def test_a_measurement_that_was_not_taken_is_absent() -> None:
    """A missing number is a gap, never a zero and never a pass."""
    measurements = [Measurement(name="interview.turn", seconds=0.1, budget=0.5)]
    document = budget_document(measurements)
    assert document["counts"]["measured"] == 1
    assert document["counts"]["unmeasured"] == len(BUDGETS) - 1
    names = {row["name"] for row in document["measurements"]}
    assert "core.startup" not in names


def test_a_measurement_says_whether_it_met_its_budget() -> None:
    within = Measurement(name="a", seconds=0.2, budget=0.5)
    over = Measurement(name="b", seconds=0.9, budget=0.5)
    without = Measurement(name="c", seconds=0.1)
    assert within.within_budget is True
    assert over.within_budget is False
    assert without.within_budget is None, "no budget means no verdict"


def test_the_record_names_the_machine() -> None:
    document = budget_document([])
    assert document["machine"]["processor"]
    assert document["machine"]["python"]
    assert document["machine"]["platform"]


def test_the_hot_paths_are_measured_here() -> None:
    """The measurement runs on this machine, and the numbers are real."""
    measurements = measure_all(ROOT)
    names = {item.name for item in measurements}
    assert "core.startup" in names
    assert "interview.turn" in names
    assert "design.all_phases" in names
    for item in measurements:
        assert item.seconds >= 0
        assert item.budget is not None, "every measured path has a budget"


def test_the_measured_paths_are_within_their_budgets() -> None:
    """The budgets are the ones the app can keep."""
    measurements = measure_all(ROOT)
    over = [item.name for item in measurements if item.within_budget is False]
    assert over == [], f"these paths are over their budgets: {over}"
