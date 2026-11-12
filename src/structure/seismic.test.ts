import { describe, expect, it } from "vitest";
import { seismicPack, type SeismicSystem, type SiteClass } from "../rules/bnbcStructure";
import { refCs, refSa } from "../validation/reference";
import { analyseSeismic, approxPeriod, dampingEta, designCategory, distributionExponent, liveWeightFraction, spectrumCs, systemById, systemPermitted } from "./seismic";

const oneStorey = (z: number, siteClass: SiteClass = "SD", extra: Partial<Parameters<typeof analyseSeismic>[0]> = {}) =>
  analyseSeismic({ z, siteClass, group: "I_II", systemId: "special-rc-mrf", storeys: 1, storeyHeightMm: 3000, levelWeightsKn: [1000], storeyStiffnessKnPerMm: [100], ...extra });

describe("seismic system lookup and permission", () => {
  it("an unknown system id is an error that names the id", () => {
    expect(() => systemById("no-such-system")).toThrow(/unknown seismic system "no-such-system"/);
    expect(systemById("special-rc-mrf").r).toBe(8);
  });

  it("design category follows Table 6.2.18 by zone, site class and group", () => {
    expect([1, 2, 3, 4].map((z) => designCategory("SD", "I_II", z as 1 | 2 | 3 | 4))).toEqual(["C", "D", "D", "D"]);
    expect([1, 2, 3, 4].map((z) => designCategory("SA", "III", z as 1 | 2 | 3 | 4))).toEqual(["B", "C", "C", "D"]);
    expect([1, 2, 3, 4].map((z) => designCategory("SA", "IV", z as 1 | 2 | 3 | 4))).toEqual(["C", "D", "D", "D"]);
  });

  it("systems with no limit are always permitted; NP means never", () => {
    const ordinary = systemById("ordinary-rc-mrf"); // [NL, NP, NP]
    expect(systemPermitted(ordinary, "B", 100)).toEqual({ ok: true, limit: null });
    expect(systemPermitted(ordinary, "C", 3)).toEqual({ ok: false, limit: "NP" });
    expect(systemPermitted(ordinary, "D", 3)).toEqual({ ok: false, limit: "NP" });
    const intermediate = systemById("intermediate-rc-mrf"); // [NL, NL, NP]
    expect(systemPermitted(intermediate, "C", 100).ok).toBe(true);
    expect(systemPermitted(intermediate, "D", 3).ok).toBe(false);
  });

  it("a numeric height limit is inclusive and picked by category B, C or D", () => {
    const limited = { ...systemById("special-rc-mrf"), height: [30, 20, 10] } as unknown as SeismicSystem;
    expect(systemPermitted(limited, "B", 30)).toEqual({ ok: true, limit: 30 });
    expect(systemPermitted(limited, "B", 30.01).ok).toBe(false);
    expect(systemPermitted(limited, "C", 20).ok).toBe(true);
    expect(systemPermitted(limited, "C", 20.01).ok).toBe(false);
    expect(systemPermitted(limited, "D", 10).ok).toBe(true);
    expect(systemPermitted(limited, "D", 10.01).ok).toBe(false);
  });
});

describe("spectrum", () => {
  const classes: SiteClass[] = ["SA", "SB", "SC", "SD", "SE"];
  it("every branch agrees with the reference for damping corrections other than 1", () => {
    for (const cls of classes) {
      const { s, tb, tc, td } = seismicPack().siteClasses[cls];
      for (const eta of [0.55, 0.8, 1, 1.3]) {
        for (const t of [tb / 2, tb, (tb + tc) / 2, tc, (tc + td) / 2, td, td * 1.5, 4]) {
          expect(spectrumCs(t, cls, eta), `${cls} eta ${eta} t ${t}`).toBeCloseTo(refCs(t, s, tb, tc, td, eta), 10);
        }
      }
    }
  });

  it("damping correction eta = sqrt(10 / (5 + xi)) with a floor of 0.55", () => {
    expect(dampingEta(5)).toBeCloseTo(1, 12);
    expect(dampingEta(0)).toBeCloseTo(Math.SQRT2, 12);
    expect(dampingEta(10)).toBeCloseTo(Math.sqrt(10 / 15), 12);
    expect(dampingEta(30)).toBe(0.55); // sqrt(10/35) = 0.534 is below the floor
    expect(dampingEta(28.2)).toBeCloseTo(0.55, 2);
  });

  it("live load share of the seismic weight: 25 % up to 3 kN/m2, 50 % above", () => {
    expect(liveWeightFraction(0)).toBe(0.25);
    expect(liveWeightFraction(3)).toBe(0.25);
    expect(liveWeightFraction(3.01)).toBe(0.5);
    expect(liveWeightFraction(5)).toBe(0.5);
  });

  it("the force exponent is 1 up to 0.5 s, 2 from 2.5 s and linear between", () => {
    expect(distributionExponent(0.2)).toBe(1);
    expect(distributionExponent(0.5)).toBe(1);
    expect(distributionExponent(1)).toBeCloseTo(1.25, 12);
    expect(distributionExponent(1.5)).toBeCloseTo(1.5, 12);
    expect(distributionExponent(2.5)).toBe(2);
    expect(distributionExponent(4)).toBe(2);
  });

  it("approximate period T = Ct h^m for frames and other systems", () => {
    expect(approxPeriod(30, true)).toBeCloseTo(0.0466 * 30 ** 0.9, 10);
    expect(approxPeriod(30, false)).toBeCloseTo(0.0488 * 30 ** 0.75, 10);
  });
});

