import { describe, expect, it } from "vitest";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { bnbcPack, liveLoadKnM2 } from "../rules/bnbc";
import { analyzeStructure, panelToBeam } from "./analyze";
import { designBeamLine, sizeBeamLine, type BeamLineInput } from "./beam";
import { analyseSpans, envelope, supportMoments } from "./continuousBeam";
import { factoredLoad, slabSelfWeightKnM2, wallLineLoadKnM } from "./loads";
import { crackedInertia, flexure, shear } from "./section";
import { designSlab, shortShare, stripMoments, type SlabInput } from "./slab";

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

  it("hand example: 150 mm slab = 3.75 kN/m2; 250 mm wall 2.5 m high = 13.075 kN/m", () => {
    expect(slabSelfWeightKnM2(150)).toBeCloseTo(3.75, 10);
    // (0.25 x 19 + 2 x 0.012 x 20) x 2.5 = (4.75 + 0.48) x 2.5
    expect(wallLineLoadKnM(250, 2.5)).toBeCloseTo(13.075, 10);
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
  contShort: 0,
  contLong: 0,
  deadExtraKnM2: 1.5,
  liveKnM2: 3.2,
  roofLiveKnM2: 0,
  ...over,
});

describe("slabs", () => {
  it("coefficients: both ends continuous w=10, L=4 -> +wL2/16 = 10, -wL2/11 = 14.545", () => {
    const m = stripMoments(10, 4, 2);
    expect(m.pos).toBeCloseTo(10, 10);
    expect(m.neg).toBeCloseTo(160 / 11, 10);
  });

  it("load share: square 0.5, 2:1 panel 16/17", () => {
    expect(shortShare(4, 4)).toBeCloseTo(0.5, 10);
    expect(shortShare(3, 6)).toBeCloseTo(16 / 17, 10);
  });

  it("hand example: 4 x 4 m simply supported, h 150: wu = 1.2 x 5.25 + 1.6 x 3.2 = 11.42; each way 5.71; M+ = 11.42 kN.m/m", () => {
    const r = designSlab(slabIn({ thicknessMm: 150 }));
    expect(r.type).toBe("two-way");
    expect(r.dKnM2).toBeCloseTo(5.25, 10);
    expect(r.wuKnM2).toBeCloseTo(11.42, 10);
    expect(r.combo).toBe(2);
    expect(r.short.posKnM).toBeCloseTo((5.71 * 16) / 8, 8);
  });

  it("a panel longer than 2:1 spans one way", () => {
    const r = designSlab(slabIn({ shortM: 2, longM: 4.5 }));
    expect(r.type).toBe("one-way");
    expect(r.long).toBeNull();
  });

  it("picks the smallest thickness that passes, never below 125 mm, and reports >1 when nothing passes", () => {
    const ok = designSlab(slabIn({ shortM: 3, longM: 3 }));
    expect(ok.thicknessMm).toBeGreaterThanOrEqual(125);
    expect(ok.util).toBeLessThanOrEqual(1);
    const bad = designSlab(slabIn({ shortM: 14, longM: 14 }));
    expect(bad.util).toBeGreaterThan(1);
  });

  it("property: a longer span gives a larger moment", () => {
    let prev = 0;
    for (const s of [3, 4, 5, 6]) {
      const r = designSlab(slabIn({ shortM: s, longM: s, thicknessMm: 200 }));
      expect(r.short.posKnM).toBeGreaterThan(prev);
      prev = r.short.posKnM;
    }
  });
});

const line = (lengthsMm: number[], over: Partial<BeamLineInput["spans"][number]> = {}): BeamLineInput => ({
  slabThicknessMm: 125,
  wallHeightMm: 3000,
  spans: lengthsMm.map((l) => ({ lengthMm: l, slabDeadBend: 10, slabDeadShear: 10, slabLiveBend: 5, slabLiveShear: 5, wallThicknessMm: null, wallShare: 0, ...over })),
});

describe("beam line", () => {
  it("hand example: one 5 m span, 250 x 500, slab 125: self 2.34 kN/m, wu = 22.8125, M+ = wL2/8 = 71.29, Vu = 43.6 at d from the face", () => {
    // self = 25 x 0.25 x (0.5 - 0.125) = 2.34375; D = 12.34375, L = 5; wu = max(17.28, 14.8125 + 8) = 22.8125
    const r = designBeamLine(line([5000]), { bMm: 250, hMm: 500 });
    const s = r.spans[0];
    expect(s.mPosKnM).toBeCloseTo((22.8125 * 25) / 8, 6);
    // d = 500 - 40 - 10 - 10 = 440; Vu = wu L/2 - wu (0.15 + 0.44) = 57.03 - 13.46
    expect(r.dMm).toBe(440);
    expect(s.vuKn).toBeCloseTo(22.8125 * 2.5 - 22.8125 * 0.59, 6);
    expect(s.mNegLeftKnM).toBeCloseTo((22.8125 * 25) / 24, 6);
  });

  it("deflection is checked against span/480 and reported, not clamped", () => {
    const r = designBeamLine(line([9000]), { bMm: 250, hMm: 350 });
    expect(r.spans[0].deflection.limitMm).toBeCloseTo(9000 / 480, 10);
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
      expect(r.util).toBeGreaterThan(prevU);
      prevM = r.spans[0].mPosKnM;
      prevU = r.util;
    }
  });
});

describe("slab load to beams", () => {
  it("square 4 x 4: triangular, bend w S/3, shear w S/4", () => {
    const c = panelToBeam(4000, 4000, 4000);
    expect(c.bend).toBeCloseTo(4 / 3, 10);
    expect(c.shear).toBeCloseTo(1, 10);
  });
  it("3 x 5: trapezoid on the long beam carries total w S/2 (L - S/2) = 6.75 per unit load", () => {
    const c = panelToBeam(5000, 3000, 5000);
    expect(c.shear * 5).toBeCloseTo(1.5 * (5 - 1.5), 8);
    // triangle on the short beam: S/3 and S/4
    expect(panelToBeam(3000, 3000, 5000).shear).toBeCloseTo(0.75, 10);
  });
  it("one-way panel: only the long beams load, with w S/2", () => {
    expect(panelToBeam(5000, 2000, 5000)).toEqual({ bend: 1, shear: 1 });
    expect(panelToBeam(2000, 2000, 5000)).toEqual({ bend: 0, shear: 0 });
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

  it("roof slabs carry the roof live load, floors the residential live load", () => {
    const res = analyzeStructure(model("p1-4b", 3));
    const floor = res.levels[0].panels[0].result;
    const roof = res.levels[2].panels[0].result;
    expect(roof.lKnM2).toBe(1);
    expect(floor.lKnM2).toBeGreaterThanOrEqual(3.2);
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
