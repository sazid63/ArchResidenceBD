"""W5.7: the converter and the templates, through the channel the app uses."""

from __future__ import annotations

import pathlib

from archres_core.bridge import Bridge

ROOT = pathlib.Path(__file__).resolve().parents[2]


def _bridge() -> Bridge:
    return Bridge(root=ROOT)


def _convert(**params) -> dict:
    reply = _bridge().handle({"id": "1", "method": "units.convert", "params": params})
    return reply


def test_five_katha_is_the_pinned_area() -> None:
    """The module's pin: 5 katha -> 334.45 m2."""
    reply = _convert(value=5, **{"from": "katha", "to": "sqm"})
    result = reply["result"]
    assert result["kind"] == "area"
    assert result["value"].startswith("334.45")
    assert result["from"] == "katha"
    assert result["to"] == "sqm"


def test_a_bigha_is_fourteen_thousand_four_hundred_square_feet() -> None:
    reply = _convert(value=1, **{"from": "bigha", "to": "sqft"})
    assert reply["result"]["value"].startswith("14400")


def test_feet_and_metres_are_lengths() -> None:
    reply = _convert(value=10, **{"from": "ft", "to": "m"})
    assert reply["result"]["kind"] == "length"
    assert reply["result"]["value"].startswith("3.048")


def test_an_area_and_a_length_are_refused() -> None:
    """They are not the same kind of thing - a number would be a lie."""
    reply = _convert(value=5, **{"from": "katha", "to": "ft"})
    assert reply["error"]["code"] == "invalid_params"
    assert "not the same kind of thing" in reply["error"]["message"]


def test_an_unknown_unit_is_refused() -> None:
    reply = _convert(value=5, **{"from": "banana", "to": "sqm"})
    assert reply["error"]["code"] == "invalid_params"
    assert "unknown unit" in reply["error"]["message"]


def test_a_missing_argument_is_refused() -> None:
    assert _convert(value=5, **{"from": "katha"})["error"]["code"] == "invalid_params"
    assert _convert(**{"from": "katha", "to": "sqm"})["error"]["code"] == "invalid_params"


def test_the_templates_are_the_repos_own_examples() -> None:
    reply = _bridge().handle({"id": "1", "method": "templates.list", "params": {}})
    rows = reply["result"]["templates"]
    assert rows
    ids = {row["id"] for row in rows}
    assert "two-storey-residential" in ids
    for row in rows:
        assert row["path"].startswith("spec/examples/")
        assert row["name"]
