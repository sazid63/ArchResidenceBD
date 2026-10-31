# 🛠️ Scripts Index

Organized utility scripts for development, testing, and auditing.

---

## 📁 Structure

```
scripts/
├── tests/        # Regression + smoke tests (exit non-zero on failure)
├── audits/       # Geometry, preset, structural and code audits
├── render/       # Software 3D renderer (PNG output)
└── extraction/   # One-off data extraction (floor-plan links/images, PDFs)
```

Generated output goes to `audits/audit-out/` and `tests/exporter-out/` (both gitignored).
`npm run verify` runs typecheck + floor-plan chain test + solid audit + preset audit.

## 🧪 Tests (`tests/`)

| Script | Purpose |
|--------|---------|
| `user-test-3story.ts` | **Main user test** — 3-story/5 katha full workflow |
| `test-exporters.ts` | IFC/STEP/FreeCAD macro export validation |
| `test-drawings.ts` | Floor plan/section/elevation generation |
| `test-boq.ts` | BOQ generation & CSV export |
| `check-corridor.ts` | Corridor width measurement verification |
| `check-mesh.ts` | Mesh quality (duplicate IDs, zero volume) |
| `check-png.ts` / `check-png2.ts` / `quick-png-check.ts` | PNG render validation |
| `verify-pngs.mjs` | PNG batch verification |
| `compliance-test.ts` | BNBC/RAJUK compliance check |
| `batch-export.ts` | Batch export CLI |
| `floorplan-chain.ts` | **Chosen floor plan reaches every floor** (`npm run test:floorplan`) |

---

## 🔍 Audits (`audits/`)

| Script | npm script | Purpose |
|--------|-----------|---------|
| `solid-audit.ts` | `audit:solid` | **Strict solid validator**: overlaps, z-fighting, closed/outward faces, floating solids; 11 presets x 3 heights x 2 plots |
| `mesh-audit.ts` | `audit:mesh` | Deterministic overlap/z-fight audit + software renders (writes PNG + report) |
| `preset-audit.ts` | `audit:presets` | Floor-plan preset data: room overlaps, footprint coverage, rooms without door/window |
| `structural-sweep.ts` | `audit:structural` | Column/beam sizing sweep across stories |
| `full-audit.ts` | `audit:full` | Structural + compliance audit over generated buildings |
| `probe.ts` | | Quick import-chain diagnostic |

---

## 🎨 Render (`render/`)

| Script | Purpose |
|--------|---------|
| `render-3d.ts` | **Software 3D renderer** — ISO/front/side/top PNGs |
| `render5story.ts` | 5-story building render |
| `renderInteriors.ts` | Interior view renders |

---

## 📤 Outputs (gitignored)

| Folder | Contents |
|--------|----------|
| `audits/audit-out/` | Audit JSON/MD reports and renders |
| `tests/exporter-out/` | Test export files (.fcmacro, .step) |

---

## 🚀 Quick Start

```bash
# Run Rafiq's full 3-story test
npx tsx scripts/tests/user-test-3story.ts

# Render 3D views
npx tsx scripts/render/render-3d.ts

# Run full audit
npx tsx scripts/audits/full-audit.ts

# Validate exporters
npx tsx scripts/tests/test-exporters.ts
```