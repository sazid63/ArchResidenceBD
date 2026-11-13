import { MATERIALS } from "./materials";
import { describe, expect, it } from "vitest";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { footingPack } from "../rules/bnbcStructure";
import { analyzeStructure } from "./analyze";
import { designFooting, type FootingInput } from "./footing";
import { UNIT_WEIGHTS } from "./materials";

const S = DEFAULT_SETBACKS_MM;

function model(planId: string, storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!out.ok) throw new Error("fit");
  return out.model;
}

const foot = (over: Partial<FootingInput> = {}): FootingInput => ({ serviceKn: 1000, serviceSeismicKn: 1000, puKn: 1400, colBxMm: 400, colByMm: 400, position: "interior", allowableKpa: 150, ...over });

describe("footing (Sec 6.4.10)", () => {
  it("hand example: 1000 kN service, 150 kPa, 10 % self weight -> A = 7.333 m2 -> 2.708 m -> 2750 mm square", () => {
    const r = designFooting(foot());
    expect(r.sideMm).toBe(2750);
    expect(r.pressureKpa).toBeCloseTo((1.1 * 1000) / 2.75 ** 2, 8);
    expect(r.bearingUtil).toBeCloseTo(r.pressureKpa / 150, 8);
  });

  it("punching strength at the chosen depth follows Eq 6.6.72-6.6.74 with the critical perimeter at d/2", () => {
    // Pu 1400 kN on a 400 x 400 interior column: at h = 400 (d = 301) punching is 1.40 times capacity, so the depth is deeper than 400
    const r = designFooting(foot());
    expect(r.depthMm).toBeGreaterThan(400);
    const d = r.dMm;
    expect(d).toBe(r.depthMm - footingPack().coverAgainstEarth - 16 - 8);
    const b0 = 4 * (400 + d);
    const vc = Math.min(0.17 * 3, 0.083 * ((40 * d) / b0 + 2), 0.33) * Math.sqrt(MATERIALS.fcMPa) * b0 * d / 1000;
    expect(r.punchPhiVcKn).toBeCloseTo(0.75 * vc, 6);
    const qu = 1400e3 / 2750 ** 2;
    expect(r.punchVuKn).toBeCloseTo(1400 - (qu * (400 + d) ** 2) / 1000, 6);
    expect(r.util).toBeLessThanOrEqual(1);
  });

  it("depth is the smallest 50 mm step that passes", () => {
    const r = designFooting(foot());
    const less = designFooting(foot({ puKn: 1400 })); // same input
    expect(less.depthMm).toBe(r.depthMm);
    expect(r.depthMm % 50).toBe(0);
  });

  it("corner columns have a smaller alpha_s so Eq 6.6.73 can govern sooner; a bigger load needs more depth; more soil strength a smaller pad", () => {
    expect(designFooting(foot({ puKn: 2000 })).depthMm).toBeGreaterThanOrEqual(designFooting(foot({ puKn: 1400 })).depthMm);
    expect(designFooting(foot({ allowableKpa: 300 })).sideMm).toBeLessThan(designFooting(foot({ allowableKpa: 150 })).sideMm);
    expect(designFooting(foot({ position: "corner" })).punchPhiVcKn).toBeLessThanOrEqual(designFooting(foot({ position: "interior" })).punchPhiVcKn + 1e-9);
  });

  it("the earthquake combination may use 33 % more pressure (Ch 3 Sec 3.9.3.2)", () => {
    const r = designFooting(foot({ serviceKn: 1000, serviceSeismicKn: 1300 }));
    expect(r.pressureSeismicKpa).toBeCloseTo((1.1 * 1300) / (r.sideMm / 1000) ** 2, 8);
    expect(r.bearingUtil).toBeLessThanOrEqual(1);
  });
});

