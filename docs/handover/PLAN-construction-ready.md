# ArchResidenceBD: plan to reach "usable for real construction"

## Context

The owner wants a bug-free, genuinely useful app that a civil engineer could rely on for real construction, which he will then present to officials for certification. Out of scope until then: money (pricing, licensing, sales), the customer end (onboarding docs, support, pilot with firms), and anything certification-dependent (code signing, official approvals, DAP legal sign-off). The owner will not hand-calculate reference buildings, so confidence has to come from independent re-implementation, published benchmark problems and automated cross-checks that I build.

State today (v3 at 1ce0f74, CI green): a deterministic pipeline plot -> plan -> structure -> rebar -> BOQ -> drawings. It is honest about being a screening tool (title block "not for construction", `not_checked` rows, assumptions lists). Three read-only audits (structure, rules/documents, software quality) found the gaps below. This plan turns screening into construction-grade, in the order that removes the most risk first.

## Audit findings (ranked)

**A. Structural engine (safety-critical)**
1. Columns: no shear design, tie size/spacing fixed 10 mm @ 100 mm, no Sec 8.3 confinement (hoop zone length, Ash, 6 db limit); "special moment frame R 8" has no ductile detailing behind it.
2. No capacity design: strong-column/weak-beam, joint shear, beam-column joint anchorage; beam shear not from Mpr.
3. No wind loads (Dhaka basic wind speed); no soil/water pressure, no basement.
4. Analysis is planar and simplified (D-method, one-cycle moment distribution, mid-height inflection, 30 % orthogonal rule); beams treat columns as simple supports; no member-level 3D frame solve.
5. No irregularity or accidental torsion checks; period from the code formula only; off-centre core gets no torsion.
6. Core wall: no boundary elements, coupling beams, core footing/raft; limit 8 storeys.
7. Foundations: no footing moment from eccentricity/overturning, no settlement, water table, piles, raft design, tie beams.
8. Loads missing or crude: lift, stair flights/landings, water tank as point load, partitions, equipment, no roof live reduction.
9. Detailing: hook factors apply but edge hook warnings persist, no column splice design, bottom bars not curtailed, no crack control, stock bars only.
10. Hard-coded constants: fc 20, fy 420, 3000 mm floor-to-floor, Z 0.20, SD, covers; torsion method borrowed from ACI as an assumption.
11. Validation: ~160 unit tests and sweeps check invariants, but no independent benchmark (no textbook/ETABS comparison), no hand-calculated reference (the `spec/reference` slot is empty).

**B. Rules, documents, BOQ**
1. Drawings are schematic. Missing: structural drawing set (column layout/schedule, footing plan/details, beam and slab reinforcement, stair and core details, general notes); door/window schedules, roof plan, finishes, dimension strings, more sections, drawing register; MEP (none).
2. Rules: narrow road rule (6.00 m) only a gap row for FAR; §51(11) bonus not applied; corner plots, projections into setbacks, boundary wall, DAP not checked; BNBC Part 3 stair risers/treads, window/door rules, fire protection systems, A1/A2 stairs not transcribed; plumbing, water tank, septic/soak, rainwater, electrical, earthing absent.
3. BOQ: lower bound; labour for concrete/brick/plaster, finishes, joinery, earthwork, waterproofing, services, lift cost missing; one rate card dated 2023.
4. Plan library: 14 plans, rectangular plots only; no corner, irregular or small plots; no upper-floor setbacks.

**C. Software**
1. Analysis runs on the UI thread, recomputed per screen and export, never cached.
2. Silent save failure (quota/blocked storage swallowed), no multi-tab guard, a damaged store is overwritten on next save.
3. No `window.onerror`/`unhandledrejection` reporting.
4. Thin numeric validation on import and on form inputs (`|| 0` coercion); no NaN/Infinity propagation tests.
5. Non-determinism sources (`Math.random`, `Date.now` ids), legacy `BuildingProject` adapter duplicated beside v3, possibly unreachable screens, `dangerouslySetInnerHTML` on SVG built from user text, weak accessibility, no ESLint/`npm audit`, one e2e spec.

## Phase plan

Each phase ends green (`npm run verify`, `audit:structural`, `audit:mesh`, e2e) and is committed on `v3`. Never push unless the owner asks.

