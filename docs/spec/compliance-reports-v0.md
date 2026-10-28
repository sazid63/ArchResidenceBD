# The compliance reports v0 (W3.6): the audit and the Deviation Register, for a reader

**Status:** v0.1.0 — the rule engine's verdict set and the spec's Deviation Register, rendered
as two reports (markdown for review, HTML for the Bangla print).
**Code:** `core/src/archres_core/compliance/report.py` (the renderers) ·
`tools/compliance/render_reports.py` (render/check) · `core/tests/test_compliance_report.py`
(8 tests) · **Artefacts:** `data/compliance/` (`audit.md`, `audit.bn.html`,
`deviation-register.md`, `deviation-register.bn.html`, `verdict-set.json`) ·
**Decision record:** ADR-0036
**Depends on:** W1.2 (the rule engine, the verdict set, the register sync), W2.7 (the price
service — the `cost_risk` tier) · **Plan:** §6 (the per-project deliverables: "Compliance audit
+ Deviation Register (compliant items with citations / deviations with rule, risk tier,
acknowledgment, timestamp)") · §5.6 (the one-click "restore to compliant") · §9 (no silent gaps)

## What it is

The engine produces the *verdict set* and the spec carries the *Deviation Register*; the plan's
deliverable is the two **reports** a human reads. This package is those reports, in two
renderings each:

- **markdown** — the reviewable text (what a reviewer reads in a diff, what CI can grep);
- **HTML** — the plan's route to a correct Bangla PDF (plan §6: "Bangla reports via HTML→print-PDF
  for correct glyph shaping"), with the font stack the plan names (**Noto Sans Bengali** ✓) and
  the numbers in **Bangla numerals** ✓.

## The three laws

1. **Nothing is dropped.** The audit lists the compliant items *with their citations*, the
   deviations with the rule they left behind, and the pack's own **declared gaps** under "not
   evaluated" — a gap is a gap, never a silent pass (plan §9).
2. **The report says what it is about.** The pack's id, its **sha256**, its status (the v0 pack
   is a *candidate* — engineer validation pending), the spec's revision and hash, the evaluation
   time and the evaluator travel with the report ✓.
3. **The Bangla is the pack's own text.** The verdict's title and summary carry the pack's
   hand-authored Bangla; the report renders them. Nothing is machine-translated ✓ (plan §3).

## The measured output (2026-10-21, the demo project)

`tools/compliance/render_reports.py` renders the reports for a project the engine can judge
(the example project plus the design inputs a v0 compliance run needs — the setbacks, the
planned floor area, the parking spaces), priced with the price service and carrying **one
acknowledged price override** ✓:

- **The audit:** 3 compliant, 3 deviations, 0 impossible and **12 not evaluated** (the pack's
  declared gaps) ✓ — the compliant rows carry their citations ("setbacks, s46-3-4" ✓) and the
  deviations carry the rule, the measured value and the limit ✓.
- **The register:** **4 entries** ✓ — the engine's own deviations (synced from the verdict set ✓)
  and the user's price override, the latter with the **`cost_risk`** tier ✓ and its reason
  ("local mill quote" ✓) and the nearest compliant alternative ("the card rate 550.00 BDT/bag" ✓).
- The reports are **byte-stable** (a fixed evaluation time and a fixed provenance stamp ✓), and
  the tool's `--check` proves it in CI ✓.

## What is deliberately not here

- **The PDF.** The HTML is the input the app's browser prints (plan §6) — the print itself
  belongs to the shell (P5) and to W3.9's regression ✓.
- **The xlsx.** The engine pack and the project bundle are W3.7's ✓.
- **A deviation's *restore* in the report** — the one-click "restore to compliant" is the spec
  engine's (W1.2 ✓); the report names the nearest compliant alternative, which is what a reader
  needs to decide ✓.
- **The engine's brand** — the report names the pack and the rules, never the engine ✓
  (ADR-0004).

## Checks

```powershell
uv run --directory core pytest -q tests/test_compliance_report.py     # 8 tests
uv run --directory core python ../tools/compliance/render_reports.py --check   # the reports are fresh
```