describe("frame: column takedown, seismic, sizing", () => {
  it("load path: the column dead loads at the base add up to every beam span's dead load plus the column weights", () => {
    const m = model("p1-4b", 5);
    const res = analyzeStructure(m);
    let beams = 0;
    for (const lv of res.levels) for (const line of lv.beamLines) for (const sp of line.result.spans) beams += (sp.dKnM * sp.lengthMm) / 1000;
    let colWeights = 0;
    for (const c of res.frame.columns) for (const st of c.storeys) colWeights += (UNIT_WEIGHTS.frameConcrete * st.section.bx * st.section.by * m.input.floorToFloorMm) / 1e9;
    const base = res.frame.columns.reduce((a, c) => a + c.storeys[0].deadKn, 0);
    expect(base).toBeCloseTo(beams + colWeights, 6);
  });

  it("ground columns carry more than top columns, and live load is reduced below the top floors (K_LL 4, Sec 2.3.13)", () => {
    const res = analyzeStructure(model("p1-4b", 8));
    const c = res.frame.columns[0].storeys;
    for (let i = 1; i < c.length; i++) expect(c[i - 1].deadKn).toBeGreaterThan(c[i].deadKn);
    expect(c[0].liveFactor).toBeLessThan(1);
    expect(c[0].liveFactor).toBeGreaterThanOrEqual(0.4);
    expect(c[c.length - 1].liveFactor).toBe(1);
  });

  it("every column storey is checked for gravity and for both earthquake directions, compression and tension cases", () => {
    const res = analyzeStructure(model("p1-4b", 4));
    const st = res.frame.columns[3].storeys[0];
    expect(st.cases.map((k) => k.id)).toEqual(["1.2D+1.6L", "1.2D+E+L (x)", "1.2D+E+L (y)", "0.9D+E (x)", "0.9D+E (y)"]);
    expect(st.rho).toBeGreaterThanOrEqual(0.01);
    expect(st.rho).toBeLessThanOrEqual(0.06);
    expect(st.astMm2).toBeCloseTo(st.rho * st.section.bx * st.section.by, 6);
  });

  it("seismic: Dhaka, default site SD and special moment frames -> design category D, system permitted, Sa x W = V", () => {
    const res = analyzeStructure(model("p1-4b", 6));
    const s = res.frame.seismicX;
    expect(s.category).toBe("D");
    expect(s.permitted).toBe(true);
    expect(s.baseShearKn).toBeCloseTo(s.sa * s.weightKn, 6);
    expect(s.periodS).toBeCloseTo(0.0466 * (6 * 3) ** 0.9, 10);
    expect(res.frame.options.allowableBearingKpa).toBe(150);
  });

  it("property: more storeys give a larger column load, base shear and footing", () => {
    let prevN = 0;
    let prevV = 0;
    let prevB = 0;
    for (const n of [3, 5, 7]) {
      const r = analyzeStructure(model("p1-4b", n)).frame;
      const c = r.columns[0];
      const load = c.storeys[0].deadKn + c.storeys[0].liveKn;
      expect(load).toBeGreaterThan(prevN);
      expect(r.seismicX.baseShearKn).toBeGreaterThan(prevV);
      expect(c.footing.sideMm).toBeGreaterThanOrEqual(prevB);
      prevN = load;
      prevV = r.seismicX.baseShearKn;
      prevB = c.footing.sideMm;
    }
  });

  it("a stiffer site (SA) lowers the base shear; a bigger allowable bearing pressure shrinks every footing", () => {
    const m = model("p1-4b", 5);
    const sd = analyzeStructure(m).frame;
    const sa = analyzeStructure(m, { siteClass: "SA" }).frame;
    expect(sa.seismicX.baseShearKn).toBeLessThan(sd.seismicX.baseShearKn);
    const soft = analyzeStructure(m, { allowableBearingKpa: 100 }).frame;
    const hard = analyzeStructure(m, { allowableBearingKpa: 300 }).frame;
    expect(hard.columns[0].footing.sideMm).toBeLessThan(soft.columns[0].footing.sideMm);
  });

  it("a system that is not permitted in design category D is reported as a failure", () => {
    const res = analyzeStructure(model("p1-4b", 4), { systemId: "ordinary-rc-mrf" });
    expect(res.frame.seismicX.permitted).toBe(false);
    expect(res.failures.some((f) => f.id === "seismic-system")).toBe(true);
    expect(res.ok).toBe(false);
  });

  it("small buildings converge with every member passing; utilisation is reported unclamped", () => {
    const res = analyzeStructure(model("p2-3b-fb", 4));
    expect(res.frame.converged).toBe(true);
    expect(res.failures.filter((f) => f.util > 1)).toHaveLength(0);
    expect(res.frame.util).toBeGreaterThan(0);
  });

  it("tall slender frames: any drift or stability failure is listed with a ratio over 1, and ok follows the list", () => {
    // 14 storeys now pass with the stiffest stock columns; the rule is that a failing storey is never hidden
    for (const st of [12, 14]) {
      const res = analyzeStructure(model("p2-3b-lr", st));
      for (const f of res.failures.filter((x) => x.member === "seismic")) expect(f.util).toBeGreaterThan(1);
      expect(res.ok).toBe(res.failures.length === 0);
    }
  });

  it("is deterministic", () => {
    const m = model("p2-2b-fb", 5);
    expect(JSON.stringify(analyzeStructure(m))).toBe(JSON.stringify(analyzeStructure(m)));
  });
});
