"""RAJUK rule pack v0 - schema, ledger and recompute guards (W0.5a, plan §5.6).

The pack `spec/rules/rajuk-2008.yaml` is data, not code: these tests keep it honest.
They validate it against the RulePack JSON Schema, guard the counts that encode the
open-items ledger (anti-silent-drop), resolve every citation against the scan's
page-map invariant, and independently recompute every test vector with the same
evaluator semantics the rule engine will use (bands are (from, to]; prohibited FAR
rows match by plot area only; 'NR' is a valid FAR; parking is an exact-rational
ceiling with a minSpaces floor).

The last group enforces the project quality law (plan §9): no glitch residue in
Bangla text, no silent coverage gaps, and - once the renderer exists - a fresh
rendered doc.
"""

from __future__ import annotations

import json
import math
import pathlib
import re
import subprocess
import sys
from fractions import Fraction

import pytest
import yaml
from jsonschema import Draft202012Validator

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACK_PATH = ROOT / "spec" / "rules" / "rajuk-2008.yaml"
SCHEMA_PATH = ROOT / "spec" / "schemas" / "rule-pack.schema.json"
CANDIDATES_PATH = ROOT / "spec" / "rules" / "rajuk-2008-candidates.md"
RENDERER_PATH = ROOT / "tools" / "rules" / "render_pack.py"

# This scan's page map: printed gazette page = PDF page + 2997.
PAGE_OFFSET = 2997

# Anti-silent-drop sentinels (W0.5a gate): exact where the count is exact, a floor
# where the pack may legitimately grow.
OPEN_ITEMS_SENTINEL = 12
PROVISIONS_SENTINEL = 23
TEST_VECTORS_FLOOR = 45

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CANDIDATE_HEADING_PATTERN = re.compile(r"^## (C\d+):", re.M)
LEGACY_FONT_RESIDUE = re.compile(r"[A-Za-z][_^]")

REQUIRED_COLLECTIONS = (
    "useClasses",
    "citations",
    "farTables",
    "provisions",
    "testVectors",
    "gaps",
)


@pytest.fixture(scope="module")
def pack_text() -> str:
    return PACK_PATH.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def pack(pack_text: str) -> dict:
    return yaml.safe_load(pack_text)


@pytest.fixture(scope="module")
def rule_schema() -> dict:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def candidates_text() -> str:
    return CANDIDATES_PATH.read_text(encoding="utf-8")


# --- helpers -----------------------------------------------------------------


