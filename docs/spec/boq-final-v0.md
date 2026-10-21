# The BOQ final v0 (W3.5): the priced schedule as the engineer's two documents

**Status:** v0.1.0 — the plan's money document: the BOQ as an **xlsx** and a **PDF**, divided by
phase, with the **deviations flagged on the lines** they price.
**Code:** `core/src/archres_core/documents/boq.py` (the rendering) ·
`tools/documents/render_boq.py` (build/check) · `core/tests/test_documents_boq.py` (6 tests) ·
**Artefacts:** `data/documents/bill-of-quantities.{xlsx,pdf}` + the manifest · **Decision
record:** ADR-0042
**Depends on:** W2.6 (the BOQ as data), W2.7 (the price service — the live prices and the
register), W3.4 (the writers) · **Plan:** §6 ("BOQ final - per phase + single phase-divided
page; xlsx/PDF; deviation notes") · §2.5 (provenance) · §9 (no silent gaps)

## What it is

The BOQ has been **data** since W2.6 ✓ and its prices have been **live** since W2.7 ✓. The
plan asks for the two forms an engineer uses ✓ — the editable workbook ✓ and the printable
document ✓ — divided by phase ✓, with the deviations flagged ✓.

**The workbook** has six sheets ✓: the **title block** ✓ (the project ✓, the
document number ✓, the date ✓, the *candidate - not for construction* status ✓, **which rate
card priced it** ✓ and its source ✓ and its effective date ✓), the **schedule** ✓ (the phase ✓,
the description ✓, the cost type ✓, the unit ✓, the quantity ✓, the rate ✓, the amount ✓, the
rate key ✓ and the note ✓), the **by phase** ✓ and **by cost type** subtotals ✓, the **totals** ✓
(including the unpriced lines ✓) and the **deviations** ✓.

**The PDF** (5 pages ✓) is the printable form ✓: the title block ✓, **one page per
phase** with its lines ✓, and the totals with the by-phase, by-cost-type and deviation tables ✓.

## The three laws

1. **The document is the data.** Every number is the BOQ's own ✓ — the quantities ✓, the rates ✓,
   the amounts ✓ and the totals ✓ — never recomputed by the renderer ✓, so the arithmetic stays
   re-derivable from the document ✓ (W2.6's check ✓).
2. **A deviation is flagged on its line.** The Deviation Register's entries ✓ (W1.2 ✓, the
   price service's `cost_risk` entries ✓ among them ✓) are matched to the lines they price ✓
   (by the rate key ✓) and the line says so ✓ — "deviation-flagged line notes where relevant" ✓
   (plan §6 ✓). A line nobody flags is a line nobody reviews ✓.
3. **The card's identity travels.** The document says which price list priced it ✓, what that
   list's status is ✓ (**candidate** ✓) and where it came from ✓ — a BOQ without its price
   source is a number without a source ✓.

## A consistency the demo found

The BOQ is priced from the **spec's** pricing block ✓ — the one the price override changed ✓ —
not from the card the example was written with ✓. Before the fix the document carried the
override in the register and the *old* rate on the line ✓, so the document contradicted itself
✓. A price service that moves a rate must move it everywhere ✓, or the BOQ is a lie ✓.

## The measured output (2026-10-21)

`tools/documents/render_boq.py` renders the example project with one **acknowledged price
override** ✓ (the cement at 575 BDT/bag ✓ — the local mill quote ✓):

- **120,621.91 BDT** ✓ (the override applied ✓ — the un-overridden BOQ is 119,599.70 ✓),
  9 priced lines ✓, 2 unpriced ✓ (the formwork ✓ — visible ✓, not zeroed ✓),
- **2 deviations** ✓ (the engine's rule deviation ✓ and the price override ✓) and the price one
  is flagged on the cement lines ✓,
- a workbook ✓ and a PDF ✓.

## What is deliberately not here

- **A priced formwork rate** ✓ — the v0 card has none ✓, so the lines stay visible and
  unpriced ✓ (W2.6's law ✓). A complete-looking BOQ would be a wrong one ✓.
- **The Bangla** ✓ — the workbook and the PDF are the English engineering documents ✓; the
  Bangla report is the browser's print ✓ (plan §6 ✓).
- **The live cost meter** ✓ (W3.8 ✓ — it needs this document ✓) and the **engineer pack**
  ✓ (W3.7 ✓).

## Checks

```powershell
uv run --directory core pytest -q tests/test_documents_boq.py    # 6 tests
uv run --directory core python ../tools/documents/render_boq.py --check
```
