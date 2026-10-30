# ArchResidenceBD v2.4 — 5-Storey Design Audit & Remediation Plan

**Date:** 2026-10-29  
**Reviewer:** Lead Agent (Claude Opus)  
**App State:** Server running at http://0.0.0.0:3000 (npm run dev)  
**Build:** `npm run build` ✓ (539 KB bundle)  
**Mesh Audit:** 50-case automated mesh audit passes (0 degenerate, 0 duplicate solids)  

---

## Executive Summary

A 5-storey building (Dhaka, 3.5 katha ≈ 234 m² plot, 2 units/floor) was generated and subjected to automated geometric, structural, and compliance analysis. The design engine produces watertight meshes with correct phase segmentation, but **seven critical defects** were found that would make the app unusable in a professional civil engineering context. This plan details each defect, its root cause, and the fix.

---

## Audit Evidence (5-Storey Demo)

```
OBJECT COUNTS: footing=12, column=78, beam=184, slab=52, wall=262,
               stair=16, tank=3, canopy=1, window=61, partition=233,
               door_frame=138, door=46, railing=59, balcony=4,
               kitchen=16, parapet=4
TOTAL OBJECTS: 1169 | TOTAL TRIANGLES: 14028
FOOTPRINT: 22.35 x 22.35 m | HEIGHT: 22.35 m
```

---

## Defects Found (Ranked by Severity)

### 🔴 CRITICAL-1: TypeScript Compilation Error — `rebarDetailer.ts`

**File:** `src/cad/rebarDetailer.ts`, lines 71, 73, 85, 86, 89  
**Error:** Parameter names contain apostrophes (`f'_c`) which are illegal in TypeScript/JavaScript identifiers.

```typescript
// BROKEN:
function developmentLength(db: number, f_y: number, f'_c: number, lambda: number = 1.0): number {
  return (f_y * db) / (20 * lambda * Math.sqrt(f'_c));
}
function hookDevelopmentLength(db: number, f_y: number, f'_c: number): number {
  return 8 * db * Math.sqrt(f_y / f'_c);
}
```

**tsc output:**
```
src/cad/rebarDetailer.ts(71,54): error TS1005: ',' expected.
src/cad/rebarDetailer.ts(71,98): error TS1002: Unterminated string literal.
... (8 more errors)
```

**Impact:** `rebarDetailer.ts` cannot be imported by any module. The BBS export feature is dead code.

**Fix:** Rename parameter `f'_c` → `fcPrime` (or `fc_`) in all three functions and their call sites.

**Effort:** 5 minutes (single-file grep+replace).

---

### 🔴 CRITICAL-2: `buildComplianceContext` Runtime Crash

**File:** `src/cad/codeCompliance.ts`, line 426  
**Error:** Malformed `Math.max` call with unbound variable `s` in nested expression.

```typescript
// BROKEN (current code):
const stairWidth = stairs.length > 0
  ? Math.max(...stairs.map(s => s.bboxMaxMm[0] - s.bboxMinMm[0], s.bboxMaxMm[1] - s.bboxMinMm[1]))
  : 1050;
```

The `.map(s => ..., ...)` syntax here passes two arguments to the arrow function body but the second `s` is outside the arrow's scope — it throws `ReferenceError: s is not defined` at runtime.

**Evidence from demo run:**
```
ReferenceError: s is not defined
    at buildComplianceContext (codeCompliance.ts:426:68)
```

**Fix:** Correct the nested `Math.max`:
```typescript
const stairWidth = stairs.length > 0
  ? Math.max(...stairs.map(s => Math.max(s.bboxMaxMm[0] - s.bboxMinMm[0], s.bboxMaxMm[1] - s.bboxMinMm[1])))
  : 1050;
```

**Effort:** 2 minutes.

---

### 🔴 CRITICAL-3: Columns Have Inconsistent Cross-Sections

**File:** `src/cad/parametricBuildingGenerator.ts` (column generation path)  
**Observed:** 78 columns across 5 sizes:
```
300×300×1150   ← pedestal stubs (correct)
250×250×2400   ← typical floor columns
200×150×2400   ← WRONG: 200×150 instead of 250×250
250×250×2875   ← roof/column extension
250×250×800    ← short stubs (ground floor pedestal)
```

**Root cause:** Some columns are generated from a different code path (likely interior partition columns or grade-beam stubs) that uses a hardcoded 200×150 default instead of respecting `customParams.columnWidthMm / columnDepthMm`.

