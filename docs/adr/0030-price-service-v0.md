# ADR-0030 — The price service resolves a card for the project's region, and a price override is registered

**Date:** 2026-10-21 · **Status:** accepted · **Work package:** W2.7
**Code:** `core/src/archres_core/pricing.py` · `tools/pricing/price_service.py`
**Schema:** `spec/schemas/building-spec.schema.json` (two additive changes, below) ·
**Spec:** `docs/spec/price-service-v0.md`
**Depends on:** W0.9 (the rate-card interface), W0.10 (the Source Registry), W1.3 (the spec
engine), W2.6 (the BOQ) · plan §3, §5.10, §6, §2.1, §9

## Context

The BOQ (W2.6) prices from one card read from a file. The plan wants **live prices** (§6) from
**official lists** (§3, §5.10), with **regional multipliers** and **machinery rate cards**, and
it says where the overrides go: "the price service pushes card values into the Building Spec's
inline pricing … where per-project overrides then live in the Deviation Register as usual" (the
rate-card interface's own description, W0.9).

Three things were undecided when this package started, and each of them is a place where a
plausible shortcut is a lie:

1. **A card is a region's price level; a project is a district's site.** What connects them, and
   what happens when the connection is missing?
2. **A card publishes multipliers for some regions and not for others.** What does a rate become
   in a region the card says nothing about?
3. **A user overrides a rate.** Where is that recorded, and how is it told apart from a
   compliance deviation? The Deviation Register's risk tiers are `cosmetic` / `approval_risk` /
   `structural_attention` — a price override is none of them: it is not cosmetic (it moves the
   project's money) and it is not a compliance risk (it does not touch the building or its
   approval).

## Decisions

1. **The district is the bridge, and a missing one is an error.** `region_for_district` maps the
   eight regions the rate-card interface names (with "Chittagong" and "Chattogram" both landing on
   `chattogram`). A district the service does not know raises: pricing a Sylhet project with
   Dhaka prices because the table had no Sylhet row would be a false number.
2. **A regional multiplier is published or assumed — never silent.** The card's own region is 1.0
   by definition; a published factor is applied (a line's own multiplier beats the card's); a
   region with no factor is priced at 1.0 and the entry is marked `source: default` with the
   assumption in its note. The alternative — treating a missing factor as 1.0 without saying so —
   produces a number that reads as regional and is not.
3. **The card's identity travels with the price.** The spec's `/pricing` block gained a `card`
   object (cardId, region, status, effectiveFrom, source) and the BOQ's `rateCard` block says the
   same thing. A price that cannot name its list, its region and its verification state is not a
   price.
4. **A fetched list enters as a candidate, and only with consent.** The fetch goes through the
   Source Registry (never a blind search), the artifact is hashed and recorded in the cache
   manifest, and the card that comes out is `candidate` until a human marks it active. The parse
   recipe is data, not code, and a row without a usable key, a usable rate or a **reviewed label**
   is skipped and reported — Bangla is never machine-written.
5. **A price override is registered, not applied silently.** The user's rate lands in `/pricing`
   with `source: user` and a note naming the card rate it replaced; the difference goes into the
   **Deviation Register** with the reason, the acknowledgement and the nearest compliant
   alternative (the card's rate, which the one-click restore puts back). The entry's id starts
   with `price-`, so the compliance engine's sync — which owns the `dev-` entries — never
   removes it.
6. **The risk tier enum grew a `cost_risk` value** (the Building Spec's `Deviation.riskTier`).
   Marking a price override `cosmetic` would understate it and `approval_risk` would be false.
   This is the only way the register can say what it means. The document format did not change
   (the schema's `schemaVersion` stays `0.1.0`): the enum grew, nothing moved, and the committed
   examples still validate.
7. **A machinery minimum is honoured, and the unit is checked.** The card's "minimum 2 h per
   mobilization" is applied to an **hourly** rate (the billed quantity is the minimum and the
   line's note says why); against a per-day rate the minimum is **not** applied and the note says
   the unit does not match.
8. **The BOQ reads a card or the spec's pricing block.** The same call prices the takeoff from
   either, so the app can price from what the spec carries. The cross-check is in the artefacts:
   the BOQ from the resolved card and the BOQ from the card total the same **119,599.70 BDT**.

## Consequences

- The BOQ is no longer tied to a file: the app resolves the card for the project's district,
  writes the prices into the spec, and the BOQ reads them there.
- A regional price that is really a base price says so on the line instead of pretending.
- A price override is visible in the same place an engineer already looks for deviations, with a
  tier that means what it says.
- The card registry reports what it skipped, so a card file that is not a card cannot quietly
  disappear, and a card file that is *broken* is an error rather than a silent absence.
- The two additive schema changes (`Deviation.riskTier` += `cost_risk`; `Pricing` += `card` and
  `notes`; `MachineryRate` += `minimumChargeHours`) regenerate the Python and TypeScript models;
  no existing document changed shape.
- No real price list has been fetched: BBS, PWD and BWDB did not resolve from the build machine.
  The fetch path is proved against a local server, and the first human-verified card is still to
  come (an owner item).