def _walk(node: object, path: str = "$"):
    """Yield (path, node) for every dict in the loaded pack, depth first."""
    if isinstance(node, dict):
        yield path, node
        for key, value in node.items():
            yield from _walk(value, f"{path}/{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _walk(value, f"{path}[{index}]")


def _used_cites(pack: dict):
    """Yield (path, cite-key) for every `cite` reference anywhere in the pack."""
    for path, node in _walk(pack):
        cite = node.get("cite")
        if isinstance(cite, str):
            yield path, cite


def _first_integer(text: str) -> int | None:
    """First integer appearing in a page string ('3049-3050' -> 3049)."""
    match = re.search(r"\d+", text)
    return int(match.group(0)) if match else None


def _band_matches(area: float, row: dict) -> bool:
    """Plot-area band semantics: (areaSqmFrom or 0) < area <= (areaSqmTo or +inf)."""
    low = row.get("areaSqmFrom") or 0
    high = row.get("areaSqmTo")
    return low < area and (high is None or area <= high)


# --- evaluators (same semantics as the engine spec) ---------------------------


def _eval_far(pack: dict, given: dict) -> dict:
    """Row selection, in order: (a) prohibited rows, matched by plot area only (the
    road width is ignored - prohibition is an area rule); (b) anyPlot rows at the
    exact given road width; (c) banded rows at the exact given road width."""
    class_id = given.get("classId")
    table = next((t for t in pack["farTables"] if t["classId"] == class_id), None)
    if table is None:
        return {"error": f"no farTables entry with classId {class_id!r}"}
    area = given.get("areaSqm")
    road = given.get("roadWidthM")
    if not isinstance(area, (int, float)) or not isinstance(road, (int, float)):
        return {"error": f"vector needs numeric areaSqm and roadWidthM: {given!r}"}
    rows = table["rows"]
    for row in rows:
        if row.get("prohibited") and _band_matches(area, row):
            return {"prohibited": True, "footnotes": row.get("footnotes", [])}
    for row in rows:
        if row.get("anyPlot") and row["roadWidthM"] == road:
            return {
                "far": row["far"],
                "mgcPercent": row["mgcPercent"],
                "footnotes": row.get("footnotes", []),
            }
    for row in rows:
        if (
            not row.get("prohibited")
            and not row.get("anyPlot")
            and row["roadWidthM"] == road
            and _band_matches(area, row)
        ):
            return {
                "far": row["far"],
                "mgcPercent": row["mgcPercent"],
                "footnotes": row.get("footnotes", []),
            }
    return {
        "error": f"no farTables row matches classId {class_id!r}, areaSqm {area!r}, roadWidthM {road!r}"
    }


def _eval_setback(pack: dict, given: dict) -> dict:
    """Above 33 m height or 10 storeys the beyondHeight set applies; otherwise the
    banded (areaSqmFrom, areaSqmTo] row."""
    if (given.get("heightM") or 0) > 33 or (given.get("storeys") or 0) > 10:
        beyond = pack["setbackTable"]["beyondHeight"]
        return {"frontM": beyond["frontM"], "rearM": beyond["rearM"], "sideM": beyond["sideM"]}
    area = given.get("areaSqm")
    if not isinstance(area, (int, float)):
        return {"error": f"vector needs a numeric areaSqm: {given!r}"}
    for row in pack["setbackTable"]["rows"]:
        if _band_matches(area, row):
            return {"frontM": row["frontM"], "rearM": row["rearM"], "sideM": row["sideM"]}
    return {"error": f"no setbackTable row matches areaSqm {area!r}"}


def _eval_parking(pack: dict, given: dict) -> dict:
    """spaces = max(minSpaces or 0, ceil(units * numerator / denominator)), the ceil
    computed over exact rationals (Schedule 4's fraction note: a leftover fraction
    costs one more space)."""
    row = next((r for r in pack["parkingSchedule"]["rows"] if r["id"] == given.get("rowId")), None)
    if row is None:
        return {"error": f"no parkingSchedule row with id {given.get('rowId')!r}"}
    units = given.get("units", 1)
    demanded = Fraction(units * row["spaces"]["numerator"], row["spaces"]["denominator"])
    spaces = math.ceil(demanded)
    return {"spaces": max(row.get("minSpaces") or 0, spaces)}


_EVALUATORS = {"far": _eval_far, "setback": _eval_setback, "parking": _eval_parking}


def _compare_vector(pack: dict, vector: dict) -> list[str]:
    """Recompute one vector; return human-readable failures (empty = passed)."""
    vector_id = vector["id"]
    evaluator = _EVALUATORS.get(vector["kind"])
    if evaluator is None:
        return [f"{vector_id}: unknown vector kind {vector['kind']!r}"]
    got = evaluator(pack, vector["given"])
    if "error" in got:
        return [f"{vector_id}: evaluator found no answer - {got['error']} (given {vector['given']!r})"]
    failures = []
    for key, expected in vector["expect"].items():
        actual = got.get(key)
        if key == "footnotes":
            if sorted(actual or []) != sorted(expected):
                failures.append(
                    f"{vector_id}: footnotes {actual!r} != expected {expected!r} (full answer {got!r})"
                )
        elif actual != expected:
            failures.append(
                f"{vector_id}: {key} = {actual!r}, expected {expected!r} (full answer {got!r})"
            )
    return failures


def _assert_vectors(pack: dict, kind: str) -> None:
    vectors = [v for v in pack["testVectors"] if v["kind"] == kind]
    assert vectors, f"the pack must carry {kind!r} test vectors"
    failures = [message for vector in vectors for message in _compare_vector(pack, vector)]
    assert not failures, "test vector recompute failed:\n  " + "\n  ".join(failures)


# --- schema, counts, ledger ---------------------------------------------------


def test_pack_validates_against_schema(pack: dict, rule_schema: dict) -> None:
    """The pack is data conforming to RulePack schema 0.1.0 (JSON Schema, Draft 2020-12)."""
    errors = sorted(Draft202012Validator(rule_schema).iter_errors(pack), key=lambda e: list(e.path))
    assert not errors, "pack violates rule-pack.schema.json:\n  " + "\n  ".join(
        f"{'/'.join(str(part) for part in error.path) or '$'}: {error.message}" for error in errors
    )


def test_counts_and_open_items_ledger(pack: dict) -> None:
    """Anti-silent-drop guard (plan §9): the ledger counts are exact, not approximate.
    review.openItems must equal the gaps actually listed, and the provision/test-vector
    counts may not shrink silently (a dropped row or vector is a coverage hole)."""
    review = pack["review"]
    assert review["openItems"] == len(pack["gaps"]) == OPEN_ITEMS_SENTINEL, (
        f"review.openItems ({review['openItems']}) must equal len(gaps) ({len(pack['gaps'])}) "
        f"and the W0.5a sentinel ({OPEN_ITEMS_SENTINEL})"
    )
    assert len(pack["provisions"]) == PROVISIONS_SENTINEL, (
        f"expected {PROVISIONS_SENTINEL} provisions, found {len(pack['provisions'])} - "
        "dropping a provision must be a visible, deliberate act"
    )
    assert len(pack["testVectors"]) >= TEST_VECTORS_FLOOR, (
        f"expected at least {TEST_VECTORS_FLOOR} test vectors, found {len(pack['testVectors'])} - "
        "the vector set is the recompute guard for the tables"
    )


def test_required_collections_present_and_nonempty(pack: dict) -> None:
    """The pack's six load-bearing collections exist and carry data; an empty one is a
    silently missing section of the law, not an empty table."""
    missing = [key for key in REQUIRED_COLLECTIONS if not pack.get(key)]
    assert not missing, f"top-level collections missing or empty: {missing}"


def test_ids_are_unique_and_wellformed(pack: dict) -> None:
    """Provision, test-vector and gap ids share one namespace (they are cross-referenced in
    the rendered doc and the candidates ledger) and follow ^[a-z0-9][a-z0-9-]*$."""
    ids = [item["id"] for key in ("provisions", "testVectors", "gaps") for item in pack[key]]
    duplicates = sorted({value for value in ids if ids.count(value) > 1})
    assert not duplicates, f"ids must be unique across provisions, testVectors and gaps: {duplicates}"
    malformed = sorted({value for value in ids if not ID_PATTERN.fullmatch(value)})
    assert not malformed, f"ids must match {ID_PATTERN.pattern}: {malformed}"


# --- citations ----------------------------------------------------------------


def test_every_cite_resolves_to_a_citation(pack: dict) -> None:
    """Every cite used anywhere (provisions, footnotes, farTables, setbackTable,
    parkingSchedule, parkingGeometry and any nested rule) names a key of `citations`;
    page data lives only in the registry, never inline."""
    citations = pack["citations"]
    named = {
        "provisions": [provision["cite"] for provision in pack["provisions"]],
        "footnotes": [footnote["cite"] for footnote in pack["footnotes"]],
        "farTables": [table["cite"] for table in pack["farTables"]],
        "setbackTable": [
            pack["setbackTable"]["cite"],
            pack["setbackTable"]["beyondHeight"]["cite"],
        ],
        "parkingSchedule": [pack["parkingSchedule"]["cite"]],
        "parkingGeometry": [pack["parkingGeometry"]["cite"]]
        + [rule["cite"] for rule in pack["parkingGeometry"]["rules"]],
    }
    missing = {
        f"{collection}[{index}]: cite {cite!r} is not a key of citations"
        for collection, cites in named.items()
        for index, cite in enumerate(cites)
        if cite not in citations
    }
    # Belt and braces: any other `cite` key anywhere in the pack must resolve too.
    missing.update(
        f"{path}: cite {cite!r} is not a key of citations"
        for path, cite in _used_cites(pack)
        if cite not in citations
    )
    assert not missing, "every cite must resolve to a citations entry:\n  " + "\n  ".join(sorted(missing))


def test_citation_page_map_invariant(pack: dict) -> None:
    """For every citation the first integer of gazettePage minus the first integer of
    pdfPage is 2997 (this scan's offset). A wrong offset sends the reader to the wrong
    page of the source of record."""
    bad = []
    for key, citation in pack["citations"].items():
        gazette = _first_integer(citation["gazettePage"])
        pdf = _first_integer(citation["pdfPage"])
        if gazette is None or pdf is None:
            bad.append(
                f"{key}: cannot read an integer page from gazettePage "
                f"{citation['gazettePage']!r} / pdfPage {citation['pdfPage']!r}"
            )
        elif gazette - pdf != PAGE_OFFSET:
            bad.append(f"{key}: gazette {gazette} - pdf {pdf} = {gazette - pdf}, expected {PAGE_OFFSET}")
    assert not bad, "citation page map (gazette = pdf + 2997) broken:\n  " + "\n  ".join(bad)


def test_gap_candidate_refs_match_candidates_file(pack: dict, candidates_text: str) -> None:
    """Every gap points at a '## C<n>:' heading in the companion candidates file, the file
    keeps at least C1..C11, and review.openItemsFile is a real path - the pack and its
    open-items ledger cannot drift apart (plan §9)."""
    headings = CANDIDATE_HEADING_PATTERN.findall(candidates_text)
    assert len(headings) >= 11, (
        f"candidates file must keep at least 11 '## C<n>:' headings, found {len(headings)}: {headings}"
    )
    duplicates = sorted({value for value in headings if headings.count(value) > 1})
    assert not duplicates, f"duplicate candidate headings: {duplicates}"
    missing = [
        f"gap {gap['id']}: no '## {gap['candidateRef']}:' heading in {CANDIDATES_PATH.name}"
        for gap in pack["gaps"]
        if not re.search(rf"^## {re.escape(gap['candidateRef'])}:", candidates_text, re.M)
    ]
    assert not missing, "every gap must be mirrored by a candidates heading:\n  " + "\n  ".join(missing)
    open_items_file = ROOT / pack["review"]["openItemsFile"]
    assert open_items_file.exists(), (
        f"review.openItemsFile {pack['review']['openItemsFile']!r} does not exist under {ROOT}"
    )
    assert open_items_file.resolve() == CANDIDATES_PATH.resolve(), (
        f"this suite checks gap refs against {CANDIDATES_PATH}; review.openItemsFile names "
        f"{pack['review']['openItemsFile']!r} - update the suite constant if the ledger moved"
    )


# --- test-vector recompute ----------------------------------------------------


def test_far_vectors_recompute(pack: dict) -> None:
    """Every kind:far vector recomputes from the class's farTables rows: prohibited rows
    first, matched by the plot-area band only (road width ignored); then anyPlot rows at
    the exact road width; then banded rows at the exact road width. The band is
    (areaSqmFrom or 0, areaSqmTo or +inf]. far may be the literal "NR" (no cap); far and
    mgcPercent compare exactly, footnotes as sorted lists."""
    _assert_vectors(pack, "far")


def test_setback_vectors_recompute(pack: dict) -> None:
    """Every kind:setback vector recomputes: heightM > 33 or storeys > 10 selects
    setbackTable.beyondHeight; otherwise the banded row with the same
    (areaSqmFrom, areaSqmTo] semantics. frontM/rearM/sideM compare exactly."""
    _assert_vectors(pack, "setback")


def test_setback_evaluator_cutoffs_match_declared_applicability(pack: dict) -> None:
    """Extension of the required semantics: the recompute above uses literal cutoffs of
    33 m / 10 storeys, so bind them to the pack's own declared applicability - a revision
    cannot change which side of the cutoff applies without failing here."""
    table = pack["setbackTable"]
    assert table["heightApplicabilityM"] == 33.0, (
        f"setbackTable.heightApplicabilityM {table['heightApplicabilityM']!r} != 33.0, "
        "the cutoff the recompute uses"
    )
    assert table["heightApplicabilityStoreys"] == 10, (
        f"setbackTable.heightApplicabilityStoreys {table['heightApplicabilityStoreys']!r} != 10, "
        "the cutoff the recompute uses"
    )
    assert table["beyondHeight"]["overHeightM"] == 33.0, (
        f"setbackTable.beyondHeight.overHeightM {table['beyondHeight']['overHeightM']!r} != 33.0"
    )
    assert table["beyondHeight"]["overStoreys"] == 10, (
        f"setbackTable.beyondHeight.overStoreys {table['beyondHeight']['overStoreys']!r} != 10"
    )


def test_parking_vectors_recompute(pack: dict) -> None:
    """Every kind:parking vector recomputes from the row named by rowId as
    spaces = max(minSpaces or 0, ceil(units * numerator / denominator)), using
    fractions.Fraction so the ceiling of e.g. 2/3 * 4 is exact, not float noise."""
    _assert_vectors(pack, "parking")


# --- quality law --------------------------------------------------------------


def test_localized_strings_are_complete(pack: dict) -> None:
    """Authoring standard (stricter than the schema): wherever the pack carries a BN/EN
    pair, both sides are non-empty strings - a blank side would be a silent gap in one
    of the two shipped languages."""
    pairs = 0
    bad = []
    for path, node in _walk(pack):
        if "bn" in node and "en" in node:
            pairs += 1
            for lang in ("bn", "en"):
                value = node[lang]
                if not isinstance(value, str) or not value.strip():
                    bad.append(f"{path}/{lang}: {value!r}")
    assert pairs > 0, "no bn/en pairs found - the walk is not seeing the pack"
    assert not bad, "every bn/en pair must have non-empty strings on both sides:\n  " + "\n  ".join(bad)


def test_no_glitch_residue(pack: dict, pack_text: str) -> None:
    """Quality law: the pack carries no extraction residue - no U+FFFD replacement
    characters, no legacy-font ASCII mixed into a Bangla string (the [A-Za-z][_^]
    pattern of the broken font), and none of the sentinels __CONTINUE__/TODO/FIXME in
    the raw text. A legitimate-looking exception here is a finding to report, not a
    test to loosen."""
    assert "\ufffd" not in pack_text, "raw pack text contains U+FFFD replacement characters"
    residue = []
    for path, node in _walk(pack):
        value = node.get("bn")
        if isinstance(value, str) and LEGACY_FONT_RESIDUE.search(value):
            residue.append(f"{path}: 'bn' string matches {LEGACY_FONT_RESIDUE.pattern}: {value[:80]!r}")
    assert not residue, "legacy-font ASCII residue in Bangla text:\n  " + "\n  ".join(residue)
    sentinels = [marker for marker in ("__CONTINUE__", "TODO", "FIXME") if marker in pack_text]
    assert not sentinels, f"raw pack text still carries build sentinels/markers: {sentinels}"


def test_rendered_doc_is_fresh() -> None:
    """The rendered reading doc (docs/rules/rajuk-pack-v0.md) must match the pack, checked
    by running the renderer with --check. The renderer is owned by another work package;
    while it is absent this test skips rather than claim a freshness it cannot see."""
    if not RENDERER_PATH.exists():
        pytest.skip("renderer not yet present")
    result = subprocess.run(
        [sys.executable, str(RENDERER_PATH), "--check"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    assert result.returncode == 0, (
        f"{RENDERER_PATH.relative_to(ROOT)} --check failed with code {result.returncode}; "
        "the rendered doc is stale or the renderer rejects the pack:\n"
        f"--- stdout ---\n{result.stdout}\n--- stderr ---\n{result.stderr}"
    )
