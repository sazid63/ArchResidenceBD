import { describe, expect, it } from "vitest";
import type { BuildingProject } from "../engine/projectState";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { buildingForProject } from "./projectMesh";
import { openingSchedule, scheduleToCsv } from "./schedules";
import { DOOR_HEIGHT, VENT_HEIGHT, VENT_SILL, WINDOW_HEIGHT, WINDOW_SILL } from "./toMesh";

function model(planId: string, storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
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

describe("opening schedule", () => {
  for (const plan of PLAN_LIBRARY) {
    it(`${plan.id}: the schedule counts exactly the drawn doors and windows`, () => {
      const m = model(plan.id, 3);
      const rows = openingSchedule(m);
      const doors = m.storeys.reduce((a, s) => a + s.geometry.doors.length, 0);
      const windows = m.storeys.reduce((a, s) => a + s.geometry.windows.length, 0);
      expect(rows.filter((r) => r.kind === "door").reduce((a, r) => a + r.total, 0)).toBe(doors);
      expect(rows.filter((r) => r.kind !== "door").reduce((a, r) => a + r.total, 0)).toBe(windows);
      for (const r of rows) {
        expect(r.perStorey.reduce((a, b) => a + b, 0)).toBe(r.total);
        expect(r.perStorey).toHaveLength(3);
        expect(r.widthMm).toBeGreaterThan(0);
      }
      expect(new Set(rows.map((r) => r.mark)).size).toBe(rows.length);
    });
  }

  it("sizes match what the 3D model draws", () => {
    const rows = openingSchedule(model("p1-4b", 2));
    for (const r of rows) {
      if (r.kind === "door") expect([r.heightMm, r.sillMm]).toEqual([DOOR_HEIGHT, 0]);
      if (r.kind === "window") expect([r.heightMm, r.sillMm]).toEqual([WINDOW_HEIGHT, WINDOW_SILL]);
      if (r.kind === "vent") expect([r.heightMm, r.sillMm]).toEqual([VENT_HEIGHT, VENT_SILL]);
    }
    expect(rows.some((r) => r.kind === "door" && r.main)).toBe(true);
    expect(rows.some((r) => r.kind === "window")).toBe(true);
  });

  it("is deterministic and the CSV has one line per row", () => {
    const m = model("p1-4b", 4);
    expect(openingSchedule(m)).toEqual(openingSchedule(m));
    const rows = openingSchedule(m);
    expect(scheduleToCsv(rows).split("\n")).toHaveLength(rows.length + 1);
  });
});
