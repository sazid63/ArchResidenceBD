import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../structure/analyze";
import { deriveBuilding } from "./building";
import { planChoices } from "./planChoices";

function ok(storeys = 4) {
  const r = deriveBuilding({ plotWidthMm: 18000, plotDepthMm: 28000, storeys, planId: "p2-2b-fb" });
  if (!r.ok) throw new Error("derive");
  return r.model;
}

describe("bad inputs are answered, not thrown", () => {
  it("a plot that cannot exist fits no plan and says why", () => {
    for (const [w, d] of [[0, 0], [-5, 20], [NaN, 20], [18, Infinity], [1e9, 1e9], [2, 20]]) {
      const ch = planChoices(w, d, { storeys: 4, roadWidthM: 9 });
      expect(ch.length, `${w}x${d}`).toBeGreaterThan(0);
      expect(ch.every((c) => !c.fit.ok), `${w}x${d}`).toBe(true);
      expect(ch[0].fit.ok ? "" : ch[0].fit.reasons[0].message.en).toMatch(/Plot sides/);
    }
  });

  it("the building model rejects an impossible plot with a message", () => {
    for (const [w, d] of [[0, 28000], [18000, -1], [NaN, 28000], [18000, 1e12]]) {
      const r = deriveBuilding({ plotWidthMm: w, plotDepthMm: d, storeys: 4, planId: "p2-2b-fb" });
      expect(r.ok, `${w}x${d}`).toBe(false);
      expect(r.ok ? "" : r.reasons[0].message.bn).toMatch(/৩ মিটার/);
    }
  });

  it("a real plot still works", () => {
    expect(planChoices(18, 28, { storeys: 4, roadWidthM: 9 }).some((c) => c.fit.ok)).toBe(true);
  });

  it("an unsupported site class or bearing gets a clear message", () => {
    const m = ok();
    expect(() => analyzeStructure(m, { siteClass: "SF" as never })).toThrow(/Unknown site class "SF"/);
    expect(() => analyzeStructure(m, { allowableBearingKpa: 0 })).toThrow(/between 20 and 1000/);
    expect(() => analyzeStructure(m, { allowableBearingKpa: NaN })).toThrow(/between 20 and 1000/);
    expect(analyzeStructure(m, { siteClass: "SE", allowableBearingKpa: 80 }).frame.columns.length).toBeGreaterThan(0);
  });
});
