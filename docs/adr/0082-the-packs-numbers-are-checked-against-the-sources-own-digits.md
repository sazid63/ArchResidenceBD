# ADR-0082 — The pack's numbers are checked against the source's own digits, and a gap is never a disagreement

**Date:** 2026-10-22 · **Status:** accepted · **Work package:** W4.5 (the city packs — the
repo's half) · W4.7 (the reader) · **Plan:** §5.10 (the source registry: a value carries its
source) · §9 (the quality gates: unverified content is a candidate) · **Related:** ADR-0081
(the reader reads the gazette), ADR-0080 (a gap is not a crash), ADR-0003 (the rule packs),
ADR-0079 (the city rules are what the authority publishes)
**Code:** `tools/rules/gazette/check_far.py` (the check) ·
`core/src/archres_core/pdf_text.py` (the reader that makes it possible) ·
**Tests:** `core/tests/test_far_check.py` (4) ·
**Spec:** `docs/spec/city-rules-v0.md` · `tools/rules/gazette/README.md` (the recipe)

## Context

The repo's **only** rule pack — the RAJUK 2008 pack, the one every city falls back to — was
transcribed **by eye from the gazette's rendered pages** ✓ (the recipe in
`tools/rules/gazette/README.md` ✓), because the gazette's text layer was unreadable ✓: its
Bangla letters are in a legacy font encoding ✓ ✓, and the reader could not read the layer at
all ✓ (ADR-0081 ✓ ✓).

But the layer's **digits are plain** ✓ ✓, and now the reader reads the layer ✓ ✓. So the
pack's numbers — the FAR and the MGC of every class, every plot size, every road width ✓ ✓ —
can be checked **against the source's own digits** ✓ ✓, by script ✓, with no rendering and
no human ✓ ✓.

## Decisions

1. **The pack's numbers are checked against the source's own digits** — the check reads the
   gazette's text layer ✓ and compares every row of the pack's **FAR** tables ✓ and its
   **setback** table ✓ with the numbers it finds ✓ ✓
   (`tools/rules/gazette/check_far.py` ✓).
2. **A second, independent copy checks the same rows** — the Chattogram CDA publishes the
   same schedule in its own copy of the Building Construction Act 1952 ✓ ✓, and the pack was
   transcribed from **neither** ✓ ✓ — so the rows are checked against two copies ✓ ✓. The
   CDA prints the schedule on **its own** pages ✓ ✓, and the page each table is on is
   **read from the document** ✓ ✓ — by the **Latin class labels** its text carries ✓ ✓ (A1-A4
   ✓, A5 ✓, B1 ✓, B2 ✓, C1-C4 ✓, D1-D2 ✓, E1-E6 ✓, F1 ✓, F2-F5 ✓, G1-K2 ✓ ✓) — so the map
   is never assumed ✓ ✓.
3. **A row no document carries is a gap, never a disagreement** — the check reports it as
   *not checked* ✓ ✓ and does not claim the row agrees ✓ ✓ (ADR-0080 ✓ ✓: a gap to declare,
   not a fault to raise ✓ ✓). A **disagreement** — a document that carries a row the pack
   says differently — is a real fault ✓ and fails the check ✓ ✓.
4. **The check does not transcribe** ✓ — it checks ✓ ✓. The pack's Bangla labels and its
   footnotes are still a human's read of the rendered pages ✓ ✓ (the recipe's own method ✓
   ✓, ADR-0003 ✓ ✓); what the text layer adds is a **second, independent witness** for the
   numbers ✓ ✓ — and the numbers are what the money and the zoning turn on ✓ ✓.

## Consequences

- **The pack's tables are now machine-verified against the source** — **152** FAR rows
  confirmed by the gazette's own digits ✓ ✓ and **143** by the CDA's own copy ✓ ✓, and the
  **setback** table's **16** rows confirmed by the gazette ✓ ✓ — **311 checks, none
  disagreeing** ✓ ✓, and **13 rows unchecked** ✓ ✓ (the rows the text layers do not carry ✓
  ✓ — a gap ✓ ✓, declared ✓ ✓).
- **The check runs in a second** ✓ ✓ (no rendering ✓, no model ✓, no network ✓) — so it can
  be run whenever the pack is touched ✓ ✓ (and it is a **test** ✓ — `core/tests/test_far_check.py`
  ✓ ✓ — so a change to the pack's numbers that the source does not carry is caught ✓ ✓).
- **What is deliberately not here** — **the pack's own labels and footnotes** ✓ (a human's
  read of the rendered pages ✓ ✓), and **the other tables** ✓ — the **parking** schedule ✓
  and the **use** classes ✓. The parking schedule's rows are named by their **use** ✓ (a
  single-family house ✓, a school ✓, a hospital ✓ ✓), and the uses are in the mangled
  Bangla ✓ ✓ — so a row's **numbers** alone do not say **which** row it is ✓ ✓, and a
  numeric check would be a guess ✓ ✓. So it is **not** checked ✓ ✓, and that is declared
  here rather than faked ✓ ✓ — the same law as a gap anywhere else ✓ ✓ (ADR-0080 ✓ ✓).
