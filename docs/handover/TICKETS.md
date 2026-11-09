# v3 tickets: one ticket per session

**For the owner.** Open a new session in the `repo` folder, pick the model shown, paste:

```
Ticket <ID>. Follow CLAUDE.md. Do only this ticket, run its checks, commit, reply in 5 lines.
```

Current state and open decisions: `NEXT.md`.

Order: M2-1 → M2-2 → M2-3 + M2-4 (any order) → M2-5 → M3-1 → M3-2 → M3-3 → M4-1 → M4-2 → M4-3 → M5-1 → M5-2 → M6-1 → M6-2 → M7-1 → DS-1.
Quality gate: tests every ticket; one Opus `/code-review` (medium effort) after M2-5, M3-3, M4-3 and M7-1. Use high/extra effort only to unstick a hard bug.
Opus only where an error is costly and no test can catch it (M2-2, M3-1, M4-1, M4-2); Sonnet for the rest. Haiku is fine for one-line fixes and text edits.

Done (2026-11-08): M0 foundation (pushed, CI green) · M1 new look · M2 plan engine + 2 plans (`efef993`, local).

## M2-1 Building model · Sonnet high · done
Read: `src/plans/{types,fit,geometry,validate}.ts`.
Do: `src/model/building.ts` `deriveBuilding({plotWidthMm, plotDepthMm, storeys, planId, mirror, floorToFloorMm = 3000, setbacksMm})` → plot, envelope, building origin (front-aligned, centred), `storeys[]` (level, height, use, `FloorGeometry`, phaseId), ground floor = typical grid with every non-core cell in one `parking` room + door lobby↔parking, roof (stair cover, lift room, 1 m parapet). Export `DEFAULT_SETBACKS_MM = {front 1500, rear 2000, left 1000, right 1000}` flagged as an assumption until M3-2. Phase ids as in `src/engine/projectState.ts` (`phase-ground-floor`, `phase-floor-<i>`, `phase-rooftop`). Fitter rejections pass through.
Test: envelope maths, storey levels, ground and typical share grid lines and columns, every library plan has 0 validator errors on every storey.

## M2-2 Model → 3D mesh · Opus high · done c137c90
Read (ranges): `src/cad/mesh.ts`; `solidKernel.ts` (`createBoxMesh`, `resolveSolids`, `validateSolids`); `stairBuilder.ts`; in `parametricBuildingGenerator.ts` `createDoor3DMesh` (~381), `createWindow3DMesh` (~437) and the `kind`/`phase` strings it uses.
Do: `src/model/toMesh.ts` `buildMesh(model)`: placeholder pads 1500×1500×450 at 1.5 m depth, columns 300×300, beams 250×450 on structural lines, slabs 150 ground / 125 typical with stair, lift and shaft openings, walls 250/125 cut for every opening, door and window meshes, stair per storey (`planStair`), roof items; same kinds and phase ids as the old generator; `resolveSolids`. Old generator untouched.
Test: object counts follow the model, 0 overlaps, IFC export 0 errors; add the new path to `mesh-audit` and `solid-audit` (every plan × 3 sizes × 2/6/10 storeys).

## M2-3 Eight more plans · Sonnet high · partly done (5 of 8)
First ask the owner if not yet answered: split the lift bay into lift + duct? toilets on side walls or light shafts? keep the 1.35 m corridor spine? which layouts are most common?
Do: add to `src/plans/library.ts`: `p1-3b`, `p2-2b-lr`, `p2-3b-lr`, `p2-3b-fb`, `p3-2b`, `p4-2b`, `p4-1b`, `p1-4b-wide`. Follow the two existing plans' conventions; spans ≤ 6 m; one main door per flat; bedrooms and living on outside walls; kitchens and toilets on an outside wall or shaft.
Test: the existing sweep in `plans.test.ts` must pass. Render each once (`renderPlanSvg` + headless Edge) into `../review/`.
Status: added `p1-3b`, `p1-4b-wide`, `p2-2b-lr`, `p2-3b-lr`, `p2-3b-fb` (sweep passes, rendered in `../review/plan-*.png`). Still open: `p3-2b`, `p4-2b`, `p4-1b`. Three or four flats per floor leave interior kitchens and toilets, so they need the light-shaft decision (toilets/kitchens on a shaft); until then they are blocked, not skipped. Defaults used: lift and duct one bay in the X4 plans and a separate duct in the wide plans; toilets on outside walls; 1.35 m spine kept in the X4 plans, 1.5 m horizontal corridor in the wide plans.

