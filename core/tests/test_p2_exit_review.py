"""The P2 exit review's headline numbers must stay true (plan §9: no stale claims).

`docs/work/P2-EXIT-REVIEW.md` quotes measured numbers to the owner. A number that drifts out of
the committed artefacts is a false claim in the phase's closing document, so the ones that can
be recomputed are recomputed here: the walking skeleton's end state, the mesh, the federation,
the scale-out, the equivalence gate, the price service and the branded engine. If a later
round changes a number, this test fails and the review has to be updated with it.
"""

from __future__ import annotations

import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
GENERATED = ROOT / "data" / "cad" / "generated"
REVIEW = ROOT / "docs" / "work" / "P2-EXIT-REVIEW.md"


def _json(path: pathlib.Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_the_review_quotes_the_walking_skeletons_end_state() -> None:
    report = _json(ROOT / "data" / "walking-skeleton" / "two-storey-residential.json")
    assert report["ok"] is True
    assert report["model"]["objects"] == 15
    assert report["model"]["volumeM3"] == 12.36375
    assert report["boq"]["totalBdt"] == 154_276.09
    assert report["boq"]["sumOfLinesBdt"] == 154_276.09
    assert len(report["boq"]["unpriced"]) == 2
    assert report["steel"]["scheduledKg"] == 278.9998
    assert report["steel"]["measuredKg"] == 278.785
    # the chain's MEP stage (ADR-0051): the points, the circuits and the schedules
    mep = report["mep"]
    assert mep["points"] == 22
    assert mep["circuits"] == 1
    assert mep["scheduleRows"] == 11
    assert mep["loadW"] == 720.0


def test_the_review_quotes_the_meshes_numbers() -> None:
    mesh = _json(GENERATED / "two-storey-residential.mesh.json")
    assert len(mesh["objects"]) == 15
    triangles = sum(len(item["indices"]) for item in mesh["objects"]) // 3
    assert triangles == 180


def test_the_review_quotes_the_federations_numbers() -> None:
    report = _json(GENERATED / "federation" / "master-report.json")
    assert report["ok"] is True
    assert report["summary"]["links"] == 15
    assert report["summary"]["objects"] == 15
    assert report["summary"]["volumeM3"] == 12.36375
    assert report["masterBytes"] == 10438


def test_the_review_quotes_the_scale_outs_numbers() -> None:
    report = _json(GENERATED / "commons-report.json")
    assert report["ok"] is True
    assert report["objects"] == 28
    assert report["triangles"] == 1800


def test_the_review_quotes_the_equivalence_gate() -> None:
    report = _json(GENERATED / "equivalence-report.json")
    assert report["ok"] is True
    assert report["identical"] is True
    assert report["rebuilt"] == ["floor-1"]
    assert report["reused"] == ["foundation"]


def test_the_review_quotes_the_price_services_numbers() -> None:
    registry = _json(ROOT / "data" / "prices" / "registry.json")
    cards = {card["cardId"]: card for card in registry["cards"]}
    # The placeholder the phase closed with, and the official card transcribed since.
    assert "dhaka-example-2026-10" in cards
    assert cards["dhaka-example-2026-10"]["lines"] == 8
    assert "pwd-sor-2022-civil-works" in cards
    assert cards["pwd-sor-2022-civil-works"]["status"] == "candidate"
    assert len(registry["skipped"]) == 4

    # The BOQ priced from the resolved card must equal the BOQ priced from the card.
    from archres_core.design import (
        build_boq,
        design_foundation,
        design_rebar,
        design_takeoff,
        design_typical_floor,
    )
    from archres_core.pricing import pricing_block, resolve_card

    spec = _json(ROOT / "spec" / "examples" / "two-storey-residential.json")
    foundation = design_foundation(spec)
    floor = design_typical_floor(spec, foundation, storey_index=1)
    rebar = design_rebar(spec, foundation, floor)
    takeoff = design_takeoff(spec, foundation, floor, rebar)
    card = _json(ROOT / "spec" / "examples" / "interfaces" / "rate-card-dhaka-example.json")
    from_card = build_boq(takeoff, card)
    from_service = build_boq(takeoff, pricing_block(resolve_card(card, "dhaka")))
    assert from_card["totals"]["amountBdt"] == 154_276.09
    assert from_service["totals"]["amountBdt"] == from_card["totals"]["amountBdt"]


def test_the_review_quotes_the_branded_engine() -> None:
    report = _json(GENERATED / "boot-report.json")
    assert report["ok"] is True
    branding = report["branding"]
    assert branding["title"] == "NativeCAD"
    assert branding["engineNameOnTitle"] is False
    assert branding["themeApplied"] is True
    assert branding["iconApplied"] is True
    assert len(branding["hiddenBrandActions"]) == 4
    assert branding["visibleBrandActions"] == []
    assert branding["actionsTotal"] == 559
    assert report["mode"]["mode"] == "embedded"


def test_the_review_text_carries_the_numbers_it_claims() -> None:
    """The review must say what the artefacts say - a stale sentence is a false claim."""
    text = REVIEW.read_text(encoding="utf-8")
    for needle in (
        "154,276.09 BDT",
        "12.36375 m³",
        "15 objects, 180 triangles",
        "28 objects, 1,800 triangles",
        "1,048 tests",
        '"NativeCAD"',
        "4 brand actions hidden out of 559",
    ):
        assert needle in text, needle
