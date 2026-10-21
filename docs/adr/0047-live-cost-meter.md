# ADR-0047 — The cost meter computes from the documents, and the core owns the Bangla numbers

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W3.8 (the live cost meter)
**Code:** `core/src/archres_core/design/cost_meter.py` · `core/src/archres_core/bengali.py` ·
`app/src/screens/BoqScreen.tsx` · `core/tests/test_cost_meter.py` ·
**Spec:** `docs/spec/cost-meter-v0.md`
**Depends on:** W3.5 (the BOQ), W2.7 (the price service), W2.11 (the incremental build) ·
plan §8, §6, §1

## Context

The plan's §8 asks for a **live cost meter**: *"every change shows its ৳ delta (enabled by
incremental BOQ)"* ✓. The board adds the detail that matters here: *"the project's cost moving
as the design changes, **in Bangla numerals**"* ✓.

The ingredients exist ✓ — the BOQ document (W3.5 ✓), the price service (W2.7 ✓) and the
incremental build (W2.11 ✓). What was missing was the *delta* ✓ and a place to show it ✓.

## Decisions

1. **The delta is computed from two BOQ documents, not estimated.** The meter takes the
   document before the change ✓ and the document after ✓, and says what moved ✓ — line by line
   ✓, per phase ✓, and in total ✓ ✓. Every amount re-derives from its own line ✓ (the BOQ's own
   law ✓), and the meter's total is the sum of its lines' deltas ✓.
2. **The scope is the change.** The incremental build says which phases it rebuilt ✓; the meter
   shows those phases' delta ✓ and **names the phases it did not rebuild** ✓ ✓. A meter that
   re-shows the whole bill after every change is not a meter, it is a total ✓ ✓.
3. **A line that moved but carries no price says so.** An unpriced line's amount does not move
   ✓, and the meter says the *quantity* may have ✓ — a flat amount must never pass for "no
   change" ✓ ✓.
4. **The core owns the Bangla numbers, in one place.** `archres_core.bengali` is the one
   implementation ✓ — the digits ✓, the grouping ✓, the taka sign ✓, and the **signed** delta ✓
   (a delta without a sign lies about which way the money moved ✓ ✓). The compliance report had
   its own copy of the digit table ✓; it now uses the shared one ✓ — two copies of one rule is
   how a rule drifts ✓ ✓. The app's screen has its own formatter ✓ (TypeScript and Python
   cannot share one ✓) and follows the same rule ✓ ✓.
5. **The meter is a view, not a document.** The plan's §6 lists no cost-meter document ✓, so
   v0 renders none ✓ — the meter lives on the app's BOQ screen ✓ ✓, next to the bill it
   explains ✓.
6. **The app is still the prototype.** The screen is wired to the mock's "before" quantities ✓;
   the real call comes with the backend ✓ ✓, and the screen is not pretending otherwise ✓.

## Consequences

- The **project's cost moves visibly** ✓ — the total ✓, the change ✓, the before and after ✓,
  and the lines that moved ✓ — in the reader's script ✓ ✓.
- The **delta is auditable** ✓: it comes from two documents ✓, and every line's amount can be
  re-derived by hand ✓ ✓.
- The **core has one Bangla number rule** ✓ ✓, and the compliance report and the meter cannot
  disagree about how a number is written ✓ ✓.
- The meter's test **found a real defect** ✓ — the foundation ignores the spec's footing depth
  ✓ — and that defect is **on the board as its own package** ✓, because the fix moves the
  numbers ✓ and must not be slipped into another package ✓ ✓.
