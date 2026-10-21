"""The BOQ, through the channel the app uses - and the money law it carries."""

from __future__ import annotations

import json
import pathlib

from archres_core.bridge import Bridge
from archres_core.spec import SpecStore

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXAMPLE = ROOT / "spec" / "examples" / "two-storey-residential.json"


def _project(root: pathlib.Path) -> pathlib.Path:
    spec = json.loads(EXAMPLE.read_text(encoding="utf-8"))
    folder = root / "mirpur"
    SpecStore.create(folder, spec, note="created")
    return folder


def test_the_boq_is_built_from_the_project(tmp_path: pathlib.Path) -> None:
    project = _project(tmp_path)
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "boq.build", "params": {"project": str(project)}}
    )
    result = reply["result"]
    boq = result["boq"]
    assert boq["lines"], "the BOQ has lines"
    # the arithmetic holds ✓ - the total is the sum of the priced lines ✓
    priced = [line for line in boq["lines"] if line["priced"]]
    total = round(sum(line["amountBdt"] for line in priced), 2)
    assert boq["totals"]["amountBdt"] == total


def test_the_card_the_money_came_from_is_named(tmp_path: pathlib.Path) -> None:
    """The money law: a candidate card says so ✓ - the app shows it ✓."""
    project = _project(tmp_path)
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "boq.build", "params": {"project": str(project)}}
    )
    priced_from = reply["result"]["pricedFrom"]
    assert priced_from["cardId"]
    assert priced_from["status"]
    assert priced_from["region"]


def test_a_project_that_cannot_be_read_is_refused(tmp_path: pathlib.Path) -> None:
    reply = Bridge(root=ROOT).handle(
        {"id": "1", "method": "boq.build", "params": {"project": str(tmp_path / "nothing")}}
    )
    assert reply["error"]["code"] == "invalid_params"


def test_the_boq_needs_a_project() -> None:
    reply = Bridge(root=ROOT).handle({"id": "1", "method": "boq.build", "params": {}})
    assert reply["error"]["code"] == "invalid_params"
