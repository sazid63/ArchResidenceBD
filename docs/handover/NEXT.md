# Where the work stands (read this first in a clean session)

Branch `v3`, all commits local; **never `git push` unless the owner types an explicit push request in that session.**
Owner rules: no full `npm run verify` until all phases are done (targeted `npx vitest run <path>` and `npx tsc --noEmit` only); pick defaults and keep building; ≤ 5-line replies.

## Done
M0, M1, M2-1..M2-5 (M2-3 only 5 of 8 extra plans), M3-1 BNBC pack, M3-2 RAJUK evaluators + setbacks, M3-3 Compliance screen, M4-1 loads/slabs/beams. See `TICKETS.md` for hashes.

- **Rule packs:** `spec/rules/rajuk-2008.yaml` is `frozen`: the owner (a civil engineer) read it and confirmed it correct; no government-engineer review is wanted now. `spec/rules/bnbc-2020.yaml` is still `candidate` (the owner has not said the same for it: ask before changing).
- **`src/rules/`:** `engine.ts` (exact ports of the Python evaluators), `pack.ts` (loads YAML via `?raw`), `setbacks.ts` (RAJUK setbacks in mm), `check.ts` (`check(model, {roadWidthM})`), `report.ts` (`buildReport(project)` used by the screen), `deviations.ts` (register helpers). Tests: `rules.test.ts`, `report.test.ts`.
- `deriveBuilding` and `planChoices` default to RAJUK setbacks; the picker takes `storeys` so it matches the model (above 10 storeys or 33 m larger setbacks apply). `DEFAULT_SETBACKS_MM` is legacy, kept for tests.
- Compliance screen: tabs All / Fails / Passes / Not checked; sections RAJUK, plan, fire, accessibility; deviation register stored in `BuildingProject.deviations`. Old `src/cad/codeCompliance.ts` deleted.

- **`src/structure/`:** `materials.ts` (constants and the `ASSUMPTIONS` list), `loads.ts`, `section.ts`, `continuousBeam.ts`, `slab.ts` (BNBC coefficient method, Tables 6.6.8-6.6.11), `beam.ts`, `analyze.ts` (`analyzeStructure(model)` -> levels, panels, beam lines, failures). Tests: `structure.test.ts`, `audit.test.ts`, `transcription.test.ts`. `src/rules/bnbc.ts` loads the live-load pack; `src/rules/bnbcStructure.ts` loads `spec/rules/bnbc-2020-structure.yaml`, the Part 6 values transcribed from the gazette on 2026-11-09 (dead loads, Ec, live-load reduction, deflection limits, min thickness, shear and steel minima, coefficient tables, approximate coefficients). Status candidate: the owner has not reviewed it. Cell-by-cell the tables match the page text; only printed typo is Table 6.6.10 Case 9 m=0.55 ('00.063', read 0.063).
- **M4-1 audit fixes (2026-11-09):** unit weights were assumed (brick 19, RC 25): now the gazette's (brick 1.91 kN/m2 per 100 mm, slab 23.6, frame 24.06 with 2 % steel assumed). Slab method was a Rankine-Grashof shortcut: now the gazette coefficient method. Two-way thickness now uses Eq 6.6.5/6.6.6 with alpha_fm of the beams actually sized. Beams get the Sec 2.3.13 live-load reduction and both Table 6.6.2 deflection limits (span/360 live, span/480 after partitions).
- **Still assumptions (see `ASSUMPTIONS`):** fc 20 MPa, 40 mm beam cover, 50 mm screed and 12 mm plaster, discontinuous-edge negative = 1/3 positive (gazette is silent), T-beam flange overhang rule, la/lb taken centre to centre, no roof live-load reduction (Sec 2.3.14 not transcribed).

## Next
No fixed order (owner, 2026-11-09). Remaining tickets in TICKETS.md: M4-2, M4-3, M5-1, M5-2, M6-1, M6-2, M7-1, DS-1, plus the 3 missing M2-3 plans. Do what the owner names; if nothing is named, ask which one. No mandatory code-review gate.

Start prompt for a clean session:
```
Ticket <ID>. Follow CLAUDE.md. Read docs/handover/NEXT.md first. Do only this ticket, run its checks, commit, reply in 5 lines.
```

## Open items and decisions for the owner
- **Plan picker ignores ground coverage.** A plan can fit inside the setbacks yet exceed the table's maximum ground coverage (seen: 71.67 % vs 60 % on a 15 × 25 m plot, road 9 m). The Compliance screen reports it as a fail; the picker still offers the plan. Decide whether the picker should hide or flag such plans.
- **Road width bonus not applied.** `check()` uses the table row (or the area-based row, §51(14)) and does not add the §51(11) road-width bonus: conservative.
- **Parking supply not checked.** Required cars are computed; the model does not lay out stalls. Flat size = sum of room areas (assumption).
- **Fire and accessibility mostly "not checked":** no occupancy class is set for Table 4.3.8; no cited accessibility figures in the packs. Lift rule (above 6 storeys or 20 m) is checked.
- **Plan-validator messages are English only**; titles are bilingual, the detail text is not.
- **M2-3** still needs 3 more plans (5 of 8 done).
- **DAP** land-use is parked ("not checked", user declaration at site entry).
- CI (`verify`, `audit:mesh`, `test:exporters`, `build`) has not run locally since M2; `batch-export.ts` script lost its compliance block when the old checker was deleted.
