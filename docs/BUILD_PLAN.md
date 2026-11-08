# ArchResidenceBD v3: build plan

Status: planning complete, decisions settled (§15), nothing built yet. Written 2026-11-08 from a review of `develop` @ 4326880 and the old `v0-pipeline-complete` branch.

Approach: **evolve the existing app** (keep the shell, geometry kernel, viewer and exporters; replace the core underneath). New code is built next to old code, screens move over one at a time, old code is deleted when nothing imports it. The app runs after every step.

---

## 1. Goals and non-goals

**v3 must:**
- Turn a real plot (frontage, depth, road width, authority) and a chosen floor plan into one consistent building, so the 2D plan, 3D model, structure, code checks, rebar and BOQ all describe the same thing.
- Give engineering and code results that change with the building, show failures honestly, and cite where each rule comes from.
- Work fully offline as a Windows app and as a web app, in English and Bangla, in light and dark mode.
- Be deterministic: same inputs, same outputs. No AI model in the core.

**v3 is not:**
- A replacement for a licensed structural engineer or an official RAJUK approval. Results are screening-level and say so.
- A free-form CAD editor. Users choose and adjust from a plan library; they don't draw walls.
- Multi-user or cloud-synced (later, maybe).

---

## 2. Root causes this plan fixes

| Symptom | Root cause found in code |
|---|---|
| Same skewed plan whatever you pick | Plans are 11 presets stored as percentages of the buildable area and stretched to fit; 35 JPGs only point at them |
| Building can be bigger than the user's land | The plot shape is never asked. `computeBuildingFootprint` guesses it from the template's text ("3.5–4.5 Katha") or `sqrt(area) × 0.9 / 1.1`, and **scales the plot up** when the template needs more land |
| Setbacks never change | Hard-coded 1.5 / 2.0 / 1.0 m in the generator, though the rule pack has a setback schedule by plot area and height |
| Structural numbers constant | `NativeCadScreen` feeds fixed span, section, soil and column count; the engine clamps utilisation at 1.0 |
| Corridor fails in every case | Percentage layouts can't hold a minimum width |
| Rebar sizes like 13 mm | Bar size computed by formula, not picked from a stock list |
| Screens disagree | 10 screens each call `generateBuildingMesh()` and guess the building back from boxes |

---

## 3. Architecture

```
ProjectSpec (stored; what the user decided)
   │  deriveBuilding(spec)  - pure, memoised by spec.revision
   ▼
BuildingModel (derived; never stored)
   ├─ toMesh(model)            → 3D viewer, IFC, FreeCAD, DXF/SVG 3D
   ├─ drawings(model)          → plans, sections, elevations
   ├─ analyse(model)           → StructuralResult per member
   ├─ check(model, rulePack)   → ComplianceResult per rule
   ├─ detail(model, analysis)  → BBS rows
   ├─ takeoff(model, bbs)      → quantities → BOQ (with rate card)
   └─ formwork / pours / daylight / unit mix
```

**Rules**
1. Screens never calculate engineering values; they call selectors on the derived results.
2. Everything derived is a pure function of `ProjectSpec` + bundled data (plans, rule packs, rate cards). That makes it testable and identical in browser and desktop.
3. Every number shown carries provenance: `user | rule_pack | engine | default | assumption`, plus a citation where one exists (the v0 `BuildingSpec` schema already defines this).
4. Unknown means "not checked", never a silent pass.

**Folder layout (target)**

```
src/
  model/        ProjectSpec + BuildingModel types, units (katha, bigha, decimal, sqft), migration
  plans/        plan library (JSON), fitter, plan validator
  rules/        rule-pack loader (YAML), evaluators (FAR, setback, coverage, parking), BNBC checks
  structure/    grid, loads, slab, beam, column, footing, seismic, section sizing
  detailing/    rebar / BBS
  quantities/   takeoff, BOQ, rate cards
  geometry/     solidKernel, stair, model → mesh            (moved from cad/, kept)
  exporters/    IFC, FreeCAD, DXF, SVG                       (kept)
  drawings/     plan / section / elevation generation        (kept, re-fed)
  interview/    flow-book runner, answer parser
  ui/           tokens, kit components
  screens/      one folder per area (project, design, engineering, construction, documents)
  app/          shell, routing, providers
```

---

## 4. Data contracts

### 4.1 ProjectSpec (stored, versioned)

Based on `spec/schemas/building-spec.schema.json` (already in the repo), trimmed to what v3 uses:

