import { describe, expect, it } from "vitest";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { DEFAULT_SETBACKS_MM, deriveBuilding, groundFloorPlan, type BuildingInput } from "./building";

const S = DEFAULT_SETBACKS_MM;

/** A plot sized so the plan fits at its preferred size inside the default setbacks. */
function plotFor(planId: string, extraW = 0, extraD = 0): Pick<BuildingInput, "plotWidthMm" | "plotDepthMm"> {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  return { plotWidthMm: r.widthMm.pref + S.left + S.right + extraW, plotDepthMm: r.depthMm.pref + S.front + S.rear + extraD };
}

function build(over: Partial<BuildingInput> & { planId: string }) {
  const r = deriveBuilding({ storeys: 4, ...plotFor(over.planId), ...over });
  if (!r.ok) throw new Error(r.reasons.map((x) => x.message.en).join("; "));
  return r;
}

describe("deriveBuilding", () => {
  it("computes the envelope from the plot and the setbacks", () => {
    const { model } = build({ planId: "p1-4b" });
    const p = model.plot;
    expect(model.envelope).toEqual({ x0: S.left, y0: S.front, x1: p.x1 - S.right, y1: p.y1 - S.rear });
  });

  it("puts the building inside the envelope, front-aligned and centred across the width", () => {
    const { model } = build({ planId: "p1-4b", ...plotFor("p1-4b", 1000, 2000) });
    const e = model.envelope;
    expect(model.origin.y).toBe(e.y0);
    expect(model.origin.x).toBeGreaterThanOrEqual(e.x0);
    expect(model.origin.x + model.widthMm).toBeLessThanOrEqual(e.x1);
    const left = model.origin.x - e.x0;
    const right = e.x1 - (model.origin.x + model.widthMm);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(10);
  });

  it("changes the building when the plot changes", () => {
    const a = build({ planId: "p1-4b" }).model;
    const b = build({ planId: "p1-4b", ...plotFor("p1-4b", 1200, 1500) }).model;
    expect(b.widthMm).toBeGreaterThan(a.widthMm);
    expect(b.depthMm).toBeGreaterThan(a.depthMm);
  });

  it("stacks storeys at floor-to-floor heights with the UI's phase ids", () => {
    const { model } = build({ planId: "p1-4b", storeys: 5, floorToFloorMm: 3200 });
    expect(model.storeys.map((s) => s.levelMm)).toEqual([0, 3200, 6400, 9600, 12800]);
    expect(model.storeys.map((s) => s.phaseId)).toEqual(["phase-ground-floor", "phase-floor-1", "phase-floor-2", "phase-floor-3", "phase-floor-4"]);
    expect(model.storeys.map((s) => s.use)).toEqual(["ground", "typical", "typical", "typical", "typical"]);
    expect(model.roof.levelMm).toBe(16000);
    expect(model.roof.phaseId).toBe("phase-rooftop");
  });

  it("gives the ground floor the same grid and columns as the floors above", () => {
    for (const plan of PLAN_LIBRARY) {
      const { model } = build({ planId: plan.id });
      const [ground, typical] = [model.storeys[0].geometry, model.storeys[1].geometry];
      expect(ground.fitted.xLines).toEqual(typical.fitted.xLines);
      expect(ground.fitted.yLines).toEqual(typical.fitted.yLines);
      expect(ground.columns).toEqual(typical.columns);
      expect(ground.beams).toEqual(typical.beams);
    }
  });

  it("makes the ground floor parking around the core only", () => {
    const { model } = build({ planId: "p2-2b-fb" });
    const kinds = model.storeys[0].geometry.fitted.rooms.map((r) => r.def.kind).sort();
    expect(kinds).toEqual(["lift", "lobby", "parking", "stair"]);
    expect(model.storeys[0].geometry.fitted.rooms.some((r) => r.def.unit)).toBe(false);
  });

  it("keeps the core in the same place on every floor", () => {
    const { model } = build({ planId: "p1-4b" });
    const rect = (i: number, kind: string) => model.storeys[i].geometry.fitted.rooms.find((r) => r.def.kind === kind)!.rects[0];
    expect(rect(0, "stair")).toEqual(rect(1, "stair"));
    expect(rect(0, "lift")).toEqual(rect(1, "lift"));
  });

  it("puts the stair cover and lift room on the roof over the core", () => {
    const { model } = build({ planId: "p1-4b" });
    const stair = model.storeys[1].geometry.fitted.rooms.find((r) => r.def.kind === "stair")!.rects[0];
    expect(model.roof.stairCover).toEqual(stair);
    expect(model.roof.liftRoom).not.toBeNull();
  });

  it("passes the fitter's rejection through when the plot is too small", () => {
    const r = deriveBuilding({ storeys: 4, planId: "p1-4b", plotWidthMm: 9000, plotDepthMm: 20000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons[0].code).toBe("too_narrow");
      expect(r.reasons[0].message.en).toMatch(/Needs at least/);
    }
  });

  it("rejects bad input instead of guessing", () => {
    const base = { ...plotFor("p1-4b"), planId: "p1-4b", storeys: 4 };
    for (const bad of [{ planId: "nope" }, { storeys: 0 }, { storeys: 2.5 }, { storeys: 31 }, { floorToFloorMm: 1000 }]) {
      const r = deriveBuilding({ ...base, ...bad });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reasons[0].code).toBe("invalid_plan");
    }
  });

  it("is deterministic", () => {
    const a = build({ planId: "p2-2b-fb", mirror: true });
    const b = build({ planId: "p2-2b-fb", mirror: true });
    expect(JSON.stringify(a.model)).toBe(JSON.stringify(b.model));
  });

  for (const plan of PLAN_LIBRARY)
    for (const storeys of [1, 2, 6, 10])
      for (const mirror of [false, true])
        it(`${plan.id}: ${storeys} storeys${mirror ? " mirrored" : ""} has no validator errors on any storey`, () => {
          const { model } = build({ planId: plan.id, storeys, mirror });
          expect(model.storeys).toHaveLength(storeys);
          for (const s of model.storeys)
            expect(s.issues.filter((i) => i.severity === "error").map((i) => `${s.phaseId}: ${i.message}`)).toEqual([]);
        });
});

describe("groundFloorPlan", () => {
  it("covers every cell exactly once and keeps the core doors", () => {
    for (const plan of PLAN_LIBRARY) {
      const g = groundFloorPlan(plan);
      const count = g.rooms.reduce((n, r) => n + r.cells.reduce((m, [x0, y0, x1, y1]) => m + (x1 - x0 + 1) * (y1 - y0 + 1), 0), 0);
      expect(count).toBe(plan.baysX.length * plan.baysY.length);
      expect(g.doors.some((d) => d.between.includes("lobby") && d.between.includes("parking"))).toBe(true);
      expect(g.doors.some((d) => d.between.includes("lobby") && d.between.includes("stair"))).toBe(true);
    }
  });
});
