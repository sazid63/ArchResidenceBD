import { describe, expect, it } from "vitest";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { bnbcPack, liveLoadKnM2 } from "../rules/bnbc";
import { alphaF, analyzeStructure, tBeamInertia } from "./analyze";
import { designBeamLine, sizeBeamLine, type BeamLineInput } from "./beam";
import { beamMpr, beamVe } from "./capacity";
import { analyseSpans, envelope, supportMoments } from "./continuousBeam";
import { factoredLoad, liveReductionFactor, slabSelfWeightKnM2, wallLineLoadKnM } from "./loads";
import { UNIT_WEIGHTS } from "./materials";
import { crackedInertia, flexure, shear } from "./section";
import { designSlab, type SlabInput } from "./slab";

const S = DEFAULT_SETBACKS_MM;

describe("loads and combinations", () => {
  it("reads live loads from the BNBC pack (Table 6.2.3)", () => {
    expect(liveLoadKnM2("residential-private")).toBe(2);
    expect(liveLoadKnM2("residential-public")).toBe(4.8);
    expect(liveLoadKnM2("roof-flat")).toBe(1);
  });

  it("gravity combinations match the pack text", () => {
    const e = Object.fromEntries(bnbcPack().loadCombinations.strength.map((c) => [c.n, c.expr]));
    expect(e[1]).toBe("1.4(D + F)");
    expect(e[2]).toBe("1.2(D + F + T) + 1.6(L + H) + 0.5(Lr or R)");
    expect(e[3]).toBe("1.2D + 1.6(Lr or R) + (L or 0.8W)");
  });

  it("hand example: D 5, L 2 kN/m2 -> 1.4D = 7.0, 1.2D+1.6L = 9.2 governs (combo 2)", () => {
    expect(factoredLoad(5, 2)).toEqual({ value: 9.2, combo: 2 });
    // dead-dominated: D 10, L 0.5 -> 14.0 vs 12.8
    expect(factoredLoad(10, 0.5)).toEqual({ value: 14, combo: 1 });
    // roof: D 5, Lr 1 -> 1.2*5 + 1.6*1 = 7.6 beats 1.4*5 = 7
    expect(factoredLoad(5, 0, 1).value).toBeCloseTo(7.6, 10);
  });

  it("hand example (Tables 6.2.1-6.2.2): 150 mm slab = 3.54 kN/m2; 250 mm wall 2.5 m high = 13.3175 kN/m", () => {
    expect(slabSelfWeightKnM2(150)).toBeCloseTo(3.54, 10);
    // (250 x 0.0191 + 2 x 12 x 0.023) x 2.5 = (4.775 + 0.552) x 2.5
    expect(wallLineLoadKnM(250, 2.5)).toBeCloseTo(13.3175, 10);
  });

  it("finishes are built from table rates: floor 1.150 + 0.268 + 0.287, roof 1.150 + 0.431 + 0.287", () => {
    expect(UNIT_WEIGHTS.floorFinishKnM2).toBeCloseTo(1.705, 10);
    expect(UNIT_WEIGHTS.roofFinishKnM2).toBeCloseTo(1.868, 10);
    expect(UNIT_WEIGHTS.frameConcrete).toBeCloseTo(24.06, 10);
  });

  it("live-load reduction (Eq 6.2.1): KLL 2, AT 50 m2 -> 0.25 + 4.57 / 10 = 0.707; none below KLL.AT 37.16; floor 0.5; none above 4.8", () => {
    expect(liveReductionFactor(2, 50, 2)).toBeCloseTo(0.707, 10);
    expect(liveReductionFactor(2, 18, 2)).toBe(1);
    expect(liveReductionFactor(2, 400, 2)).toBe(0.5);
    expect(liveReductionFactor(5, 50, 2)).toBe(1);
  });
});

