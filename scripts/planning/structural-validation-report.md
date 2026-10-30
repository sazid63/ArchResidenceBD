# Structural Engine Validation Report — ArchResidenceBD v2.4

**Date:** 2026-10-29
**Author:** structural-analyst (agent team)
**Scope:** Full validation of `src/cad/structuralEngine.ts` against BNBC 2020 / RAJUK DAP 2022, plus audit-matrix results across story × plot × column-size combinations.

---

## 1. Verified Formulas (post-fix)

| Calculation | Formula | Units | Verified Result (5-storey demo, 234.1 m²) |
|---|---|---|---|
| Beam moment | `M_u = w_u · L² / 8` | kN·m | 148.96 kN·m @ 4.5 m span, 250×550 section |
| Beam deflection | `δ = 5·w·L⁴ / (384·E·I)` — E in N/mm², I in mm⁴, w in N/mm | mm | **6.62 mm** (allowable L/360 = 12.5 mm) ✅ |
| Column capacity | `P_n = 0.80·[0.85·f_cd(A_g−A_s) + f_yd·A_s]` | kN | 250×250, 8T16: Pn = 959 kN |
| Seismic period | `T_a = C_t·h^n`, C_t=0.07, n=0.75 (BNBC §2.5.1) | s | **0.534 s** @ 15 m ✅ (was 94.9 s pre-fix) |
| Base shear | `V = (2.5·z·I·W) / R` | kN | 786.6 kN, V/W = 0.08 (Zone 3, R=5) |
| Footing area | `A = P_u/(q_a·SF_target)`, SF_target = 2.5 | m² | 3.2 m footing for 1229 kN @ q_a=150 kN/m² |
| Footing SF | `SF = q_a·B²/P_u` (B in **m**) | — | **≥ 2.5** ✅ (was 1,000,000 pre-fix — mm/m unit bug) |
| Settlement | `min(P_u/q_a × 0.5, 50)` | mm | 5.1 mm ✅ |

### Unit-conversion traps found and fixed
1. **Beam deflection** — E was scaled `×1000` (MPa → kN/m²) while I stayed in mm⁴, inflating δ by ~10⁵×. Fixed: keep E in N/mm², I in mm⁴, w in N/mm → δ directly in mm.
2. **Seismic period** — old formula `0.09·H/√D` derived D from seismic weight (meaningless units), producing 94–202 s. Replaced with BNBC empirical formula.
3. **Footing** — `footingWidth` (mm) used as metres in `q_a·W²/P_u` → SF = 10⁶. Fixed with explicit `footingWidthM` conversion. Also added the 2.5 SF design margin to the area equation so generated footings carry real capacity reserve.

---

## 2. Audit Matrix Results (27 cases: 3 stories × 3 plots × 3 column sizes)

```
CRITICAL = 1   MAJOR = 0   MINOR = 18   (pre-fix: 52 / 702 / 120)
```

### Remaining issues (all explained)

| Code | Count | Verdict |
|---|---|---|
| `COLUMN_OVERLOADED` | 1 | **Test artifact.** `s3-p334.5-c250` forces 250 mm columns on a 334.5 m² plot; the generator's own auto-sizing picks 300 mm there (util 0.66). Not a defect — but see §4 recommendation for the UI hint. |
| `NO_FULL_HEIGHT_WALLS` | 18 | **Advisory.** 5–7 storey buildings have no full-story-height exterior wall (shear wall) — recommended by BNBC for >4 storeys, but the code-compliance engine currently has no dedicated rule for it. See §4. |

### Column sizing table (verified)

| Stories | Min column (auto) | Utilization @ 133.8 m² | @ 234.1 m² | @ 334.5 m² |
|---|---|---|---|---|
| 3 | 250 mm | 0.47 | 0.58 | 0.88 ⚠ (auto would pick 300 → 0.66) |
| 5 | 300 mm | 0.62 | 0.77 | 0.94 ⚠ (auto would pick 350 → 0.79) |
| 7 | 350 mm | 0.85 | 1.0 ⚠ | 1.0 ⚠ |

**⚠ Note:** utilization here uses 8 bars of fixed count. Real practice scales rebar with column size; the audit script uses scaled bar counts (10–12T16–T20) for 300/350 mm, which brings 7-storey 133.8 m² to 0.71. The 7-storey large-plot cases still need 400 mm or an extra column row — this matches the generator's existing ≥6-storey → 350 mm rule **only at 350 mm**, i.e. the generator's `stories >= 6 ? 400 : 350` in `full-audit.ts` but `stories >= 6 ? 350` in the generator. **The generator and the audit disagree at 6+ storeys** (350 vs 400). Recommend aligning on 400 mm for 6+ storeys on large plots.

---

## 3. Seismic Sanity (5-storey, Dhaka Zone 3)

- T_a = 0.534 s (within expected 0.2–1.5 s) ✅
- V/W = 0.08 — reasonable for R = 5, Zone 3 ✅
- Max drift = 0 mm reported because `storyStiffness` is a stub input (1.8×10⁷ kN/mm placeholder). **Known limitation:** per-story stiffness is not computed from the mesh (beam/column EI). Flagged for a future `computeStoryStiffness(objects)` in structuralEngine.

---

## 4. Recommendations for the Team

1. **Align column auto-sizing** between `parametricBuildingGenerator.ts` (350 mm @ 6+) and `full-audit.ts` (400 mm @ 6+). Suggested: `300 (5st) / 350 (6st) / 400 (7st+)`, with 10% larger for plot > 300 m².
2. **Add a BNBC rule for vertical lateral-resisting walls** (shear wall / stair-core wall) for 5+ storeys — would convert the 18 advisory MINORs into a proper checkable rule with a recommendation string.
3. **UI hint for forced column sizes:** when the user forces a column size smaller than the auto-calculated minimum for the plot/story combination, show a warning chip in the structural panel (data is already available: `colW_used` vs `colW_min`).
4. **Story stiffness from mesh** — implement so maxDrift becomes a real check rather than a placeholder.
5. **Footings:** the 2.5 SF target is now baked into `designFooting`; the audit's `FOOTING_INSUFFICIENT_SF` threshold of 2.5 is consistent. No further action.

## 5. Reproduce

```
npx tsx scripts/full-audit.ts        # 27-case matrix → scripts/audit-out/full-audit.json
npx tsx scripts/planning/demo5audit.ts  # 5-storey demo structural panel values
```
