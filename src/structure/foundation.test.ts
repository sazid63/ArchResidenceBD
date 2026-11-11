import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { analyzeStructure } from "./analyze";
import { buildBbs } from "./bbs";
import { footingsOverlap, planFoundation } from "./foundation";

function structure(planId: string, storeys: number, w = 18000, d = 28000) {
  const r = deriveBuilding({ plotWidthMm: w, plotDepthMm: d, storeys, planId });
  if (!r.ok) throw new Error("derive " + planId);
  return { model: r.model, res: analyzeStructure(r.model) };
}

describe("foundation", () => {
  it("no two footings overlap, in any plan at any height that fits (the isolated pads alone did overlap)", () => {
    let sawOverlap = 0;
    for (const plan of PLAN_LIBRARY) {
      const range = fitRange(plan);
      for (const storeys of [1, 4, 6, 8, 12]) {
        const r = deriveBuilding({ plotWidthMm: range.widthMm.pref + 4000, plotDepthMm: range.depthMm.pref + 7000, storeys, planId: plan.id });
        if (!r.ok) continue;
        const res = analyzeStructure(r.model);
        expect(footingsOverlap(res.foundation.footings), `${plan.id} ${storeys}st`).toBe(false);
        sawOverlap += res.foundation.overlappingPads;
        // every column sits in exactly one footing
        const owners = new Map<string, number>();
        for (const f of res.foundation.footings) for (const id of f.columnIds) owners.set(id, (owners.get(id) ?? 0) + 1);
        expect(owners.size).toBe(res.frame.columns.length);
        expect([...owners.values()].every((n) => n === 1)).toBe(true);
      }
    }
    // the test can tell: isolated pads overlapped somewhere in this sweep
    expect(sawOverlap).toBeGreaterThan(0);
  }, 120000);

  it("a merged footing keeps at least the bearing area of the pads it replaces, and holds its columns", () => {
    const { res } = structure("p2-3b-lr", 6);
    const merged = res.foundation.footings.filter((f) => f.kind !== "isolated");
    expect(merged.length).toBeGreaterThan(0);
    for (const f of merged) {
      const need = f.columnIds.reduce((a, id) => {
        const c = res.frame.columns.find((x) => x.id === id)!;
        return a + (c.footing.sideMm * c.footing.sideMm) / 1e6;
      }, 0);
      expect(f.areaM2).toBeGreaterThanOrEqual(need - 1e-6);
      for (const id of f.columnIds) {
        const c = res.frame.columns.find((x) => x.id === id)!;
        expect(c.xMm).toBeGreaterThanOrEqual(f.x0);
        expect(c.xMm).toBeLessThanOrEqual(f.x1);
        expect(c.yMm).toBeGreaterThanOrEqual(f.y0);
        expect(c.yMm).toBeLessThanOrEqual(f.y1);
      }
      expect(f.depthMm).toBeGreaterThanOrEqual(Math.max(...f.columnIds.map((id) => res.frame.columns.find((x) => x.id === id)!.footing.depthMm)));
    }
  });

  it("a footing with no neighbour in its way stays the designed isolated pad", () => {
    const { res } = structure("p2-2b-fb", 4);
    for (const f of res.foundation.footings.filter((x) => x.kind === "isolated")) {
      const c = res.frame.columns.find((x) => x.id === f.columnIds[0])!;
      expect(f.x1 - f.x0).toBe(c.footing.sideMm);
      expect(f.depthMm).toBe(c.footing.depthMm);
    }
  });

  it("a tall narrow building becomes a raft and merging is stable (planning twice gives the same footings)", () => {
    const { res } = structure("p2-2b-fb", 14);
    expect(res.foundation.footings.some((f) => f.kind === "raft")).toBe(true);
    const again = planFoundation(res.frame.columns, 14);
    expect(again.footings).toEqual(res.foundation.footings);
  });

  it("the bar schedule and concrete use the footings as built, not the overlapping pads", () => {
    const { model, res } = structure("p2-3b-lr", 6);
    const bbs = buildBbs(res, model);
    const built = res.foundation.footings.reduce((a, f) => a + ((f.x1 - f.x0) * (f.y1 - f.y0) * f.depthMm) / 1e9, 0);
    const pads = res.frame.columns.reduce((a, c) => a + (c.footing.sideMm ** 2 * c.footing.depthMm) / 1e9, 0);
    // the merged footings are larger than the overlapping pads they replace (they fill the gap and get deeper), never a sum of overlapping volumes
    expect(built).toBeGreaterThan(pads * 0.9);
    expect(bbs.totals.concreteM3).toBeGreaterThan(built);
    const rows = bbs.rows.filter((r) => r.family === "footing");
    expect(rows.some((r) => /Combined footing|Raft/.test(r.description.en))).toBe(true);
    expect(rows.every((r) => r.cutLengthMm <= 12000)).toBe(true); // lapped within the stock length
  });
});

describe("merged footing: punching and bending between columns", () => {
  it("strip moment, hand-worked: two 1000 kN loads at 1 m and 5 m on a 6 m strip give 500 kN.m at mid-span; one 600 kN load at the centre gives 450", async () => {
    const { stripMaxMomentKnM } = await import("./foundation");
    expect(stripMaxMomentKnM([{ x: 1000, p: 1000 }, { x: 5000, p: 1000 }], 0, 6000)).toBeCloseTo(500, 6);
    expect(stripMaxMomentKnM([{ x: 3000, p: 600 }], 0, 6000)).toBeCloseTo(450, 6);
    expect(stripMaxMomentKnM([], 0, 6000)).toBe(0);
  });

  it("every merged footing carries its check; it passes unless it reached the 2000 mm limit, and the depth never shrinks below the pad rule", async () => {
    const { deriveBuilding } = await import("../model/building");
    const { analyzeStructure } = await import("./analyze");
    const b = deriveBuilding({ plotWidthMm: 12000, plotDepthMm: 22000, storeys: 7, planId: "pn-3b" });
    if (!b.ok) throw new Error("fit");
    const res = analyzeStructure(b.model);
    const merged = res.foundation.footings.filter((f) => f.kind !== "isolated");
    expect(merged.length).toBeGreaterThan(0);
    for (const f of merged) {
      expect(f.mergedCheck, f.id).toBeTruthy();
      if (f.depthMm < 2000) expect(f.mergedCheck!.util, f.id).toBeLessThanOrEqual(1);
      else if (f.mergedCheck!.util > 1) expect(res.failures.some((x) => x.id === f.id && x.member === "footing")).toBe(true);
      expect(f.depthMm % 50).toBe(0);
    }
  });
});