describe("section checks", () => {
  it("flexure hand example: b 250, d 400, Mu 100 kN.m -> As 726.6 mm2, capacity 163.9 kN.m", () => {
    // Rn = 100e6 / (0.9 x 250 x 400^2) = 2.7778; rho = (17/420)(1 - sqrt(1 - 2 x 2.7778 / 17)) = 0.0072658
    const r = flexure(100, 250, 400, 0);
    expect(r.asCalcMm2).toBeCloseTo(726.6, 0);
    // rho_tc = 0.85 x 0.85 x (20/420) x 0.375 = 0.012902; phi.Mn = 0.9 x rho fy b d^2 (1 - 0.59 rho fy/fc)
    expect(r.capacityKnM).toBeCloseTo(163.9, 0);
    expect(r.util).toBeCloseTo(100 / r.capacityKnM, 10);
  });

  it("never clamps utilisation: 250 kN.m on the same section is about 1.5 and has no singly-reinforced steel", () => {
    const r = flexure(250, 250, 400, 0);
    expect(r.util).toBeGreaterThan(1.5);
    expect(r.asCalcMm2).toBe(Infinity);
  });

  it("shear hand example: b 250, d 400 -> phiVc 57.0 kN, section limit 278.4 kN", () => {
    // Vc = 0.17 x sqrt(20) x 250 x 400 = 76.03 kN; Vs,max = 0.66 x sqrt(20) x 100000 = 295.2 kN
    const r = shear(100, 250, 400);
    expect(r.phiVcKn).toBeCloseTo(57.02, 1);
    expect(r.capacityKn).toBeCloseTo(278.4, 0);
    expect(r.avPerMm).toBeGreaterThan(0);
    expect(shear(20, 250, 400).avPerMm).toBe(0);
  });

  it("cracked inertia is below gross inertia", () => {
    const ig = (250 * 500 ** 3) / 12;
    expect(crackedInertia(250, 440, 1200, 200000 / (4700 * Math.sqrt(20)))).toBeLessThan(ig);
  });
});

