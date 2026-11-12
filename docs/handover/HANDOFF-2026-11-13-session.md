# Handoff: v3 BOQ and walkthrough fixes (2026-11-13)

Read this first, then `NEXT.md`. Branch `v3`, HEAD `d864797`, **5 commits ahead of origin, NOT pushed.**
Never `git push` unless the owner asks in that session.

## State
- `npm run verify` passes: 75 files, 1,634 tests. One fast-check test (`src/validation/crosscheck.test.ts`, pad footing) failed once and passed on rerun; treat as possibly flaky.
- Working tree: only CRLF noise (`git diff --ignore-cr-at-eol` is empty for everything except committed work). Do not `git add` whole folders.
- Golden (`spec/reference/golden.json`) moved only in `boqCsv` hashes in the last three commits (BOQ text and prices). Regenerate with `UPDATE_GOLDEN=1 npx vitest run src/validation/golden.test.ts` and say which figures moved.

## Commits since the repo tidy (oldest first)
| Commit | What |
|---|---|
| 30abf76 | Untrack test output, logs, stray screenshot; ignore `scripts/tests/audit-out/` and `*.log` |
| bc9bb67 | Parking storey asks no per-unit questions (`floor-usage != parking` in `spec/flows/phase-flow-book.yaml`); "Yes"/"No" match choices with a comma label; 3D concrete = BOQ structural concrete (`structuralConcreteM3` on mesh); BOQ steel text; phase chat saves once per revision (StrictMode guard); 3D workspace one column below 900 px |
| 8834dc1 | Removed unused `rebar-grade` question; design basis = Grade 420 (fy 420 MPa) |
| 558fa91 | Web-sourced rates added to the card, each marked ASSUMPTION: floor tile, paint, waterproofing, manual excavation (PWD RSoR 2022 Zone A upper value, from a search summary), backfill, door, window, lift, lean concrete (derived from card cement/sand/stone) |
| 12266a9 | Removed "no rate" wording from lines that now have a rate |
| d864797 | Mason Tk 940/day (2021 urban wage board, was SoR 700); helper Tk 800/day (2025 daily-labour policy); electrical Tk 3,122/m² and plumbing Tk 3,767/m² of floor (benchmarks, low confidence) under new BOQ category `services` |

Sample "Sample block (4 storeys)" priced total: 2.82 crore (was 0.93 at start). Benchmark check: web guides give Tk 2,500–3,500/sq ft all-in for standard Dhaka builds; sample is about Tk 3,850/sq ft of floor on a partial BOQ, so it may run high.

## Open items (in priority order)
1. **Owner decision: push v3** (5 commits).
2. **Verify rates against an official source.** Most new rates come from blogs and supplier pages (see `source` notes on each line in `spec/rates/pwd-sor-2022-civil-works-candidate.json`). The PWD SoR 2022 PDF was not readable: fetching produced binary only, and installing a PDF reader was denied. Excavation rate 512 is from a search summary. Helper rate Tk 800 is the most influential single number.
3. **Unpriced:** balcony railing (no per-running-foot rate found), septic tank and soak well, water tanks, pump, drainage. Lift shaft and pit work is not in the lift rate.
4. **Structure/BOQ:** lintel concrete (~0.95 m³) is in 3D but not in BOQ concrete; accepted as <0.5%.
5. **Banner:** the "changed in another tab" banner fix is a StrictMode guard in `src/screens/PhaseChatScreen.tsx`. Trigger was inferred, not reproduced before the fix.
6. **Card status:** `pwd-sor-2022-civil-works-candidate.json` is still `candidate` and marked not verified; the card now mixes SoR and web lines. Owner should decide whether to rename or split it.
7. **Paint area** (`src/quantities/takeoff.ts`, paint line) uses plaster area plus floor area, which may include parapet and stair rings. Not checked.
8. **Stale claim:** an "Input Router" helper summary said `takeoff.ts` had a syntax error near lines 199–200. `tsc --noEmit` and all tests pass, so it is not real. Verify with `npx tsc --noEmit` before believing any such note.

## Decisions the owner already made (keep)
- No AI. Dhaka only. Windows and web. Monsoon indigo tokens. Original plans only.
- Simple UI: no new inputs or options unless asked; common-practice values for open decisions.
- Cite regulations or mark "assumption". Integer mm. UI text EN and BN.
- Ask before changing candidate rule pack values (`spec/rules/bnbc-2020*.yaml`).

## Useful commands
- Unit tests for one area: `npx vitest run src/quantities` (or `src/interview`, `src/model`).
- Typecheck: `npx tsc --noEmit`. Full: `npm run verify`.
- Browser walkthrough: `preview_start` with name `vite` (port 5199). "Open sample" button creates the sample project; `#/boq` shows the BOQ.
- Interview free text: typed answers must match a choice label or value; for chat questions, read the page first, since question order varies.
