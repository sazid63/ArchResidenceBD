# Price service v0 (W2.7)

**Status:** v0.1.0 — the cards the app knows, the rates resolved for the project's region, the
prices pushed into the Building Spec, the user's own rate registered, and the official-list
fetch that has to be asked for first.
**Code:** `core/src/archres_core/pricing.py` (the registry, the resolution, the pricing block, the
override, the parsers, the fetch) · `tools/pricing/price_service.py` (build/check + the commands) ·
`core/tests/test_pricing.py` (26 tests) · **Artefacts:** `data/prices/` ·
**Decision record:** ADR-0030
**Depends on:** W0.9 (the rate-card interface) · W0.10 (the Source Registry) · W1.3 (the spec
engine) · W2.6 (the BOQ) · **Plan:** §3 (live prices, official lists) · §5.10 (Source Registry &
Smart Fetch) · §6 (machinery rate cards, regional multipliers, live prices) · §2.1 (overrides are
registered) · §9 (unverified content is a candidate)

## What it is

The BOQ (W2.6) prices from **one card read from a file**. The price service is what makes the
prices live: it knows the cards, resolves one for the project's region, and writes the result
into the Building Spec, where the app and the BOQ read it.

```text
rate cards (a directory) ─▶ CardRegistry ─▶ resolve_card(card, region) ─┬─▶ the BOQ's card
                                                                       ├─▶ the spec's /pricing
                                                                       └─▶ the override register
official list ─(consent)─▶ fetch ─▶ parse ─▶ candidate card ─▶ (a human marks it active)
```

## The four laws

1. **The card's identity travels with the price.** Every priced artefact says which list, which
   region, which effective date and which verification state it used. The spec's `/pricing` block
   carries a `card` object (cardId, region, status, effectiveFrom, source) for exactly this
   reason, and the BOQ's `rateCard` block does the same.
2. **A regional multiplier is either published or assumed — never silent.** The card's own region
   is 1.0 by definition; a region the card publishes a factor for gets that factor (a line's own
   multiplier beats the card's); a region it does not gets **1.00 with the assumption written on
   the line** (`source: default`, "no regional multiplier published - 1.00 assumed"). A price that
   pretends to be regional when it is not is the worst kind of wrong.
3. **A fetched list enters as a candidate.** The fetch needs the user's consent (the Source
   Registry's fetch law), the artifact is hashed and recorded in the cache manifest, and the card
   that comes out says `candidate` until a human marks it active.
4. **A price override is registered, never silent.** The user's rate lands in `/pricing` with
   `source: user` and a note naming the card rate it replaced, and the difference is recorded in
   the **Deviation Register** with the reason, the acknowledgement and the nearest compliant
   alternative (the card's rate, which is what the one-click restore puts back).

## The district → region bridge

A card is a region's price level; a project is a district's site. `region_for_district` maps
"Dhaka" → `dhaka`, "Chittagong" → `chattogram` (both spellings), and the eight regions the
rate-card interface names. **A district the service does not know is an error**, not a silent
"Dhaka": pricing a Sylhet project with Dhaka prices because the table had no Sylhet row would be
a false number.

## The machinery rules

The card's machinery law is the inclusion flags and the minimum billable time: the excavator's
rate is per hour, includes the operator, does not include fuel, and has a **minimum of 2 h per
mobilization**. The BOQ bills the measured hours, or the minimum when the minimum is higher —
and the line's note says which and why ("1.05 hour measured; billed at the card's minimum 2 hour
per mobilization (one mobilization assumed)"). A minimum stated in hours is **not** applied to a
per-day rate: that is a unit error, and the note says the minimum was not applied.

## The measured output (2026-10-21, `two-storey-residential`)

`data/prices/` — the registry, the resolved card, the priced spec and the report
(`data/prices/report.md`):

- **The registry** holds one card: `dhaka-example-2026-10` (dhaka, `candidate`, from
  2026-10-01, 8 lines, source `manual`). The four other JSON files in the interface folder are
  not cards; they are **skipped and reported**, not silently ignored.
- **The resolution** for Dhaka is the card's own region: every rate unchanged (cement 550.00
  BDT/bag, rod 89,000.00 BDT/ton, mason 950.00 BDT/day, excavator 2,800.00 BDT/hour).
- **The same card for Chattogram** applies the card's published 1.06: cement 583.00, rod
  94,340.00, mason 1,007.00, excavator 2,968.00. For **Rajshahi** (no published multiplier) the
  rates are the card's own and the entry is marked `source: default` — the assumption is on the
  line.
- **The priced spec** (`data/prices/spec/two-storey-residential.priced.json`) carries the
  `/pricing` block and the spec's own provenance entry for it
  (`source: default` — "price service: card dhaka-example-2026-10 (dhaka, candidate)").
- **The cross-check:** the BOQ built from the resolved card and the BOQ built straight from the
  card both total **119,599.70 BDT** (9 priced, 2 unpriced) — the service resolved the card, it
  did not move a price.

## The official-list path (fetch → parse → candidate card)

`fetch` goes through the Source Registry, never by a blind search (plan §5.10):

- **Consent first.** Without it the call raises `ConsentRequired` and nothing is fetched.
- **The parse recipe is data, not code.** It says which column holds the key, the unit, the rate
  and the labels (`csv` or `json`). A row without a usable key, a usable rate or a **reviewed
  label** is skipped and **reported** — the recipe's report lists every skipped row and why.
- **Bangla is never invented.** A line needs both labels: from the list's own columns, from a
  hand-written `labelMap`, or from the recipe's defaults. A row that has only one language is not
  a rate line yet, and the fetch says so.
- **The card that comes out is a `candidate`** with the artifact's URL, retrieval date and
  sha256 in its source, and the sha256 also in the source cache manifest (the provenance chain's
  first hop).

The path is proved against a **local HTTP server** in the test suite (26 tests, no network). No
official list has been fetched from the real sources yet — BBS, PWD and BWDB did not resolve from
the build machine (`docs/spec/source-registry-v0.md`).

## What is deliberately not here

- **A real price list.** The only card in the repository is the illustrative example (its own
  note: "never use for a BOQ"). Nothing in this package is a market price.
- **The price update schedule and the consent UI** — the app's job (W2.8) and P3's.
- **The xlsx/PDF BOQ renderers** (P3) and the **Bangla reports** (P3).
- **A price per district from a real survey** — the service resolves a card's published
  multipliers; it does not invent a district price level.
- **A formwork rate** — the v0 card has none, so those BOQ lines stay measured and unpriced
  (W2.6's law).

## Checks

```powershell
uv run --directory core pytest -q tests/test_pricing.py                  # 26 tests
uv run --directory core python ../tools/pricing/price_service.py --check  # the artefacts are fresh
uv run --directory core python ../tools/pricing/price_service.py registry # what the app knows
```