### Phase 1: Software hardening (about 1 week; do first, it protects everything after)
- Move `analyzeStructure`/`buildBbs`/`buildBoq` into one memoised design pipeline (keyed on a project hash) used by `useDesign.ts`, `DrawingsScreen.tsx`, `projectMesh.ts`, `permit.ts`; run it in a Web Worker with a progress state. Add a timing test for 2/6/10 storeys.
- Storage: surface write failures and `skipped` counts in the UI, never overwrite a damaged store (quarantine it), compare `revision` on write, listen to `storage` events. Fault-injection tests (quota on the Nth write, corrupted JSON, two tabs).
- Global `window.onerror` + `unhandledrejection` capture into the existing error report file (no network).
- Strict input validation: a single `validateSpec` used by import, forms and `migrate.ts` (finite, in range, integer mm); replace `Number(x) || 0` coercions with field errors. Fuzz tests on `importProjectFile`, `toProjectSpec`, `loadProjects`.
- Determinism: remove `Math.random`/`Date.now` from engine paths (ids only at the edge), add a "same input, byte-identical output" test.
- Escape all text in SVG/scene generation; test with hostile project names.
- Tooling: add ESLint (react-hooks, jsx-a11y, no `Math.random` in engine), `npm audit` and the full test run before the release workflow, axe checks on each screen, more Playwright flows (all screens, EN/BN, import/export).
- Remove or confirm reachability of leftover screens and `src/cad` generators; retire the legacy `BuildingProject` adapter where cheap.

### Phase 2: Independent validation harness (about 1-2 weeks, parallel with Phase 3)
Goal: confidence without the owner's hand calculations.
- `fast-check` property tests over plots/plans/storeys/site class/bearing: no NaN/Infinity, load path closes, steel within min/max, cover/spacing legal, monotonic in storeys.
- Independent re-implementation: write a second, minimal implementation (separate code, textbook formulas) of slab coefficients, beam flexure/shear, column interaction, pad footing, base shear/Sa, wall shear. Compare against the engine on generated cases to within 1 %. Disagreements are bugs in one or the other and must be explained.
- Benchmark problems: transcribe worked examples from published references (ACI/PCA textbook and BNBC commentary examples that are public) into `spec/reference/benchmarks/*.json` with their printed answers; `audit:reference` compares them.
- Golden files: full BBS CSV, BOQ, SVG hashes for ~10 canonical projects; `.archres` fixtures for every schema version.
- Mutation testing (Stryker) on `src/structure` and `migrate.ts`; fix surviving mutants with real assertions.
- Frame cross-check: add a small direct-stiffness 2D/3D frame solver (test-only first) and compare column moments, drift, period against the D-method results; the gap tells how much conservatism the simplifications carry.

### Phase 3: Structural engine to construction grade (about 6-8 weeks, ordered by safety impact)
1. **Column shear and ties** (`column.ts`, `frame.ts`, `bbs.ts`): design shear from capacity/seismic demand, tie size and spacing from shear + Sec 8.3 confinement (hoop zone, Ash, spacing limits), crossties; schedule rows and mesh follow. Read Sec 8.3 and 6.3 from the gazette (`pdftotext` copy in the scratchpad; source `_backup/sources/bnbc-2020-gazette-39201.pdf`).
2. **Capacity design**: strong-column/weak-beam ratio, beam shear from Mpr, joint shear check and joint anchorage; failures sized up automatically.
3. **Wind** (BNBC Part 6 Sec 2.4): transcribe basic speed, exposure, pressure coefficients; add wind load cases and combinations, check drift and cladding/parapet; governs where it governs.
4. **Frame analysis upgrade**: replace D-method/one-cycle with a proper 3D (or two planar) direct-stiffness frame including beam-column continuity, rigid diaphragms, accidental eccentricity 5 %, torsional irregularity and soft-storey/mass checks; compute the real period and compare with the code formula; trigger "dynamic analysis needed" visibly.
5. **Foundations**: footing moment from eccentricity and seismic overturning, soil pressure distribution, tie beams, differential-settlement screen, raft analysis (flexible strip or plate model) with punching and bending, optional pile cap; water table and soil type as inputs; core footing for the shear wall.
6. **Core wall completion**: boundary elements (Sec 8.3.6.6), coupling beams over doors, core raft, stair-core walls as an option; extend the supported height (target 10-12) only when audits pass with stated reasons.
7. **Loads and members**: stair flights and landings designed as members; water tank as point load; lift reactions and pit; partitions with openings; slab crack control and long-term deflection; beam crack control and skin steel; bottom-bar curtailment; column splices and staggering; per-project floor heights, fc, fy as inputs.
8. Each item lands with unit tests, a benchmark in Phase 2, an update of `ASSUMPTIONS` and the Structure screen text (EN+BN).

