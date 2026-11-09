# Where the work stands (read this first in a clean session)

Branch `v3`, all commits local (head `3742fda`); **never `git push` unless the owner types an explicit push request in that session.**
Owner rules: no full `npm run verify` until all phases are done (targeted `npx vitest run <path>`, `npx tsc --noEmit`, `npm run audit:structural` only); pick defaults and keep building; ≤ 5-line replies; no fixed ticket order: do what the owner names, otherwise ask.

## Done
M0, M1, M2-1..M2-5 (M2-3 only 5 of 8 extra plans), M3-1..M3-3 (rule packs, RAJUK evaluators, Compliance screen), **M4-1** loads/slabs/beams, **M4-2** columns/footings/seismic/Structure screen, **M4-3** rebar and BBS. Each of M4-1 and M4-3 was audited and fixed afterwards; hashes in `TICKETS.md`. Last checks (3742fda): `tsc` clean, 556 vitest tests, `npm run audit:structural` 85 checks over 70 cases.

## Next
Remaining in `TICKETS.md`: M5-1 quantities + BOQ, M5-2 drawings + permit package, M6-1, M6-2, M7-1, DS-1, and the 3 missing M2-3 plans.
Start prompt for a clean session:
```
Ticket <ID>. Follow CLAUDE.md. Read docs/handover/NEXT.md first. Do only this ticket, run its checks, commit, reply in 5 lines.
```
M5-1 hints: concrete volumes and steel weights already exist (`buildBbs(...).totals`, `concreteM3` inside `bbs.ts` is not exported yet); rate card source is in the ticket.

## Owner decisions confirmed (2026-11-09)
The owner (a civil engineer) confirmed the structural assumptions as correct: fc' 20 MPa and Grade 420 bars, 40 mm beam cover and 20 mm slab cover, 50 mm screed and 12 mm plaster, 250/125 mm brick walls, frame concrete with 2 % steel (24.06 kN/m3), discontinuous-edge negative moment = 1/3 positive, T-beam flange overhang rule, la/lb centre to centre, no roof live-load reduction, seismic defaults (Dhaka Z 0.20, site class SD, occupancy category II with I = 1.00, special RC moment frames R 8 / Cd 5.5, soil bearing 150 kPa), and the rebar detailing simplifications below. `spec/rules/rajuk-2008.yaml` is `frozen` (owner-read). `spec/rules/bnbc-2020.yaml` and `spec/rules/bnbc-2020-structure.yaml` stay `candidate`: ask before changing their values.

## Map of the engine (all pure TypeScript, all lengths mm unless named)
- `src/plans` plan library, fit, geometry; `src/model` building model, `buildingForProject(project)`.
- `src/rules` RAJUK pack and checks, Compliance report; `bnbc.ts` live loads and combinations; `bnbcStructure.ts` loads `spec/rules/bnbc-2020-structure.yaml` (BNBC Part 6 transcribed from the gazette: dead loads, Ec, live-load reduction, deflection, coefficient tables 6.6.8-6.6.11, seismic Sec 2.5, columns, footings, hooks/development/laps). Digits of the tables were cross-checked against the PDF text in cell order; only printed typo: Table 6.6.10 Case 9 m = 0.55 ("00.063", read 0.063).
- `src/structure`: `materials.ts` (constants and the `ASSUMPTIONS` list shown on the screens), `loads.ts`, `section.ts`, `continuousBeam.ts`, `slab.ts`, `beam.ts`, `tbeam.ts`, `analyze.ts` (`analyzeStructure(model, {siteClass, systemId, allowableBearingKpa})` -> levels, panels, beam lines, `frame`, failures), `seismic.ts`, `column.ts`, `footing.ts`, `frame.ts`, `anchorage.ts`, `barSelect.ts`, `bbs.ts` (`buildBbs(result, model)`).
- Screens: Compliance, **Structure** (route `structure`), **Rebar** (route `rebar`, CSV download). `src/cad/rebarDetailer.ts` is deleted; the rest of `src/cad` (v2 engines) is still used by 3D/BOQ/drawings and is outdated.
- Tests: `src/structure/*.test.ts` (hand-worked examples, property tests, `audit.test.ts` independent statics, `transcription.test.ts`). `npm run audit:structural` = `scripts/audits/structural-sweep.audit.ts` run by vitest (`vitest.audit.config.ts`; the packs load through Vite `?raw`, tsx cannot run them); it is in CI; the report is `scripts/audits/audit-out/structural-sweep.md`.

