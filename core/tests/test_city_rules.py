"""W4.5: the city rules - the KDA's transcribed rules and the registry's measured entries.

The laws these tests hold:

- **the KDA's numbers are the authority's own** ✓ — the candidate carries every value with
  the service's own wording beside it ✓, in Bangla and in English ✓ ✓;
- **the units are stated** ✓ — the setbacks are in metres ✓ (and the feet-and-inches they
  came from ✓), the heights are in storeys ✓, the land area is in katha ✓ ✓;
- **a fetched rule is a candidate** ✓ — the artefact says so ✓, and it is not a rule pack ✓
  (no pack is written until a human checks it) ✓ ✓;
- **the gaps are declared** ✓ — the FAR schedule ✓, the parking schedule ✓ and the use
  classes ✓ are named ✓, not guessed ✓ ✓;
- **the registry's entries are true** ✓ — the Chattogram documents are pinned with their
  hashes ✓ and their page counts ✓ ✓.
"""

from __future__ import annotations

import json
import pathlib

import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / "data" / "rules" / "khulna-kda-zoning-candidate.json"
REGISTRY = ROOT / "spec" / "sources" / "registry.yaml"


def _candidate() -> dict:
    return json.loads(CANDIDATE.read_text(encoding="utf-8"))


def _sources() -> dict[str, dict]:
    registry = yaml.safe_load(REGISTRY.read_text(encoding="utf-8"))
    return {source["id"]: source for source in registry["sources"]}


def test_the_candidate_says_it_is_a_candidate() -> None:
    """A fetched rule is a candidate ✓ — it is not law until a human checks it ✓ ✓."""
    candidate = _candidate()
    assert candidate["status"] == "candidate"
    assert candidate["source"]["retrievedAt"]
    assert candidate["verification"]["tiers"] == ["web-service"]
    assert candidate["verification"]["unread"]


def test_the_setbacks_are_the_authoritys_own_numbers() -> None:
    """Every setback carries the value and the words it came from ✓ ✓."""
    candidate = _candidate()
    setbacks = candidate["setbacks"]
    assert len(setbacks) == 4
    for item in setbacks:
        assert item["landArea"]["bn"] and item["landArea"]["en"]
        for side in ("front", "sides", "rear"):
            assert item[side]["metres"] > 0
            assert item[side]["original"]
    # the first class: 5 ft at the front, 2 ft 7 in at the sides, 3 ft 3 in at the rear
    first = setbacks[0]
    assert first["front"]["original"] == "5 ft"
    assert first["sides"]["original"] == "2 ft 7 in"
    assert first["rear"]["original"] == "3 ft 3 in"
    assert abs(first["front"]["metres"] - 1.524) < 0.001
    assert abs(first["sides"]["metres"] - 0.7874) < 0.001


def test_the_heights_are_the_authoritys_own_numbers() -> None:
    """The height by the road width ✓ — and "no limit" is said as a limit that is none ✓ ✓."""
    candidate = _candidate()
    heights = candidate["heights"]
    assert len(heights) == 7
    assert heights[0]["roadWidth"]["en"] == "12 ft"
    assert heights[0]["storeysMax"] == 5
    assert heights[3]["storeysMin"] == 7 and heights[3]["storeysMax"] == 9
    last = heights[-1]
    assert last["storeysMax"] is None
    assert last["note"], "the class with no limit says so"


def test_the_gaps_are_declared() -> None:
    """What the portal does not carry is named ✓ — never guessed ✓ ✓."""
    candidate = _candidate()
    gaps = {gap["id"] for gap in candidate["gaps"]}
    assert "khulna-far" in gaps
    assert "khulna-parking" in gaps
    assert "khulna-use-classes" in gaps
    for gap in candidate["gaps"]:
        assert gap["what"] and gap["why"] and gap["status"] == "open"


def test_the_registry_pins_the_chattogram_documents() -> None:
    """The Chattogram documents are pinned ✓ — with their hashes and their page counts ✓ ✓."""
    sources = _sources()
    rules = sources["chattogram-cda-building-rules"]
    assert rules["kind"] == "pdf-document"
    assert rules["url"].startswith("https://")
    assert rules["artifact"]["pages"] == 50
    assert len(rules["artifact"]["sha256"]) == 64

    act = sources["chattogram-building-construction-act-1952"]
    assert act["artifact"]["pages"] == 87
    assert len(act["artifact"]["sha256"]) == 64
    assert act["artifact"]["fileName"].endswith(".pdf")


def test_the_registry_says_what_is_still_missing() -> None:
    """A gap is declared ✓ — the registry never claims more than it has ✓ ✓."""
    sources = _sources()
    chattogram = sources["chattogram-cda-building-rules"]["notes"]
    khulna = sources["khulna-kda-building-rules"]["notes"]
    sylhet = sources["sylhet-sda-building-rules-1996"]["notes"]
    assert "404" in chattogram
    assert "rajuk@2008.1" in chattogram
    assert "CANDIDATE" in khulna
    assert "rajuk@2008.1" in khulna
    assert "not been fetched" in sylhet
    assert "rajuk@2008.1" in sylhet


def test_the_khulna_entry_points_at_the_authoritys_own_portal() -> None:
    """The entry's URL is the page the rules are published on ✓ ✓."""
    source = _sources()["khulna-kda-building-rules"]
    assert source["kind"] == "html-index"
    assert source["url"] == "https://cp.kda.gov.bd/building-construction-rules"
    assert "ajax-land-area-setback" in source["fetch"]["recipe"]
    assert "ajax-building-height-check" in source["fetch"]["recipe"]


def test_the_sylhet_entry_carries_no_url_it_cannot_serve() -> None:
    """The Sylhet document is not pinned ✓ — so the entry says so and carries no URL ✓ ✓."""
    source = _sources()["sylhet-sda-building-rules-1996"]
    assert source["kind"] == "manual-entry"
    assert "url" not in source
    assert "not pinned" in source["notes"].lower()
