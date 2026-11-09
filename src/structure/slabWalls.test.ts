import { describe, expect, it } from "vitest";
import type { WallSegment } from "../plans/geometry";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "./analyze";
import { wallLineLoadKnM } from "./loads";
import { slabWallKn } from "./slabWalls";

const wall = (o: Partial<WallSegment>): WallSegment => ({ orientation: "v", at: 3000, from: 0, to: 4000, a: 0, b: 1, exterior: false, thicknessMm: 125, ...o });
const panel = { px: 0, py: 0, x0: 0, y0: 0, x1: 6000, y1: 4000 };

describe("walls on slabs", () => {
  it("a wall inside a panel adds its weight: length x line load", () => {
    const kn = slabWallKn([wall({})], new Set(), [panel], 2875).get("0,0")!;
    expect(kn).toBeCloseTo(4 * wallLineLoadKnM(125, 2.875), 6);
  });

  it("a wall on a structural line is left to the beam", () => {
    expect(slabWallKn([wall({})], new Set(["v3000"]), [panel], 2875).size).toBe(0);
  });

  it("a wall on the panel edge or outside it adds nothing; a wall that runs past the panel counts only its part", () => {
    expect(slabWallKn([wall({ at: 0 })], new Set(), [panel], 2875).size).toBe(0);
    expect(slabWallKn([wall({ at: 6000 })], new Set(), [panel], 2875).size).toBe(0);
    expect(slabWallKn([wall({ at: 9000 })], new Set(), [panel], 2875).size).toBe(0);
    const part = slabWallKn([wall({ from: 2000, to: 7000 })], new Set(), [panel], 2875).get("0,0")!;
    expect(part).toBeCloseTo(2 * wallLineLoadKnM(125, 2.875), 6);
  });

  it("a horizontal wall is handled the same way, and a thicker wall weighs more", () => {
    const h = slabWallKn([wall({ orientation: "h", at: 2000, from: 0, to: 6000, thicknessMm: 250 })], new Set(), [panel], 2875).get("0,0")!;
    expect(h).toBeCloseTo(6 * wallLineLoadKnM(250, 2.875), 6);
    expect(h).toBeGreaterThan(6 * wallLineLoadKnM(125, 2.875));
  });

  it("in a real plan with walls off the beam lines (p1-4b) the slab dead load is higher than in a floor without them", () => {
    const r = deriveBuilding({ plotWidthMm: 14000, plotDepthMm: 24000, storeys: 4, planId: "p1-4b" });
    if (!r.ok) throw new Error("derive");
    const res = analyzeStructure(r.model);
    const dMax = Math.max(...res.levels[1].panels.map((p) => p.result.dKnM2));
    const dMin = Math.min(...res.levels[1].panels.map((p) => p.result.dKnM2));
    expect(dMax - dMin).toBeGreaterThan(1); // panels with a wall standing on them carry it
  });
});
