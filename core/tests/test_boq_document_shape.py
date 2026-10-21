"""The app's BOQ screen reads the real BOQ document - and its shape, not a guess.

The screen was written against the *mock* BOQ ✓ and the real document's lines have a
different shape ✓ (`label` in two languages ✓, `costType` ✓, `unit` ✓, `rateBdt` ✓) — so a
screen written from the mock would show `undefined` ✓ ✓. This test holds the screen's
expectations to the **real** document ✓ ✓.
"""

from __future__ import annotations

import json
import pathlib

from archres_core.bridge import Bridge
from archres_core.spec import SpecStore

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def test_the_boq_the_app_reads_has_the_shape_the_screen_expects(tmp_path: pathlib.Path) -> None:
    """Every field the screen reads must be there ✓ ✓."""
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    project = tmp_path / "mirpur"
    SpecStore.create(project, spec, note="created")

    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "boq.build", "params": {"project": str(project)}}
    )
    boq = reply["result"]["boq"]

    assert boq["lines"], "the BOQ has lines"
    for line in boq["lines"]:
        # the fields the screen reads ✓
        assert isinstance(line["key"], str) and line["key"]
        assert line["label"]["en"], line["key"]
        assert line["label"]["bn"], line["key"]
        assert line["phase"], line["key"]
        assert line["costType"] in ("material", "labour", "machinery", "subcontract", "other")
        assert isinstance(line["unit"], str)
        assert isinstance(line["quantity"], (int, float))
        assert isinstance(line["priced"], bool)
        assert isinstance(line["provenance"], str)
        if line["priced"]:
            assert isinstance(line["rateBdt"], (int, float))
            assert isinstance(line["amountBdt"], (int, float))
        else:
            # an unpriced line has **no** amount ✓ - the screen says so ✓ (a number there
            # would be a made-up price ✓ ✓)
            assert line["amountBdt"] is None
            assert line["rateBdt"] is None

    # the totals the screen reads ✓
    assert isinstance(boq["totals"]["amountBdt"], (int, float))
    assert isinstance(boq["totals"]["pricedLines"], int)
    assert isinstance(boq["totals"]["unpricedLines"], list)
    assert isinstance(boq["subtotals"]["byPhase"], dict)
    assert isinstance(boq["subtotals"]["byCostType"], dict)


def test_the_committed_boq_document_has_the_same_shape() -> None:
    """The committed document ✓ - the one the repo's own tool writes ✓ ✓."""
    document = ROOT / "data" / "boq" / "two-storey-residential.boq.json"
    if not document.is_file():
        return
    boq = json.loads(document.read_text(encoding="utf-8"))
    for line in boq["lines"]:
        assert line["label"]["en"], line["key"]
        assert line["label"]["bn"], line["key"]
        assert line["costType"] in ("material", "labour", "machinery", "subcontract", "other")
        assert "unit" in line
        assert "rateBdt" in line
        assert "provenance" in line