- `schemaVersion`, `revision`, `createdAt`, `updatedAt`
- `project`: name, address, display units, language
- `site.plot`: **frontageM, depthM**, areaSqm (derived or entered), **roadWidthM**, cornerPlot, roadSide (which edge faces the road), existingStructure
- `site.jurisdiction`: authority (rajuk first), rulePack id, seismic zone
- `site.soil`: status (`not_provided | user_report | area_default`), allowable bearing kPa, groundwater depth
- `building`: storeys, ground/typical floor heights, basement, unitsPerFloor, groundFloorUsage (parking/residential/mixed)
- `design`: planId per unit count, per-storey overrides, mirror flag, materials (concrete grade, steel grade)
- `pricing`: rate card id, overrides
- `assumptions[]`, `deviations[]` (acknowledged rule deviations with risk tier), `provenance{}`

**Migration from v2 saves:** map stories/units/plotSqm/phases; plot frontage and depth are unknown in v2 data, so the app asks for them when an old project is opened (pre-filled with a square estimate, clearly marked as an assumption).

**Storage:** keep localStorage for the web; add *Save / Open project file* (`.archres`, JSON) in both, and use the file system in the Tauri build. Move bulk data to IndexedDB if projects outgrow localStorage's ~5 MB.

### 4.2 BuildingModel (derived)

- `plot` polygon, `envelope` (buildable rectangle after setbacks, each setback with its rule citation)
- `grid`: x-lines and y-lines in metres (also the structural grid, see 5.2)
- `storeys[]`: level, height, `rooms[]` (polygon, kind, unit id, name EN/BN), `walls[]` (axis line, thickness, external/internal/party), `openings[]` (door/window, wall, offset, size)
- `core`: stair (dog-leg, width, risers), lift (if required), shafts
- `columns[]` (grid ref, section, storeys), `beams[]` (grid line, span, section), `slabs[]` (panel, thickness, one/two-way), `footings[]`
- `groundFloor`: parking bays and drive aisle, or residential rooms
- `roof`: parapet, water tank, stair room

### 4.3 Results

- `StructuralResult`: member id, demand, capacity, utilisation (**unclamped**), status, governing check, clause
- `ComplianceResult`: rule id, status `pass | fail | not_checked | not_applicable`, expected, actual, source `{document, section, page}`
- `BbsRow`: member, bar mark, diameter (stock list only), shape code, cut length, count, weight
- `BoqItem`: code, description EN/BN, quantity, unit, rate, amount, rate source and date

---

## 5. Floor plan system (replaces presets and JPGs)

### 5.1 Plan definition format

Each plan is a **tartan grid**: bays across the width and along the depth, each bay with a min / preferred / max size in metres. Rooms are made of grid cells. Example (shape only):

```json
{
  "id": "p2-3bed-a",
  "name": { "en": "Two flats, 3 bed each, central core", "bn": "..." },
  "unitsPerFloor": 2, "bedroomsPerUnit": 3,
  "baysX": [{ "min": 3.0, "pref": 3.6, "max": 4.2 }, ...],
  "baysY": [{ "min": 3.0, "pref": 3.6, "max": 4.5 }, ...],
  "core": { "cells": [[2,2],[2,3]], "stairWidthM": 1.2, "lift": "if-required" },
  "rooms": [{ "id": "a-bed1", "kind": "bedroom", "unit": "A", "cells": [[0,0],[0,1]] }, ...],
  "corridors": [{ "cells": [[1,2]], "minWidthM": 1.2 }],
  "doors": [...], "windows": "auto-on-exterior-habitable"
}
```

### 5.2 Why a grid

The structural grid is **part of** the plan grid: each plan marks which of its grid lines are structural (`structuralX`, `structuralY`); columns sit where two structural lines cross and beams run along them. Narrow bays (a 1.35 m corridor spine, a 1.5 m toilet band) stay partition lines only, so columns are never 1.3 m apart. Plan and structure can't drift apart, and spans are known exactly for the structural engine.

*Built (M2, first pass):* `src/plans/` holds the types, fitter (`fit.ts`), geometry (walls 250/125 mm, doors and windows kept clear of columns, columns and beams), validator and SVG renderer, with two plans (`p1-4b`, `p2-2b-fb`) swept across their whole fit range in tests.

### 5.3 Fitter

