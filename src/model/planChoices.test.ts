import { describe, expect, it } from "vitest";
import { PLAN_LIBRARY } from "../plans/library";
import { availableUnitCounts, envelopeFor, planChoices, plotProblems, rejectionText, summarisePlot } from "./planChoices";

describe("summarisePlot", () => {
  it("gives area in m², katha and sq ft", () => {
    const s = summarisePlot(12.19, 16.46);
    expect(s.areaSqm).toBeCloseTo(200.65, 1);
    expect(s.katha).toBeCloseTo(3.0, 0); // 720 sq ft per katha
    expect(s.sqft).toBeGreaterThan(2150);
  });
});

describe("envelopeFor", () => {
  it("takes the setbacks off the plot", () => {
    expect(envelopeFor(12, 18, { front: 1500, rear: 2000, left: 1000, right: 1000 })).toEqual({ widthMm: 10000, depthMm: 14500 });
  });
});

describe("planChoices", () => {
  it("lists every library plan, fitting ones first", () => {
    const c = planChoices(13, 20);
    expect(c).toHaveLength(PLAN_LIBRARY.length);
    const firstMiss = c.findIndex((x) => !x.fit.ok);
    expect(firstMiss).toBeGreaterThan(0);
    expect(c.slice(firstMiss).every((x) => !x.fit.ok)).toBe(true);
  });

  it("explains a plan that does not fit and keeps the numbers honest", () => {
    const c = planChoices(8, 10);
    expect(c.every((x) => !x.fit.ok)).toBe(true);
    const bad = c[0].fit;
    if (bad.ok) throw new Error("expected a rejection");
    expect(rejectionText(bad.reasons, "en")).toMatch(/Needs at least/);
    expect(rejectionText(bad.reasons, "bn")).toMatch(/দরকার/);
  });

  it("filters by dwellings per floor", () => {
    const c = planChoices(16, 22, { unitsPerFloor: 2 });
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((x) => x.plan.unitsPerFloor === 2)).toBe(true);
  });

  it("a bigger plot never loses a plan that fit a smaller one", () => {
    const small = new Set(planChoices(14, 18).filter((x) => x.fit.ok).map((x) => x.plan.id));
    const big = new Set(planChoices(18, 24).filter((x) => x.fit.ok).map((x) => x.plan.id));
    for (const id of small) expect(big.has(id)).toBe(true);
  });
});

describe("availableUnitCounts", () => {
  it("matches the library", () => {
    expect(availableUnitCounts()).toEqual([...new Set(PLAN_LIBRARY.map((p) => p.unitsPerFloor))].sort());
  });
});

describe("plotProblems", () => {
  it("flags missing or non-positive numbers", () => {
    expect(plotProblems({})).toEqual(["frontage", "depth", "roadWidth"]);
    expect(plotProblems({ frontageM: 10, depthM: 0, roadWidthM: 6 })).toEqual(["depth"]);
    expect(plotProblems({ frontageM: 10, depthM: 20, roadWidthM: 6 })).toEqual([]);
  });
});
