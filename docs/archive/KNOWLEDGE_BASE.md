# ArchResidenceBD — Engineering Knowledge Base

**Version:** 2.4.0  
**Last Updated:** 2026-10-29  
**Location:** Dhaka, Bangladesh  
**Standards:** BNBC 2020, ACI 318-19, RAJUK DAP 2022

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Structural Engineering Principles](#structural-engineering-principles)
3. [Architectural Patterns](#architectural-patterns)
4. [Code Compliance Framework](#code-compliance-framework)
5. [3D Mesh Generation](#3d-mesh-generation)
6. [BOQ & Pricing](#boq--pricing)
7. [Drawing Generation](#drawing-generation)
8. [Agent Team Patterns](#agent-team-patterns)
9. [Validation & Testing](#validation--testing)
10. [Common Pitfalls & Fixes](#common-pitfalls--fixes)

---

## Project Overview

### Purpose
Parametric building generator for Bangladesh residential buildings (2–8 storeys) producing:
- Watertight 3D mesh models (WebGL rendering)
- Structural analysis (BNBC 2020 compliant)
- Code compliance reports (8 BNBC rules + RAJUK checks)
- 2D architectural drawings (SVG/DXF)
- Bill of Quantities with Bangladesh market rates

### Tech Stack
- **Frontend:** React + Vite + TypeScript
- **3D Rendering:** Vanilla WebGL 1.0
- **Backend:** Node.js/Express (Gemini proxy)
- **CAD Engine:** Custom TypeScript (mesh generation, structural analysis)
- **Export:** IFC4 STEP, FreeCAD macros, CSV BOQ

### File Structure
```
src/
├── cad/
│   ├── parametricBuildingGenerator.ts  # Main mesh generator
│   ├── structuralEngine.ts             # BNBC structural analysis
│   ├── codeCompliance.ts               # 8 BNBC + RAJUK rules
│   ├── drawingEngine.ts                # SVG/DXF generation
│   ├── boqGenerator.ts                 # Bill of Quantities
│   ├── rebarDetailer.ts                # Bar bending schedules
│   ├── exporters.ts                    # IFC STEP + FreeCAD
│   └── viewer.ts                       # WebGL renderer
├── engine/
│   ├── projectState.ts                 # Project management
│   └── phaseAiEngine.ts                # AI phase guidance
└── screens/                            # React UI components
scripts/
├── mesh-audit.ts                       # Geometry validation
├── full-audit.ts                       # 36-case parametric sweep
├── structural-sweep.ts                 # Structural validation
├── compliance-test.ts                  # 108-case compliance test
└── test-boq.ts                         # BOQ generation test
```

---

## Structural Engineering Principles

### Material Specifications (Default)
| Component | Grade | Properties |
|-----------|-------|------------|
| Concrete | M25 | f_ck = 25 MPa, f_cd = 16.67 MPa, γ_c = 1.5 |
| Steel | Fe415 | f_y = 415 MPa, f_yd = 360.87 MPa, γ_s = 1.15 |
| Brick Masonry | 7.5 MPa | Typical for Bangladesh |

### Column Auto-Sizing (Validated by `scripts/audits/structural-sweep.ts`)

| Stories | Small Plot (<200 m²) | Medium (200–300 m²) | Large (>300 m²) |
|---------|---------------------|---------------------|-----------------|
| 2–3 | 300 mm × 300 mm | 300 mm × 300 mm | 300 mm × 300 mm |
| 4–5 | 300 mm × 300 mm | 300 mm × 300 mm | **350 mm × 350 mm** |
| 6–7 | **350 mm × 350 mm** | **350 mm × 350 mm** | **400 mm × 400 mm** |
| 8+ | 400 mm × 400 mm | 400 mm × 400 mm | 450 mm × 450 mm |

**Key Insight:** 250mm columns are **structurally invalid** for any building ≥2 storeys (beam utilization exceeds 0.85).

### Beam Design
- **Section:** 250 mm × 500 mm (for 300mm+ columns)
- **Span:** 4.0–6.0 m typical
- **Deflection Limit:** L/360 (≈12.5 mm for 4.5 m span)
- **Utilization Target:** ≤0.85 (moment), ≤0.80 (shear)

### Seismic Design (BNBC 2020, Dhaka Zone 3)
- **Formula:** T_a = C_t × h^n
- **Coefficients:** C_t = 0.07, n = 0.75 (RC moment frame)
- **Expected Period:** 0.2–1.5 s for 2–8 storey buildings
- **Base Shear:** V = (Z × I × C_s × W) / R
  - Z = 0.25 (Zone 3)
  - I = 1.0 (residential)
  - R = 5.0 (special RC frame)

### Footing Design
- **Safety Factor:** ≥2.5 against bearing capacity failure
- **Soil Parameters (Dhaka stiff clay):**
  - q_u = 250 kN/m² (ultimate)
  - q_a = 150 kN/m² (allowable)
  - SPT N = 15
- **Minimum Size:** 1800 mm × 1800 mm × 1600 mm deep

### Reinforcement Detailing (ACI 318-19)
- **Development Length:** l_d = (f_y × d_b) / (20 × λ × √f'_c)
- **Lap Splice:** Class B = 1.3 × l_d (typical)
- **Seismic Hooks:** 135° with 10d_b extension
- **Column Links:** 8 mm @ 100 mm c/c (plastic hinge zones)

---

## Architectural Patterns

### Standard Presets (9 Types)
1. **dual-3bed** — Two 3-bedroom units per floor (234–334 m² plots)
2. **single-luxury** — Single large unit with master suite (267 m²+)
3. **triple-rental** — Three compact rental units (334 m²+)
4. **ground-parking** — Open parking on ground floor (267 m²+)
5. **penthouse-luxury** — Duplex penthouse on top floors (334 m²+)
6. **architect-villa** — Custom luxury with courtyard (133–334 m²)
7. **narrow-duct** — Narrow plot optimization (133–166 m²)
8. **duplex-courtyard** — Central courtyard duplex (334 m²+)
9. **studio-bachelor** — Studio/bachelor units (133–200 m²)

### Room Layout Rules
- **Minimum Room Sizes:**
  - Bedroom: 3.0 m × 3.6 m (10.8 m²)
  - Living: 3.6 m × 4.8 m (17.3 m²)
  - Kitchen: 2.4 m × 3.0 m (7.2 m²)
  - Bathroom: 1.8 m × 2.4 m (4.3 m²)
- **Ceiling Heights:** 3.0 m typical, 3.3 m luxury
- **Stair Width:** ≥1000 mm clear (BNBC minimum)
- **Corridor Width:** ≥1200 mm for egress

### Facade Patterns
- **Window Sills:** 900 mm above finished floor
- **Window Heads:** 2100 mm (door height) or beam soffit
- **Balcony Depth:** 1200 mm typical
- **Parapet Height:** 1050 mm above roof (safety)

---

## Code Compliance Framework

### BNBC 2020 Rules (8 Checks)

| Rule ID | Clause | Title | Severity | Check |
|---------|--------|-------|----------|-------|
| BNBC-001 | §4.2.1 | Maximum Building Height | Critical | Height ≤ 30 m (8 storeys) for residential |
| BNBC-002 | §4.5 | Setback Requirements | Major | Front 3.0 m, Rear 2.0 m, Sides 1.5 m |
| BNBC-003 | §2.5 | Seismic Zone Assignment | Critical | Dhaka = Zone 3 (Z=0.25) |
| BNBC-004 | §4.7 | Fire Separation | Major | Walls between units, stair enclosure |
| BNBC-005 | §5.3 | Structural Material Grades | Major | Concrete ≥ M20, Steel ≥ Fe415 |
| BNBC-006 | §5.2 | Floor Area Ratio (FAR) | Major | FAR ≤ 3.0 (Dhaka residential) |
| BNBC-007 | §4.4 | Occupancy Load & Egress | Major | Stair width ≥ 1000 mm, corridor ≥ 1200 mm |
| BNBC-008 | §2.5.4 | Earthquake Drift Limit | Critical | Δ ≤ 0.025 × story height |

### RAJUK DAP 2022 Checks
- **RAJUK-001:** Front setback ≥ 4.5 m for plots > 5 Katha
- **RAJUK-002:** Parking provision (1 space per 150 m² floor area)

### Compliance Test Results
- **108 test cases** (9 presets × 4 stories × 3 plot sizes)
- **54 fully compliant** (2–3 storey buildings)
- **54 with FAR deviations** (5–7 storey, expected — FAR limit exceeded)
- **0 crashes** — production ready

---

## 3D Mesh Generation

### Mesh Object Kinds
| Kind | Description | Typical Volume |
|------|-------------|----------------|
| `slab` | Floor/roof slabs (125 mm thick) | 15–30 m³ per floor |
| `beam` | Frame beams (250×500 mm) | 8–12 m³ per floor |
| `column` | RC columns (300–400 mm square) | 10–20 m³ total |
| `footing` | Isolated footings | 30–50 m³ total |
| `wall` | Exterior/interior walls (136 mm) | 50–100 m³ total |
| `stair` | Dog-legged staircase | 5–8 m³ per flight |
| `window` | Sliding glass + frame | 0.1 m³ each |
| `door` | Timber door + frame | 0.15 m³ each |
| `bath` | Sunken bathroom basin | 0.5 m³ each |
| `canopy` | Entrance portico | 2–3 m³ |
| `tank` | Roof water tank | 10–15 m³ |

### Mesh Quality Standards
- **Degenerate Objects:** 0 (all dimensions ≥ 1 mm)
- **Duplicate Objects:** 0 (unique bounding boxes)
- **Overlaps:** Expected (walls intersect slabs, etc.) — not defects
- **Z-Fights:** < 500 mm² area (textured surfaces only)

### Audit Commands
```bash
# Full geometry audit (50 cases)
npx tsx scripts/mesh-audit.ts

# Single case structural + compliance
npx tsx scripts/full-audit.ts

# Export validation
npx tsx scripts/test-exporters.ts
```

---

## BOQ & Pricing

### Rate Table (Dhaka 2025, BDT)

| Item | Unit | Rate (৳) | Description |
|------|------|----------|-------------|
| Ready-mix concrete M25 | m³ | 12,500 | Including formwork, placement |
| RCC columns & beams | m³ | 10,500 | M25, including formwork |
| Brick wall 136 mm | m² | 4,200 | Fired clay, CM 1:6 |
| Ceramic floor tiles | m² | 1,200 | 300×300 mm, white cement grout |
| TMT reinforcement Fe415 | ton | 95,000 | 12–25 mm diameter |
| Wooden window | m² | 3,800 | 800×1500 mm, single shutter |
| Electrical wiring | m² | 850 | Concealed, switchgear included |
| Plumbing & sanitary | kp | 285,000 | Per bathroom (complete) |

### BOQ Generation Process
1. **Extract quantities** from mesh (volumes, areas, counts)
2. **Map to rate items** using `KIND_TO_BOQ` table
3. **Calculate totals** by category
4. **Add VAT** (5% per Bangladesh)
5. **Export** as CSV, JSON, or Markdown report

### Sample Output (5-storey, 234 m² plot)
```
Concrete Works:      ৳4,353,505 (371.85 m³)
Masonry Works:       ৳1,202,509 (318.76 m²)
Joinery:                ৳54,680 (15.36 m²)
Finishes:                ৳8,974 (5.19 m²)
Metal Works:           ৳242,723 (2.55 ton rebar)
Plumbing & Sanitary:   ৳855,000 (3 bathrooms)
Electrical:            ৳696,448 (819 m² wiring)
─────────────────────────────────────────────
Subtotal:              ৳7,413,838
VAT (5%):                ৳370,692
Grand Total:           ৳7,784,530
```

---

## Drawing Generation

### Available Views
- **Floor Plans:** Ground, Floor 1–4, Roof (SVG + DXF)
- **Sections:** Typical building section (SVG)
- **Elevations:** Front, Rear, Side (SVG)

### Drawing Standards
- **Scale:** 1:100 for plans, 1:50 for details
- **Layers:** WALLS, DOORS, WINDOWS, DIMENSIONS, TEXT, FURNITURE, GRIDS
- **Line Weights:**
  - Walls: 0.5 mm (black)
  - Windows: 0.25 mm (gray)
  - Dimensions: 0.18 mm (blue)
  - Text: 0.18 mm (black)

### Usage Example
```typescript
import { generateFloorPlanFromMesh, exportDrawingAsSVG } from './cad/drawingEngine';

const drawing = generateFloorPlanFromMesh(mesh, 'ground_floor', {
  scale: 100,
  project: 'My Building',
  drawingNo: 'A-101',
});

const svg = exportDrawingAsSVG(drawing);
```

---

## Agent Team Patterns

### Existing Agents
| Agent | Role | Status |
|-------|------|--------|
| `structural-analyst` | Parametric structural validation | ✅ Active |
| `compliance-auditor` | BNBC/RAJUK compliance testing | ✅ Active |
| `drawing-gen` | 2D drawing generation | ✅ Active |
| `exporter-agent` | IFC STEP + FreeCAD export | ✅ Available |
| `audit-agent` | Mesh quality audit | ✅ Available |

### Agent Communication Patterns
1. **Fork Context:** Agents inherit completed conversation turns
2. **Shared Workspace:** All file edits visible immediately
3. **Task Dependencies:** Use `team_task_create` for ordered work
4. **Status Reporting:** Agents send summary messages to Lead on completion

### Example Agent Prompt Template
```markdown
You are the [ROLE] for ArchResidenceBD. Your job is [TASK].

## Context
[Project background, relevant files, standards]

## Your Tasks
1. [Specific task 1]
2. [Specific task 2]
3. [Validation/deliverable]

## Key Imports
```typescript
import { X } from "../src/cad/Y.js";
```

## Output
Run with `npx tsx scripts/[name].ts` and report findings to Lead.
```

---

## Validation & Testing

### Test Suite
| Script | Purpose | Cases | Pass Criteria |
|--------|---------|-------|---------------|
| `mesh-audit.ts` | Geometry validation | 50 | 0 degenerate, 0 duplicates |
| `full-audit.ts` | Full parametric sweep | 27 | <5 critical issues |
| `structural-sweep.ts` | Structural validation | 36 | Column util ≤0.80, beam ≤0.85 |
| `compliance-test.ts` | BNBC/RAJUK checks | 108 | 0 crashes, FAR deviations expected |
| `test-exporters.ts` | IFC/FreeCAD export | 1 | 0 validation errors |
| `test-boq.ts` | BOQ generation | 1 | All categories populated |
| `test-drawings.ts` | SVG/DXF export | 6 phases | Valid SVG + DXF per phase |

### Build & Run Commands
```bash
# TypeScript check
npx tsc --noEmit

# Production build
npm run build

# Run all audits
npx tsx scripts/mesh-audit.ts
npx tsx scripts/full-audit.ts
npx tsx scripts/compliance-test.ts
```

---

## Common Pitfalls & Fixes

### 1. Column Size Too Small (250 mm)
**Symptom:** Beam utilization > 0.85, structural failure  
**Fix:** Use auto-sizing table (300 mm minimum for 2+ storeys)  
**File:** `parametricBuildingGenerator.ts` lines 1082–1095

### 2. Stair Missing on Upper Floors
**Symptom:** `MISSING_STAIR_FLOORS` critical error  
**Fix:** Ensure `createFittedStair` called for each floor phase, emit stair void markers when stairwell too narrow  
**File:** `parametricBuildingGenerator.ts` lines 1664–1677

### 3. Z-Fighting (Window Sills vs Walls)
**Symptom:** Visual flickering in renders, 375,000 mm² Z-fights  
**Fix:** Inset sills 25 mm from wall faces  
**File:** `parametricBuildingGenerator.ts` lines 220, 241

### 4. Bath Basin Overlaps Slab
**Symptom:** 955,000,000 mm³ overlaps (basin intersects slab)  
**Fix:** Place basin at slab Z (not below), use 50 mm height  
**File:** `parametricBuildingGenerator.ts` line 982

### 5. Canopy Overlaps Beam
**Symptom:** 57,000,000 mm³ canopy-beam overlap  
**Fix:** Raise canopy 10 mm above beam top  
**File:** `parametricBuildingGenerator.ts` lines 1346–1360

### 6. Stair Landing Z-Fight
**Symptom:** 250,000 mm² stair-landing Z-fight  
**Fix:** Lower landing 5 mm below flight treads  
**File:** `parametricBuildingGenerator.ts` lines 906–919, 938–951

### 7. TypeScript `never[]` Errors
**Symptom:** `Property 'push' does not exist on type 'never'`  
**Fix:** Explicitly type array: `const issues: Array<{code: string; ...}> = []`  
**Example:** `full-audit.ts` line 130

### 8. Missing `address` Property
**Symptom:** `Property 'address' is missing in type BuildingProject`  
**Fix:** Add `address: "Mirpur, Dhaka"` to all project objects  
**Files:** All scripts, `ComplianceScreen.tsx`

---

## Quick Reference

### BNBC 2020 Key Numbers
- **Seismic Zone (Dhaka):** Zone 3, Z = 0.25
- **FAR (Residential):** 3.0 maximum
- **Stair Width:** ≥1000 mm clear
- **Corridor Width:** ≥1200 mm for egress
- **Room Height:** ≥2.75 m clear
- **Concrete Cover:** 40 mm (beams/columns), 75 mm (foundations)

### ACI 318-19 Key Formulas
- **Development Length:** `l_d = (f_y × d_b) / (20 × λ × √f'_c)`
- **Lap Splice (Class B):** `1.3 × l_d`
- **Seismic Hook:** 135° + 10d_b extension

### RAJUK DAP 2022 Key Numbers
- **Front Setback:** 4.5 m (plots > 5 Katha)
- **Parking:** 1 space per 150 m² floor area
- **Maximum Coverage:** 80% (residential)

---

## Contact & Support

**Project Lead:** ArchResidenceBD Team  
**Repository:** `C:\1_SAJID\ArchResidenceBD\repo`  
**Documentation:** This file + inline code comments  
**Test Reports:** `scripts/audit-out/` directory

---

*Generated by the ArchResidenceBD AI Fleet — 2026-10-29*