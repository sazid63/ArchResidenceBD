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