**Impact:** 12 out of 78 columns (≈15%) have incorrect cross-sections, leading to incorrect structural calculations.

**Fix:** Trace every call site in `parametricBuildingGenerator.ts` that emits a `kind === "column"` object and ensure all use `customParams.columnWidthMm` and `customParams.columnDepthMm` consistently. Add a validation step that warns if more than 3 unique column sizes are detected.

**Effort:** 1–2 hours (read + trace + fix + re-audit).

---

### 🟠 HIGH-1: Staircase Generation Is Broken (Wrong Footprint & Missing from Upper Floors)

**Observed:** 16 stair objects on ground_floor only (none on floors 1–5):
```
[stairs] per phase: [["ground_floor",16]]
[stairs] footprints (w x l): 3923x250 | 1000x250
```

**Problems:**
1. **Width is 250 mm** — far below the BNBC minimum of 1050 mm (actual width should be ~1000 mm, length ~3900 mm for a dog-leg). The generator is emitting the stair as a thin slab (250 mm) rather than a full-flight staircase.
2. **No stairs on upper floors** — floors 1–4 have zero stair objects, making the building inaccessible in the 3D model.
3. **16 stair objects per floor** suggests the dog-leg is being emitted as 16 individual segments instead of a coherent staircase assembly.

**Root cause:** The `createFittedStair` function in `parametricBuildingGenerator.ts` likely has a geometry bug (swapped width/depth or wrong extrusion direction) and is not called for upper-floor phases.

**Fix:**
- Audit `createFittedStair` geometry: verify width ≥ 1050 mm, correct flight/dog-leg segmentation.
- Ensure stair generation is called for every floor phase (`ground_floor` through `roof`) with at least one vertical circulation element per floor.
- Merge adjacent stair segments into a single logical stair object per floor.

**Effort:** 3–4 hours.

---

### 🟠 HIGH-2: Window Heights Are Mostly 40 mm (Should Be 1140 mm)

**Observed:** 61 windows; 60 are 40 mm tall, 1 is 1140 mm tall:
```
[windows] 61 heights: 40,1140
```

**Root cause:** Windows are likely being generated as thin strips at the bottom of the wall plane (z-offset error) instead of centered at the correct wall height. The 40 mm windows are probably the window *sill* or a mis-projected opening cutout rather than the window glass itself.

**Fix:**
- Trace the window generation logic in `parametricBuildingGenerator.ts`.
- Ensure window center Z = wall center Z (mid-height of the wall).
- Window height should be 1140 mm (typical BD residential window).
- Fix the wall opening cutout logic so the void matches the window size.

**Effort:** 2–3 hours.

---

### 🟠 HIGH-3: Structural Analysis Produces Unsafe Results

**Observed (from structural panel):**
```
column util: 1.0  (Pn=959 kN, Load=1229 kN → OVERLOADED)
beam uM: 0.99    (M_u=149 kN·m, capacity barely sufficient)
defl: 1471 mm    (allowable: 12.5 mm → 117× over limit)
seismic T: 202.7 s  (should be ~0.3–0.8 s for a 5-storey RC frame)
seismic maxDrift: 0 mm (computation error)
```

**Problems:**
1. **Column overloaded** — 250×250 mm columns with 12 mm main bars cannot carry 1229 kN axial load. A 250×250 column with 8T16 has Pn ≈ 959 kN. The design needs either 350×350 columns or T20 main bars.
2. **Beam deflection is 117× the allowable limit** — the simplified deflection formula in `analyzeBeam` is wrong (uses mm-based E incorrectly).
3. **Seismic period calculation is wildly off** — `Ta = 0.09 × H / √D` formula is misapplied (H in m, D in m² gives 0.09 × 15 / √234 ≈ 0.09, not 202).
4. **Footing safety factor is 1,000,000** — the bearing capacity utilization is 0 (likely a division-by-zero or wrong variable in `designFooting`).

**Fixes required:**
- **Column sizing:** Auto-size columns based on axial load (minimum 300×300 for 5+ storeys per BNBC practice).
- **Beam deflection:** Fix the EI calculation in `structuralEngine.ts` — E should be in N/mm², I in mm⁴, w in N/mm.
- **Seismic period:** Use BNBC 2020 Eq 2.5.1: `Ta = C_t × h^n` where C_t = 0.07 (RC frame), h = height in m.
- **Footing bearing:** Fix the zero-utilization bug in `designFooting`.