## Known limits (said on the screens)
- Structure: screening, not final design. Not modelled: torsion, wind, dynamic analysis, shear walls and the lift core, footing moments, stair loads, column tension splices, column tension from overturning beyond the simple lever. Frames of about 10 storeys and up on narrow plans fail drift or stability even with the largest stock column: they need shear walls or deeper beams, which are not added. Gravity column moments = one cycle of moment distribution; seismic column moments use mid-height inflection (0.65 h at the base) and 30 % of the orthogonal direction.
- Rebar: stock bars only (8, 10, 12, 16, 20, 22, 25, 28, 32 mm), no row longer than 12 m (top bars are cut into lapped pieces); bottom beam bars not curtailed; extra top bars stop 0.25 L + max(d, 12 db) from the support; ties 10 mm at 100 mm in the end zones (Sec 8.3 confinement not transcribed); no crossties or corner bars; slab bars assume 250 mm beams; first row of the Sec 8.2.3.2 table for ld; shape codes follow BS 8666 (not in the gazette). Exterior hooks longer than the column are reported as warnings (the 0.7/0.8 factors of Sec 8.2.6.3 are not applied).

## Open items for the owner
- **Plan picker ignores ground coverage.** A plan can fit inside the setbacks yet exceed the table's maximum ground coverage (seen: 71.67 % vs 60 % on a 15 × 25 m plot, road 9 m). The Compliance screen reports it as a fail; the picker still offers the plan.
- **Road width bonus not applied** (§51(11)): conservative. **Parking supply not checked** (stalls are not laid out).
- **Fire and accessibility mostly "not checked":** no occupancy class for Table 4.3.8, no cited accessibility figures. **DAP** land-use is parked.
- **Plan-validator messages are English only.** **M2-3** needs 3 more plans.
- The old 3D screen (`NativeCadScreen`) still shows the v2 "Structural Engineering" panel from `src/cad/structuralEngine.ts` (known wrong, e.g. moment utilisation 158 %). It should be replaced by the Structure screen results or removed when that screen is cleaned up (M6-2).
- CI (`verify`, `audit:mesh`, `test:exporters`, `build`) has not run locally since M2; `batch-export.ts` lost its compliance block when the old checker was deleted.

## Practical notes
- Windows: files are CRLF (scripted edits must normalise `\r\n`); `python3` hangs (use node); a bash heredoc whose body has an apostrophe can break the Bash tool: write files with the Write tool; stop any `vite preview` before `npm ci`.
- Reading the gazette: `_backup/sources/bnbc-2020-gazette-39201.pdf` (59.7 MB, not in git). Render pages with the `mupdf` npm package in a scratch folder (text layer for English prose, page images for tables), and cross-check digits against the text layer.
- Browser checks: the dev server config is `C:\1_SAJID\ArchResidenceBD\.claude\launch.json` (port 5199, `cd repo && npx vite`). The app registers a service worker that serves stale bundles: unregister it and clear caches before judging a UI change. Hash routes are `#/<view>`; a new view must be added to `PLAIN` in `src/hooks/useHashRoute.ts`. Seed a project through `localStorage` keys `archres_v2_active_project` and `archres_v2_all_projects` (see `createNewProject` in `src/engine/projectState.ts`).
- An untracked `repo/.claude/launch.json` may exist (a stray from M4-2); it is not needed and not committed.
