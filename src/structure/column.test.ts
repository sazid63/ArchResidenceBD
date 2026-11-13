import { MATERIALS } from "./materials";
import { describe, expect, it } from "vitest";
import { checkColumn, interaction, lightestSteel, momentCapacityAt, phiFromStrain, rayScale, type ColumnCase, type Interaction } from "./column";
import { ecMPa } from "./materials";

// Hand-derived expectations from BNBC 2020 Part 6 Sec 6.2.3.2, 6.3.10 and 6.6 (fc 20 MPa, fy 420 MPa). Moments in kN.m, loads in kN.

/** A made-up envelope so that rays and interpolation can be worked on paper: (p, m) = (100, 0) -> (60, 40) -> (0, 50). */
const toy = (extra: Partial<Interaction> = {}): Interaction => ({
  curve: [
    { p: 100, m: 0, epsT: 0, phi: 0.65 },
    { p: 60, m: 40, epsT: 0, phi: 0.65 },
    { p: 0, m: 50, epsT: 0, phi: 0.9 },
  ],
  phiPnMax: 100,
  p0: 200,
  astMm2: 1000,
  ...extra,
});

describe("phi from strain", () => {
  it("0.65 up to 0.002, 0.90 from 0.005, linear between (Grade 420 limit 0.002)", () => {
    expect(phiFromStrain(0)).toBe(0.65);
    expect(phiFromStrain(0.002)).toBe(0.65);
    expect(phiFromStrain(0.005)).toBe(0.9);
    expect(phiFromStrain(0.01)).toBe(0.9);
    expect(phiFromStrain(0.0035)).toBeCloseTo(0.65 + (0.25 * 0.0015) / 0.003, 12);
  });
  it("other steel grades use fy / Es as the compression-controlled limit", () => {
    // fy 500: 500 / 200000 = 0.0025
    expect(phiFromStrain(0.0025, 500)).toBe(0.65);
    expect(phiFromStrain(0.00375, 500)).toBeCloseTo(0.65 + (0.25 * 0.00125) / 0.0025, 12);
  });
});

describe("momentCapacityAt on a known envelope", () => {
  it("zero at and above the axial cap, linear between points, the last moment below the last point", () => {
    const it0 = toy();
    expect(momentCapacityAt(it0, 100)).toBe(0);
    expect(momentCapacityAt(it0, 150)).toBe(0);
    expect(momentCapacityAt(it0, 80)).toBeCloseTo(20, 12);
    expect(momentCapacityAt(it0, 60)).toBeCloseTo(40, 12);
    expect(momentCapacityAt(it0, 30)).toBeCloseTo(45, 12);
    expect(momentCapacityAt(it0, 0)).toBeCloseTo(50, 12);
    expect(momentCapacityAt(it0, -50)).toBe(50);
  });
});

describe("rayScale on a known envelope", () => {
  it("a ray through (m, p) meets the envelope at t m, t p", () => {
    // ray through (m 20, p 40): p = 2 m. Segment 1 (0, 100) -> (40, 60) is p = 100 - m, so 2 m = 100 - m, m = 100 / 3, t = 5 / 3
    expect(rayScale(toy(), 20, 40)).toBeCloseTo(5 / 3, 10);
    // ray through (m 15, p 12): p = 0.8 m. Segment 2 (40, 60) -> (50, 0) is p = 60 - 6 (m - 40) = 300 - 6 m, so 0.8 m = 300 - 6 m, m = 44.12, t = 2.941
    expect(rayScale(toy(), 15, 12)).toBeCloseTo(300 / 6.8 / 15, 10);
    // ray through (m 10, p 80): segment 1 (0, 100) -> (40, 60): p = 100 - m. 8 m = 100 - m -> m = 100 / 9, t = 10 / 9 / 1 ... = (100/9)/10
    expect(rayScale(toy(), 10, 80)).toBeCloseTo(100 / 9 / 10, 10);
  });
  it("a ray along the axis (no moment) meets the cap", () => {
    expect(rayScale(toy(), 0, 50)).toBeCloseTo(2, 12);
    expect(rayScale(toy({ phiPnMax: 80 }), 0, 40)).toBeCloseTo(2, 12);
  });
  it("a ray with no moment and no load, or one that never meets the curve, gives Infinity", () => {
    expect(rayScale(toy(), 0, 0)).toBe(Infinity);
    expect(rayScale(toy(), 0, -10)).toBe(Infinity);
    // a ray pointing to negative moment never meets the envelope that lies at m >= 0
    expect(rayScale(toy(), -20, 40)).toBe(Infinity);
  });
  it("a ray that runs along a segment is skipped, not counted", () => {
    // parallel to segment 1 (direction (40, -40)): the determinant is zero
    const r = rayScale(toy(), 40, -40);
    expect(r).toBe(Infinity);
  });
  it("a ray through a vertex of the envelope is found (the segment ends are inclusive)", () => {
    expect(rayScale(toy(), 40, 60)).toBeCloseTo(1, 9);
    expect(rayScale(toy(), 50, 0.0000001)).toBeCloseTo(1, 4);
  });
});

