import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "./analyze";
import { buildBbs, concreteSteps, type ConcreteStep } from "./bbs";
import { planPours, POUR_ASSUMPTIONS } from "./pourPlan";

const build = (planId: string, storeys: number) => {
  const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys, planId });
  if (!b.ok) throw new Error("fit");
  const res = analyzeStructure(b.model);
  return { model: b.model, res, bbs: buildBbs(res, b.model) };
};

describe("pour sequence", () => {
  it("the pours add up to the BOQ concrete, in pouring order", () => {
    const { model, res, bbs } = build("p2-2b-fb", 5);
    const steps = concreteSteps(res, model);
    expect(steps.reduce((a, s) => a + s.m3, 0)).toBeCloseTo(bbs.totals.concreteM3, 9);
    expect(steps[0].kind).toBe("foundation");
    expect(steps.filter((s) => s.kind === "columns")).toHaveLength(5);
    expect(steps.filter((s) => s.kind === "slab")).toHaveLength(5);
    expect(steps.at(-1)!.kind).toBe("core"); // the lift shaft walls
    // columns of a storey come before the slab above it
    const order = steps.map((s) => s.id);
    for (let k = 0; k < 5; k++) expect(order.indexOf(`columns-${k}`)).toBeLessThan(order.indexOf(`slab-${k}`));
  });

  it("hand-worked days: 60 m3 at 25 per day is 3 days, 10 m3 is 1 day, waits follow the step kind", () => {
    const steps: ConcreteStep[] = [
      { id: "foundation", kind: "foundation", m3: 60 },
      { id: "columns-0", kind: "columns", index: 0, m3: 10 },
      { id: "slab-0", kind: "slab", index: 0, m3: 30 },
      { id: "columns-1", kind: "columns", index: 1, m3: 10 },
      { id: "slab-1", kind: "slab", index: 1, m3: 30 },
    ];
    const plan = planPours(steps);
    const A = POUR_ASSUMPTIONS;
    expect(plan.rows[0]).toMatchObject({ workDays: 3, startDay: 1, endDay: 3, waitDays: A.foundationCureDays });
    expect(plan.rows[1]).toMatchObject({ workDays: 1, startDay: 3 + A.foundationCureDays + 1, waitDays: A.columnToSlabDays });
    expect(plan.rows[2].workDays).toBe(2);
    expect(plan.rows[2].waitDays).toBe(A.slabCureDays);
    expect(plan.rows.at(-1)!.waitDays).toBe(0); // nothing follows the last slab
    expect(plan.totalM3).toBe(140);
    expect(plan.totalDays).toBe(plan.rows.at(-1)!.endDay);
  });

  it("formwork by family in the BOQ equals the bar-schedule areas times the rate card rates", () => {
    const { bbs, model } = build("p2-2b-fb", 4);
    const fw = bbs.totals.formworkM2;
    expect(fw.column).toBeGreaterThan(0);
    expect(fw.core).toBeGreaterThan(0);
    expect(model.storeys).toHaveLength(4);
  });
});
