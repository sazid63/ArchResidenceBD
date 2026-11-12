import { describe, expect, it } from "vitest";
import { analyseWind, kzExposureB, velocityPressureKpa, WIND_V_DHAKA_MS } from "./wind";

describe("wind, Sec 2.4 (analytical, Exposure B)", () => {
  it("K_z at 10 m: 2.01 (10000 / 365760)^(2/7) = 0.719", () => {
    expect(kzExposureB(10000)).toBeCloseTo(2.01 * (10000 / 365760) ** (2 / 7), 9);
    expect(kzExposureB(10000)).toBeCloseTo(0.719, 2);
  });

  it("velocity pressure at 10 m for Dhaka: 0.613 x 0.719 x 0.85 x 65.7^2 = 1.62 kPa", () => {
    expect(velocityPressureKpa(10000, WIND_V_DHAKA_MS)).toBeCloseTo(1.62, 1);
  });

  it("base shear is the sum of storey forces; shear grows downwards and the overturning moment is positive", () => {
    const k = [100, 100, 100, 100];
    const w = analyseWind({ storeys: 4, storeyHeightMm: 3000, planXMm: 12000, planYMm: 9000, stiffnessXKnPerMm: k, stiffnessYKnPerMm: k });
    const x = w.x;
    expect(x.baseShearKn).toBeCloseTo(x.forcesKn.reduce((a, b) => a + b, 0), 9);
    for (let i = 0; i + 1 < x.shearKn.length; i++) expect(x.shearKn[i]).toBeGreaterThanOrEqual(x.shearKn[i + 1]);
    expect(x.overturningKnM).toBeGreaterThan(0);
  });

  it("drift is shear over storey stiffness, and the utilisation is against h / 500", () => {
    const w = analyseWind({ storeys: 2, storeyHeightMm: 3000, planXMm: 12000, planYMm: 9000, stiffnessXKnPerMm: [50, 50], stiffnessYKnPerMm: [50, 50] });
    expect(w.x.driftMm[0]).toBeCloseTo(w.x.shearKn[0] / 50, 9);
    expect(w.x.driftUtil[0]).toBeCloseTo(w.x.driftMm[0] / (3000 / 500), 9);
  });
});

import { analyseSeismic } from "./seismic";

describe("lateral design takes the larger of wind and seismic", () => {
  const base = { z: 0.2, siteClass: "SD" as const, group: "I_II" as const, systemId: "special-rc-mrf", storeys: 4, storeyHeightMm: 3000, levelWeightsKn: [3000, 3000, 3000, 2500], storeyStiffnessKnPerMm: [400, 400, 400, 400] };

  it("a wind base shear above the seismic one becomes the design base shear", () => {
    const s0 = analyseSeismic(base);
    const s = analyseSeismic({ ...base, minBaseShearKn: s0.baseShearKn * 1.5 });
    expect(s.windGoverns).toBe(true);
    expect(s.baseShearKn).toBeCloseTo(s0.baseShearKn * 1.5, 6);
    expect(s.seismicBaseShearKn).toBeCloseTo(s0.baseShearKn, 6);
    expect(s.forcesKn.reduce((a, b) => a + b, 0)).toBeCloseTo(s.baseShearKn, 6);
  });

  it("a wind base shear below the seismic one changes nothing", () => {
    const s0 = analyseSeismic(base);
    const s = analyseSeismic({ ...base, minBaseShearKn: s0.baseShearKn * 0.5 });
    expect(s.windGoverns).toBe(false);
    expect(s.baseShearKn).toBe(s0.baseShearKn);
  });
});

describe("accidental torsion (5 % eccentricity, rigid diaphragm)", () => {
  it("every storey and direction reports a drift ratio of at least 1 and an amplification Ax between 1 and 3", async () => {
    const { deriveBuilding } = await import("../model/building");
    const { analyzeStructure } = await import("./analyze");
    const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys: 4, planId: "p2-2b-fb" });
    if (!b.ok) throw new Error("fit");
    const r = analyzeStructure(b.model);
    expect(r.frame.torsion).toHaveLength(4 * 2);
    for (const t of r.frame.torsion) {
      expect(t.ratio).toBeGreaterThanOrEqual(1);
      expect(t.ax).toBeGreaterThanOrEqual(1);
      expect(t.ax).toBeLessThanOrEqual(3);
      expect(t.irregular).toBe(t.ratio > 1.2);
      expect(t.extreme).toBe(t.ratio > 1.4);
    }
  });

  it("a torsionally irregular storey is listed with its ratio", async () => {
    const { deriveBuilding } = await import("../model/building");
    const { analyzeStructure } = await import("./analyze");
    const b = deriveBuilding({ plotWidthMm: 10000, plotDepthMm: 22000, storeys: 4, planId: "pn-2b+v" });
    if (!b.ok) throw new Error("fit");
    const r = analyzeStructure(b.model);
    const tors = r.irregularities.filter((x) => x.kind === "torsion");
    expect(tors.length).toBe(r.frame.torsion.filter((t) => t.irregular).length);
    for (const x of tors) expect(x.ratio).toBeGreaterThan(1.2);
  });
});