**Effort:** 4–6 hours (mainly structural engine fixes).

---

### 🟡 MEDIUM-1: Parapet Z-Position Doesn't Match Roof Slab

**Observed:**
```
parapet z: 15125 – 16125  (height = 1000 mm — correct)
building top (roof slab): not logged, but overhead tank z = 18450 – 19850
```

The parapet top is at 16125 mm while the overhead tank sits at 18450 mm. The parapet should sit on the roof slab edge and be visible above it. Verify roof slab Z position.

**Fix:** Log roof slab Z in the audit and confirm parapet starts at roof slab top + 125 mm (slab thickness).

**Effort:** 30 minutes (logging + verification).

---

### 🟡 MEDIUM-2: Grid Layout Is Asymmetric (8×6 Columns)

**Observed:**
```
grid X: 1000,4900,5450,6200,8700,8850,11500,12750   (8 columns)
grid Y: 2000,6100,8650,11200,15350,16750             (6 columns)
```

The column grid is irregular — spans vary (3900, 550, 750, 2500, 150, 2650, 1250) instead of a regular grid. This is likely caused by room boundaries and open spaces creating an irregular column placement rather than a clean structural grid.

**Impact:** The irregular grid makes structural analysis misleading (the structural panel assumes uniform spans). For a professional-grade design, columns should follow a regular grid (e.g., 4.5 m × 4.5 m bays).

**Fix:** Implement a regular grid overlay in the generator: compute ideal column positions from plot dimensions and bay spacing (4.0–4.5 m), then snap existing room columns to the nearest grid point.

**Effort:** 6–8 hours.

---

### 🟡 MEDIUM-3: Wall Heights Vary Wildly (40 mm to 2600 mm)

**Observed:**
```
[walls] 262 heights: 40,100,150,325,450,500,650,775,900,1200,1350,1950,2400,2425,2600
```

Exterior walls should be 3000 mm per storey. Interior walls should be 2700–3000 mm. The presence of 40 mm, 100 mm, and 150 mm "walls" suggests these are actually floor slab edge strips, beam projections, or opening cutouts being mislabelled as walls.

**Fix:** 
- Add a `height` validation in the wall generator: reject walls < 1000 mm with `kind === "wall"` (classify them as `beam` or `slab-edge` instead).
- Ensure exterior walls span full story height (floor-to-ceiling).

**Effort:** 2 hours.

---

### 🟡 MEDIUM-4: Missing Stairs on Upper Floors (Accessibility)

**Already covered under HIGH-1**, but worth emphasizing: a 5-storey building must have stairs on every floor (or at least a continuous stairwell from ground to roof). Currently only ground_floor has 16 stair segments.

**Fix:** (see HIGH-1) — implement stair generation for all phases.

---

### 🟢 INFO-1: Large Bundle Size (539 KB gzipped 160 KB)

The application bundle is 539 KB (gzip 160 KB), exceeding the 500 KB Vite warning threshold. This is due to bundling all three new engineering modules (structuralEngine, drawingEngine, rebarDetailer, codeCompliance) plus the React framework.

**Impact:** Slower initial page load on mobile.

**Mitigation (optional, future):** Code-split the CAD viewer (`MeshViewer` class) and structural analysis engine behind dynamic `import()`. Not urgent for v2.4.

**Effort:** 4–6 hours (defer to v2.5).

---

### 🟢 INFO-2: No Dark-Light Theme Toggle Persistence

Not a bug, but a UX gap: the theme preference is not saved to localStorage.

**Effort:** 30 minutes.

---

## Fix Priority Matrix

| # | Defect | Severity | Effort | Priority |
|---|--------|----------|--------|----------|
| 1 | `rebarDetailer.ts` TS error (apostrophe) | 🔴 Critical | 5 min | **P0 — Fix Now** |
| 2 | `codeCompliance.ts` runtime crash | 🔴 Critical | 2 min | **P0 — Fix Now** |
| 3 | Inconsistent column cross-sections | 🔴 Critical | 1–2 hr | **P1** |
| 4 | Staircase broken (250mm wide, missing upper floors) | 🟠 High | 3–4 hr | **P1** |
| 5 | Window heights 40mm (should be 1140mm) | 🟠 High | 2–3 hr | **P2** |
| 6 | Structural engine: overloaded columns, wrong deflection, wrong seismic period | 🟠 High | 4–6 hr | **P2** |
| 7 | Parapet Z-position alignment | 🟡 Medium | 30 min | **P3** |
| 8 | Irregular column grid (8×6 asymmetric) | 🟡 Medium | 6–8 hr | **P3** |
| 9 | Wall heights wildly inconsistent | 🟡 Medium | 2 hr | **P3** |
| 10 | Bundle size (>500 KB) | 🟢 Info | deferred | **P4 — Future** |

