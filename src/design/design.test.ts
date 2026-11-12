import { describe, expect, it } from "vitest";
import type { BuildingProject } from "../engine/projectState";
import { buildingForProject } from "../model/projectMesh";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { designAsync } from "./client";
import { computeDesign } from "./compute";

function model(storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === "p1-4b")!;
  const r = fitRange(plan);
  const p = {
    id: "p1", name: "T", address: "", stories: storeys, plotSize: 0, plotUnit: "sqm", plotSqm: 0, unitsPerFloor: plan.unitsPerFloor,
    createdAt: "", updatedAt: "", phases: [], designStarted: false,
    plot: { frontageM: (r.widthMm.pref + 3600) / 1000, depthM: (r.depthMm.pref + 5000) / 1000, roadWidthM: 9, roadSide: "south" },
    planId: plan.id,
  } as BuildingProject;
  const b = buildingForProject(p);
  if (!b || !b.ok) throw new Error("fit");
  return b.model;
}

describe("design pipeline off the UI thread", () => {
  it("the model and every result survive structuredClone (worker transport) unchanged", () => {
    const m = model(4);
    const r = computeDesign(m);
    expect(structuredClone(m)).toEqual(m);
    expect(structuredClone(r)).toEqual(r);
  });

  it("a computation on a cloned model equals the one on the original", () => {
    const m = model(4);
    expect(computeDesign(structuredClone(m))).toEqual(computeDesign(m));
  });

  it("designAsync falls back inline without Worker and shares one promise per model and options", async () => {
    const m = model(2);
    const a = designAsync(m);
    expect(designAsync(m)).toBe(a);
    expect(designAsync(m, { allowableBearingKpa: 200 })).not.toBe(a);
    expect(await a).toEqual(computeDesign(m));
  });

  it("timing budget: 2, 6 and 10 storeys each finish inside 3 s", () => {
    for (const n of [2, 6, 10]) {
      const m = model(n);
      const t = performance.now();
      computeDesign(m);
      expect(performance.now() - t).toBeLessThan(3000);
    }
  });
});
