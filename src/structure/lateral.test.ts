import { MATERIALS } from "./materials";
import { describe, expect, it } from "vitest";
import { ecMPa } from "./materials";
import { checkColumn, interaction, lightestSteel, momentCapacityAt, phiFromStrain, rayScale, type ColumnCase } from "./column";
import { analyseSeismic, approxPeriod, dampingEta, designCategory, designSa, distributeForces, distributionExponent, liveWeightFraction, spectrumCs, systemById, systemPermitted } from "./seismic";

describe("seismic: spectrum, period, base shear (Sec 2.5)", () => {
  it("Eq 6.2.35 for site class SD (S 1.35, TB 0.20, TC 0.80, TD 2.0)", () => {
    expect(spectrumCs(0.1, "SD")).toBeCloseTo(1.35 * (1 + 0.5 * 1.5), 10); // rising branch
    expect(spectrumCs(0.5, "SD")).toBeCloseTo(2.5 * 1.35, 10); // plateau
    expect(spectrumCs(1.6, "SD")).toBeCloseTo(2.5 * 1.35 * 0.5, 10); // 1/T branch
    expect(spectrumCs(4, "SD")).toBeCloseTo((2.5 * 1.35 * 0.8 * 2) / 16, 10); // 1/T2 branch
  });

  it("eta = sqrt(10 / (5 + xi)) not below 0.55; 5 % damping gives 1", () => {
    expect(dampingEta(5)).toBeCloseTo(1, 10);
    expect(dampingEta(100)).toBe(0.55);
  });

  it("Table 6.2.18: SA zone 1 is B; SD zone 2 is D; SB zone 2 occupancy IV is D", () => {
    expect(designCategory("SA", "I_II", 1)).toBe("B");
    expect(designCategory("SD", "I_II", 2)).toBe("D");
    expect(designCategory("SB", "IV", 2)).toBe("D");
    expect(designCategory("SC", "III", 3)).toBe("D");
  });

  it("only the special RC moment frame and the dual systems are permitted in category D without a limit", () => {
    expect(systemPermitted(systemById("special-rc-mrf"), "D", 90).ok).toBe(true);
    expect(systemPermitted(systemById("intermediate-rc-mrf"), "D", 10).ok).toBe(false);
    expect(systemPermitted(systemById("ordinary-rc-mrf"), "C", 10).ok).toBe(false);
    expect(systemPermitted(systemById("ordinary-rc-mrf"), "B", 10).ok).toBe(true);
  });

  it("hand example: Dhaka, SD, I 1.0, special RC MRF (R 8, Cd 5.5), 10 storeys x 3 m: T = 0.0466 x 30^0.9, Sa = (2/3)(0.2/8) Cs", () => {
    const t = 0.0466 * 30 ** 0.9; // 0.995 s
    expect(approxPeriod(30, true)).toBeCloseTo(t, 10);
    const r = designSa({ z: 0.2, importance: 1, r: 8, t, siteClass: "SD" });
    expect(r.cs).toBeCloseTo((2.5 * 1.35 * 0.8) / t, 10);
    expect(r.sa).toBeCloseTo((2 / 3) * (0.2 / 8) * r.cs, 10);
    expect(r.governs).toBe("spectrum");
    // lower bound 0.67 x 0.11 x 0.2 x 1 x 1.35
    expect(r.lowerBound).toBeCloseTo(0.67 * 0.11 * 0.2 * 1.35, 10);
  });

  it("the lower bound governs at long periods", () => {
    const r = designSa({ z: 0.2, importance: 1, r: 8, t: 4, siteClass: "SD" });
    expect(r.governs).toBe("lower bound");
  });

  it("seismic weight takes 25 % of live load up to 3 kN/m2 and 50 % above", () => {
    expect(liveWeightFraction(2)).toBe(0.25);
    expect(liveWeightFraction(3)).toBe(0.25);
    expect(liveWeightFraction(4.8)).toBe(0.5);
  });

  it("Eq 6.2.41: k is 1 to 0.5 s, 2 from 2.5 s; forces add up to V and grow with height", () => {
    expect(distributionExponent(0.4)).toBe(1);
    expect(distributionExponent(1.5)).toBe(1.5);
    expect(distributionExponent(3)).toBe(2);
    const f = distributeForces(100, [10, 10, 10], [3, 6, 9], 1);
    expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(f).toEqual([100 * 3 / 18, 100 * 6 / 18, 100 * 9 / 18].map((x) => expect.closeTo(x, 10)));
  });

  const base = { z: 0.2, siteClass: "SD" as const, group: "I_II" as const, systemId: "special-rc-mrf", storeys: 10, storeyHeightMm: 3000 };

  it("hand example storey drift: delta_design = Cd Vx / (Kx I); limit 0.020 h = 60 mm", () => {
    const w = Array(10).fill(5000);
    const k = Array(10).fill(500); // kN/mm
    const r = analyseSeismic({ ...base, levelWeightsKn: w, storeyStiffnessKnPerMm: k });
    expect(r.weightKn).toBe(50000);
    expect(r.baseShearKn).toBeCloseTo(r.sa * 50000, 6);
    const s0 = r.storeys[0];
    expect(s0.shearKn).toBeCloseTo(r.baseShearKn, 6);
    expect(s0.designDriftMm).toBeCloseTo((5.5 * s0.shearKn) / 500, 8);
    expect(s0.limitMm).toBe(60);
    expect(s0.util).toBeCloseTo(s0.designDriftMm / 60, 10);
    // storey shears decrease up the building; the top storey carries the top force only
    expect(r.storeys[9].shearKn).toBeCloseTo(r.forcesKn[9], 8);
    expect(r.storeys[0].shearKn).toBeGreaterThan(r.storeys[5].shearKn);
    expect(r.category).toBe("D");
    expect(r.permitted).toBe(true);
    expect(r.staticApplicable).toBe(true);
  });

  it("buildings of four storeys or less may use 0.025 h (partitions designed for the drift)", () => {
    const r = analyseSeismic({ ...base, storeys: 4, levelWeightsKn: Array(4).fill(5000), storeyStiffnessKnPerMm: Array(4).fill(500) });
    expect(r.storeys[0].limitMm).toBe(75);
  });

  it("overturning moment at the base is the sum of F_i h_i (Eq 6.2.47)", () => {
    const r = analyseSeismic({ ...base, levelWeightsKn: Array(10).fill(5000), storeyStiffnessKnPerMm: Array(10).fill(500) });
    const m0 = r.forcesKn.reduce((a, f, i) => a + f * (i + 1) * 3, 0);
    expect(r.overturningKnM[0]).toBeCloseTo(m0, 6);
    expect(r.overturningKnM[9]).toBeCloseTo(r.forcesKn[9] * 3, 8);
  });

  it("property: softer storeys drift more; more storeys give a larger base shear", () => {
    const stiff = analyseSeismic({ ...base, levelWeightsKn: Array(10).fill(5000), storeyStiffnessKnPerMm: Array(10).fill(800) });
    const soft = analyseSeismic({ ...base, levelWeightsKn: Array(10).fill(5000), storeyStiffnessKnPerMm: Array(10).fill(400) });
    expect(soft.storeys[0].designDriftMm).toBeGreaterThan(stiff.storeys[0].designDriftMm);
    let prev = 0;
    for (const n of [3, 5, 8, 12]) {
      const r = analyseSeismic({ ...base, storeys: n, levelWeightsKn: Array(n).fill(5000), storeyStiffnessKnPerMm: Array(n).fill(500) });
      expect(r.baseShearKn).toBeGreaterThan(prev);
      prev = r.baseShearKn;
    }
  });
});