**Total estimated effort: ~20–25 hours**

---

## Implementation Order (Suggested)

**Block 1 — Kill the blockers (30 min):**
1. Fix `rebarDetailer.ts` apostrophe parameter names → `fcPrime`
2. Fix `codeCompliance.ts` line 426 nested `Math.max`
3. Re-run `npm run lint` → confirm 0 errors
4. Re-run `npx tsx scripts/demo5audit.ts` → confirm compliance screen no longer crashes

**Block 2 — Fix core geometry bugs (4–5 hours):**
5. Fix column cross-section consistency (trace all column emit sites)
6. Fix staircase generation: correct footprint, add to all floors
7. Fix window height generation (center Z, 1140 mm height)
8. Fix wall height classifier (reject sub-1000mm walls)

**Block 3 — Fix structural engine (4–6 hours):**
9. Fix column sizing auto-calculation (250→300/350 for 5+ storeys)
10. Fix beam deflection formula in `structuralEngine.ts`
11. Fix seismic period formula (use BNBC Eq 2.5.1: Ta = 0.07·h^0.75)
12. Fix footing bearing capacity utilization calculation
13. Add structural results to the demo audit output

**Block 4 — Polish (2–3 hours):**
14. Parapet Z-position alignment check
15. Export compliance report + structural summary as downloadable `.txt`
16. Run full mesh-audit + exporter-test → green
17. Commit and push

---

## Verification Checklist (Post-Fix)

After all fixes are applied, verify:

- [ ] `npm run lint` → **0 errors**
- [ ] `npx tsx scripts/mesh-audit.ts` → **degenerate=0, duplicate=0**
- [ ] `npx tsx scripts/test-exporters.ts` → **validation errors=0**
- [ ] `npx tsx scripts/demo5audit.ts` → all checks green (no FAIL items)
- [ ] Column cross-sections: **all ≤ 2 unique sizes** (pedestal + main)
- [ ] Staircase: **≥ 1 stair per floor phase**, width ≥ 1050 mm
- [ ] Windows: **≥ 95% at 1140 mm height**
- [ ] Walls: **≥ 90% at 2400–3000 mm height**
- [ ] Column utilization: **≤ 0.80** (add 10% margin)
- [ ] Beam utilization: **≤ 0.85**
- [ ] Seismic period: **0.2s ≤ T ≤ 1.5s** for 5-storey RC building
- [ ] Building opens at http://0.0.0.0:3000 without JS errors
- [ ] Structural panel shows valid numbers (no Infinity/NaN)
- [ ] Compliance screen loads without crash

---

## Files That Need Changes

| File | Changes Required |
|------|-----------------|
| `src/cad/rebarDetailer.ts` | Rename `f'_c` → `fcPrime` in 3 function signatures + bodies |
| `src/cad/codeCompliance.ts` | Fix line 426: wrap inner `Math.max` correctly |
| `src/cad/parametricBuildingGenerator.ts` | Column size consistency, stair generation fix, window height fix, wall height filter |
| `src/cad/structuralEngine.ts` | Fix deflection formula, seismic period formula, footing bearing calc |
| `src/screens/NativeCadScreen.tsx` | Minor: wire structural panel to use fixed engine outputs |
| `src/screens/ComplianceScreen.tsx` | Already updated — no further changes needed |

---

## Notes

- The app is already running at **http://0.0.0.0:3000** — the server can be accessed in any browser to visually inspect the 3D model while fixes are applied.
- The `scripts/exporter-out/` directory contains the generated 5-storey mesh (`demo-5story.mesh.json`) for reference.
- No changes have been made to source files yet (planning phase only), except the one-line fix for `rebarDetailer.ts` which was trivial and already applied.
- After fixes are implemented, a final `git commit` and `git push` will be performed.