### Phase 4: Construction documents (about 4-6 weeks, can start after Phase 3 item 1-2)
- **Structural drawing set** from the existing results (`src/drawings/sheets.ts`, new `structSheets.ts`): column layout and schedule, footing plan and details, beam layout and reinforcement schedule/elevations, slab reinforcement plans, stair and lift-core details, general structural notes sheet (grades, cover, laps, hooks, bar shapes). PDF/DXF/SVG as for the rest.
- **Architectural completeness**: door and window schedules, dimension strings and grid bubbles everywhere, roof plan, toilet/kitchen enlargements, more sections, finishes schedule, drawing register and revision block.
- **MEP basis (not full design)**: water tank and septic/soak pit sizing and placement as cited or clearly assumed rules, drainage and electrical layout sketches only if citable; otherwise a "by others" sheet. Decide with the owner (see questions).
- **BOQ completeness**: labour for concrete/brick/plaster, finishes, joinery, earthwork, waterproofing, lift allowance; each line carries source and status; owner supplies or approves rates later (money part stays out of scope, quantities do not).

### Phase 5: Rules and plan coverage (about 3-4 weeks)
- Transcribe from the gazette/RAJUK text the owner already holds: Part 3 stairs (risers, treads, A1/A2 width), door/window rules, fire protection requirements, §46(5) projections, §51(9)-(11), §58 spaces; every row cited or `not_checked`.
- Corner plots and irregular plots: generalise the envelope (`BuildingInput`, `setbacks.ts`, `fit.ts`) to polygon plots with per-edge setbacks and multiple road frontages; fit the nearest rectangular building inside, flag the rest. Add more original plans for small plots and wide plots, and an upper-floor setback option.
- Keep DAP/land-use as `not_checked` until the owner supplies the official text (out of scope for now).

### Phase 6: Whole-system verification (continuous, final gate)
- Regression snapshot grows to 20+ buildings; all benchmarks pass; independent implementation agrees; mutation score target set; timing budgets pass.
- Full manual walk-through in the built Windows app (Save/Open dialogs, install/uninstall) on this machine; record findings in `docs/handover/NEXT.md`.
- Produce a "validation dossier" (`docs/validation/`) listing every check, benchmark, assumption and known limit, which is the material the owner will show officials.

## Critical files
`src/structure/{column,frame,beam,slab,footing,foundation,core,seismic,bbs,anchorage,materials,analyze}.ts`, `spec/rules/bnbc-2020-structure.yaml` (+ `src/rules/bnbcStructure.ts`), `src/drawings/{sheets,permit,pdf,scene}.ts`, `src/quantities/takeoff.ts` + `spec/rates/`, `src/rules/{check,report,setbacks,parking,egress}.ts`, `src/plans/{library,fit,validate,geometry}.ts`, `src/model/{building,projectStore,projectFile,migrate}.ts`, `src/engine/projectState.ts`, `src/screens/useDesign.ts`, `scripts/audits/`, `spec/reference/`.
Reuse: `deriveBuilding` -> `analyzeStructure` -> `buildBbs` -> `buildBoq` pipeline, `dualLateral`/`checkCore` pattern for new member checks, `ldHook`/`hookFactor` style of condition-gated clauses, `scripts/audits/reference.audit.ts` snapshot machinery, `src/drawings/scene.ts` for new sheets.

## Verification
- Per change: `npx vitest run <path>`, `npx tsc --noEmit`.
- Per phase: `npm run verify`, `npm run audit:structural`, `npm run audit:reference`, `npm run audit:mesh`, `npm run build && npm run check:bundle`, `npm run test:e2e`, CI green on a pushed branch (only when the owner says push).
- Engineering: independent implementation and benchmark agreement (Phase 2), reviewed by the owner on the validation dossier; no result is marked "construction grade" until its benchmark passes.

## Open questions for the owner
1. MEP: should the app design water tank/septic/drainage/electrical layouts, or stop at a cited-rules basis and a "by others" sheet?
2. Target height: stay at 8 storeys (dual system) or push to 10-12 with extra shear walls around the stairs?
3. Plot coverage: are corner plots and irregular plots in scope for this round?
4. May I use published textbook worked examples as benchmarks (public-domain problems only)?
