import { describe, expect, it } from "vitest";
import { cantileverMinThicknessMm, designCantilever } from "./cantilever";
import { liveLoadKnM2 } from "../rules/bnbc";
import { roofLiveKnM2, slabSelfWeightKnM2, wallLineLoadKnM } from "./loads";
import { UNIT_WEIGHTS } from "./materials";

describe("balcony cantilever slab", () => {
  it("is at least L/10 deep (Table 6.6.1, cantilever divisor 10), rounded up to 25 mm", () => {
    expect(cantileverMinThicknessMm(1000)).toBe(100);
    expect(cantileverMinThicknessMm(1500)).toBe(150);
    expect(cantileverMinThicknessMm(1800)).toBe(200);
    expect(designCantilever({ lengthMm: 1000, thicknessMm: 125, roof: false, parapetMm: 1000 }).thicknessMm).toBe(125);
    expect(designCantilever({ lengthMm: 1800, thicknessMm: 125, roof: false, parapetMm: 1000 }).thicknessMm).toBe(200);
  });

  it("matches a hand calculation: 1.5 m, 150 mm, floor", () => {
    const L = 1.5;
    const wd = slabSelfWeightKnM2(150) + UNIT_WEIGHTS.floorFinishKnM2;
    const wl = liveLoadKnM2("residential-public");
    const pd = 1.0; // railing, kN/m (assumption)
    const md = (wd * L * L) / 2 + pd * L;
    const ml = (wl * L * L) / 2;
    const vd = wd * L + pd;
    const vl = wl * L;
    const r = designCantilever({ lengthMm: 1500, thicknessMm: 150, roof: false, parapetMm: 1000 });
    // Sec 2.7.5: 1.4D, 1.2D + 1.6L; the second governs here.
    expect(Math.max(1.4 * md, 1.2 * md + 1.6 * ml)).toBeCloseTo(r.muKnMPerM, 9);
    expect(1.2 * md + 1.6 * ml).toBeCloseTo(r.muKnMPerM, 9);
    expect(r.vuKnPerM).toBeCloseTo(1.2 * vd + 1.6 * vl, 9);
    expect(r.beamDeadKnM).toBeCloseTo(vd, 9);
    expect(r.beamLiveKnM).toBeCloseTo(vl, 9);
    expect(r.muKnMPerM).toBeGreaterThan(15);
    expect(r.muKnMPerM).toBeLessThan(20);
    expect(r.dMm).toBe(150 - 20 - 6);
    expect(r.util).toBeGreaterThan(0);
    expect(r.util).toBeLessThan(1);
    expect(r.util).toBeCloseTo(Math.max(r.flexure.util, r.vuKnPerM / r.phiVcKnPerM), 9);
  });

  it("on a roof the live load is Lr and the tip carries a parapet", () => {
    const L = 1.5;
    const wd = slabSelfWeightKnM2(150) + UNIT_WEIGHTS.roofFinishKnM2;
    const pd = wallLineLoadKnM(125, 1.0);
    const md = (wd * L * L) / 2 + pd * L;
    const ml = (roofLiveKnM2() * L * L) / 2;
    const r = designCantilever({ lengthMm: 1500, thicknessMm: 150, roof: true, parapetMm: 1000 });
    expect(r.tipDeadKnM).toBeCloseTo(pd, 9);
    expect(r.muKnMPerM).toBeCloseTo(Math.max(1.4 * md, 1.2 * md + 0.5 * ml, 1.2 * md + 1.6 * ml * 0), 6);
  });

  it("grows with the length: a longer cantilever takes more moment and is never reported as passing when it cannot", () => {
    const a = designCantilever({ lengthMm: 1000, thicknessMm: 125, roof: false, parapetMm: 1000 });
    const b = designCantilever({ lengthMm: 1500, thicknessMm: 125, roof: false, parapetMm: 1000 });
    expect(b.muKnMPerM).toBeGreaterThan(a.muKnMPerM * 2);
    // 3 m on a 125 mm slab: the thickness is raised to L/10 = 300 mm, and the result is still finite.
    const c = designCantilever({ lengthMm: 3000, thicknessMm: 125, roof: false, parapetMm: 1000 });
    expect(c.thicknessMm).toBe(300);
    expect(Number.isFinite(c.util)).toBe(true);
  });
});
