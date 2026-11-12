# Handoff: ArchResidenceBD v3 (read this first)

Branch `v3`, last commit `ac410e6`. **Nothing is pushed. Never `git push` unless the owner asks in that session.**
Date of this handoff: 2026-11-13. `npm run verify` passes (75 files, 1,631 tests). The owner now allows full verify runs.

## What the app is for (owner, this session)
A website/app that creates the **3D plan and the final BOQ with all project phases** for a Dhaka residential building. The final plan is
shown to an engineer manually. **Making a government-approved plan was never the intent.** So: screening-level structure with common
practice values is acceptable; money, customer-facing docs and certification-dependent work stay out of scope. Owner preference:
"don't make it complicated" (no new inputs or options unless asked); use common practice for open decisions; search the internet
for common values and methods and use them.

## Done this session (commits on v3, oldest first)
| Commit | What |
|---|---|
| 1303fce | Column ties and confinement, BNBC Sec 8.3.5.4 (`src/structure/confinement.ts`); steel +6 to 11 % accepted |
| 3cbeefd | Capacity numbers (`capacity.ts`): Mpr, nominal beam and column moments, eq 6.8.5, beam Ve |
| 6aa85b7, f4a4456 | Eq 6.8.5 strong column / weak beam wired into pass or fail; the sizing loop grows columns until joints pass |
| 87afde6 | Joint shear (gazette Sec 8.3.7.3: 1.7 / 1.2 / 1.0 sqrt(fc') Aj) and beam design shear from probable moments (Sec 8.3.8.1) |
| b6bce6b | Foundations: base moments in pad pressure, tie beams, overturning screen, settlement screen |
| 1354ba2 | Wind (Sec 2.4), Rayleigh period, irregularity flags, core boundary stress screen |
| d9610de, 467f967 | Wind envelope (lateral design = larger of wind and seismic), accidental torsion 5 %, core boundary elements, coupling beams, stair flight design, crack control |
| b024cdc, 0d384c5 | BOQ completeness (earthwork, lean concrete, tiles, paint, waterproofing, doors, windows, lift) and labour/machine days |
| ac410e6 | Structural drawing sheets S-001 notes, S-101 columns, S-102 footings, S-2nn beam and slab layout per level |

## Values that are common practice, not read from BNBC (owner to confirm; each is in `ASSUMPTIONS` in `src/structure/materials.ts` or `BOQ_ASSUMPTIONS`)
- Joint shear: phi 0.75, Aj = min(bc, bb + hc) hc, column shear taken as zero, joint core = column below.
- Wind: Dhaka V 65.7 m/s (from published comparisons; check Figure 6.2.1), Exposure B, Kd 0.85, G 0.85, Cp 0.8/-0.5, GCpi 0.18, drift h/500.
- Seismic period: Cu 1.7 (design still uses Ta). Soft storey 70 % / 80 %, mass 1.5x.
- Foundations: service moment = factored / 1.2, tie force 10 % of the larger column load, overturning FS 1.5, settlement screen pressure ratio 1.5.
- Core: 150 mm walls (kept; owner said do not add a thickness input), boundary element where edge stress > 0.15 fc' (required above 0.2 fc'),
  coupling beam shear = half the wall shear shared by lintels, capped at 0.83 sqrt(fc') Acw.
- Stair: simply supported waist slab, span = run + 300, live 4.0 kN/m2, finishes 1.5 kN/m2, bars at most 200 mm apart.
- BOQ labour norms (mason 1 m3 brick / 9 m2 plaster / 12 m2 screed / 6 m2 tiles per day, mixer 8 m3/day, vibrator 10 m3/day).

## Known facts and open items
- Sample steel moved a lot across the session (e.g. mid-2st 14,461 to 17,334 kg; mid-8st-dual 83,242 to about 104,476 kg incl. core boundary elements).
  Ground columns grow big (600 mm on a 2-storey sample): worth a sizing review.
- Wind-governed plans now get the larger lateral force (`SeismicResult.windGoverns`); the frame is not otherwise checked with wind load cases.
- Not built: true 3D direct-stiffness frame solver (torsion uses the D-method), raft stiffness and soil model, water table, pile caps,
  per-project fc/fy inputs, skin steel and bottom-bar curtailment in the bar schedule, height above 8 storeys, slab reinforcement sheets,
  stair and lift-core detail sheets, beam elevations, tie beam steel in the bar schedule and BOQ.
- New structural sheets were checked by tests only, not by eye (the PDF font loader needs a browser). Open one and look.
- Next per plan (`docs/handover/PLAN-construction-ready.md`): Phase 4 rest (more sheets, MEP basis), Phase 5 (rules, corner and irregular plots,
  more plans), Phase 6 (validation dossier, Windows walkthrough). Owner-blocked: MEP scope, target height 8 vs 10-12, corner plots,
  code signing certificate, support address. Ask the owner which to do; there is no fixed order.

## Rules and gotchas
- Work: `npx vitest run <path>`, `npx tsc --noEmit`. Before a commit: `npm run verify` (full runs are allowed now), plus `npm run audit:structural` when structure changes.
- Golden and snapshot move when outputs change: `UPDATE_GOLDEN=1 npx vitest run src/validation/golden.test.ts` and `UPDATE_SNAPSHOT=1 npm run audit:reference`.
  Regenerate only for a stated, accepted reason, then say which figures moved.
- Commit on `v3`, stage files by name (the working tree shows many files modified by line endings only; do not `git add` whole folders blindly).
  Commit message ends with the Co-Authored-By line the session gives.
- Ask before changing candidate rule pack values (`spec/rules/bnbc-2020*.yaml`). Cite regulations or mark "assumption". UI text EN + BN. Integer mm.
- Windows: no `python3`; files LF in git (CRLF warnings are harmless). Gazette: `_backup/sources/bnbc-2020-gazette-39201.pdf`; the text layer is
  garbled for equations, so render pages to PNG with `mupdf` (npm) and read the image. PDF index = printed page - offset (e.g. printed 3679 = PDF 1098).
- Code map: `src/structure/{frame,column,beam,capacity,confinement,core,foundation,footing,wind,seismic,stair,bbs,analyze}.ts`,
  `src/quantities/takeoff.ts`, `src/drawings/{permit,sheets,structSheets,scene}.ts`.
