# ADR-0028 — The BOQ measures first and prices second, and a unit mismatch never prices

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.6
**Code:** `core/src/archres_core/design/boq.py` · `tools/boq/build_boq.py`
**Schema:** `spec/schemas/boq.schema.json` · **Spec:** `docs/spec/boq-v0.md`
**Depends on:** W2.2, W2.3, W2.4, W0.9 (the rate-card interface) · plan §6

## Context

The plan's BOQ is xlsx + PDF, divided by phase, with the cost types (material / labour /
machinery / subcontract / others), machinery rate cards with operator/fuel inclusion flags,
deviation-flagged line notes and live prices. That is P3's rendering; the *data* underneath is
W2.6.

Two things make the data non-trivial. First, the **quantities** must come from the design —
the concrete the engine measured, the steel the BBS scheduled, the excavation the foundation
declared — because a BOQ whose quantities are estimates is a guess with a total at the bottom.
Second, the **prices** must come from the frozen rate-card interface (W0.9) with its region,
date, source and status, because a price without a source is not a price.

And the first build showed the trap that sits between them: a *quantity in one unit priced with
a rate in another*. The excavation was measured in cubic metres and multiplied by the
excavator's hourly rate: 293.9 m³ × 2,800 BDT/hour = 822,899 BDT, 94 % of the BOQ, for a
number that means nothing.

## Decisions

1. **Two stages, never mixed.** The *takeoff* measures quantities and says where each came from;
   the *pricing* applies a card's rates. A price never enters the takeoff, and a quantity never
   enters the card.
2. **A rate in another unit never prices a line.** If the card's rate is per hour and the line
   is measured per cubic metre, the line stays in the document **unpriced and visible**, with the
   mismatch in its note. The excavation line is therefore measured in **hours** (the volume at an
   assumed productivity), and the arithmetic in the document is re-derivable by hand.
3. **A line the card cannot price stays visible.** The formwork lines have no rate in the v0
   card; they are in the document with a null amount, listed in `totals.unpricedLines`, and the
   document says so. A missing price is a visible gap, never a zero and never a dropped line.
4. **Every line carries its provenance and its rate key.** `derived` (the design measured it) or
   `assumed` (the v0 mix and productivity — the pack has no mix or productivity rule), plus the
   rate key it priced itself from.
5. **The rate card's status travels with the document.** A `candidate` card means the prices are
   not a quotation, and the rendered document says exactly that. The BOQ never launders an
   unverified price list into a total.
6. **The BOQ is a frozen interface.** `spec/schemas/boq.schema.json` is generated into the
   Python and TypeScript interfaces like every other contract, so the P3 renderers read the
   same document the app checks.
7. **The document's own numbers must add up.** `tools/boq/build_boq.py --check` re-derives
   every amount from the line's quantity and rate, re-adds the subtotals and the grand total,
   validates the document against the schema, and refuses a stale or inconsistent BOQ. The
   committed example is the artefact CI checks.

## Consequences

- The BOQ is reproducible from the spec and the card, and every number in it can be traced to a
  measurement, an assumption or a rate line.
- A wrong unit can no longer hide behind a plausible total; the check that caught the excavation
  line now runs on every build.
- Unpriced work is visible instead of invisible, which is what an engineer needs to see before
  a BOQ goes out.
- The renderers (xlsx/PDF), the live price service (W2.7) and the register's deviation notes
  are the next layers over the same document; none of them needs the data model to change.
- v0's mix, productivity and formwork rates are authored assumptions; a real project replaces
  them with the engineer's or the card's numbers, and the line's provenance says which is which.
