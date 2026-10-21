# ADR-0036 — The compliance reports render the pack's own Bangla, and the register shows the price tier

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.6
**Code:** `core/src/archres_core/compliance/report.py` · `tools/compliance/render_reports.py`
**Spec:** `docs/spec/compliance-reports-v0.md`
**Depends on:** W1.2 (the verdict set, the register sync), W2.7 (the price service) ·
plan §3, §5.6, §6, §9

## Context

P2 closed with the engine, the generators, the prices and the workspace. P3's first deliverable
in the "money and trust" half is the pair of documents the plan lists under the per-project
deliverables: "**Compliance audit + Deviation Register** (compliant items with citations /
deviations with rule, risk tier, acknowledgment, timestamp)".

The engine already produces the verdict set (W1.2) and the spec already carries the register —
but they are *data*, and the plan's deliverable is something a person reads. Two things were
undecided: what the report must **not** hide, and how the Bangla gets into it.

## Decisions

1. **The audit's gaps are a section, not an absence.** The pack declares 12 gaps (four of them
   subject-level since the RAG amendment, ADR-0003) and the engine reports what it could not
   evaluate (the missing inputs too). The report lists all of it under "not evaluated", so a
   reader sees a short compliant list *and* a long list of what was not checked — never a clean
   sheet that hides both (plan §9).
2. **The pack's identity travels with the report.** Its id, its **sha256**, its status (the v0
   pack is a *candidate* — engineer validation pending), the spec's revision and hash, the
   evaluation time and the evaluator. A compliance report without the rules' identity is a
   claim about nothing.
3. **The Bangla is the pack's own text.** The verdict's title and summary already carry
   hand-authored Bangla; the report renders them and adds hand-written Bangla headings. Nothing
   is machine-translated (plan §3) — and the *same* HTML is the input the app prints to PDF
   (plan §6: "Bangla reports via HTML→print-PDF for correct glyph shaping"), so the glyphs have
   one rendering path ✓.
4. **The numbers are in Bangla numerals.** The report writes its counts, its revision and its
   timestamps the way a Bengali engineer reads them. This is also the first real input for the
   rendering regression the plan's §9 asks for (W3.9) ✓.
5. **The register shows both kinds of deviation.** The engine's entries (synced from the verdict
   set) sit beside the user's **price override** with the `cost_risk` tier (W2.7's) — a cost
   deviation is not an approval risk, and a register that could not say so would be lying.
6. **The committed reports are byte-stable.** The evaluation time and the provenance stamp are
   fixed, and the tool's `--check` proves the freshness in CI. A report that changes on every
   run cannot be reviewed in a diff.
7. **The demo project is one the engine can judge.** The example project carries no phase design
   data, so every rule comes back "not evaluated" — a true report, but a thin one. The demo
   therefore carries the design inputs a v0 compliance run needs (the same set the rule
   engine's own test uses), so the audit shows compliant rows and deviations and the register
   shows both entries.

## Consequences

- The two documents the plan promises exist, in two renderings, with a CI check ✓ — and the
  first Bangla PDF's *input* exists ✓ (the print itself is the shell's ✓).
- A reader can tell exactly which rules, which version of the rules and which project the
  report is about ✓, and can see what was **not** checked ✓.
- The price override reaches the same register as a rule deviation, with a tier that means what
  it says ✓.
- W3.9's regression now has real Bangla to watch: the pack's titles, the pack's summaries, the
  hand-written headings and the Bangla numerals ✓.
- The PDF, the xlsx, the engineer pack and the project bundle remain W3.5, W3.7 and the shell's
  print ✓ — declared, not implied ✓.
