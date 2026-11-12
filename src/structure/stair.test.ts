import { describe, expect, it } from "vitest";
import { designStairFlight, STAIR_CONCRETE_KN_M3, STAIR_FINISH_KN_M2, STAIR_LIVE_KN_M2 } from "./stair";

// Hand values, floor height 3000: 18 risers in 2 flights of 9 (riser 166.7 mm), tread 250, run = 8 x 250 = 2000 mm, span = 2300 mm.
describe("stair flight as a one-way waist slab", () => {
  it("span = run + 300 = 2300 mm for a 3 m storey", () => {
    expect(designStairFlight(3000).spanMm).toBe(2300);
  });

  it("factored load: (24 x 0.15 / cos a + 24 x 0.1667 / 2 + 1.5) x 1.2 + 1.6 x 4.0 = 15.79 kN/m", () => {
    const d = designStairFlight(3000);
    const cosA = 250 / Math.hypot(250, 3000 / 18);
    const dead = (STAIR_CONCRETE_KN_M3 * 0.15) / cosA + (STAIR_CONCRETE_KN_M3 * (3000 / 18)) / 2000 + STAIR_FINISH_KN_M2;
    expect(d.wuKnM).toBeCloseTo(1.2 * dead + 1.6 * STAIR_LIVE_KN_M2, 6);
    expect(d.wuKnM).toBeCloseTo(15.79, 1);
  });

  it("Mu = wu L^2 / 8 and Vu = wu (L/2 - d); the design passes with a waist from 150 to 250 mm", () => {
    const d = designStairFlight(3000);
    expect(d.muKnM).toBeCloseTo((d.wuKnM * 2.3 * 2.3) / 8, 9);
    expect(d.vuKn).toBeCloseTo(d.wuKnM * (1.15 - d.dMm / 1000), 9);
    expect(d.ok).toBe(true);
    expect(d.waistMm).toBeGreaterThanOrEqual(150);
    expect(d.waistMm).toBeLessThanOrEqual(250);
    expect(d.util).toBeLessThanOrEqual(1);
  });

  it("the main bars carry the required steel and are at most 200 mm apart", () => {
    const d = designStairFlight(3000);
    expect(d.main.areaPerM).toBeGreaterThanOrEqual(d.asReqMm2PerM - 1e-9);
    expect(d.main.spacingMm).toBeLessThanOrEqual(200);
  });

  it("a taller storey (longer flight) needs at least as much steel", () => {
    expect(designStairFlight(3600).muKnM).toBeGreaterThan(designStairFlight(3000).muKnM);
  });
});
