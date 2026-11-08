import { describe, expect, it } from "vitest";
import { distribute, fitPlan, fitRange } from "./fit";
import { deriveGeometry } from "./geometry";
import { PLAN_LIBRARY, P1_4B } from "./library";
import { validateFitted } from "./validate";

describe("distribute", () => {
  const bays = [
    { min: 3000, pref: 3600, max: 3900 },
    { min: 1200, pref: 1200, max: 1500 },
  ];
  it("uses the preferred sizes at the preferred total", () => {
    expect(distribute(bays, 4800)?.sizes).toEqual([3600, 1200]);
  });
  it("adds up exactly and stays inside every range", () => {
    for (let target = 4200; target <= 5400; target += 37) {
      const r = distribute(bays, target)!;
      expect(r.total).toBe(Math.round(target / 10) * 10);
      r.sizes.forEach((s, i) => {
        expect(s).toBeGreaterThanOrEqual(bays[i].min);
        expect(s).toBeLessThanOrEqual(bays[i].max);
        expect(s % 10).toBe(0);
      });
    }
  });
  it("stops at the maximum and refuses below the minimum", () => {
    expect(distribute(bays, 9000)?.total).toBe(5400);
    expect(distribute(bays, 4199)).toBeNull();
  });
});

describe("fitPlan", () => {
  it("rejects a plot that is too small, saying what it needs", () => {
    const r = fitPlan(P1_4B, { widthMm: 9000, depthMm: 15000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.map((x) => x.code).sort()).toEqual(["too_narrow", "too_shallow"]);
      expect(r.reasons[0].requiredMm).toBe(fitRange(P1_4B).widthMm.min);
      expect(r.reasons[0].message.en).toMatch(/Needs at least 10\.03 m/);
    }
  });

  it("changes the building when the plot changes (no fixed preset)", () => {
    const a = fitPlan(P1_4B, { widthMm: 10200, depthMm: 16000 });
    const b = fitPlan(P1_4B, { widthMm: 12000, depthMm: 18000 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.fitted.widthMm).toBe(10200);
      expect(b.fitted.widthMm).toBe(12000);
      expect(a.fitted.xLines).not.toEqual(b.fitted.xLines);
    }
  });

  it("mirrors left-right without changing sizes", () => {
    const env = { widthMm: 11000, depthMm: 17000 };
    const a = fitPlan(P1_4B, env);
    const b = fitPlan(P1_4B, env, { mirror: true });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      const bed = (f: typeof a.fitted) => f.rooms.find((r) => r.def.id === "a-bed1")!.rects[0];
      expect(bed(a.fitted).x0).toBe(0);
      expect(bed(b.fitted).x1).toBe(b.fitted.widthMm);
      expect(bed(b.fitted).x1 - bed(b.fitted).x0).toBe(bed(a.fitted).x1 - bed(a.fitted).x0);
    }
  });
});

describe("plan library", () => {
  for (const plan of PLAN_LIBRARY) {
    const range = fitRange(plan);
    const widths = [range.widthMm.min, Math.round((range.widthMm.min + range.widthMm.max) / 2 / 10) * 10, range.widthMm.max];
    const depths = [range.depthMm.min, Math.round((range.depthMm.min + range.depthMm.max) / 2 / 10) * 10, range.depthMm.max];
    for (const mirror of [false, true])
      for (const w of widths)
        for (const d of depths)
          it(`${plan.id} passes the validator at ${w} × ${d} mm${mirror ? " (mirrored)" : ""}`, () => {
            const r = fitPlan(plan, { widthMm: w, depthMm: d }, { mirror });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            const { issues } = validateFitted(r.fitted);
            expect(issues.filter((i) => i.severity === "error").map((i) => i.message)).toEqual([]);
          });

    it(`${plan.id} puts a column at every structural crossing and every beam within limits`, () => {
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit failed");
      const geo = deriveGeometry(r.fitted);
      expect(geo.columns.length).toBe(plan.structuralX.length * plan.structuralY.length);
      expect(Math.max(...geo.beams.map((b) => b.spanMm))).toBeLessThanOrEqual(6000);
    });
  }
});