1. Envelope = plot minus setbacks (from the rule pack, by plot area, road width and height).
2. Distribute envelope width over `baysX` and depth over `baysY` within min/max, preferring `pref` (simple proportional fill with clamping).
3. If any bay can't stay within limits, the plan is **rejected for this plot** with the reason ("needs at least 11.4 m frontage").
4. Mirror the plan when the road is on the other side.

### 5.4 Plan validator (runs in tests on every plan × plot sweep)

- No overlaps; rooms plus walls cover the floor
- Corridor ≥ 1.2 m; stair width and riser/tread within limits
- Minimum room area and width per room kind (values sourced, see 7.2)
- Every room reachable from the core (adjacency graph)
- Every habitable room has an exterior window; every toilet has a window or shaft
- Spans within the structural limits of 5.x

### 5.5 Starter library

| Units per floor | Plans | Typical plots |
|---|---|---|
| 1 | 2 (3-bed, 4-bed) | 3–5 katha |
| 2 | 4 (2-bed, 3-bed ×2, 3-bed narrow) | 3–6 katha |
| 3 | 2 | 5–8 katha |
| 4 | 2 | 7–10 katha |
| Ground floor | 3 parking layouts (bays 2.5 × 5.0 m, aisle) | all |

Authored from scratch as geometry (no tracing of listing images). The 35 scraped JPGs are removed.

---

## 6. Structural engine (screening level)

**Scope:** RCC frame, 2–10 storeys, isolated footings (flag mat/pile cases as "needs engineer").

1. **Loads:** self-weight from model; floor finish, partitions, live load by occupancy; roof load; wall loads on beams from wall lines. *Values sourced from BNBC 2020 Part 6 and cited; until verified they are marked as assumptions.*
2. **Combinations:** BNBC 2020 strength design (e.g. 1.4D; 1.2D + 1.6L) and service (D + L) for deflection and footings.
3. **Slabs:** one-way / two-way by panel ratio, coefficient method, thickness check.
4. **Beams:** tributary loads from slab panels, continuous-span moments (coefficient method), flexure, shear, deflection with service loads, span/depth.
5. **Columns:** axial load takedown by tributary area storey by storey, minimum eccentricity moments, slenderness, axial + bending check.
6. **Footings:** area from service load ÷ allowable bearing; depth from punching shear at d/2 and one-way shear; flexure.
7. **Seismic:** BNBC equivalent static base shear by zone, importance, response reduction and approximate period; storey drift check.
8. **Section sizing:** pick the smallest section from a stock list that passes; report utilisation unclamped.

**Tests:** hand-worked examples (one per member type, written into the test files), property tests (more storeys → larger column load; longer span → larger moment; weaker soil → larger footing), and the existing structural sweep rebuilt on the real model.

---

## 7. Codes and rules

### 7.1 RAJUK 2008 rule pack (sourced, in repo)

`spec/rules/rajuk-2008.yaml` has 58 entries (FAR tables, setback schedule, parking, coverage) with page citations and test vectors. Port the v0 Python evaluators (`far_row`, `setback_row`, `parking_spaces`, banding rules) to TypeScript; run every test vector in Vitest.

### 7.2 BNBC 2020 checks (need sourcing)

Room minimum sizes, ceiling heights, stair geometry, corridor width, lift requirement, fire exits and travel distance, accessibility. Each check ships with a citation; checks without a verified source show **not checked**. The fire-safety and accessibility screens become sections of the compliance screen.

### 7.3 DAP 2022

Not in the repo. Find the official RAJUK publication online (T3.0) before any DAP check ships. Until then the app says it checks RAJUK 2008.

### 7.4 Deviation register

A failing rule can be acknowledged with a reason and a risk tier (`cosmetic | approval_risk | structural_attention | cost_risk`, from the schema). It appears in the compliance report.

---

## 8. Rebar, quantities and BOQ

- **Rebar:** stock diameters only (8, 10, 12, 16, 20, 22, 25, 28, 32 mm); detailing from member results; development and lap lengths; BBS by member with shape codes and weights.
- **Takeoff:** concrete by member type, formwork area, rebar kg from the BBS, brickwork and plaster by wall area, flooring, doors and windows by count, excavation and fill.
- **Rates:** rate card in the existing `rate-card.schema.json` format; start from the v0 PWD schedule-of-rates candidate card, showing its date and source on screen. Users can override rates.
- **Export:** CSV now; XLSX later if wanted.

---

## 9. Interview and phases

