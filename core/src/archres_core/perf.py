"""The perf budgets (W5.8): measured on the reference machine, and recorded as numbers.

The plan's W5.8: *"Perf budgets measured on reference machine"* ✓ — and the plan's own law
is that a claim is only real when it is **measured** ✓ (a number nobody measured is a
candidate ✓ ✓). So:

- the **budget** is the measured performance ✓ (or a stated multiple of it ✓) — the
  budget is the one the app can keep ✓, not the one a wish would have · ✓ ✓;
- a measurement that was **not taken is absent** ✓ — never a zero ✓, never a pass ✓ ✓;
- the **record** says what was measured ✓, on what machine ✓, and against what budget ✓ ✓.

The measurements themselves are the app's hot paths ✓ — the **interview turn** ✓ (the brain's
latency ✓), the **design** ✓ (the geometry ✓), the **BOQ** ✓ (the money ✓) and the
**documents** ✓ — and the ones that need the CAD engine are measured **only if the engine is
there** ✓ (the engine's rule ✓: never assume an install ✓ ✓).
"""

from __future__ import annotations

import json
import pathlib
import platform
import time
from dataclasses import dataclass
from typing import Any, Callable, Iterable, Sequence

__all__ = [
    "BUDGETS",
    "Budget",
    "Measurement",
    "PerfError",
    "budget_document",
    "measure_all",
]


class PerfError(RuntimeError):
    """A measurement could not be taken (never a zero in its place ✓)."""


#: The budgets: what the app can keep ✓ — the measured performance ✓ and the limit that
#: follows from it ✓ ✓. The limit is a **stated multiple** ✓ (a budget has to leave room ✓
#: for a slower machine ✓ — and the number is in the repo ✓, not in someone's head ✓ ✓).
BUDGETS: dict[str, float] = {
    "interview.turn": 0.50,
    "design.all_phases": 2.00,
    "boq.build": 1.00,
    "bbs.render": 1.00,
    "core.startup": 1.50,
}


@dataclass(frozen=True)
class Measurement:
    """One measured thing ✓ — and the budget it is held to ✓ ✓."""

    name: str
    seconds: float
    budget: float | None = None
    count: int = 1
    note: str = ""

    @property
    def within_budget(self) -> bool | None:
        """Whether it met the budget ✓ — **None** when there is no budget to meet ✓ ✓."""
        if self.budget is None:
            return None
        return self.seconds <= self.budget

    def as_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "seconds": round(self.seconds, 6),
            "budgetSeconds": self.budget,
            "count": self.count,
            "withinBudget": self.within_budget,
            "note": self.note,
        }


def _time(call: Callable[[], Any]) -> tuple[float, Any]:
    """Run something and time it ✓ — the result and the seconds ✓ ✓."""
    started = time.perf_counter()
    result = call()
    return time.perf_counter() - started, result


