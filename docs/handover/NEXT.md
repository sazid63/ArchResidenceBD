# Where the work stands (read this first in a clean session)

Branch `v3`, all commits local; **never `git push` unless the owner types an explicit push request in that session.**
Owner rules: no full `npm run verify` until all phases are done (targeted `npx vitest run <path>` and `npx tsc --noEmit` only); pick defaults and keep building; ≤ 5-line replies.

## Done
M0, M1, M2-1..M2-5 (M2-3 only 5 of 8 extra plans), M3-1 BNBC pack, M3-2 RAJUK evaluators + setbacks, M3-3 Compliance screen. See `TICKETS.md` for hashes.

- **Rule packs:** `spec/rules/rajuk-2008.yaml` is `frozen`: the owner (a civil engineer) read it and confirmed it correct; no government-engineer review is wanted now. `spec/rules/bnbc-2020.yaml` is still `candidate` (the owner has not said the same for it: ask before changing).
- **`src/rules/`:** `engine.ts` (exact ports of the Python evaluators), `pack.ts` (loads YAML via `?raw`), `setbacks.ts` (RAJUK setbacks in mm), `check.ts` (`check(model, {roadWidthM})`), `report.ts` (`buildReport(project)` used by the screen), `deviations.ts` (register helpers). Tests: `rules.test.ts`, `report.test.ts`.
- `deriveBuilding` and `planChoices` default to RAJUK setbacks; the picker takes `storeys` so it matches the model (above 10 storeys or 33 m larger setbacks apply). `DEFAULT_SETBACKS_MM` is legacy, kept for tests.
- Compliance screen: tabs All / Fails / Passes / Not checked; sections RAJUK, plan, fire, accessibility; deviation register stored in `BuildingProject.deviations`. Old `src/cad/codeCompliance.ts` deleted.

## Next
No fixed order (owner, 2026-11-09). Remaining tickets in TICKETS.md: M4-1, M4-2, M4-3, M5-1, M5-2, M6-1, M6-2, M7-1, DS-1, plus the 3 missing M2-3 plans. Do what the owner names; if nothing is named, ask which one. No mandatory code-review gate.

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
