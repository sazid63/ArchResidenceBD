# ArchResidenceBD v2.5.4 (v3 work in progress)

A bilingual (English / Bangla) app for residential buildings in Dhaka. Enter a plot, pick a floor plan, and the app derives the 3D model, a structural screening, the RAJUK and BNBC checks, the bar schedule, a bill of quantities and drawings from that one choice. Everything runs in the browser (and in a Tauri desktop shell); there is no server, no account and no upload.

**There is no AI in this app.** Every number comes from fixed rules and formulas, and the guided interview reads answers with a deterministic parser. The app is a screening tool: its output is not a signed design, and RAJUK needs drawings and calculations checked and signed by licensed architects and engineers.

## What it does

| Screen | What you get |
|---|---|
| Project setup | Plot size, frontage, depth, road width, storeys, dwellings per floor, and the plans that fit the plot after the RAJUK setbacks |
| 3D model | The building as a parametric 3D model, with FreeCAD and IFC export |
| Code compliance | RAJUK 2008 setbacks, floor-area ratio, coverage; plan checks; each result with its citation, and "not checked" where a value cannot be cited |
| Structure | Loads, slabs, beams, columns, footings and seismic checks to BNBC 2020 Part 6 (screening, assumptions listed on the screen) |
| Rebar schedule | Bar bending schedule from the structure, CSV download |
| Bill of quantities | Quantities from the model and the bar schedule, priced from a dated rate card (a lower bound while the card is a candidate) |
| Drawings | Site plan, floor plans, section and elevations as SVG and DXF, and a permit package zip (drawings, BOQ, bar schedule, compliance report, assumptions) |
| Land units, Help | Katha / shotok / bigha / gonda converter and an offline manual |

Known limits are written on the screens and in `docs/handover/NEXT.md`.

## Technology

React 19, TypeScript, Vite 8, Tailwind CSS 4, a Tauri 2 desktop shell. Projects are stored in the browser's local storage (format v3, see `src/model`); older saves are converted the first time the app opens and the old copy is kept as a backup. There is no backend.

## Getting started

Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build into dist/
npm run preview    # serve the build
```

Tests and checks:

```bash
npx tsc --noEmit            # types
npm test                    # unit tests (vitest)
npm run audit:structural    # independent structural statics sweep
npm run verify              # tsc + tests + hooks, manual, sizing and solid audits
```

## Repository layout

```
src/plans/        floor plans: library, fit to plot, geometry, validation, SVG rendering
src/model/        project format v3, migration from v2, store, building model, 3D mesh, legacy adapter
src/rules/        RAJUK 2008 and BNBC rule packs, checks, the compliance report
src/structure/    loads, slabs, beams, columns, footings, seismic, rebar and the bar schedule
src/quantities/   takeoff and BOQ from the model and the bar schedule
src/drawings/     drawing sheets, SVG and DXF writers, the permit package and zip
src/interview/    the guided interview: answer parser, flow-book loader, runner
src/screens/      the screens above, plus 3D, formwork, pour sequence, daylight, unit mix
src/cad/          the 3D engine and exporters
spec/             rule packs (YAML), rate cards, schemas, the interview flow book
scripts/          audits and tests run by npm run verify
docs/handover/    NEXT.md (current state and open items) and TICKETS.md
```

Older reports under `docs/` (audits, knowledge base, model card) describe earlier versions and are out of date; `docs/handover/NEXT.md` is the source of truth.

## Regulatory sources

RAJUK Imarat Nirman Bidhimala 2008 (rule pack reviewed) and BNBC 2020 Parts 6 and 8 (rule packs marked candidate until reviewed). A value that cannot be cited is shown as "not checked", never passed.

## Licence

MIT. See [LICENSE](LICENSE).
