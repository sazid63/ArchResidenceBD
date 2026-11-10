import { describe, expect, it } from "vitest";
import { groundBuiltAreaMm2 } from "../rules/check";
import { buildBbs } from "../structure/bbs";
import { analyzeStructure } from "../structure/analyze";
import { deriveBuilding } from "../model/building";
import { buildMesh } from "../model/toMesh";
import { slabOpeningRects } from "../model/openings";
import { buildBoq, envelopeQuantities } from "../quantities/takeoff";
import { baseIdOf, frontUnit, isVerandahId, withFrontVerandah } from "./balcony";
import { fitPlan, fitRange } from "./fit";
import { deriveGeometry } from "./geometry";
import { PLAN_LIBRARY, getPlan, verandahVariants } from "./library";
import { RAILING } from "./rules";
import { validateFitted } from "./validate";

describe("front verandah (B2: balcony cantilevered off the old front beam line)", () => {
  const variants = verandahVariants();

  it("is offered for every plan in the library", () => {
    expect(variants.map((v) => baseIdOf(v.id)).sort()).toEqual(PLAN_LIBRARY.map((p) => p.id).sort());
    expect(withFrontVerandah(getPlan("p4-2b")!)).not.toBeNull();
  });

  it("a plan with one flat on the front gets one full-width verandah; plans with a core or several flats get a balcony per flat and a notch in front of the core", () => {
    const rooms = (id: string) => getPlan(id + "+v")!.rooms.filter((r) => r.kind === "balcony");
    expect(frontUnit(getPlan("pn-2b")!)).toBe("A");
    expect(rooms("pn-2b")).toHaveLength(1);
    expect(getPlan("pn-2b+v")!.voids ?? []).toHaveLength(0);
    for (const id of ["p2-2b-lr", "p2-3b-lr", "p3-2b", "p4-2b", "p4-1b"]) {
      expect(frontUnit(getPlan(id)!), id).toBeNull();
      expect(rooms(id).length, id).toBeGreaterThanOrEqual(2);
      expect(getPlan(id + "+v")!.voids, id).toHaveLength(1); // the stretch in front of the stair
    }
    // pn-2b-f has the stair and lobby on the front: one balcony beside them, off the master bedroom, and a notch.
    expect(rooms("pn-2b-f")).toHaveLength(1);
    expect(getPlan("pn-2b-f+v")!.voids).toHaveLength(1);
    expect(getPlan("p4-2b+v")!.rooms.filter((r) => r.kind === "balcony").map((r) => r.unit).sort()).toEqual(["A", "B"]);
  });

  it("resolves by id and keeps the base plan untouched", () => {
    const v = getPlan("pn-2b+v")!;
    expect(isVerandahId(v.id)).toBe(true);
    expect(getPlan("pn-2b+v")).toBe(v);
    expect(getPlan("nope+v")).toBeUndefined();
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

    it(`${plan.id}: every balcony is open to the outside, reached by a door from a room of its flat, and has railings, not walls`, () => {
      const r = fitPlan(plan, { widthMm: range.widthMm.pref, depthMm: range.depthMm.pref });
      if (!r.ok) throw new Error("fit");
      const geo = deriveGeometry(r.fitted);
      const balconies = r.fitted.rooms.map((x, i) => ({ x, i })).filter((q) => q.x.def.kind === "balcony");
      expect(balconies.length).toBeGreaterThan(0);
      for (const { x, i: bi } of balconies) {
        const edges = geo.walls.filter((w) => w.a === bi || w.b === bi);
        const rails = edges.filter((w) => w.exterior);
        expect(rails.length).toBeGreaterThan(0);
        expect(rails.every((w) => w.railing && w.thicknessMm === RAILING.thicknessMm)).toBe(true);
        expect(edges.filter((w) => !w.exterior).every((w) => !w.railing)).toBe(true);
        const door = geo.doors.find((d) => [d.a, d.b].includes(bi));
        expect(door, x.def.id).toBeDefined();
        const other = r.fitted.rooms[door!.a === bi ? door!.b : door!.a];
        expect(other.def.unit).toBe(x.def.unit);
        expect(["living", "dining", "bedroom"]).toContain(other.def.kind);
        expect(geo.metrics[bi].netAreaM2).toBeGreaterThanOrEqual(3);
        expect(geo.metrics[bi].netWidthMm).toBeGreaterThanOrEqual(1000);
      }
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

  for (const plan of variants) {
    it(`${plan.id}: designs, prices and builds in 3D with no column on the front edge and a slab hole at each notch`, () => {
      const range = fitRange(plan);
      const S = { front: 1500, rear: 2000, left: 1000, right: 1000 };
      const built = deriveBuilding({ planId: plan.id, storeys: 4, setbacksMm: S, plotWidthMm: range.widthMm.pref + 2000, plotDepthMm: range.depthMm.pref + 3500 });
      if (!built.ok) throw new Error(built.reasons.map((x) => x.message.en).join("; "));
      const m = built.model;
      const res = analyzeStructure(m);
      const nBalcony = plan.rooms.filter((r) => r.kind === "balcony").length;
      for (const l of res.levels) {
        expect(l.cantilevers, plan.id).toHaveLength(nBalcony);
        for (const c of l.cantilevers) expect(c.result.util).toBeLessThanOrEqual(1);
      }
      expect(res.failures.filter((f) => f.governs.startsWith("cantilever"))).toEqual([]);
      const yFront = m.storeys[1].geometry.fitted.yLines[1];
      expect(Math.min(...res.frame.columns.map((q) => q.yMm))).toBe(yFront);
      expect(res.frame.columns.every((q) => Number.isFinite(q.footing.sideMm) && Number.isFinite(q.footing.pressureKpa))).toBe(true);
      const bbs = buildBbs(res, m);
      const boq = buildBoq(m, bbs);
      expect(boq.lines.every((l) => Number.isFinite(l.quantity) && l.quantity >= 0)).toBe(true);
      expect(Number.isFinite(bbs.totals.weightKg)).toBe(true);
      expect(bbs.totals.kgPerM3).toBeGreaterThan(55);
      expect(bbs.totals.kgPerM3).toBeLessThan(150);
      const holes = slabOpeningRects(m.storeys[1].geometry, m).filter((o) => o.id.startsWith("notch_"));
      expect(holes).toHaveLength(plan.voids?.length ?? 0);
      const doc = buildMesh(m, res);
      expect(doc.objects.some((o) => o.label === "Balcony Railing")).toBe(true);
    });
  }

  it("every library plan has a variant: 14 plans, 14 variants", () => {
    expect(PLAN_LIBRARY).toHaveLength(14);
    expect(variants).toHaveLength(14);
  });

  it("ground coverage leaves out the unbuilt notch", () => {
    const r = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys: 4, planId: "p4-2b+v" });
    if (!r.ok) throw new Error("fit");
    const notch = (r.model.storeys[0].geometry.fitted.voidRects ?? []).reduce((a, q) => a + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
    expect(notch).toBeGreaterThan(0);
    expect(groundBuiltAreaMm2(r.model)).toBe(r.model.widthMm * r.model.depthMm - notch);
  });
});