const flat = { m2ns: 0, m2s: 0, deltaS: 1 };

describe("columns: interaction, slenderness, biaxial bending (Sec 6.3)", () => {
  it("phi from strain: 0.65 up to 0.002 (Grade 420, Sec 6.3.3.3), 0.90 from 0.005, linear between", () => {
    expect(phiFromStrain(0.001)).toBe(0.65);
    expect(phiFromStrain(0.005)).toBe(0.9);
    expect(phiFromStrain(0.0035)).toBeCloseTo(0.65 + (0.25 * 0.0015) / 0.003, 10);
    expect(phiFromStrain(0.002)).toBe(0.65);
  });

  it("hand example, 400 x 400 with 2 % steel: P0 = 4009.6 kN, phi Pn,max = 0.65 x 0.80 x P0 = 2085 kN (Eq 6.6.9)", () => {
    // P0 = 0.85 x 20 x (160000 - 3200) + 420 x 3200 = 2 665 600 + 1 344 000 N
    const it = interaction(400, 400, 0.02, 20);
    expect(it.p0).toBeCloseTo(4009.6, 6);
    expect(it.phiPnMax).toBeCloseTo(0.65 * 0.8 * 4009.6, 6);
    expect(it.curve[0].p).toBeCloseTo(it.phiPnMax, 6);
  });

  it("pure-bending capacity is near the singly-reinforced estimate: phi x 1600 x 420 x (340 - 49.4) = 176 kN.m, plus compression steel", () => {
    const m0 = momentCapacityAt(interaction(400, 400, 0.02, 20), 0);
    expect(m0).toBeGreaterThan(170);
    expect(m0).toBeLessThan(215);
  });

  it("the curve falls monotonically from the cap to zero axial load and grows with steel and section", () => {
    const it = interaction(400, 400, 0.02, 20);
    for (let i = 1; i < it.curve.length; i++) expect(it.curve[i].p).toBeLessThanOrEqual(it.curve[i - 1].p + 1e-9);
    expect(it.curve[it.curve.length - 1].p).toBe(0);
    expect(interaction(400, 400, 0.04).phiPnMax).toBeGreaterThan(interaction(400, 400, 0.02, 20).phiPnMax);
    expect(momentCapacityAt(interaction(500, 500, 0.02), 1000)).toBeGreaterThan(momentCapacityAt(interaction(400, 400, 0.02, 20), 1000));
  });

  it("a ray through a point on the curve scales back to 1", () => {
    const it = interaction(400, 400, 0.02, 20);
    const pt = it.curve[Math.floor(it.curve.length / 2)];
    expect(rayScale(it, pt.m, pt.p)).toBeCloseTo(1, 3);
  });

  const stub = (over: Partial<ColumnCase> = {}): ColumnCase => ({ id: "G", puKn: 1000, betaDns: 0.6, luMm: 3000, k: 1, x: flat, y: flat, ...over });

  it("minimum moment Eq 6.6.24: Pu 1000 kN on a 400 mm face -> 1000 x (15 + 12) / 1000 = 27 kN.m", () => {
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [stub()]);
    expect(r.cases[0].x.m2minKnM).toBeCloseTo(27, 10);
    expect(r.cases[0].x.mDesignKnM).toBeGreaterThanOrEqual(27);
  });

  it("hand example magnifier Eq 6.6.19-6.6.22: lu 3000, 400 sq, Pu 1000, beta_dns 0.6 -> slender (25 > 22), delta_ns = 1 / (1 - Pu / 0.75 Pc)", () => {
    const ec = ecMPa(MATERIALS.fcMPa);
    const ig = (400 * 400 ** 3) / 12;
    const ei = (0.4 * ec * ig) / 1.6;
    const pc = (Math.PI ** 2 * ei) / 3000 ** 2 / 1000; // kN
    const want = 1 / (1 - 1000 / (0.75 * pc));
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [stub({ x: { m2ns: 40, m2s: 0, deltaS: 1 } })]);
    expect(r.cases[0].x.slendernessRatio).toBeCloseTo(25, 10);
    expect(r.cases[0].x.slender).toBe(true);
    expect(r.cases[0].x.deltaNs).toBeCloseTo(want, 8);
    expect(r.cases[0].x.mDesignKnM).toBeCloseTo(want * 40, 6);
  });

  it("a short column is not magnified; a column that buckles reports an infinite magnifier and utilisation over 1.4 amplification", () => {
    const short = checkColumn({ bx: 600, by: 600 }, 0.02, [stub({ luMm: 2400, x: { m2ns: 50, m2s: 0, deltaS: 1 } })]);
    expect(short.cases[0].x.slender).toBe(false);
    expect(short.cases[0].x.deltaNs).toBe(1);
    const buckle = checkColumn({ bx: 300, by: 300 }, 0.01, [stub({ puKn: 1500, luMm: 5000, x: { m2ns: 20, m2s: 0, deltaS: 1 } })]);
    expect(buckle.cases[0].x.deltaNs).toBe(Infinity);
    expect(buckle.util).toBe(Infinity);
  });

  it("axial-only load: utilisation is Pu / phi Pn,max; bending raises it; biaxial raises it further (Bresler)", () => {
    const sec = { bx: 450, by: 450 };
    const axial = checkColumn(sec, 0.02, [stub({ puKn: 1200, luMm: 2400 })]);
    // first-order moment is only the minimum-eccentricity moment, so utilisation is just above Pu / cap
    const cap = interaction(450, 450, 0.02).phiPnMax;
    expect(axial.cases[0].util).toBeGreaterThanOrEqual(1200 / cap - 1e-9);
    const uni = checkColumn(sec, 0.02, [stub({ puKn: 1200, luMm: 2400, x: { m2ns: 120, m2s: 0, deltaS: 1 } })]);
    const bi = checkColumn(sec, 0.02, [stub({ puKn: 1200, luMm: 2400, x: { m2ns: 120, m2s: 0, deltaS: 1 }, y: { m2ns: 120, m2s: 0, deltaS: 1 } })]);
    expect(uni.cases[0].util).toBeGreaterThan(axial.cases[0].util);
    expect(bi.cases[0].util).toBeGreaterThan(uni.cases[0].util);
  });

  it("sway part is multiplied by delta_s (Eq 6.6.28) and adds to the non-sway part", () => {
    const r = checkColumn({ bx: 500, by: 500 }, 0.02, [stub({ puKn: 800, luMm: 2500, x: { m2ns: 30, m2s: 60, deltaS: 1.2 } })]);
    expect(r.cases[0].x.mDesignKnM).toBeCloseTo(30 + 1.2 * 60, 6);
  });

  it("property: more axial load or more moment never lowers the utilisation; larger sections lower it", () => {
    let prev = 0;
    for (const pu of [400, 800, 1200, 1600]) {
      const u = checkColumn({ bx: 450, by: 450 }, 0.02, [stub({ puKn: pu, luMm: 2400, x: { m2ns: 80, m2s: 0, deltaS: 1 } })]).util;
      expect(u).toBeGreaterThan(prev);
      prev = u;
    }
    const small = checkColumn({ bx: 350, by: 350 }, 0.02, [stub({ puKn: 1000, luMm: 2400, x: { m2ns: 80, m2s: 0, deltaS: 1 } })]).util;
    const large = checkColumn({ bx: 500, by: 500 }, 0.02, [stub({ puKn: 1000, luMm: 2400, x: { m2ns: 80, m2s: 0, deltaS: 1 } })]).util;
    expect(large).toBeLessThan(small);
  });

  it("lightestSteel finds the lowest ratio from 1 % that passes, or null", () => {
    const easy = lightestSteel({ bx: 500, by: 500 }, [stub({ puKn: 600, luMm: 2400 })]);
    expect(easy?.rho).toBe(0.01);
    const hopeless = lightestSteel({ bx: 300, by: 300 }, [stub({ puKn: 3000, luMm: 2400 })]);
    expect(hopeless).toBeNull();
  });
});
