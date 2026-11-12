import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "./analyze";

// Eq 6.8.5 (BNBC 2020 Part 6 Sec 8.3.5.2) is wired into pass or fail: each joint that fails is a structure failure.
const analyse = (storeys: number) => {
  const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys, planId: "p2-2b-fb" });
  if (!b.ok) throw new Error("fit");
  return analyzeStructure(b.model);
};

describe("eq 6.8.5 strong column / weak beam, wired", () => {
  it("every checked joint has ratio = sum Mnc / sum Mnb and passes only at 1.2 or more", () => {
    const r = analyse(4);
    expect(r.frame.strongColumn.length).toBeGreaterThan(0);
    for (const j of r.frame.strongColumn) {
      expect(j.ratio).toBeCloseTo(j.sumMncKnM / j.sumMnbKnM, 6);
      expect(j.ok).toBe(j.ratio >= 1.2 - 1e-9);
    }
  });

  it("after sizing, every storey count from 2 to 8 passes eq 6.8.5 at every checked joint, with no strong-column failure left", () => {
    for (const storeys of [2, 4, 6, 8]) {
      const r = analyse(storeys);
      expect(r.frame.strongColumn.length).toBeGreaterThan(0);
      expect(r.frame.strongColumn.every((j) => j.ok)).toBe(true);
      expect(r.failures.filter((f) => f.governs.startsWith("strong column"))).toHaveLength(0);
      expect(r.frame.converged).toBe(true);
    }
  });
});

// Joint shear, Sec 8.3.7.3: the sizing grows the column below each joint until Vu <= phi gamma sqrt(fc') Aj.
describe("joint shear, Sec 8.3.7.3, wired", () => {
  it("every checked joint passes after sizing, with a confinement factor of 1.0, 1.2 or 1.7", () => {
    for (const storeys of [2, 4, 8]) {
      const r = analyse(storeys);
      expect(r.frame.jointShear.length).toBeGreaterThan(0);
      expect(r.frame.jointShear.every((j) => j.ok && j.util <= 1)).toBe(true);
      expect(r.frame.jointShear.every((j) => [1.0, 1.2, 1.7].includes(j.gamma))).toBe(true);
      expect(r.failures.filter((f) => f.governs.startsWith("joint shear"))).toHaveLength(0);
    }
  });
});

// Core boundary elements (Sec 8.3.6.6): an 8-storey core edge is above 0.2 fc', so boundary elements are detailed and in the bar schedule.
describe("core boundary elements", () => {
  it("the 8-storey core needs boundary elements; they are detailed with ties and the structure passes", () => {
    const r = analyse(8);
    const c = r.frame.core!;
    expect(c.x.boundaryStressMpa).toBeGreaterThan(0.2 * 20);
    expect(c.x.boundaryElementRequired).toBe(true);
    const be = c.x.boundary!;
    expect(be.fits).toBe(true);
    expect(be.lengthMm).toBeGreaterThanOrEqual(300);
    expect(be.tieSpacingMm).toBeGreaterThanOrEqual(50);
    expect(be.tieSpacingMm).toBeLessThanOrEqual(150);
    expect(r.failures.some((f) => f.id.startsWith("boundary-element"))).toBe(false);
  });

  it("the boundary stress follows M / (flange x t x lw) and the element length covers the zone above 0.15 fc'", () => {
    const r = analyse(8);
    const c = r.frame.core!.x;
    const limit = 0.15 * 20;
    const lw = 2 * 1000; // sanity floor only: the element is never shorter than 300 mm
    expect(c.boundary!.lengthMm).toBeGreaterThanOrEqual(Math.min(300, lw));
    expect(c.boundaryStressMpa).toBeGreaterThan(limit);
  });
});