## M2-4 Site entry + plan picker · Sonnet high · done
Read: `src/screens/ProjectSetupScreen.tsx`; `BuildingProject` and `createNewProject` in `src/engine/projectState.ts` (grep); `src/model/{building,migrate,legacyV2}.ts`; `src/plans/{fit,render}.ts`.
Do: setup asks frontage, depth, road width, road side, corner (area shown in katha and m²). `BuildingProject` gains optional `plot`, `planId`, `mirror`; `migrateV2` maps them and drops the matching `pendingInputs`. Picker: plans that fit show an inline SVG; plans that don't show the fitter's reason.
Test: unit tests for new pure logic; one headless screenshot in light and dark.

## M2-5 Switch the app to the new building · Sonnet high · done
Do: `generateBuildingMesh` delegates to `buildMesh(deriveBuilding(...))` when the project has `plot` + `planId`; old saves get a callout asking for the plot shape (no guessing). `NativeCadScreen` structural block (~lines 330–450) uses model spans and columns instead of 4.5 m / 250×450 / `max(9, …)`. Then delete `src/data/floorplan*.ts`, `public/assets/floorplans/`, `FloorplanPreview.tsx`, `audit:presets` (update `verify` and CI).
Test: route sweep with no console errors; all audits pass on the new path.
Done as: `src/model/projectMesh.ts` (project → model → mesh, cached); `generateBuildingMesh` is now a thin wrapper (old preset generator deleted; door/window/box helpers moved to `src/cad/meshParts.ts`); a save without `plot` + `planId` gets an empty mesh and `PlotShapeCallout` asks for the plot shape; `PlanCard` replaces the template gallery (3D and phase screens); the structural block reads model spans, columns, footprint and storey height. Deleted `src/data/floorplan*.ts`, `public/assets/floorplans/`, `FloorplanPreview`, `audit:presets`, `test:floorplan`, `test:quality`, `audit:full` and the ad-hoc preset scripts; `verify` updated. Kept `scripts/tests/batch-export.ts` (DocumentsScreen imports it; M5-2 replaces it). The random-building button now picks a Dhaka plot and a fitting plan. Section sizes in the 3D are still placeholders (M4). `audit:mesh` and `audit:solid` now run the model cases only.

## M3-1 Source BNBC 2020 / DAP 2022 · Opus high · done b6b1b17
Done as: BNBC 2020 is pinned to the official gazette S.R.O. 55-Law/2020 (dpp.gov.bd, 59.7 MB, 2461 pages, sha256 in `spec/sources/registry.yaml` as `bnbc-2020-gazette`); HBRI's site links only front matter. `spec/rules/bnbc-2020.yaml` (pack `bnbc@2020.1`): room sizes, bathroom/shaft/opening tables, egress, stairs, lifts, Table 6.2.3 live loads, strength and service load combinations, Dhaka seismic zone 2 (Z 0.20), 21 test vectors, and `gaps`. Not found, not estimated: residential corridor width (Table 4.3.8 prints "36", unit unclear), A1/A2 stair width (self-referencing), lift car sizes, dead-load tables, seismic soil/R parameters, wind, and DAP 2022 itself (no official gazette PDF online; only maps and a 2016 draft). `src/plans/rules.ts` now has cited habitable 9.5 m² / 2.9 m, kitchen 4 m² / 1.5 m, toilet (smallest Table 3.1.10 row) and shaft values, per-rule `cited`/`assumption` basis, `shaftMinimum`, `liftRequired`; corridor, lobby, lift, dining stay flagged assumptions. Cited minimums exposed bedrooms/living at 2.81-2.88 m in four plans, so their bay minimums in `library.ts` went up to 3050/3100 mm. Second pass (same day): all values re-read from page images, Part numbers confirmed from the gazette headings, registry validated against its JSON schema (0 errors), residential corridor 36 in = 915 mm confirmed by the owner, gazette copy archived in `_backup/sources` and hash-checked by a test, four changed plans re-rendered in `../review/after-*-min.png`. Gazette quirks recorded as gaps: Table 4.3.4 vs 4.3.5 cross-reference, dangling 'Table 4.3.5b'. Still open: DAP 2022 text, engineer review of the pack. Test: `src/plans/bnbc-pack.test.ts`. M3-2 note: RAJUK setbacks and the BNBC shaft table are the inputs for the envelope; the pack's `egress` and `liveLoads` feed M3-3 and M4-1.