describe("interaction curve", () => {
  const it0 = interaction(400, 400, 0.02);
  it("starts at the axial cap with no moment and ends at zero axial load", () => {
    expect(it0.curve[0]).toEqual({ p: it0.phiPnMax, m: 0, epsT: 0, phi: 0.65 });
    const last = it0.curve[it0.curve.length - 1];
    expect(last.p).toBe(0);
    expect(last.m).toBeGreaterThan(0);
    expect(last.phi).toBe(0.9);
    expect(last.epsT).toBeGreaterThan(0.005);
  });
  it("the strain at the end is 0.003 (dT - c) / c for the neutral axis where the load is zero", () => {
    // the zero-axial point must lie between the last two sampled neutral axes: strain from the last sampled point on
    const prev = it0.curve[it0.curve.length - 2];
    const last = it0.curve[it0.curve.length - 1];
    expect(last.epsT).toBeGreaterThan(prev.epsT);
    expect(last.epsT).toBeLessThan(0.02);
  });
  it("the strain at the zero-axial point is 0.003 (dT - c) / c at the neutral axis step where the load changes sign", () => {
    // sample k = length - 2 is the first with negative axial load: c = 3 h (0.02 / 3)^(k / 400)
    const k = it0.curve.length - 2;
    const c = 400 * 3 * Math.pow(0.02 / 3, k / 400);
    const dT = 400 - (40 + 10 + 20 / 2);
    expect(it0.curve[it0.curve.length - 1].epsT).toBeCloseTo((0.003 * (dT - c)) / c, 12);
  });
  it("every point carries the phi of its strain, and axial load falls along the curve", () => {
    for (const pt of it0.curve.slice(1)) expect(pt.phi).toBeCloseTo(phiFromStrain(pt.epsT), 12);
    for (let i = 1; i < it0.curve.length; i++) expect(it0.curve[i].p).toBeLessThanOrEqual(it0.curve[i - 1].p + 1e-9);
  });
  it("the cap is 0.65 * 0.80 * P0 with P0 = (0.85 fc (Ag - Ast) + fy Ast) / 1000", () => {
    const ast = 0.02 * 160000;
    const p0 = (0.85 * MATERIALS.fcMPa * (160000 - ast) + 420 * ast) / 1000;
    expect(it0.p0).toBeCloseTo(p0, 9);
    expect(it0.phiPnMax).toBeCloseTo(0.65 * 0.8 * p0, 9);
    expect(it0.astMm2).toBe(ast);
  });
  it("the curve is sampled finely, stopping where the axial load reaches zero", () => {
    expect(it0.curve.length).toBeGreaterThan(150);
    expect(it0.curve.length).toBeLessThanOrEqual(402);
  });
});

const base = (over: Partial<ColumnCase> = {}): ColumnCase => ({
  id: "c",
  puKn: 0,
  betaDns: 0.5,
  luMm: 2000,
  k: 1,
  x: { m2ns: 0, m2s: 0, deltaS: 1 },
  y: { m2ns: 0, m2s: 0, deltaS: 1 },
  ...over,
});

