# BUGS_FOUND.md — User Test Bug Report

**Tester:** Rafiq (simulated Bangladeshi user)
**Date:** 2026-10-30
**Test:** Full 3-story / 5 katha workflow through real app code

---

## BUG-001 — Duplicate window sill in Y-oriented windows (FIXED)

**Severity:** Critical
**File:** `src/cad/parametricBuildingGenerator.ts` (createWindow3DMesh, Y branch)

**What happened:** The Y-orientation window branch pushed the window sill **twice** with the same ID — once with an old 20/30 mm inset, once with the new 25 mm inset. Result:
- 8 duplicate mesh object IDs (e.g. `g_win3_sill`, `f1_win14_sill`)
- Two overlapping 60 mm-thick sills inside every Y-facing window (visible Z-fighting in the 3D viewer)
- **8 duplicate IFC GUIDs** → the exported IFC file was invalid (violates IFC4 entity identity)

**Root cause:** A "v2.3 Z-fighting refinement" added a new inset sill without removing the old one.

**Fix applied:** Removed the old 20/30 mm sill push; kept the single 25 mm-inset sill. After fix: 632 objects, 0 duplicate IDs, IFC validation **0 errors**.

**Impact before fix:** Any Y-facing window in the building (most windows in Dhaka's narrow plots) produced corrupted IFC exports and doubled concrete in the sill BOQ.

---

## BUG-002 — Corridor width measured from wall stubs (FIXED)

**Severity:** Major
**File:** `src/cad/codeCompliance.ts` (buildComplianceContext)

**What happened:** BNBC-002 reported "Corridor width **13mm** < 1200mm" — impossible for a real corridor. The corridor measurement took the minimum gap between *any* two partition walls, including 13 mm stubs at wall junctions and column faces.

**Root cause:** No minimum-gap threshold; any positive gap counted.

**Fix applied:** Only gaps ≥ 500 mm are considered candidate corridor widths. After fix the measured value is 646 mm (a real, plausible value — see BUG-003).

**Impact before fix:** 100% false positive on BNBC-002 for every project — users would lose trust in the compliance engine.

---

## BUG-003 — Dual-unit preset corridor is 646 mm, below BNBC 1200 mm (OPEN — design data issue)

**Severity:** Major
**File:** `src/data/floorplanPresets.ts` (preset-dual-3bed)

**What happened:** After fixing the measurement (BUG-002), the compliance check now reports the inter-unit corridor of the standard dual-3-bed preset at **646 mm** (769 mm on one floor) — below the BNBC 2020 §4.7.3 minimum of 1200 mm.

**Assessment:** This is a **genuine design defect in the preset data**, not a code bug. A real dual-unit flat in Dhaka needs a 1200 mm shared corridor for two families to pass each other with luggage. The app now *correctly catches it*, which means the shipped "standard" preset does not meet the code it claims to enforce.

**Recommended fix:** Widen the inter-unit partition corridor in `preset-dual-3bed` to ≥ 1200 mm (shift the two unit partitions outward), or add a corridor-widening option to the optimizer screens.

---

## BUG-004 — 862 lines of dead code left over from file-split refactor (OPEN — bloat)

**Severity:** Major (maintenance hazard)
**Files:** `src/cad/wall-synthesis.ts` (616 lines), `src/cad/mesh-utils.ts` (246 lines)

**What happened:** The "code quality" refactor claimed to split `parametricBuildingGenerator.ts` into `wall-synthesis.ts` + `mesh-utils.ts`, but **neither file is imported by anything**. All `synthesizeFloorWalls`, `createBoxMesh`, `createWindow3DMesh` calls resolve to the copies still inside `parametricBuildingGenerator.ts`.

**Consequences:**
- 862 lines of dead code ship in the source tree
- The dead copies **still contain the BUG-001 double-sill bug** (a future dev who "fixes" the wrong copy silently does nothing)
- Duplicate implementations will drift apart

**Recommended fix:** Delete both files (confirmed: zero importers), or re-point `parametricBuildingGenerator.ts` to import from them and delete the inline copies.

---

## BUG-005 — 714 KB single JS bundle, all 25 screens eager-loaded (OPEN — performance bloat)

**Severity:** Minor (desktop app, but noticeable startup)
**File:** `src/App.tsx` (lines 4–27)

**What happened:** All 25 screens are statically imported. The build warns: "chunks are larger than 500 kB". The heaviest screens (NativeCadScreen 1,289 lines, PhaseChatScreen 547) load even when the user never opens them.

**Recommended fix:** `React.lazy()` + `Suspense` per screen in `renderView()`. Expected result: ~40–50% smaller initial chunk.

---

## BUG-006 — Unused imports (OPEN — minor bloat)

**Severity:** Minor

| File | Issue |
|------|-------|
| `src/App.tsx:1` | `useEffect` imported, never used |
| `src/cad/parametricBuildingGenerator.ts:26` | `ARCHITECTURAL_ASSETS` imported, never used (the asset library's `generateMesh` functions are never called anywhere — doors/windows come from the wall synthesis instead) |

**Impact:** The whole `assetsLibrary.ts` (405 lines, 10+ fixture definitions) is effectively dead — its meshes are never placed in buildings. Either wire the asset library into the generator (the AssetsLibraryScreen UI implies this feature exists) or remove it.

---

## Non-bugs verified OK during test

- ✅ `createBoxMesh` null-filtering (degenerate boxes) works — 0 null objects
- ✅ IFC GUID FNV-1a generation — 0 validation errors after BUG-001 fix
- ✅ DXF/SVG drawing export — all 12 files generated
- ✅ BOQ totals — ৳6,890,380 for 3-story dual-unit, realistic for Dhaka 2025
- ✅ localStorage persistence round-trip (project JSON saved/loaded)
- ✅ Phase generation — 7 phases for 3 stories, correct names in both languages
- ✅ Mesh watertightness — 0 zero-volume objects, 0 duplicate bounding boxes
- ✅ 3D model completeness — 19 object kinds including fitted kitchen/bath/louvers

---

## Test Environment

- Windows 11, Node v24.19.0, tsx v4.23.15
- App repo: C:\1_SAJID\ArchResidenceBD\repo
- Build: `npm run build` ✅ (8.1s after fixes)
- Types: `npx tsc --noEmit` ✅ (app code clean)