describe("analyseSeismic by hand", () => {
  it("one storey: period, Sa, base shear and drift follow the formulas", () => {
    const r = oneStorey(0.2);
    const t = 0.0466 * 3 ** 0.9;
    const site = seismicPack().siteClasses.SD;
    const sa = refSa(0.2, 1, 8, t, site, seismicPack().spectrum.beta);
    expect(r.periodS).toBeCloseTo(t, 12);
    expect(r.sa).toBeCloseTo(sa, 12);
    expect(r.saGoverns).toBe("spectrum");
    expect(r.baseShearKn).toBeCloseTo(sa * 1000, 9);
    // drift = Cd V / K / I with Cd 5.5, K 100 kN/mm, I 1
    expect(r.storeys[0].elasticMm).toBeCloseTo((sa * 1000) / 100, 9);
    expect(r.storeys[0].designDriftMm).toBeCloseTo((5.5 * sa * 1000) / 100, 9);
    // limit 0.025 h for up to 4 storeys, group I and II
    expect(r.storeys[0].limitMm).toBeCloseTo(0.025 * 3000, 9);
    expect(r.storeys[0].util).toBeCloseTo(r.storeys[0].designDriftMm / 75, 9);
  });

  it("a larger importance factor lowers the design drift by 1/I and raises the base shear by I", () => {
    const base = oneStorey(0.2, "SD");
    const iii = oneStorey(0.2, "SD", { importance: 1.25 });
    expect(iii.baseShearKn / base.baseShearKn).toBeCloseTo(1.25, 9);
    // drift = Cd * (V / K) / I: V rises by I, divided by I again
    expect(iii.storeys[0].designDriftMm).toBeCloseTo(base.storeys[0].designDriftMm, 9);
    expect(iii.importance).toBe(1.25);
    expect(base.importance).toBe(1);
  });

  it("the seismic zone is set by Z: the design category changes exactly at 0.12, 0.2 and 0.28", () => {
    expect(oneStorey(0.12, "SA").category).toBe("B");
    expect(oneStorey(0.13, "SA").category).toBe("C");
    expect(oneStorey(0.28, "SA").category).toBe("C");
    expect(oneStorey(0.29, "SA").category).toBe("D");
    expect(oneStorey(0.2, "SB").category).toBe("C");
    expect(oneStorey(0.21, "SB").category).toBe("D");
  });

  it("the equivalent static procedure applies to short buildings only", () => {
    const tall = (n: number) =>
      analyseSeismic({ z: 0.2, siteClass: "SD", group: "I_II", systemId: "special-rc-mrf", storeys: n, storeyHeightMm: 3000, levelWeightsKn: Array(n).fill(1000), storeyStiffnessKnPerMm: Array(n).fill(100) });
    expect(tall(3).staticApplicable).toBe(true);
    expect(tall(60).staticApplicable).toBe(false);
    // the limit is the smaller of 4 Tc and 2 s: SA has Tc 0.40, so 4 Tc = 1.6 s
    const t = (n: number) => 0.0466 * (n * 3) ** 0.9;
    const n = [...Array(60).keys()].map((i) => i + 1);
    const lastOk = n.filter((k) => t(k) < 1.6).pop()!;
    const sa = (k: number) => analyseSeismic({ z: 0.2, siteClass: "SA", group: "I_II", systemId: "special-rc-mrf", storeys: k, storeyHeightMm: 3000, levelWeightsKn: Array(k).fill(1000), storeyStiffnessKnPerMm: Array(k).fill(100) });
    expect(sa(lastOk).staticApplicable).toBe(true);
    expect(sa(lastOk + 1).staticApplicable).toBe(false);
  });

  it("the lower bound on Sa governs for a long period", () => {
    const r = oneStorey(0.2, "SD", { storeys: 40, levelWeightsKn: Array(40).fill(1000), storeyStiffnessKnPerMm: Array(40).fill(100) });
    expect(r.saGoverns).toBe("lower bound");
    const site = seismicPack().siteClasses.SD;
    expect(r.sa).toBeCloseTo(0.67 * seismicPack().spectrum.beta * 0.2 * 1 * site.s, 12);
  });
});