describe("slenderness (Sec 6.3.10): a column is slender when k lu / r exceeds 22", () => {
  it("r = 0.3 of the depth in the plane of bending; exactly 22 is not slender", () => {
    // 300 x 600: bending about x uses depth 300 (r 90), about y depth 600 (r 180)
    const r = checkColumn({ bx: 300, by: 600 }, 0.02, [base({ puKn: 500, luMm: 1980, x: { m2ns: 40, m2s: 0, deltaS: 1 }, y: { m2ns: 40, m2s: 0, deltaS: 1 } })]).cases[0];
    expect(r.x.slendernessRatio).toBeCloseTo(22, 12);
    expect(r.x.slender).toBe(false);
    expect(r.y.slendernessRatio).toBeCloseTo(1980 / 180, 12);
    const above = checkColumn({ bx: 300, by: 600 }, 0.02, [base({ puKn: 500, luMm: 1981 })]).cases[0];
    expect(above.x.slender).toBe(true);
    expect(above.y.slender).toBe(false);
  });

  it("the sway length factor of the y axis is kY when given, else k", () => {
    const withKy = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ luMm: 2000, k: 1, kY: 1.5 })]).cases[0];
    expect(withKy.x.slendernessRatio).toBeCloseTo(2000 / 120, 12);
    expect(withKy.y.slendernessRatio).toBeCloseTo((1.5 * 2000) / 120, 12);
    const withoutKy = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ luMm: 2000, k: 1.2 })]).cases[0];
    expect(withoutKy.y.slendernessRatio).toBeCloseTo((1.2 * 2000) / 120, 12);
  });

  it("minimum moment is Pu (15 + 0.03 h) / 1000 in the plane of bending, only for compression", () => {
    const r = checkColumn({ bx: 300, by: 600 }, 0.02, [base({ puKn: 1000 })]).cases[0];
    expect(r.x.m2minKnM).toBeCloseTo((1000 * (15 + 0.03 * 300)) / 1000, 12); // 24
    expect(r.y.m2minKnM).toBeCloseTo((1000 * (15 + 0.03 * 600)) / 1000, 12); // 33
    expect(checkColumn({ bx: 300, by: 600 }, 0.02, [base({ puKn: -100 })]).cases[0].x.m2minKnM).toBe(0);
  });

  it("a short column keeps its first-order moment: the larger of the moment and the minimum moment", () => {
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: 1000, x: { m2ns: 10, m2s: 0, deltaS: 1 }, y: { m2ns: 60, m2s: 0, deltaS: 1 } })]).cases[0];
    expect(r.x.deltaNs).toBe(1);
    expect(r.x.mDesignKnM).toBeCloseTo(27, 12); // minimum moment 1000 (15 + 12) / 1000 beats 10
    expect(r.y.mDesignKnM).toBeCloseTo(60, 12);
  });

  it("slender: delta_ns = 1 / (1 - Pu / (0.75 Pc)) with Pc = pi^2 EI / lu^2, EI = 0.4 Ec Ig / (1 + beta_dns)", () => {
    const pu = 800;
    const lu = 5000;
    const ig = (400 * 400 ** 3) / 12;
    const ei = (0.4 * ecMPa(MATERIALS.fcMPa) * ig) / 1.5;
    const pc = (Math.PI ** 2 * ei) / lu ** 2 / 1000;
    const delta = 1 / (1 - pu / (0.75 * pc));
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: pu, luMm: lu, betaDns: 0.5, x: { m2ns: 80, m2s: 0, deltaS: 1 } })]).cases[0];
    expect(r.x.slender).toBe(true);
    expect(delta).toBeGreaterThan(1);
    expect(r.x.deltaNs).toBeCloseTo(delta, 9);
    expect(r.x.mDesignKnM).toBeCloseTo(delta * 80, 7);
    expect(r.x.amplification).toBeCloseTo(delta, 7);
  });

  it("beta_dns is held between 0 and 1", () => {
    const at = (b: number) => checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: 800, luMm: 5000, betaDns: b, x: { m2ns: 80, m2s: 0, deltaS: 1 } })]).cases[0].x.deltaNs;
    expect(at(-0.5)).toBeCloseTo(at(0), 12);
    expect(at(2)).toBeCloseTo(at(1), 12);
    expect(at(1)).toBeGreaterThan(at(0));
  });

  it("a load at or above 0.75 Pc is unstable: delta_ns is infinite and the case fails", () => {
    const r = checkColumn({ bx: 300, by: 300 }, 0.02, [base({ puKn: 3000, luMm: 8000, x: { m2ns: 10, m2s: 0, deltaS: 1 } })]);
    expect(r.cases[0].x.deltaNs).toBe(Infinity);
    expect(r.util).toBe(Infinity);
  });

  it("delta_ns is never below 1, and sway moments are magnified by delta_s", () => {
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: 10, luMm: 3000, x: { m2ns: 50, m2s: 30, deltaS: 1.25 } })]).cases[0];
    expect(r.x.slender).toBe(true);
    expect(r.x.deltaNs).toBeGreaterThanOrEqual(1);
    expect(r.x.mDesignKnM).toBeCloseTo(r.x.deltaNs * 50 + 1.25 * 30, 9);
    expect(r.x.amplification).toBeCloseTo(r.x.mDesignKnM / 80, 9);
    expect(r.x.deltaS).toBe(1.25);
  });

  it("amplification above 1.4 is reported as amplification / 1.4, not at or below 1.4", () => {
    const at = (deltaS: number) => checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: 0, x: { m2ns: 0, m2s: 100, deltaS } })]).cases[0].amplificationUtil;
    expect(at(1.4)).toBe(0);
    expect(at(1.2)).toBe(0);
    expect(at(2.1)).toBeCloseTo(1.5, 12);
  });

  it("the larger amplification of the two axes decides", () => {
    const r = checkColumn({ bx: 400, by: 400 }, 0.02, [base({ puKn: 0, x: { m2ns: 0, m2s: 100, deltaS: 1.1 }, y: { m2ns: 0, m2s: 100, deltaS: 2.8 } })]).cases[0];
    expect(r.amplificationUtil).toBeCloseTo(2.0, 12);
  });
});