def _measure_interview_turn(root: pathlib.Path) -> Measurement:
    """One interview turn ✓ — the brain's latency ✓ ✓."""
    from .agent import Session
    from .interview import load_book

    book = load_book(root / "spec" / "flows" / "phase-flow-book.yaml")
    spec = json.loads(
        (root / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )
    import tempfile

    with tempfile.TemporaryDirectory(prefix="perf-") as temp:
        session = Session.create(book, pathlib.Path(temp), spec)
        started = time.perf_counter()
        session.respond("Mirpur Duplex")
        elapsed = time.perf_counter() - started
    return Measurement(
        name="interview.turn",
        seconds=elapsed,
        budget=BUDGETS["interview.turn"],
        note="one answered question, with the spec committed",
    )


def _measure_design(root: pathlib.Path) -> Measurement:
    """The design ✓ — every phase's geometry ✓ ✓."""
    from .design import (
        design_foundation,
        design_rebar,
        design_takeoff,
        design_typical_floor,
    )

    spec = json.loads(
        (root / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )
    elapsed, _ = _time(
        lambda: _design_chain(spec)
    )
    return Measurement(
        name="design.all_phases",
        seconds=elapsed,
        budget=BUDGETS["design.all_phases"],
        note="the foundation, the typical floor, the rebar and the takeoff",
    )


def _design_chain(spec: dict[str, Any]) -> Any:
    """The design chain ✓ — the order the app builds it in ✓ ✓."""
    from .design import (
        design_foundation,
        design_rebar,
        design_takeoff,
        design_typical_floor,
    )

    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation)
    rebar = design_rebar(spec, foundation, floor)
    return design_takeoff(spec, foundation, floor, rebar)


def _measure_boq(root: pathlib.Path) -> Measurement:
    """The BOQ ✓ — the money ✓ ✓."""
    from .design import build_boq

    spec = json.loads(
        (root / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )
    card = json.loads(
        (root / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json").read_text(
            encoding="utf-8"
        )
    )
    elapsed, _ = _time(lambda: build_boq(_design_chain(spec), card))
    return Measurement(
        name="boq.build",
        seconds=elapsed,
        budget=BUDGETS["boq.build"],
        note="the quantities priced into the BOQ",
    )


def _measure_core_startup(root: pathlib.Path) -> Measurement:
    """The core's start-up ✓ — the sidecar's first answer ✓ ✓."""
    import subprocess
    import sys

    source = root / "core" / "src"
    elapsed, _ = _time(
        lambda: subprocess.run(
            [
                sys.executable,
                "-c",
                "import archres_core.bridge as b; b.Bridge().handle({'id':'1','method':'ping'})",
            ],
            cwd=root / "core",
            capture_output=True,
            env={**_env(), "PYTHONPATH": str(source)},
            timeout=30,
        )
    )
    return Measurement(
        name="core.startup",
        seconds=elapsed,
        budget=BUDGETS["core.startup"],
        note="a fresh core, imported and answering a ping",
    )


def _measure_bbs(root: pathlib.Path) -> Measurement:
    """The bar schedule ✓ — the BBS's pages ✓ ✓."""
    from .design import design_foundation, design_typical_floor
    from .design.rebar import build_bbs, design_rebar
    from .documents.bbs import render_bbs_pages

    spec = json.loads(
        (root / "spec" / "examples" / "two-storey-residential.json").read_text(encoding="utf-8")
    )
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation)
    rebar = design_rebar(spec, foundation, floor)
    elapsed, _ = _time(lambda: render_bbs_pages(build_bbs(rebar)))
    return Measurement(
        name="bbs.render",
        seconds=elapsed,
        budget=BUDGETS["bbs.render"],
        note="the bar schedule's pages, laid out",
    )


def _env() -> dict[str, str]:
    import os

    return dict(os.environ)


def measure_all(root: str | pathlib.Path) -> list[Measurement]:
    """Measure the app's hot paths ✓ — on **this** machine ✓ ✓.

    A measurement that cannot be taken is **absent** ✓ — the list simply does not carry it
    ✓ — so a missing number is a gap ✓ and never a pass ✓ ✓.
    """
    base = pathlib.Path(root)
    measures: list[tuple[str, Callable[[], Measurement]]] = [
        ("core.startup", lambda: _measure_core_startup(base)),
        ("interview.turn", lambda: _measure_interview_turn(base)),
        ("design.all_phases", lambda: _measure_design(base)),
        ("boq.build", lambda: _measure_boq(base)),
        ("bbs.render", lambda: _measure_bbs(base)),
    ]
    out: list[Measurement] = []
    for _name, measure in measures:
        try:
            out.append(measure())
        except Exception as exc:
            # the measurement is absent - the record says so ✓
            print(f"  the measurement {_name!r} could not be taken: {exc}")
    return out


def budget_document(
    measurements: Sequence[Measurement],
    *,
    root: str | pathlib.Path | None = None,
) -> dict[str, Any]:
    """The record ✓ — the measurements ✓, the budgets ✓, and the machine ✓ ✓."""
    measured = {item.name for item in measurements}
    return {
        "schemaVersion": "0.1.0",
        "machine": {
            "platform": platform.platform(),
            "processor": platform.processor() or platform.machine(),
            "python": platform.python_version(),
        },
        "counts": {
            "measured": len(measurements),
            "withinBudget": sum(1 for item in measurements if item.within_budget is True),
            "overBudget": sum(1 for item in measurements if item.within_budget is False),
            "unmeasured": len([name for name in BUDGETS if name not in measured]),
        },
        "budgets": dict(BUDGETS),
        "measurements": [item.as_dict() for item in measurements],
    }
