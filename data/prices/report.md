# Price service v0 — the example project

- Project: `7c9e6f10-2a3b-4c5d-9e8f-1a2b3c4d5e6f` (Dhaka, 2 storeys)
- Card: `dhaka-example-2026-10` — region **dhaka**, status **candidate**, effective from 2026-10-01
- Source: Illustrative example card (structure demo) (manual)

## The card registry

| Card | Region | Status | From | Lines | File |
|---|---|---|---|---:|---|
| `dhaka-example-2026-10` | dhaka | candidate | 2026-10-01 | 8 | `spec/examples/interfaces/rate-card-dhaka-example.json` |
| `pwd-sor-2022-civil-works` | dhaka | candidate | 2023-02-23 | 9 | `data/prices/cards/pwd-sor-2022-civil-works-candidate.json` |

Files that are not rate cards (skipped, reported):

- `spec/examples/interfaces/job-request-geometry.json` — not a rate card
- `spec/examples/interfaces/job-result-drawing.json` — not a rate card
- `spec/examples/interfaces/job-result-error.json` — not a rate card
- `spec/examples/interfaces/verdict-set-example.json` — not a rate card

## The resolved rates (the card resolved for this project's region)

| Key | Type | Unit | Card rate | Multiplier | How | Resolved |
|---|---|---|---:|---:|---|---:|
| `cement-opc-43` | material | bag | 550.00 | 1 | own-region | 550.00 |
| `rod-60g` | material | ton | 89,000.00 | 1 | own-region | 89,000.00 |
| `sand-fine` | material | cft | 42.00 | 1 | own-region | 42.00 |
| `brick-1st` | material | each | 12.00 | 1 | own-region | 12.00 |
| `mason` | labour | day | 950.00 | 1 | own-region | 950.00 |
| `mixer-diesel` | machinery | day | 3,500.00 | 1 | own-region | 3,500.00 |
| `excavator` | machinery | hour | 2,800.00 | 1 | own-region | 2,800.00 |
| `piling-450` | subcontract | per_pile | 42,000.00 | 1 | own-region | 42,000.00 |

## The same card for another region (the multiplier law on real numbers)

| Key | Card rate | Chattogram multiplier | Resolved |
|---|---:|---:|---:|
| `cement-opc-43` | 550.00 | 1.06 (published) | 583.00 |
| `rod-60g` | 89,000.00 | 1.06 (published) | 94,340.00 |
| `sand-fine` | 42.00 | 1.06 (published) | 44.52 |
| `brick-1st` | 12.00 | 1.06 (published) | 12.72 |
| `mason` | 950.00 | 1.06 (published) | 1,007.00 |
| `mixer-diesel` | 3,500.00 | 1.06 (published) | 3,710.00 |
| `excavator` | 2,800.00 | 1.06 (published) | 2,968.00 |
| `piling-450` | 42,000.00 | 1.06 (published) | 44,520.00 |

A region the card publishes no multiplier for (rajshahi, here) is priced at 1.00 and marked `source: default` — an assumed regional rate says so instead of pretending.

## The pricing pushed into the spec

- `/pricing.source`: `default`
- `/pricing.card`: `dhaka-example-2026-10` (dhaka, candidate)
- The spec's own provenance entry for `/pricing`: `default` — price service: card dhaka-example-2026-10 (dhaka, candidate)

## The BOQ those prices produce (the cross-check)

- **154,276.09 BDT** (9 priced, 2 unpriced)
- The committed BOQ (built straight from the card) totals the same: **154,276.09 BDT** — the service resolved the card, it did not move a price.

## What this service does not do (declared, not implied)

- The card in the repository is an **illustrative candidate** (its own note says "never use for a BOQ"). Nothing here is a real market price.
- No official list has been fetched from the network yet: the Source Registry's price sources (BBS, PWD, BWDB) were not reachable from the build machine (see `docs/spec/source-registry-v0.md`). The fetch path is implemented and tested against a local server, not against a real list.
- A region the card publishes no multiplier for is priced at 1.00 and says so (`source: default`). A price that pretends to be regional is worse than a missing one.
- The BOQ's xlsx/PDF renderers, the price-update scheduling and the consent UI are P3's and the app's (W2.8).
