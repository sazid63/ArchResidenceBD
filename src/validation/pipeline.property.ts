/**
 * Phase 2: properties of the whole design pipeline (plan -> structure -> bars -> BOQ) over generated projects.
 * What must hold for every input, whatever the numbers turn out to be.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { computeDesign } from "../design/compute";
import type { BuildingProject } from "../engine/projectState";
import { buildingForProject } from "../model/projectMesh";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { SUPPORTED_MAX_STOREYS } from "../structure/analyze";
import type { SiteClass } from "../rules/bnbcStructure";

const STOCK_BARS = [8, 10, 12, 16, 20, 22, 25, 28, 32];

interface Case { planId: string; storeys: number; extraX: number; extraY: number; siteClass: SiteClass; bearing: number }

function modelFor(c: Case) {
  const plan = PLAN_LIBRARY.find((p) => p.id === c.planId)!;
  const r = fitRange(plan);
  const p = {
    id: "p", name: "P", address: "", stories: c.storeys, plotSize: 0, plotUnit: "sqm", plotSqm: 0, unitsPerFloor: plan.unitsPerFloor,
    createdAt: "", updatedAt: "", phases: [], designStarted: false,
    plot: { frontageM: (r.widthMm.pref + 3600 + c.extraX) / 1000, depthM: (r.depthMm.pref + 5000 + c.extraY) / 1000, roadWidthM: 9, roadSide: "south" },
    planId: plan.id,
  } as BuildingProject;
  const b = buildingForProject(p);
  return b && b.ok ? b.model : null;
}
const design = (c: Case) => {
  const m = modelFor(c);
  return m ? { m, d: computeDesign(m, { siteClass: c.siteClass, allowableBearingKpa: c.bearing }) } : null;
};

const caseArb = (maxStoreys: number) =>
  fc.record({
    planId: fc.constantFrom(...PLAN_LIBRARY.map((p) => p.id)),
    storeys: fc.integer({ min: 1, max: maxStoreys }),
    extraX: fc.integer({ min: 0, max: 2000 }),
    extraY: fc.integer({ min: 0, max: 3000 }),
    siteClass: fc.constantFrom<SiteClass>("SB", "SC", "SD", "SE"),
    bearing: fc.integer({ min: 100, max: 300 }),
  });

/** Every number in a result, with its path; NaN is never allowed, Infinity only where a member cannot be designed. */
function badNumbers(v: unknown, path = "", out: string[] = []): string[] {
  if (typeof v === "number") {
    if (Number.isNaN(v)) out.push(`${path} is NaN`);
  } else if (Array.isArray(v)) v.forEach((x, i) => badNumbers(x, `${path}[${i}]`, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) badNumbers(x, `${path}.${k}`, out);
  return out;
}

const runs = { numRuns: 25 };

describe("pipeline properties", () => {
  it("no NaN anywhere in the structure, bar schedule or BOQ", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const r = design(c);
      if (!r) return;
      expect(badNumbers(r.d)).toEqual([]);
    }), runs);
  });

  it("ok means no failures, supported means within the storey limit, and utilisation agrees with ok", () => {
    fc.assert(fc.property(caseArb(10), (c) => {
      const r = design(c);
      if (!r) return;
      expect(r.d.structure.ok).toBe(r.d.structure.failures.length === 0);
      expect(r.d.structure.supported).toBe(c.storeys <= SUPPORTED_MAX_STOREYS);
      if (r.d.structure.supported && r.d.structure.ok) expect(r.d.structure.util).toBeLessThanOrEqual(1 + 1e-9);
    }), runs);
  });

  it("bar schedule: stock bars only, positive lengths and counts, and the totals add up", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const r = design(c);
      if (!r) return;
      const { rows, totals } = r.d.bbs;
      for (const row of rows) {
        expect(STOCK_BARS).toContain(row.diaMm);
        expect(row.cutLengthMm).toBeGreaterThan(0);
        expect(row.totalBars).toBeGreaterThan(0);
        expect(row.weightKg).toBeGreaterThan(0);
        expect(row.totalBars).toBe(row.barsPerMember * row.members);
      }
      const sum = rows.reduce((a, x) => a + x.weightKg, 0);
      expect(totals.weightKg).toBeCloseTo(sum, 6);
      expect(totals.byDia.reduce((a, x) => a + x.weightKg, 0)).toBeCloseTo(sum, 6);
      expect(totals.byFamily.reduce((a, x) => a + x.weightKg, 0)).toBeCloseTo(sum, 6);
      // steel density: kg/m of a round bar is d^2 / 162 (the usual site rule, within 1 %)
      for (const row of rows) expect(row.weightKg / row.totalLengthM).toBeCloseTo((row.diaMm * row.diaMm) / 162, 1);
    }), runs);
  });

  it("the BOQ total is finite and equals the sum of its priced lines", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const r = design(c);
      if (!r) return;
      const { boq } = r.d;
      expect(Number.isFinite(boq.totalBdt)).toBe(true);
      const sum = boq.lines.reduce((a, l) => a + (l.amountBdt ?? 0), 0);
      expect(boq.totalBdt).toBeCloseTo(sum, 2);
      expect(boq.quantities.concreteM3).toBeGreaterThan(0);
      // BOQ steel is the schedule plus 3 % cutting wastage (BOQ_ASSUMPTIONS, id steel)
      expect(boq.quantities.steelKg).toBeCloseTo(r.d.bbs.totals.weightKg * 1.03, 3);
    }), runs);
  });

  it("load path closes: the footings' bearing area carries the column service loads", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const r = design(c);
      if (!r) return;
      const service = r.d.structure.frame.columns.reduce((a, col) => a + col.storeys[0].deadKn + col.storeys[0].liveKn + col.storeys[0].roofLiveKn, 0);
      const areaM2 = r.d.structure.foundation.footings.reduce((a, f) => a + f.areaM2, 0);
      // allowable pressure is a limit, so area x allowable must cover the service load (the 10 % pad self-weight allowance is on top)
      expect(areaM2 * c.bearing).toBeGreaterThanOrEqual(service * 0.99);
    }), runs);
  });

  it("column steel stays between the 1 % minimum and the 6 % practical maximum, and sections are stock sizes in whole 50 mm", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const r = design(c);
      if (!r) return;
      for (const col of r.d.structure.frame.columns) for (const st of col.storeys) {
        expect(st.rho).toBeGreaterThanOrEqual(0.01 - 1e-9);
        expect(st.rho).toBeLessThanOrEqual(0.06);
        expect(st.section.bx % 50).toBe(0);
        expect(st.section.by % 50).toBe(0);
      }
    }), runs);
  });

  // Up to 7 storeys only: at 8 the system becomes dual (a core shear wall takes the lateral load), so the frame columns can legitimately get smaller.
  it("more storeys (up to 7) never shrink the ground-storey columns, the footings or the concrete", () => {
    fc.assert(fc.property(caseArb(6), (c) => {
      const a = design(c);
      const b = design({ ...c, storeys: c.storeys + 1 });
      if (!a || !b) return;
      const area = (d: NonNullable<typeof a>) => Math.max(...d.d.structure.frame.columns.map((col) => col.storeys[0].section.bx * col.storeys[0].section.by));
      const footing = (d: NonNullable<typeof a>) => d.d.structure.foundation.footings.reduce((s, f) => s + f.areaM2, 0);
      expect(area(b)).toBeGreaterThanOrEqual(area(a));
      expect(footing(b)).toBeGreaterThanOrEqual(footing(a) - 1e-9);
      expect(b.d.bbs.totals.concreteM3).toBeGreaterThan(a.d.bbs.totals.concreteM3);
      expect(b.d.bbs.totals.weightKg).toBeGreaterThan(a.d.bbs.totals.weightKg);
    }), runs);
  });

  it("weaker soil never gives smaller footings", () => {
    fc.assert(fc.property(caseArb(SUPPORTED_MAX_STOREYS), (c) => {
      const strong = design({ ...c, bearing: 300 });
      const weak = design({ ...c, bearing: 100 });
      if (!strong || !weak) return;
      const total = (d: NonNullable<typeof strong>) => d.d.structure.foundation.footings.reduce((s, f) => s + f.areaM2, 0);
      expect(total(weak)).toBeGreaterThanOrEqual(total(strong) - 1e-9);
    }), runs);
  });

  it("the design is a pure function of the model and options (same input, identical output)", () => {
    fc.assert(fc.property(caseArb(5), (c) => {
      const a = design(c);
      const b = design(c);
      if (!a || !b) return;
      expect(JSON.stringify(a.d)).toBe(JSON.stringify(b.d));
    }), { numRuns: 8 });
  });
});
