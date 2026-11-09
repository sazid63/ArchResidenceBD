import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { roofLoads, tankKn, TANK_HEIGHT_MM, TANK_INSET_MM } from "../model/roofEquipment";
import { analyzeStructure } from "./analyze";

function model(planId: string, storeys: number) {
  const r = deriveBuilding({ plotWidthMm: 18000, plotDepthMm: 28000, storeys, planId });
  if (!r.ok) throw new Error("derive");
  return r.model;
}

describe("roof equipment loads", () => {
  it("the tank is its inner volume of water plus 10 % for the shell", () => {
    const cover = { x0: 0, y0: 0, x1: 6000, y1: 3000 };
    const inner = (6000 - 2 * TANK_INSET_MM) * (3000 - 2 * TANK_INSET_MM) * TANK_HEIGHT_MM / 1e9; // m3
    expect(tankKn(cover)).toBeCloseTo(inner * 10 * 1.1, 6);
    expect(tankKn(cover)).toBeGreaterThan(150); // 5.4 x 2.4 x 1.2 m of water is about 171 kN with the shell: a real tank, not a token load
  });

  it("every building with a stair cover has a tank, a cover and a lift room load", () => {
    const m = model("p2-2b-fb", 4);
    const loads = roofLoads(m);
    expect(loads.map((l) => l.what).sort()).toEqual(["lift machine room", "stair cover", "water tank"]);
    expect(loads.every((l) => l.kn > 0)).toBe(true);
  });

  it("the columns carry the roof equipment: removing it lowers the total base load by about its weight", () => {
    const m = model("p2-2b-fb", 4);
    const bare = { ...m, roof: { ...m.roof, stairCover: null, liftRoom: null } };
    const total = (mm: typeof m) => analyzeStructure(mm).frame.columns.reduce((a, c) => a + c.storeys[0].deadKn, 0);
    const equipment = roofLoads(m).reduce((a, l) => a + l.kn, 0);
    const diff = total(m) - total(bare);
    expect(diff).toBeGreaterThan(equipment * 0.95);
    expect(diff).toBeLessThan(equipment * 1.4); // the heavier roof grows some columns a little
  });

  it("stair panels weigh more than a flat slab of the same thickness", () => {
    const m = model("p2-2b-fb", 4);
    const res = analyzeStructure(m);
    const lv = res.levels[1];
    const stairPanels = lv.panels.filter((p) => p.result.dKnM2 !== undefined);
    expect(stairPanels.length).toBeGreaterThan(0);
    const dMax = Math.max(...stairPanels.map((p) => p.result.dKnM2));
    const dMin = Math.min(...stairPanels.map((p) => p.result.dKnM2));
    expect(dMax - dMin).toBeGreaterThanOrEqual(2.9);
  });
});
