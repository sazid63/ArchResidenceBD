import { describe, expect, it } from "vitest";
import { deriveBuilding } from "./building";
import { buildMesh } from "./toMesh";
import { LIFT_ASSUMPTIONS, LIFT_CLASSES, liftCore, liftSpec } from "./lift";

const build = (planId: string, storeys: number) => {
  const b = deriveBuilding({ plotWidthMm: 22000, plotDepthMm: 32000, storeys, planId });
  if (!b.ok) throw new Error("fit");
  return b.model;
};

describe("B5 lift sizing, pit and overrun", () => {
  it("serves flats x floors; 1 lift per 40 flats; class by flats per lift", () => {
    const m = build("p2-2b-fb", 8); // 2 flats on 7 typical floors
    const s = liftSpec(m)!;
    expect(s.flatsServed).toBe(14);
    expect(s.liftsNeeded).toBe(1);
    expect(s.cls.id).toBe("630");
    expect(s.persons).toBe(14 * LIFT_ASSUMPTIONS.personsPerFlat);
    const big = liftSpec(build("p4-2b", 9))!; // 4 flats on 8 floors = 32 flats, 32 per lift
    expect(big.flatsServed).toBe(32);
    expect(big.cls.id).toBe("1000");
  });

  it("above ten storeys the car is the stretcher class: platform at least 1275 x 2000 mm (BNBC Part 8)", () => {
    const s = liftSpec(build("p2-2b-fb", 11))!;
    expect(s.stretcher).toBe(true);
    expect(s.cls.id).toBe("stretcher");
    const [w, d] = LIFT_CLASSES[2].carMm;
    expect(Math.min(w, d)).toBeGreaterThanOrEqual(1275);
    expect(Math.max(w, d)).toBeGreaterThanOrEqual(2000);
    expect(liftSpec(build("p2-2b-fb", 10))!.stretcher).toBe(false);
  });

  it("overhead is the roof cover height above the top landing less the slab", () => {
    const m = build("p2-2b-fb", 6);
    const s = liftSpec(m)!;
    expect(s.overheadMm).toBe(m.input.floorToFloorMm + m.roof.coverHeightMm - 125);
    expect(s.fitsOverhead).toBe(s.overheadMm >= LIFT_ASSUMPTIONS.overheadMm);
  });

  it("shaft concrete: 150 mm walls round the cell from pit floor to machine-room roof, less a door per floor, plus the pit slab (hand check)", () => {
    const m = build("p2-2b-fb", 6);
    const c = liftCore(m)!;
    const w = m.roof.liftRoom!.x1 - m.roof.liftRoom!.x0;
    const d = m.roof.liftRoom!.y1 - m.roof.liftRoom!.y0;
    const h = 1500 + m.roof.levelMm + m.roof.coverHeightMm;
    expect(c.heightMm).toBe(h);
    expect(c.wallM3).toBeCloseTo((2 * (w + d) * h * 150) / 1e9 - 6 * 0.9 * 2.1 * 0.15, 6);
    expect(c.pitSlabM3).toBeCloseTo(((w + 150) * (d + 150) * 250) / 1e9, 6);
  });

  it("the 3D model has the pit below the ground floor level", () => {
    const m = build("p2-2b-fb", 6);
    const doc = buildMesh(m);
    const pit = doc.objects.filter((o) => o.id.startsWith("lift_pit"));
    expect(pit.length).toBeGreaterThan(0);
    expect(Math.min(...pit.map((o) => o.bboxMinMm[2]))).toBe(-(1500 + 250));
    expect(Math.max(...pit.map((o) => o.bboxMaxMm[2]))).toBeLessThanOrEqual(0);
  });

});
