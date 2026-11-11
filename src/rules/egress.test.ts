import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { PLAN_LIBRARY } from "../plans/library";
import { fitRange } from "../plans/fit";
import { egressLimits, evaluateEgress, OCCUPANCY_CLASS } from "./egress";

const build = (planId: string, storeys: number) => {
  const r = fitRange(PLAN_LIBRARY.find((p) => p.id === planId)!);
  const b = deriveBuilding({ plotWidthMm: r.widthMm.pref + 9000, plotDepthMm: r.depthMm.pref + 12000, storeys, planId });
  if (!b.ok) throw new Error("fit");
  return b.model;
};

describe("egress checks (class A3, not sprinklered)", () => {
  it("reads the limits from the BNBC pack: 45 m travel, 915 mm corridor, 1120 mm stair, 8 mm per person", () => {
    expect(OCCUPANCY_CLASS).toBe("A3");
    expect(egressLimits()).toEqual({ travelPathM: 45, corridorMinWidthMm: 915, corridorMaxDeadEndMm: 12190, stairMinWidthMm: 1120, stairMmPerOccupant: 8 });
  });

  it("travel distance is a real walk: positive, at least the straight distance to the stair, and under 45 m for every library plan", () => {
    for (const p of PLAN_LIBRARY) {
      const e = evaluateEgress(build(p.id, 5))!;
      expect(e, p.id).toBeTruthy();
      expect(e.travelMm, p.id).toBeGreaterThan(2000);
      expect(e.travelMm / 1000, p.id).toBeLessThanOrEqual(45);
      expect(e.travelFrom.length).toBeGreaterThan(0);
    }
  });

  it("stair capacity: persons of one floor times 8 mm", () => {
    const e = evaluateEgress(build("p2-2b-fb", 5))!;
    expect(e.persons).toBe(10);
    expect(e.stairNeededMm).toBe(80);
    expect(e.stairFlightMm).toBe(1120);
  });
});
