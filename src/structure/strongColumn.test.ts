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

  it("each failing joint is listed as a structure failure, and the structure fails with it", () => {
    const r = analyse(4);
    const bad = r.frame.strongColumn.filter((j) => !j.ok);
    expect(bad.length).toBeGreaterThan(0);
    const flagged = r.failures.filter((f) => f.governs.startsWith("strong column"));
    expect(flagged).toHaveLength(bad.length);
    for (const f of flagged) expect(f.util).toBeGreaterThan(1);
    expect(r.ok).toBe(false);
  });

  it("the failure utilisation is 1.2 Mnb / Mnc for the joint", () => {
    const r = analyse(4);
    const j = r.frame.strongColumn.find((x) => !x.ok)!;
    const f = r.failures.find((x) => x.id === `${j.columnId}/joint-L${j.level}-${j.dir}`)!;
    expect(f.util).toBeCloseTo((1.2 * j.sumMnbKnM) / j.sumMncKnM, 6);
  });
});