describe("combining the two bending axes", () => {
  const sec = { bx: 300, by: 600 };
  const itX = interaction(300, 600, 0.02);
  const itY = interaction(600, 300, 0.02);

  it("tension: Pu / (0.9 Ast fy) plus the moment ratios about both axes at zero axial load", () => {
    const c = base({ puKn: -300, x: { m2ns: 20, m2s: 0, deltaS: 1 }, y: { m2ns: 35, m2s: 0, deltaS: 1 } });
    const r = checkColumn(sec, 0.02, [c]).cases[0];
    const ast = 0.02 * 300 * 600;
    const t = 300 / ((0.9 * ast * 420) / 1000);
    expect(r.method).toBe("tension");
    expect(r.util).toBeCloseTo(t + 20 / momentCapacityAt(itX, 0) + 35 / momentCapacityAt(itY, 0), 9);
    // zero load is the tension branch too (the limit is p <= 0)
    expect(checkColumn(sec, 0.02, [base({ puKn: 0, x: { m2ns: 20, m2s: 0, deltaS: 1 } })]).cases[0].method).toBe("tension");
  });

  it("below 0.1 fc Ag the moments add linearly: Mx / Mcx(Pu) + My / Mcy(Pu)", () => {
    // 0.1 * 20 * 180000 / 1000 = 360 kN
    const c = base({ puKn: 359, luMm: 1500, x: { m2ns: 30, m2s: 0, deltaS: 1 }, y: { m2ns: 50, m2s: 0, deltaS: 1 } });
    const r = checkColumn(sec, 0.02, [c]).cases[0];
    expect(r.method).toBe("linear");
    expect(r.util).toBeCloseTo(r.x.mDesignKnM / momentCapacityAt(itX, 359) + r.y.mDesignKnM / momentCapacityAt(itY, 359), 9);
    expect(r.x.mDesignKnM).toBeCloseTo(30, 12);
    expect(r.y.mDesignKnM).toBeCloseTo(50, 12);
  });

  it("from 0.1 fc Ag the reciprocal load method applies, 1/Pn = 1/Pnx + 1/Pny - 1/P0", () => {
    const pu = (0.1 * MATERIALS.fcMPa * 180000) / 1000 + 10; // just above 0.1 fc Ag
    const c = base({ puKn: pu, luMm: 1500, x: { m2ns: 30, m2s: 0, deltaS: 1 }, y: { m2ns: 50, m2s: 0, deltaS: 1 } });
    const r = checkColumn(sec, 0.02, [c]).cases[0];
    expect(r.method).toBe("Bresler");
    const capX = Math.min(rayScale(itX, r.x.mDesignKnM, pu) * pu, itX.phiPnMax);
    const capY = Math.min(rayScale(itY, r.y.mDesignKnM, pu) * pu, itY.phiPnMax);
    const inv = 1 / capX + 1 / capY - 1 / (0.65 * itX.p0);
    expect(r.util).toBeCloseTo(pu / Math.min(1 / inv, itX.phiPnMax), 9);
    // the P0 term is subtracted: the combined capacity is below both single-axis capacities
    expect(1 / inv).toBeLessThan(Math.min(capX, capY));
  });

  it("the reciprocal capacity is capped at phi Pn,max", () => {
    const c = base({ puKn: 400, x: { m2ns: 0.001, m2s: 0, deltaS: 1 }, y: { m2ns: 0.001, m2s: 0, deltaS: 1 } });
    const r = checkColumn({ bx: 300, by: 300 }, 0.01, [c]).cases[0];
    const it1 = interaction(300, 300, 0.01);
    // the minimum moment lifts both axes above zero; whichever capacity results, util is at least P / cap
    expect(r.util).toBeGreaterThanOrEqual(400 / it1.phiPnMax - 1e-12);
  });

  it("the biaxial result differs from the uniaxial one: a moment about the second axis lowers the capacity", () => {
    const one = checkColumn(sec, 0.02, [base({ puKn: 800, x: { m2ns: 60, m2s: 0, deltaS: 1 } })]).cases[0].util;
    const two = checkColumn(sec, 0.02, [base({ puKn: 800, x: { m2ns: 60, m2s: 0, deltaS: 1 }, y: { m2ns: 60, m2s: 0, deltaS: 1 } })]).cases[0].util;
    expect(two).toBeGreaterThan(one);
  });

  it("the check reports the case that governs and where, whatever its position", () => {
    const light = base({ id: "A", puKn: 100, x: { m2ns: 5, m2s: 0, deltaS: 1 } });
    const heavy = base({ id: "B", puKn: 100, x: { m2ns: 60, m2s: 0, deltaS: 1 } });
    const r = checkColumn(sec, 0.02, [light, heavy]);
    expect(r.governs).toBe("B interaction");
    expect(r.util).toBe(r.cases[1].util);
    expect(r.cases[1].util).toBeGreaterThan(r.cases[0].util);
    const rev = checkColumn(sec, 0.02, [heavy, light]);
    expect(rev.governs).toBe("B interaction");
    expect(rev.util).toBe(rev.cases[0].util);
    expect(r.astMm2).toBe(0.02 * 180000);
    expect(r.rho).toBe(0.02);
  });

  it("the amplification governs when it is the larger ratio", () => {
    const r = checkColumn({ bx: 400, by: 400 }, 0.04, [base({ id: "S", puKn: 0, x: { m2ns: 0, m2s: 5, deltaS: 3 } })]);
    expect(r.cases[0].amplificationUtil).toBeCloseTo(3 / 1.4, 12);
    expect(r.cases[0].util).toBeLessThan(0.5);
    expect(r.governs).toBe("S amplification over 1.4");
    expect(r.util).toBeCloseTo(3 / 1.4, 12);
  });

  it("no cases: utilisation 0 and nothing governs", () => {
    const r = checkColumn(sec, 0.02, []);
    expect(r.util).toBe(0);
    expect(r.governs).toBe("none");
  });
});

