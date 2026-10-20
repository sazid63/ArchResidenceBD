# BOQ v0 (W2.6)

**Status:** v0.1.0 — the quantities we measured, priced from a rate card, with the arithmetic
checkable by hand.
**Code:** `core/src/archres_core/design/boq.py` (the takeoff, the pricing, the markdown) ·
`tools/boq/build_boq.py` (build/check) · `core/tests/test_design_boq.py` (6 tests) ·
**Schema:** `spec/schemas/boq.schema.json` (W2.6, generated into the Python/TS interfaces like
every other contract) · **Decision record:** ADR-0028
**Depends on:** W2.2 (the foundation), W2.3 (the floor), W2.4 (the BBS), W0.9 (the rate-card
interface) · **Plan:** §6 (BOQ: per phase, four cost types, subtotals + grand total, live prices,
deviation-flagged notes) · §9 (no silent gaps)

## What it is

The BOQ is **data**; the xlsx and PDF renderers are P3's job. This package produces the
document those renderers will read:

- **The takeoff** — the quantities, measured from the design: the concrete (the footings' and the
  floor's volumes), the steel (the BBS's scheduled weight), the excavation (the declared prism),
  the formwork (the contact areas), and the labour and machinery **in the card's own units**
  (days, hours).
- **The pricing** — the rates come from the frozen rate-card interface (W0.9). A line whose rate
  is missing, **or whose rate is in another unit**, stays in the document *unpriced and visible*.
- **The grouping** — per phase (site-excavation / foundation / floor) and per cost type
  (material / labour / machinery / subcontract / other), with the subtotals and the grand total.
- **The provenance** — every line says where its quantity came from (`derived` from the design,
  `assumed` for the v0 mix and productivity) and which rate key priced it. The rate card's id,
  region, date and source travel with the document.

## The example BOQ (2026-10-21, `two-storey-residential`)

`data/boq/two-storey-residential.boq.{json,md}` — 11 lines, **119,599.70 BDT**, 9 priced and
2 unpriced (the formwork, because the v0 card has no formwork rate):

| Phase | Line | Type | Qty | Unit | Rate BDT | Amount BDT |
|---|---|---|---:|---|---:|---:|
| site-excavation | Excavation (machinery) | machinery | 24.491 | hour | 2,800.00 | 68,574.80 |
| foundation | Cement | material | 21.060 | bag | 550.00 | 11,583.00 |
| floor | Cement | material | 19.828 | bag | 550.00 | 10,905.45 |
| floor | Steel reinforcement | material | 0.279 | ton | 89,000.00 | 24,831.00 |
| foundation | Mason | labour | 1.123 | day | 950.00 | 1,067.04 |
| foundation | Concrete mixer | machinery | 0.351 | day | 3,500.00 | 1,228.50 |
| foundation / floor | Formwork | other | 5.760 / 17.190 | sqm | — | **unpriced** |

The document says the rate card is a **candidate** ("not a quotation") — the example card's own
status is `candidate`, and the BOQ does not hide it.

## The bug the arithmetic caught

The first build priced the excavation as a **volume** with the excavator's **hourly** rate: 293.9
m³ × 2,800 BDT/hour = 822,899 BDT, i.e. 94 % of the BOQ for a number that means nothing. Two
rules now prevent it: the excavation line is measured in **hours** (the volume at an assumed
12 m³/hour), and **a rate in another unit never prices a line** — the line stays visible and
unpriced, with the mismatch in its note. The BOQ's own check re-derives every amount from the
document's own numbers.

## What is deliberately not here

- **The xlsx/PDF renderers** (P3) and the **price service** (W2.7): v0 prices from one card,
  read from a file. A *candidate* card is never used silently.
- **A structural mix, a productivity figure or a formwork rate from the pack** — the pack has
  none, so these are authored assumptions and every line that uses one says so.
- **Subcontract lines**: v0's foundation is isolated footings, so nothing is subcontracted; the
  cost type exists in the model and is simply unused (the plan's piling-as-subcontract rule
  applies when there are piles).
- **Deviation-flagged notes from the register**: the Deviation Register (W1.2) is the source, and
  W2.6 does not yet read it.

## Checks

```powershell
uv run --directory core pytest -q tests/test_design_boq.py    # the takeoff, the pricing, the schema
uv run --directory core python ../tools/boq/build_boq.py --check   # the committed BOQ is fresh and adds up
```