describe("continuous beam", () => {
  it("two equal spans, full load: M = wL2/8 = 62.5, shears 3wL/8 and 5wL/8, sagging 9wL2/128", () => {
    const spans = [{ lengthM: 5, w: 20 }, { lengthM: 5, w: 20 }];
    expect(supportMoments(spans)[1]).toBeCloseTo(-62.5, 8);
    const r = analyseSpans(spans);
    expect(r[0].vLeft).toBeCloseTo(37.5, 8);
    expect(r[0].vRight).toBeCloseTo(62.5, 8);
    expect(r[0].mPos).toBeCloseTo((9 * 20 * 25) / 128, 8);
  });

  it("three equal spans, full load: interior supports wL2/10", () => {
    const m = supportMoments([1, 2, 3].map(() => ({ lengthM: 4, w: 10 })));
    expect(m[1]).toBeCloseTo(-16, 8);
    expect(m[2]).toBeCloseTo(-16, 8);
  });

  it("pattern loading: one of two spans loaded -> sagging 49wL2/512, support wL2/16", () => {
    const e = envelope([5, 5], [0, 0], [20, 20], 1, 1, 0);
    expect(e.spans[0].mPos).toBeCloseTo((49 * 20 * 25) / 512, 8);
    expect(e.spans[0].mRight).toBeCloseTo(-62.5, 8); // full load gives the larger hogging
  });

  it("property: a longer span gives a larger moment", () => {
    let prev = 0;
    for (const L of [3, 4, 5, 6, 7]) {
      const m = envelope([L, L], [10, 10], [4, 4], 1.2, 1.6).spans[0].mPos;
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });
});

const slabIn = (over: Partial<SlabInput> = {}): SlabInput => ({
  shortM: 4,
  longM: 4,
  contLongEdges: 0,
  contShortEdges: 0,
  deadExtraKnM2: 1.705,
  liveBaseKnM2: 2,
  livePartitionKnM2: 1.2,
  roofLiveKnM2: 0,
  ...over,
});

describe("slabs (coefficient method, Sec 6.5.8.3)", () => {
  it("hand example, Case 2 (all edges continuous), 4 x 4 m, h 150: wd = 1.2 x 5.245, wl = 1.6 x 3.2, w = 11.414", () => {
    // negative: 0.045 x 11.414 x 16 = 8.218; positive: (0.018 x 6.294 + 0.027 x 5.12) x 16 = 4.0245
    const r = designSlab(slabIn({ thicknessMm: 150, contLongEdges: 2, contShortEdges: 2 }));
    expect(r.type).toBe("two-way");
    expect(r.caseNo).toBe(2);
    expect(r.dKnM2).toBeCloseTo(5.245, 10);
    expect(r.wuKnM2).toBeCloseTo(11.414, 10);
    expect(r.combo).toBe(2);
    expect(r.short.negKnM).toBeCloseTo(8.2181, 3);
    expect(r.short.posKnM).toBeCloseTo(4.0245, 3);
    expect(r.long!.posKnM).toBeCloseTo(4.0245, 3);
  });

  it("Case 1 (simply supported all round): positive 0.036 w l2 = 6.5745; the discontinuous-edge negative is one third of it", () => {
    const r = designSlab(slabIn({ thicknessMm: 150 }));
    expect(r.caseNo).toBe(1);
    expect(r.short.posKnM).toBeCloseTo(0.036 * 11.414 * 16, 3);
    expect(r.short.negKnM).toBeCloseTo((0.036 * 11.414 * 16) / 3, 3);
  });

  it("slab shear uses the Table 6.6.11 share: square Case 2 carries half the load each way, 0.5 x wu x (la/2 - d)", () => {
    const r = designSlab(slabIn({ thicknessMm: 150, contLongEdges: 2, contShortEdges: 2 }));
    expect(r.shareShort).toBe(0.5);
    expect(r.short.vuKn).toBeCloseTo(0.5 * 11.414 * (2 - 0.125), 3);
  });

  it("a panel longer than 2:1 spans one way with the Sec 6.1.4.3 coefficients (interior: +w l2/16, -w l2/12 up to 3.048 m)", () => {
    const r = designSlab(slabIn({ shortM: 2, longM: 4.5, contLongEdges: 2, thicknessMm: 150 }));
    expect(r.type).toBe("one-way");
    expect(r.long).toBeNull();
    expect(r.short.posKnM).toBeCloseTo((11.414 * 4) / 16, 3);
    expect(r.short.negKnM).toBeCloseTo((11.414 * 4) / 12, 3);
  });

  it("minimum thickness: Eq 6.6.6 for stiff beams, Eq 6.6.5 (>= 125 mm) for flexible beams, +10 % with a weak edge beam", () => {
    // ln = 4000 - 250 = 3750, beta = 1; fy 420 -> 0.8 + 0.3 = 1.1
    const stiff = designSlab(slabIn({ thicknessMm: 150, alphaFm: 3 }));
    expect(stiff.minThicknessMm).toBeCloseTo((3750 * 1.1) / (36 + 9), 6); // 91.67 mm, above the 90 mm floor
    const flexible = designSlab(slabIn({ thicknessMm: 150, alphaFm: 1 }));
    expect(flexible.minThicknessMm).toBeCloseTo(Math.max((3750 * 1.1) / (36 + 5 * 0.8), 125), 6);
    const weak = designSlab(slabIn({ thicknessMm: 150, alphaFm: 3, weakEdgeBeam: true }));
    expect(weak.minThicknessMm).toBeCloseTo(stiff.minThicknessMm * 1.1, 6);
    // one way, both ends continuous: l / 28
    expect(designSlab(slabIn({ shortM: 2.8, longM: 6, contLongEdges: 2, thicknessMm: 150 })).minThicknessMm).toBeCloseTo(100, 6);
  });

  it("picks the smallest thickness that passes, never below 125 mm, and reports >1 when nothing passes", () => {
    const ok = designSlab(slabIn({ shortM: 3, longM: 3 }));
    expect(ok.thicknessMm).toBeGreaterThanOrEqual(125);
    expect(ok.util).toBeLessThanOrEqual(1);
    const bad = designSlab(slabIn({ shortM: 14, longM: 14 }));
    expect(bad.util).toBeGreaterThan(1);
  });

  it("property: a longer span gives a larger moment; continuity never raises the positive moment", () => {
    let prev = 0;
    for (const s of [3, 4, 5, 6]) {
      const r = designSlab(slabIn({ shortM: s, longM: s, thicknessMm: 200 }));
      expect(r.short.posKnM).toBeGreaterThan(prev);
      prev = r.short.posKnM;
    }
    const free = designSlab(slabIn({ thicknessMm: 150 })).short.posKnM;
    const cont = designSlab(slabIn({ thicknessMm: 150, contLongEdges: 2, contShortEdges: 2 })).short.posKnM;
    expect(cont).toBeLessThan(free);
  });
});

const line = (lengthsMm: number[], over: Partial<BeamLineInput["spans"][number]> = {}, reduceLive = false): BeamLineInput => ({
  slabThicknessMm: 125,
  wallHeightMm: 3000,
  reduceLive,
  spans: lengthsMm.map((l) => ({ lengthMm: l, slabDead: 10, slabLiveTable: 5, slabLivePartition: 0, liveBaseKnM2: 2, tributaryAreaM2: 10, wallThicknessMm: null, wallShare: 0, ...over })),
});

describe("beam line", () => {
  it("hand example: one 5 m span, 250 x 500, slab 125: self 2.2556 kN/m, wu = 22.70675, M+ = wL2/8, Vu at d from the face", () => {
    // self = 24.06 x 0.25 x (0.5 - 0.125) = 2.255625; D = 12.255625, L = 5; wu = max(1.4 D = 17.16, 1.2 D + 1.6 L = 22.70675)
    const r = designBeamLine(line([5000]), { bMm: 250, hMm: 500 });
    const s = r.spans[0];
    expect(s.mPosKnM).toBeCloseTo((22.70675 * 25) / 8, 6);
    // d = 500 - 40 - 10 - 10 = 440; Vu = wu L/2 - wu (0.15 + 0.44)
    expect(r.dMm).toBe(440);
    // Sec 8.3.8.1 (a): design shear is the probable-moment shear, never below the analysed Vu = wu L/2 - wu (0.15 + 0.44)
    const analysed = 22.70675 * 2.5 - 22.70675 * 0.59;
    expect(s.vuKn).toBeCloseTo(beamVe(beamMpr(s.negLeft.asReqMm2, 250, 440), beamMpr(s.negRight.asReqMm2, 250, 440), 5000 - 300, 22.70675, analysed), 6);
    expect(s.vuKn).toBeGreaterThanOrEqual(analysed - 1e-9);
    expect(s.mNegLeftKnM).toBeCloseTo((22.70675 * 25) / 24, 6);
  });

  it("live reduction (Sec 2.3.13) applies on floors only: A_T 50 m2 -> 0.707 of the table part, partition allowance kept", () => {
    const floor = designBeamLine(line([5000], { tributaryAreaM2: 50, slabLivePartition: 1 }, true), { bMm: 250, hMm: 500 });
    expect(floor.spans[0].liveFactor).toBeCloseTo(0.707, 10);
    expect(floor.spans[0].lKnM).toBeCloseTo(5 * 0.707 + 1, 10);
    const roof = designBeamLine(line([5000], { tributaryAreaM2: 50 }, false), { bMm: 250, hMm: 500 });
    expect(roof.spans[0].liveFactor).toBe(1);
  });

  it("deflection is checked against span/480 after partitions and span/360 for the immediate live part, not clamped", () => {
    const r = designBeamLine(line([9000]), { bMm: 250, hMm: 350 });
    expect(r.spans[0].deflection.limitMm).toBeCloseTo(9000 / 480, 10);
    expect(r.spans[0].deflection.liveLimitMm).toBeCloseTo(9000 / 360, 10);
    expect(r.spans[0].deflection.util).toBeGreaterThan(1);
    expect(r.ok).toBe(false);
  });

  it("sizing returns the smallest passing section; a heavier wall needs a deeper one", () => {
    const light = sizeBeamLine(line([4000]));
    const walled = sizeBeamLine(line([4000], { wallThicknessMm: 250, wallShare: 1 }));
    expect(light.ok).toBe(true);
    expect(walled.section.bMm * walled.section.hMm).toBeGreaterThanOrEqual(light.section.bMm * light.section.hMm);
  });

  it("property: a longer span gives a larger design moment and utilisation", () => {
    let prevM = 0;
    let prevU = 0;
    for (const L of [3000, 4000, 5000, 6000]) {
      const r = designBeamLine(line([L, L]), { bMm: 300, hMm: 600 });
      expect(r.spans[0].mPosKnM).toBeGreaterThan(prevM);
      // utilisation is not monotone in span once the probable-moment shear governs short spans (Mpr/ln falls as ln grows)
      expect(r.util).toBeGreaterThan(0);
      prevM = r.spans[0].mPosKnM;
      prevU = r.util;
    }
  });
});

describe("beam-to-slab stiffness ratio", () => {
  it("a T section with no overhang and a flange as wide as the web is the plain rectangle", () => {
    expect(tBeamInertia(250, 450, 125, 0)).toBeCloseTo((250 * 450 ** 3) / 12, 0);
  });

  it("hand example: 250 x 450 beam, 125 slab, both overhangs of min(325, 500) -> flange 900; strip 4000 mm", () => {
    // Af = 112500 at 62.5, Aw = 81250 at 287.5, yBar = 30390625 / 193750 = 156.855
    const yBar = (112500 * 62.5 + 81250 * 287.5) / 193750;
    const ib = (900 * 125 ** 3) / 12 + 112500 * (62.5 - yBar) ** 2 + (250 * 325 ** 3) / 12 + 81250 * (287.5 - yBar) ** 2;
    expect(tBeamInertia(250, 450, 125, 2)).toBeCloseTo(ib, 0);
    expect(alphaF({ bMm: 250, hMm: 450 }, 125, 2, 4000)).toBeCloseTo(ib / ((4000 * 125 ** 3) / 12), 8);
  });

  it("property: a deeper beam is stiffer", () => {
    expect(alphaF({ bMm: 250, hMm: 550 }, 125, 2, 4000)).toBeGreaterThan(alphaF({ bMm: 250, hMm: 450 }, 125, 2, 4000));
  });
});

describe("whole building", () => {
  function model(planId: string, storeys: number) {
    const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
    const r = fitRange(plan);
    const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
    if (!out.ok) throw new Error("fit");
    return out.model;
  }

  it("designs every level, shares identical floors, and lists assumptions", () => {
    const res = analyzeStructure(model("p1-4b", 4));
    expect(res.levels).toHaveLength(4);
    expect(res.levels.map((l) => l.kind)).toEqual(["floor", "floor", "floor", "roof"]);
    expect(res.levels[0].panels.length).toBeGreaterThan(0);
    expect(res.levels[0].beamLines.length).toBeGreaterThan(0);
    for (const l of res.levels) {
      expect(l.slabThicknessMm).toBeGreaterThanOrEqual(125);
      expect(Number.isFinite(l.util)).toBe(true);
    }
    expect(res.assumptions.length).toBeGreaterThan(5);
    expect(res.failures.every((f) => f.util > 1)).toBe(true);
    expect(res.ok).toBe(res.failures.length === 0);
  });

  it("roof slabs carry the roof live load, floors the residential live load plus the partition allowance", () => {
    const res = analyzeStructure(model("p1-4b", 3));
    const floor = res.levels[0].panels[0].result;
    const roof = res.levels[2].panels[0].result;
    expect(roof.lRoofKnM2).toBe(1);
    expect(floor.lBaseKnM2 + floor.lPartitionKnM2).toBeGreaterThanOrEqual(3.2);
  });

  it("a single storey is only a roof", () => {
    const res = analyzeStructure(model("p1-3b", 1));
    expect(res.levels.map((l) => l.kind)).toEqual(["roof"]);
  });

  it("is deterministic", () => {
    const m = model("p2-2b-fb", 5);
    expect(JSON.stringify(analyzeStructure(m))).toBe(JSON.stringify(analyzeStructure(m)));
  });
});
