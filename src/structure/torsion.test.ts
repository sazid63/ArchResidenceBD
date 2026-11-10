import { describe, expect, it } from "vitest";
import { RAILING } from "../plans/rules";
import { liveLoadForKind } from "./loads";
import { edgeBeamTorsion } from "./torsion";

describe("edge-beam torsion under a cantilever (ACI 318-08 11.5 method, assumption)", () => {
  it("250 x 450 beam, fc' 20: cracking torque 10.0 kN.m, threshold 2.5 kN.m (hand check)", () => {
    // Acp = 112500 mm2, pcp = 1400 mm: phi 0.33 sqrt(20) Acp^2/pcp = 0.75 x 0.33 x 4.472 x 9.040e6 N.mm
    const r = edgeBeamTorsion({ muKnMPerM: 17.5, stripWidthMm: 3300, vuKn: 60, bMm: 250, hMm: 450 });
    expect(r.crackingKnM).toBeCloseTo(10.0, 1);
    expect(r.thresholdKnM).toBeCloseTo(2.52, 1);
    expect(r.equilibriumKnM).toBeCloseTo(28.875, 3); // 17.5 x 3.3 / 2
    expect(r.tuKnM).toBeCloseTo(r.crackingKnM, 6); // capped: the back slab takes the rest
    expect(r.backSlabMomentKnMPerM).toBeCloseTo(17.5 - (2 * r.tuKnM) / 3.3, 6);
    expect(r.needsDesign).toBe(true);
    expect(r.atPerMm).toBeGreaterThan(0);
  });
  it("a short span stays below the threshold: no torsion steel, nothing left for the back slab", () => {
    const r = edgeBeamTorsion({ muKnMPerM: 2, stripWidthMm: 1000, vuKn: 20, bMm: 300, hMm: 600 });
    expect(r.needsDesign).toBe(false);
    expect(r.atPerMm).toBe(0);
    expect(r.backSlabMomentKnMPerM).toBe(0);
  });
});

describe("balcony loads", () => {
  it("balcony live load is the Table 6.2.3 balcony row, 4.8 kN/m2 (multifamily)", () => {
    expect(liveLoadForKind("balcony")).toBe(4.8);
  });
  it("railing height sits between the BNBC handrail minimum 0.9 m and the RAJUK balcony limit 1.2 m", () => {
    expect(RAILING.heightMm).toBeGreaterThanOrEqual(900);
    expect(RAILING.heightMm).toBeLessThanOrEqual(RAILING.maxHeightRajukMm);
  });
});

describe("torsion steel in the bar schedule", () => {
  it("a balcony edge beam gets closed stirrups at no more than ph/8 and torsion side bars; a plan without balcony gets none", async () => {
    const { deriveBuilding } = await import("../model/building");
    const { analyzeStructure } = await import("./analyze");
    const { buildBbs } = await import("./bbs");
    const mk = (planId: string) => {
      const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys: 4, planId });
      if (!b.ok) throw new Error("fit");
      return buildBbs(analyzeStructure(b.model), b.model);
    };
    const withB = mk("p4-2b+v");
    const without = mk("p4-2b");
    const torsionRows = (s: ReturnType<typeof mk>) => s.rows.filter((r) => /torsion bars/.test(r.description.en));
    expect(torsionRows(withB).length).toBeGreaterThan(0);
    expect(torsionRows(without).length).toBe(0);
    const row = torsionRows(withB)[0];
    expect(row.barsPerMember).toBeGreaterThanOrEqual(4);
    expect(withB.rows.some((r) => /stirrups at (50|75|100|125|150) mm/.test(r.description.en))).toBe(true);
  });
});
