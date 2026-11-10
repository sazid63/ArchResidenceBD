import { describe, expect, it } from "vitest";
import { buildBbs } from "../structure/bbs";
import { analyzeStructure } from "../structure/analyze";
import { deriveBuilding } from "../model/building";
import { buildMesh } from "../model/toMesh";
import { buildBoq, envelopeQuantities } from "../quantities/takeoff";
import { baseIdOf, frontUnit, isVerandahId, withFrontVerandah } from "./balcony";
import { fitPlan, fitRange } from "./fit";
import { deriveGeometry } from "./geometry";
import { PLAN_LIBRARY, getPlan, verandahVariants } from "./library";
import { RAILING } from "./rules";
import { validateFitted } from "./validate";

describe("front verandah (B2: balcony cantilevered off the old front beam line)", () => {
  const variants = verandahVariants();

  it("is offered for every plan whose front row belongs to one flat", () => {
    expect(variants.map((v) => baseIdOf(v.id)).sort()).toEqual(["p1-3b", "p1-4b", "p1-4b-wide", "p2-2b-fb", "p2-3b-fb", "pn-2b", "pn-2f", "pn-3b"]);
    // Plans with a core or two flats on the front are not offered one yet (they need the cantilever balcony, phase 2).
    for (const id of ["p2-2b-lr", "p2-3b-lr", "p3-2b", "p4-2b", "p4-1b", "pn-2b-f"]) expect(frontUnit(getPlan(id)!), id).toBeNull();
    expect(withFrontVerandah(getPlan("p4-2b")!)).toBeNull();
  });

  it("resolves by id and keeps the base plan untouched", () => {
    const v = getPlan("pn-2b+v")!;
    expect(isVerandahId(v.id)).toBe(true);
    expect(getPlan("pn-2b+v")).toBe(v);
    expect(getPlan("nope+v")).toBeUndefined();
    expect(getPlan("p4-2b+v")).toBeUndefined();
    expect(getPlan("pn-2b")!.baysY).toHaveLength(6);
    expect(v.baysY).toHaveLength(7);
  });

  for (const plan of variants) {
    const range = fitRange(plan);
    const widths = [range.widthMm.min, Math.round((range.widthMm.min + range.widthMm.max) / 20) * 10, range.widthMm.max];
    const depths = [range.depthMm.min, Math.round((range.depthMm.min + range.depthMm.max) / 20) * 10, range.depthMm.max];
    for (const mirror of [false, true])
      for (const w of widths)
        for (const d of depths)
          it(`${plan.id} passes the validator at ${w} x ${d} mm${mirror ? " (mirrored)" : ""}`, () => {
            const r = fitPlan(plan, { widthMm: w, depthMm: d }, { mirror });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(validateFitted(r.fitted).issues.filter((i) => i.severity === "error").map((i) => i.message)).toEqual([]);
          });

    it(`${plan.id}: the balcony is open to the outside, reached by a door from the living room, and has railings, not walls`, () => {
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit");
      const geo = deriveGeometry(r.fitted);
      const bi = r.fitted.rooms.findIndex((x) => x.def.kind === "balcony");
      expect(bi).toBeGreaterThanOrEqual(0);
      const edges = geo.walls.filter((w) => w.a === bi || w.b === bi);
      const rails = edges.filter((w) => w.exterior);
      expect(rails.length).toBeGreaterThan(0);
      expect(rails.every((w) => w.railing && w.thicknessMm === RAILING.thicknessMm)).toBe(true);
      expect(edges.filter((w) => !w.exterior).every((w) => !w.railing)).toBe(true);
      const living = r.fitted.rooms.findIndex((x) => x.def.kind === "living");
      expect(geo.doors.some((d) => [d.a, d.b].includes(bi) && [d.a, d.b].includes(living))).toBe(true);
      expect(geo.metrics[bi].netAreaM2).toBeGreaterThanOrEqual(3);
      expect(geo.metrics[bi].netWidthMm).toBeGreaterThanOrEqual(1000);
    });
  }

  it("flows through structure, BOQ and 3D: railing in metres, no masonry on the balcony edge, designed slab, clean mesh", () => {
    const common = { plotWidthMm: 10000, plotDepthMm: 22000, storeys: 4 };
    const base = deriveBuilding({ ...common, planId: "pn-2b" });
    const withV = deriveBuilding({ ...common, planId: "pn-2b+v" });
    if (!base.ok || !withV.ok) throw new Error("fit");
    expect(withV.model.depthMm - base.model.depthMm).toBeGreaterThanOrEqual(1250);
    const envBase = envelopeQuantities(base.model);
    const envV = envelopeQuantities(withV.model);
    // 4 floors x (2 side edges + 1 front edge); the typical floors carry it, the ground floor is parking.
    expect(envV.railingM).toBeGreaterThan(10);
    expect(envBase.railingM).toBe(0);

    const res = analyzeStructure(withV.model);
    expect(res.ok).toBe(true);
    const bbs = buildBbs(res, withV.model);
    const boq = buildBoq(withV.model, bbs);
    expect(boq.lines.find((l) => l.id === "balcony-railing")!.quantity).toBeCloseTo(envV.railingM, 6);
    expect(boq.lines.every((l) => Number.isFinite(l.quantity) && l.quantity >= 0)).toBe(true);

    const doc = buildMesh(withV.model, res);
    const rails = doc.objects.filter((o) => o.label === "Balcony Railing");
    expect(rails.length).toBeGreaterThan(0);
    for (const o of rails) expect(o.bboxMaxMm[2] - o.bboxMinMm[2]).toBe(RAILING.heightMm);
  });

  it("the balcony is a designed cantilever with no columns at its tip, and the edge beam carries its reaction", () => {
    const r = deriveBuilding({ plotWidthMm: 10000, plotDepthMm: 22000, storeys: 4, planId: "pn-2b+v" });
    const base = deriveBuilding({ plotWidthMm: 10000, plotDepthMm: 22000, storeys: 4, planId: "pn-2b" });
    if (!r.ok || !base.ok) throw new Error("fit");
    const res = analyzeStructure(r.model);
    const resBase = analyzeStructure(base.model);
    expect(res.ok).toBe(true);
    expect(res.levels.every((l) => l.cantilevers.length === 1)).toBe(true);
    for (const l of res.levels) {
      const c = l.cantilevers[0].result;
      expect(c.util).toBeLessThanOrEqual(1);
      expect(c.thicknessMm).toBeGreaterThanOrEqual(c.minThicknessMm);
      expect(l.slabThicknessMm).toBeGreaterThanOrEqual(c.thicknessMm);
    }
    // No column on the front edge: the column grid is the same size as the plan without the verandah.
    expect(res.frame.columns.length).toBe(resBase.frame.columns.length);
    const yFront = r.model.storeys[1].geometry.fitted.yLines[1];
    expect(Math.min(...res.frame.columns.map((q) => q.yMm))).toBe(yFront);
    expect(res.frame.columns.every((q) => Number.isFinite(q.footing.sideMm) && q.footing.sideMm > 0)).toBe(true);
    // The front beam line carries more than the same line of the plan without a verandah.
    const front = (rr: typeof res, at: number) => rr.levels[0].beamLines.find((b) => b.orientation === "h" && Math.abs(b.at - at) < 2)!.result;
    expect(front(res, yFront).spans[0].mPosKnM).toBeGreaterThan(front(resBase, resBase.levels[0].beamLines.find((b) => b.orientation === "h")!.at).spans[0].mPosKnM);
  });

  it("the cantilever steel, concrete and formwork are in the bar schedule", () => {
    const r = deriveBuilding({ plotWidthMm: 10000, plotDepthMm: 22000, storeys: 3, planId: "pn-2b+v" });
    const base = deriveBuilding({ plotWidthMm: 10000, plotDepthMm: 22000, storeys: 3, planId: "pn-2b" });
    if (!r.ok || !base.ok) throw new Error("fit");
    const res = analyzeStructure(r.model);
    const bbs = buildBbs(res, r.model);
    const bbsBase = buildBbs(analyzeStructure(base.model), base.model);
    for (const prefix of ["Balcony cantilever, top bars", "Balcony cantilever, distribution"]) {
      const rows = bbs.rows.filter((x) => x.description.en.startsWith(prefix));
      expect(rows.length, prefix).toBeGreaterThan(0);
      expect([...new Set(rows.flatMap((x) => x.levels))].sort(), prefix).toEqual([0, 1, 2]); // the slab over the ground floor, the first floor and the roof
    }
    const strip = res.levels[0].cantilevers[0];
    const stripM3 = ((strip.x1 - strip.x0) * (strip.y1 - strip.y0) * strip.result.thicknessMm) / 1e9;
    expect(bbs.totals.concreteM3 - bbsBase.totals.concreteM3).toBeGreaterThan(3 * stripM3 * 0.9);
    expect(bbs.totals.formworkM2.slab).toBeGreaterThan(bbsBase.totals.formworkM2.slab);
    expect(bbs.totals.kgPerM3).toBeGreaterThan(60);
    expect(bbs.totals.kgPerM3).toBeLessThan(140);
  });

  it("every library plan keeps its count: 14 plans, 8 variants", () => {
    expect(PLAN_LIBRARY).toHaveLength(14);
    expect(variants).toHaveLength(8);
  });
});
