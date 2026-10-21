# ADR-0042 — The BOQ is priced from the spec, and a deviation is flagged on its line

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.5
**Code:** `core/src/archres_core/documents/boq.py` · `tools/documents/render_boq.py` ·
`core/tests/test_documents_boq.py`
**Spec:** `docs/spec/boq-final-v0.md`
**Depends on:** W2.6, W2.7, W3.4 · plan §2.5, §6, §9

## Context

The plan's money document: "**BOQ final** - per phase + single phase-divided page; xlsx/PDF;
deviation notes" (§6 ✓). The BOQ has been data since W2.6 ✓, the prices have been live since
W2.7 ✓, and W3.4 delivered the two writers ✓.

Two things were undecided: what the document must say beyond the numbers ✓, and — the one this
package actually had to answer — **which prices the document uses** ✓.

## Decisions

1. **The BOQ is priced from the spec's pricing block**, not from the card the example was
   written with ✓. The first build of this package priced the document from the card ✓ while
   the register carried an **override** ✓ — so the document held the old rate on the line ✓ and
   the new one in the register ✓: the document contradicted itself ✓. A price service that moves
   a rate must move it everywhere ✓, or the BOQ is a lie ✓.
2. **A deviation is flagged on the line it prices.** The register's entries (the rule deviations ✓
   from W1.2 ✓ and the `cost_risk` price deviations ✓ from W2.7 ✓) are matched to the BOQ's lines
   by the **rate key** ✓ — the price override's id *is* `price-<rate key>` ✓ — and the line's note
   says so ✓ ("deviation-flagged line notes where relevant" ✓, plan §6 ✓). A line nobody flags
   is a line nobody reviews ✓.
3. **The card's identity travels with the document.** Which price list priced it ✓, that list's
   status ✓ (**candidate** ✓) ✓, its source ✓ and its effective date ✓ — a BOQ without its
   price source is a number without a source ✓.
4. **The document is the data.** Every number is the BOQ's own ✓ — the quantities ✓, the rates ✓,
   the amounts ✓, the totals ✓ — never recomputed by the renderer ✓, so the arithmetic stays
   re-derivable from the document ✓ (W2.6's check ✓).
5. **The unpriced lines stay visible.** The v0 card has no formwork rate ✓, so those lines
   carry no amount ✓ and are listed ✓ — a complete-looking BOQ would be a wrong one ✓.
6. **The PDF is the printable form and the workbook the editable one** ✓ — the same split as
   the BBS ✓ (ADR-0040 ✓), with the same writers ✓.

## Consequences

- The BOQ final exists in the two forms the plan names ✓: a workbook (six sheets ✓)
  and a PDF (five pages ✓ — the title block ✓, one per phase ✓, the totals ✓).
- The measured document is **156,594.30 BDT** ✓ (the price override applied ✓ — the
  un-overridden BOQ is 154,276.09 ✓), 9 priced lines ✓, 2 unpriced ✓, and 2 deviations ✓ with
  the price one flagged on the cement lines ✓.
- A price service's change now reaches the document ✓ — the contradiction the package found
  cannot come back ✓.
- What is still missing is named ✓: a priced formwork rate ✓, the Bangla report ✓ (the
  browser's ✓), the live cost meter ✓ (W3.8 ✓) and the engineer pack ✓ (W3.7 ✓).
