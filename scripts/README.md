# 🛠️ Scripts Index

Organized utility scripts for development, testing, and auditing.

---

## 📁 Structure

```
scripts/
├── tests/          # Unit & integration tests
├── audits/         # Code & architecture audits
├── render/         # 3D rendering & visualization
├── audit-out/      # Audit outputs (gitignored)
├── exporter-out/   # Export test outputs (gitignored)
├── planning/       # Planning images (gitignored)
├── structural-sweep.ts   # Structural analysis CLI
```

---

## 🧪 Tests (`tests/`)

| Script | Purpose |
|--------|---------|
| `user-test-3story.ts` | **Main user test** — 3-story/5 katha full workflow |
| `test-exporters.ts` | IFC/STEP/FreeCAD macro export validation |
| `test-drawings.ts` | Floor plan/section/elevation generation |
| `test-boq.ts` | BOQ generation & CSV export |
| `test-drawings.ts` | Drawing engine smoke test |
| `test-exporters.ts` | Exporter smoke test |
| `check-corridor.ts` | Corridor width measurement verification |
| `check-mesh.ts` | Mesh quality (duplicate IDs, zero volume) |
| `check-png.ts` / `check-png2.ts` / `quick-png-check.ts` | PNG render validation |
| `verify-pngs.mjs` | PNG batch verification |
| `compliance-test.ts` | BNBC/RAJUK compliance check |
| `batch-export.ts` | Batch export CLI |
| `user-test-3story.ts` | **Rafiq's full workflow** |

---

## 🔍 Audits (`audits/`)

| Script | Purpose |
|--------|---------|
| `full-audit.ts` | Complete line-by-line code audit |
| `mesh-audit.ts` | Mesh quality & watertightness |
| `probe.ts` | Quick diagnostic probe |

---

## 🎨 Render (`render/`)

| Script | Purpose |
|--------|---------|
| `render-3d.ts` | **Software 3D renderer** — ISO/front/side/top PNGs |
| `render5story.ts` | 5-story building render |
| `renderInteriors.ts` | Interior view renders |

---

## 🏗️ Structural

| Script | Purpose |
|--------|---------|
| `structural-sweep.ts` | Column/beam sizing sweep across stories |

---

## 📤 Outputs (gitignored)

| Folder | Contents |
|--------|----------|
| `audit-out/` | Audit JSON/MD reports |
| `exporter-out/` | Test export files (.fcmacro, .step) |
| `planning/` | Planning images (JPG/PNG) |

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