- Run the setup and phase questions from `spec/flows/phase-flow-book.yaml` (1,294 lines, already asks plot frontage, depth, road width, authority, soil and more).
- Port the v0 deterministic answer parser: Bangla digits, units (katha, bigha, decimal, sqft, m, ft), yes/no in Bangla, English and Banglish, "don't know" → default with an assumption entry.
- Answers write to `ProjectSpec` with provenance; the reply echoes the stored value and unit so mistakes are visible.
- The 3D "copilot" text box is replaced by plain controls (and later, maybe, a command bar like "set storeys to 6" handled by the same parser).

---

## 10. UI and navigation

**Theme:** Civic style (white, soft rounding, Noto Sans + Noto Sans Bengali, local fonts) in the Monsoon indigo palette, light and dark. Design system artifact updated first: https://claude.ai/artifact/V44tU8dshbDmJ5PsCHo3LA

**Navigation**

| Area | Screens |
|---|---|
| Projects | Your projects, compare two projects |
| Project | Setup interview, Site (plot, envelope, setbacks), Phases |
| Design | Floor plans (choose and fit, 2D), 3D model, Unit mix, Daylight |
| Engineering | Structure (grid, members), Compliance (incl. fire and accessibility), Rebar, Connections |
| Construction | BOQ, Formwork, Pour sequence |
| Documents | Drawings, Reports, Permit package, Exports (IFC, FreeCAD, DXF) |
| Other | Help, Settings (language, units, theme), About and licences |

**Removed:** Windows installer page, Templates (merged into Floor plans), Import review (fake), Construction, Value engineering and Sustainability (mock data). Any of these can return later on real data.

**New kit components:** data table, segmented control, plan canvas (SVG), value-with-unit, citation chip, status chip, toast, empty state.

**Accessibility:** keyboard reachable, visible focus, contrast AA in both themes, `lang` set per text run, Bangla body text never below 14 px.

---

## 11. Quality gates

| Layer | Tool | Gate |
|---|---|---|
| Types | `tsc --noEmit` | zero errors |
| Units | Vitest | parsers, evaluators, engines; rule-pack test vectors |
| Sweeps | existing audit scripts, extended | every plan × plot range × storeys: plan validator, solid audit, mesh audit, structural sweep |
| Variety | property tests | outputs must differ between different buildings |
| Exports | golden files | IFC/DXF for 3 reference projects; IFC validation 0 errors |
| UI | Playwright | every route opens in EN/BN and light/dark with no console errors; axe accessibility scan |
| Size | build report | initial JS budget, screens code-split |
| CI | GitHub Actions | all of the above on each push; Windows installer built on tags |

---

## 12. Milestones

Sizes are relative (S, M, L, XL), not dates.

| # | Milestone | Size | Depends on | Done when |
|---|---|---|---|---|
| M0 | Foundation | S | - | Checkout repaired, Vitest + CI running, ProjectSpec v3 types + v2 migration, one version number |
| M1 | Design system and shell | M | M0 | Artifact updated, tokens and kit replaced, new navigation, dark mode, all old screens still open |
| M2 | Plans and building model | XL | M0 | Plan format, 10 plans, fitter, validator, `deriveBuilding`, model → mesh; exporters and audits pass on the new mesh |
| M3 | Rules | M | M2 | RAJUK evaluators ported with all test vectors; setbacks feed the envelope; compliance screen on new results |
| M4 | Structure and detailing | L | M2 | Engine rewritten, hand-calc tests pass, rebar from stock list, structure screen |
| M5 | Quantities and documents | M | M4 | Takeoff, BOQ with dated rates, drawings and permit package from the model |
| M6 | Interview and polish | M | M2, M3 | Flow-book interview with parser, all screens on the model, old code deleted |
| M7 | Release | S | all | Tauri fixed (devUrl, icons, CSP, no server), PWA icons, code splitting, installer on CI, offline check |

M1 and M2 can run in parallel (different files). M3 and M4 can run in parallel once M2's model exists.

---

## 13. Task list

**M0**
- T0.1 Restore `repo/_keep_2` into the repo root (or re-clone), recover the 5 missing root docs, branch `v3`
- T0.2 Add Vitest; move existing `scripts/tests` assertions into it where cheap
- T0.3 GitHub Actions: tsc, tests, audits, build
- T0.4 `ProjectSpec` v3 types from the schema; `migrateV2()`; versioned storage keys
- T0.5 Single version source (package.json → Tauri, About, README)