describe("lightest steel", () => {
  const sec = { bx: 400, by: 400 };
  const load = (n: number) => [base({ puKn: n, x: { m2ns: 40, m2s: 0, deltaS: 1 } })];

  it("returns the first ratio from 1 % that passes, in steps of 0.25 %", () => {
    const light = lightestSteel(sec, load(300))!;
    expect(light.rho).toBe(0.01);
    expect(light.util).toBeLessThanOrEqual(1);
    // a load that 1 % cannot carry needs more
    for (const n of [2500, 3000, 3500]) {
      const r = lightestSteel(sec, load(n), 0.06);
      if (r && r.rho > 0.01) {
        const below = checkColumn(sec, Math.round((r.rho - 0.0025) * 10000) / 10000, load(n));
        expect(below.util).toBeGreaterThan(1);
      }
    }
  });

  it("never exceeds the ratio ceiling, which is inclusive; beyond it the answer is null", () => {
    expect(lightestSteel(sec, load(300), 0.01)!.rho).toBe(0.01);
    // a load that 1 % of steel cannot carry but 6 % can: the ceiling must stop the search
    let n = 500;
    while (n < 6000 && !(checkColumn(sec, 0.01, load(n)).util > 1)) n += 100;
    expect(checkColumn(sec, 0.06, load(n)).util).toBeLessThanOrEqual(1);
    expect(lightestSteel(sec, load(n), 0.01)).toBeNull();
    expect(lightestSteel(sec, load(n), 0.06)!.rho).toBeGreaterThan(0.01);
    const heavy = lightestSteel(sec, load(3500), 0.06);
    if (heavy) expect(heavy.rho).toBeGreaterThan(0.01);
  });
});

describe("column stock", () => {
  it("includes 250 x 300 mm (and 300 x 250) for 2-storey ground columns, the smallest section in the stock", async () => {
    const { COLUMN_STOCK } = await import("./column");
    expect(COLUMN_STOCK[0]).toEqual({ bx: 250, by: 300 });
    expect(COLUMN_STOCK).toContainEqual({ bx: 300, by: 250 });
  });
});
