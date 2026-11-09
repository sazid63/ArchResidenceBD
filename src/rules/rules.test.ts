import { describe, expect, it } from "vitest";
import { PLAN_LIBRARY } from "../plans/library";
import { fitRange } from "../plans/fit";
import { deriveBuilding } from "../model/building";
import { check, roadStep } from "./check";
import { inBand, runVector } from "./engine";
import { rajukPack } from "./pack";
import { rajukSetbacks } from "./setbacks";

const pack = rajukPack();

describe("RAJUK pack test vectors", () => {
  it("loads the pack with vectors", () => {
    expect(pack.id).toBe("rajuk@2008.1");
    expect(pack.testVectors.length).toBeGreaterThan(40);
  });

  for (const v of pack.testVectors) {
    it(v.id, () => {
      const got = runVector(pack, v);
      expect(got, "a row applies").not.toBeNull();
      const out = got as Record<string, unknown>;
      for (const [k, want] of Object.entries(v.expect)) {
        if (k === "footnotes") expect(out.footnotes).toEqual(want);
        else expect(out[k]).toEqual(want);
      }
    });
  }
});

describe("inBand", () => {
  it("is (from, to] with open ends", () => {
    expect(inBand(134, { areaSqmTo: 134 })).toBe(true);
    expect(inBand(134, { areaSqmFrom: 134, areaSqmTo: 201 })).toBe(false);
    expect(inBand(5000, { areaSqmFrom: 1340 })).toBe(true);
  });
});

describe("rajukSetbacks", () => {
  it("gives integer mm per the schedule", () => {
    expect(rajukSetbacks(100, 4).setbacksMm).toEqual({ front: 1500, rear: 1000, left: 800, right: 800 });
    expect(rajukSetbacks(300, 4).setbacksMm).toEqual({ front: 1500, rear: 2000, left: 1250, right: 1250 });
  });
  it("switches to the tall-building values above 10 storeys or 33 m", () => {
    expect(rajukSetbacks(300, 11).setbacksMm).toEqual({ front: 1500, rear: 3000, left: 3000, right: 3000 });
    expect(rajukSetbacks(300, 10, 3500).row.beyond).toBe(true); // 35 m
  });
});

describe("deriveBuilding uses RAJUK setbacks by default", () => {
  const plan = PLAN_LIBRARY[0];
  const r = fitRange(plan);
  const w = r.widthMm.pref + 3000;
  const d = r.depthMm.pref + 4000;
  it("applies the schedule for the plot area", () => {
    const res = deriveBuilding({ plotWidthMm: w, plotDepthMm: d, storeys: 4, planId: plan.id });
    const want = rajukSetbacks((w * d) / 1e6, 4).setbacksMm;
    if (res.ok) expect(res.model.input.setbacksMm).toEqual(want);
    else expect(res.reasons.length).toBeGreaterThan(0);
  });
});

describe("check()", () => {
  const plan = PLAN_LIBRARY[0];
  const r = fitRange(plan);
  const res = deriveBuilding({ plotWidthMm: r.widthMm.pref + 3600, plotDepthMm: r.depthMm.pref + 5000, storeys: 4, planId: plan.id });
  if (!res.ok) throw new Error("fixture plan does not fit");
  const model = res.model;

  it("maps road widths to printed steps", () => {
    expect(roadStep(5.9)).toBeNull();
    expect(roadStep(6)).toBe(6);
    expect(roadStep(11.9)).toBe(9);
    expect(roadStep(30)).toBe(24);
  });

  it("passes setbacks for a building placed inside the RAJUK envelope", () => {
    const out = check(model, { roadWidthM: 9 }).filter((x) => x.ruleId.startsWith("rajuk.setback"));
    expect(out).toHaveLength(3);
    for (const x of out) expect(x.status).toBe("pass");
  });

  it("fails a setback when the building is moved too close", () => {
    const moved = { ...model, origin: { ...model.origin, y: 500 } };
    const front = check(moved, { roadWidthM: 9 }).find((x) => x.ruleId === "rajuk.setback.front")!;
    expect(front.status).toBe("fail");
    expect(front.actual).toEqual({ value: 500, unit: "mm" });
  });

  it("does not check FAR or coverage without a road width", () => {
    const out = check(model);
    expect(out.find((x) => x.ruleId === "rajuk.far")!.status).toBe("not_checked");
    expect(out.find((x) => x.ruleId === "rajuk.mgc")!.status).toBe("not_checked");
  });

  it("does not check FAR on roads under 6 m", () => {
    expect(check(model, { roadWidthM: 4 }).find((x) => x.ruleId === "rajuk.far")!.status).toBe("not_checked");
  });

  it("every result carries a gazette source", () => {
    for (const x of check(model, { roadWidthM: 9 })) {
      expect(x.source.gazettePage, x.ruleId).not.toBe("");
      expect(x.source.pack).toBe("rajuk@2008.1");
    }
  });

  it("reports FAR and coverage against the table row", () => {
    const far = check(model, { roadWidthM: 9 }).find((x) => x.ruleId === "rajuk.far")!;
    expect(["pass", "fail"]).toContain(far.status);
    expect(typeof (far.actual as { value: number }).value).toBe("number");
    const mgc = check(model, { roadWidthM: 9 }).find((x) => x.ruleId === "rajuk.mgc")!;
    expect(mgc.actual!.unit).toBe("%");
  });

  it("works out parking required but leaves supply unchecked", () => {
    const p = check(model, { roadWidthM: 9 }).find((x) => x.ruleId === "rajuk.parking")!;
    expect(p.status).toBe("not_checked");
    expect(p.expected!.value).toBeGreaterThanOrEqual(1);
  });
});

describe("plan picker and building model agree on setbacks", () => {
  it("envelopeFor matches the model envelope at a band edge and for tall buildings", async () => {
    const { envelopeFor } = await import("../model/planChoices");
    for (const [wM, dM, storeys] of [[10, 13.4, 4], [10, 13.4, 11], [12, 25, 6], [8.2, 16.3, 12]] as const) {
      const plan = PLAN_LIBRARY[0];
      const res = deriveBuilding({ plotWidthMm: Math.round(wM * 1000), plotDepthMm: Math.round(dM * 1000), storeys, planId: plan.id });
      const env = envelopeFor(wM, dM, undefined, storeys);
      const sb = rajukSetbacks(wM * dM, storeys).setbacksMm;
      expect(env.widthMm).toBe(Math.round(wM * 1000) - sb.left - sb.right);
      expect(env.depthMm).toBe(Math.round(dM * 1000) - sb.front - sb.rear);
      if (res.ok) expect(res.model.envelope.x1 - res.model.envelope.x0).toBe(env.widthMm);
    }
  });
});