**M1**
- T1.1 Rebuild the design system artifact in the Civic style and chosen palette
- T1.2 Replace `tokens.css` / `tokens.ts`, local Noto fonts, remove the remote Plus Jakarta font
- T1.3 Restyle kit components; add the new ones from §10
- T1.4 New sidebar groups and routes; Settings screen with theme and language
- T1.5 Remove dead screens and files (orphans, mock data, model registry, Windows installer page)

**M2**
- T2.1 Plan JSON schema and loader
- T2.2 Fitter with rejection reasons; mirror for road side
- T2.3 Plan validator (§5.4) and plan × plot sweep audit
- T2.4 Author 10 floor plans + 3 parking layouts
- T2.5 `deriveBuilding`: storeys, rooms, walls, openings, core, grid, members
- T2.6 Model → mesh (reuse solidKernel, stair builder); retire presets and percentage layouts
- T2.7 2D plan canvas drawn from the model (replaces JPG previews)
- T2.8 Site screen: plot entry, envelope and setbacks drawn

**M3**
- T3.0 Find the official BNBC 2020 and DAP 2022 documents online (government or publisher sources only), record them in `spec/sources/registry.yaml`, and extract cited values for §6 and §7.2
- T3.1 YAML rule-pack loader with schema validation
- T3.2 Port FAR / setback / coverage / parking evaluators; run all test vectors
- T3.3 BNBC check list with citations; `not_checked` for unsourced items
- T3.4 Deviation register UI; compliance report export

**M4**
- T4.1 Load model and combinations (sourced values, assumption flags)
- T4.2 Slab, beam, column, footing, seismic modules with hand-calc tests
- T4.3 Section sizing from stock lists; unclamped utilisation
- T4.4 Rebar detailing and BBS from member results
- T4.5 Structure screen (grid view, member table, failures first)

**M5**
- T5.1 Quantity takeoff from model and BBS
- T5.2 Rate card loader; BOQ with dated sources and overrides
- T5.3 Drawings (plans, sections, elevations) from the model
- T5.4 Permit package (drawings + BOQ + compliance + assumptions)

**M6**
- T6.1 Flow-book runner; port answer parser with its test cases
- T6.2 Move remaining screens (formwork, pours, daylight, unit mix, connections, column grid) onto the model
- T6.3 Remove `/api/cad`, Express server, isomorphic core stubs, old generator code
- T6.4 Honest README and Help content

**M7**
- T7.1 Tauri config: devUrl, icons (incl. 128x128@2x), CSP, version
- T7.2 Code splitting and size budget
- T7.3 PWA icons and offline check
- T7.4 Windows installer built and smoke-tested on CI

---

## 14. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Regulatory values not sourced (BNBC 2020, DAP 2022) | Wrong checks | Ship only cited rules; everything else "not checked"; ask for official PDFs |
| Engineering liability | Users trust screening numbers too much | Clear "screening, not final design" labelling on every engineering screen and export |
| Plan authoring effort | Library too small to be useful | Start with 10 well-tested plans; the grid format makes new ones quick to add |
| Generator rewrite (2,174 lines) | Regressions in mesh/exports | Keep solidKernel and exporters; golden-file tests before switching over |
| Old saves lack plot shape | Migration gaps | Ask on open, pre-fill an estimate marked as an assumption |
| Bangla text in DXF/IFC | Garbled exports | Test exports with Bangla names; fall back to English in CAD files if needed |
| Performance of derive on every change | Laggy UI | Memoise by revision; derive in a Web Worker if needed |

---

## 15. Decisions (settled 2026-11-08)

| # | Decision | Answer | Effect on the plan |
|---|---|---|---|
| 1 | Palette | **Monsoon indigo**, Civic style | M1 builds the design system in indigo (`#2E4FA3` light, `#8EA6F0` dark) |
| 2 | AI model fleet | **Drop entirely** | No llama.cpp, no model downloads; remove the model registry, cards and fleet files in T1.5 |
| 3 | Main user | **Both** homeowners and engineers | Plain language by default; an engineering detail view on every engineering screen |
| 4 | BNBC 2020 / DAP 2022 sources | **Find the official documents online** | New task T3.0; checks cite the official publication and page; anything not found stays "not checked" |
| 5 | Floor plans | **Author from scratch** | T2.4 writes 10 original plans + 3 parking layouts; scraped JPGs removed |
| 6 | Platforms | **Windows and web** | One codebase; Tauri installer plus web/PWA build in M7 |
| 7 | Region | **Dhaka (RAJUK) only** for v3 | Only the RAJUK rule pack ships; the authority picker shows others as "coming later" |
