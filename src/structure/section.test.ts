import { describe, expect, it } from "vitest";
import { beamMinAs, flexure, shear, slabMinAs } from "./section";

describe("flexure boundaries", () => {
  it("a moment exactly at the tension-controlled capacity still has a finite steel area", () => {
    const cap = flexure(0, 300, 500, 0, 25, 420).capacityKnM;
    const at = flexure(cap, 300, 500, 0, 25, 420);
    expect(Number.isFinite(at.asCalcMm2)).toBe(true);
    expect(at.util).toBeCloseTo(1, 12);
    // and a hair above it is not designable in a singly reinforced section
    expect(flexure(cap * 1.0001, 300, 500, 0, 25, 420).asCalcMm2).toBe(Infinity);
  });

  it("a section of zero width has zero capacity and infinite utilisation, even with no moment", () => {
    expect(flexure(0, 0, 300, 0).util).toBe(Infinity);
    expect(flexure(10, 0, 300, 0).util).toBe(Infinity);
    expect(flexure(0, 0, 300, 0).capacityKnM).toBe(0);
  });

  it("a negative moment is treated as zero", () => {
    const f = flexure(-50, 300, 500, 100);
    expect(f.asCalcMm2).toBe(0);
    expect(f.util).toBe(0);
    expect(f.asReqMm2).toBe(100);
  });

  it("the required steel is never below the minimum", () => {
    expect(flexure(1, 300, 500, 400).asReqMm2).toBe(400);
    expect(flexure(150, 300, 500, 10).asReqMm2).toBeGreaterThan(10);
  });
});

describe("minimum steel", () => {
  it("slab shrinkage steel is 0.0018 b h", () => {
    expect(slabMinAs(1000, 150)).toBeCloseTo(270, 9);
    expect(slabMinAs(500, 200)).toBeCloseTo(180, 9);
  });

  it("beam minimum is the larger of 0.25 sqrt(fc)/fy and 1.4/fy", () => {
    expect(beamMinAs(300, 500, 20, 420)).toBeCloseTo((1.4 * 300 * 500) / 420, 9);
    expect(beamMinAs(300, 500, 50, 420)).toBeCloseTo((0.25 * Math.sqrt(50) * 300 * 500) / 420, 9);
  });
});

describe("shear boundaries", () => {
  const b = 300;
  const d = 500;
  const vcKn = (fc: number) => (0.17 * Math.sqrt(fc) * b * d) / 1000;

  it("no stirrups at or below half of phi Vc, minimum stirrups just above", () => {
    const half = (0.75 * vcKn(25)) / 2;
    expect(shear(half, b, d, 25).avPerMm).toBe(0);
    expect(shear(half * 1.001, b, d, 25).avPerMm).toBeGreaterThan(0);
  });

  it("minimum stirrup area is the larger of 0.062 sqrt(fc) and 0.35 MPa, times b / fyt", () => {
    // fc 50: 0.062 sqrt(50) = 0.438 > 0.35, so the root term governs
    expect(shear(0.75 * vcKn(50), b, d, 50, 420).avPerMm).toBeCloseTo((0.062 * Math.sqrt(50) * b) / 420, 12);
    // fc 20: 0.277 < 0.35, so 0.35 governs
    expect(shear(0.75 * vcKn(20), b, d, 20, 420).avPerMm).toBeCloseTo((0.35 * b) / 420, 12);
  });

  it("stirrups beyond the minimum follow Vs / (fyt d)", () => {
    const vu = 3 * 0.75 * vcKn(25);
    const vs = vu / 0.75 - vcKn(25);
    expect(shear(vu, b, d, 25, 420).avPerMm).toBeCloseTo((vs * 1000) / (420 * d), 12);
  });

  it("zero-width section: infinite utilisation, also for zero shear", () => {
    expect(shear(0, 0, d).util).toBe(Infinity);
    expect(shear(5, 0, d).util).toBe(Infinity);
  });

  it("utilisation is shear over the section limit, never clamped", () => {
    const s = shear(1000, b, d, 25);
    expect(s.util).toBeCloseTo(1000 / s.capacityKn, 12);
    expect(s.util).toBeGreaterThan(1);
  });
});