## M3-2 RAJUK evaluators + setbacks · Sonnet high · done 209ef80
Read: `spec/rules/rajuk-2008.yaml`; `git show origin/v0-pipeline-complete:core/src/archres_core/compliance/tables.py` (fetch the branch if missing).
Do: `src/rules/`: pack loader (`js-yaml`), exact ports of `far_row`, `setback_row`, `parking_spaces`, `in_band`; `check(model)` → `{ruleId, status, expected, actual, source}`. Envelope uses RAJUK setbacks instead of `DEFAULT_SETBACKS_MM`.
Test: every `testVectors` entry passes.

## M3-3 Compliance screen · Sonnet medium · done 77564a4
Do: `ComplianceScreen` reads `src/rules` results plus plan-validator issues: `ResultChip`, `Value`, citations, "Not checked"; tabs All / Fails / Passes / Not checked; deviation register (`Deviation` in `src/model/projectSpec.ts`); fire and accessibility as sections. Delete `src/cad/codeCompliance.ts` once unused.

## M4-1 Loads, slabs, beams · Opus high · todo
Do: `src/structure/`: loads from M3-1 citations (assumption-flagged where missing), BNBC strength and service combinations, one/two-way slabs (coefficient method), continuous beams (moments, flexure, shear, service deflection) on model spans. Never clamp utilisation.
Test: one hand-worked example per module inside the test; property tests (longer span → larger moment, more storeys → larger column load).

## M4-2 Columns, footings, seismic, Structure screen · Opus high · todo
Do: column load takedown by tributary area per storey, minimum eccentricity, slenderness, axial + bending; footing area from service load ÷ allowable bearing, depth from punching at d/2 and one-way shear; equivalent static base shear and drift; section sizing from stock lists. Structure screen (grid, members, failures first, "screening, not final design"). Rebuild `audit:structural` on the model and add it to CI.

## M4-3 Rebar / BBS · Sonnet high · todo
Do: rebar from M4 member results; stock bars only (8, 10, 12, 16, 20, 22, 25, 28, 32 mm); development and lap lengths; BBS rows with shape codes and weights; Rebar screen reads it. Delete `rebarDetailer.ts` once unused.

## M5-1 Quantities + BOQ · Sonnet high · todo
Do: takeoff from the model and BBS; rate card from `git show origin/v0-pipeline-complete:data/prices/cards/pwd-sor-2022-civil-works-candidate.json` in `spec/schemas/rate-card.schema.json` shape, with date and source shown; BOQ screen and CSV.

## M5-2 Drawings + permit package · Sonnet high · todo
Do: drawings from the model (`renderPlanSvg` per storey, section, elevations, DXF via `drawingEngine`); permit package = drawings + BOQ + compliance report + assumptions as downloads.

## M6-1 Interview from the flow book · Sonnet high · todo
Do: runner for `spec/flows/phase-flow-book.yaml`; port the v0 parser (`core/src/archres_core/interview/parse.py`, `seam.py`) with its test cases (`core/tests/test_interview_parser.py`); answers write to the project with provenance.

## M6-2 Cleanup · Sonnet medium · todo
Do: UI on the v3 store (`src/model/projectStore`, migrate on first load); remaining screens (formwork, pour, daylight, unit mix, connections, column grid) read the model; delete unused v2 state, `/api/cad`, `src/server` (dev via Vite), `isomorphicCore` stubs; README and Help honest (no AI claims).

## M7-1 Packaging · Sonnet medium · todo
Do: `tauri.conf.json` devUrl and beforeDevCommand; `npx tauri icon` (adds the missing 128x128@2x); a CSP; `React.lazy` per screen with a bundle-size budget; PWA icons; CI builds the Windows installer on tags (windows-latest); offline check.

## DS-1 Design system re-sync · Sonnet medium · after M7-1
Do: `node scripts/design-system/gen-tokens.cjs && node scripts/design-system/build.mjs && node scripts/design-system/gen-comps.cjs`, then publish `scripts/design-system/out/project/` to https://claude.ai/artifact/V44tU8dshbDmJ5PsCHo3LA following its `SKILL.md` (re-read the index right before; index in the last call).
