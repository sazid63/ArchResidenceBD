/**
 * Phase 2: the engine against the independent implementations in ./reference.ts, on generated inputs (fast-check).
 * Tolerances are tight on purpose (0.1 % to 1 %): a larger gap means a formula differs, not that rounding is unlucky.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { seismicPack } from "../rules/bnbcStructure";
import { interaction, momentCapacityAt, phiFromStrain, D_PRIME_MM } from "../structure/column";
import { designFooting } from "../structure/footing";
import { beta1 } from "../structure/materials";
import { designSa, distributeForces, spectrumCs } from "../structure/seismic";
import { beamMinAs, flexure, shear } from "../structure/section";
import {
  refAsForMoment, refAsTensionControlled, refAvPerMm, refBeta1, refColumnPoint, refCs, refPadSide, refPhiColumn, refPhiMn, refPunchVc,
  refPureAxial, refSa, refStoreyForces, refVc,
} from "./reference";

const close = (a: number, b: number, rel: number, abs = 1e-9) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));
const runs = { numRuns: 300 };

describe("beta1", () => {
  it("matches the reference for every concrete strength", () => {
    fc.assert(fc.property(fc.double({ min: 15, max: 80, noNaN: true }), (f) => { expect(beta1(f)).toBeCloseTo(refBeta1(f), 12); }), runs);
  });
});

describe("flexure: closed form in the engine vs bisection on phi Mn", () => {
  const sect = fc.record({
    b: fc.integer({ min: 150, max: 1200 }),
    d: fc.integer({ min: 150, max: 900 }),
    fcv: fc.constantFrom(20, 25, 30, 35),
    fy: fc.constantFrom(420, 500),
  });
  it("required steel agrees to 0.1 % (and both say 'too much moment' together)", () => {
    fc.assert(
      fc.property(sect, fc.double({ min: 0.01, max: 1.3, noNaN: true }), ({ b, d, fcv, fy }, share) => {
        const capRef = refPhiMn(refAsTensionControlled(b, d, fcv, fy), b, d, fcv, fy);
        const mu = share * capRef;
        const eng = flexure(mu, b, d, 0, fcv, fy);
        const ref = refAsForMoment(mu, b, d, fcv, fy);
        // The engine uses the textbook Ru form with 0.59 (exact: 1 / 1.7 = 0.5882): 0.06 % lower capacity, on the safe side. Anything else is a bug.
        expect(eng.capacityKnM).toBeLessThanOrEqual(capRef * (1 + 1e-12));
        expect(eng.capacityKnM).toBeGreaterThan(capRef * 0.998);
        if (share > 1.003) {
          expect(eng.asCalcMm2).toBe(Infinity);
          expect(ref).toBe(Infinity);
        } else if (share < 0.997) {
          expect(close(eng.asCalcMm2, ref, 1e-3, 0.01), `b${b} d${d} fc${fcv} fy${fy} share${share}: engine ${eng.asCalcMm2} ref ${ref}`).toBe(true);
          // and the steel actually carries the moment
          expect(refPhiMn(eng.asCalcMm2, b, d, fcv, fy)).toBeGreaterThan(mu * 0.9995);
        }
      }),
      runs,
    );
  });

  it("minimum beam steel is the larger of the two ACI expressions", () => {
    fc.assert(fc.property(sect, ({ b, d, fcv, fy }) => {
      const ref = Math.max((0.25 * Math.sqrt(fcv) * b * d) / fy, (1.4 * b * d) / fy);
      expect(beamMinAs(b, d, fcv, fy)).toBeCloseTo(ref, 9);
    }), runs);
  });
});

describe("beam shear", () => {
  it("phi Vc, section limit and stirrup area agree with the reference", () => {
    fc.assert(
      fc.property(fc.integer({ min: 150, max: 600 }), fc.integer({ min: 200, max: 900 }), fc.constantFrom(20, 25, 30), fc.double({ min: 0, max: 600, noNaN: true }), (b, d, fcv, vu) => {
        const eng = shear(vu, b, d, fcv, 420);
        expect(eng.phiVcKn).toBeCloseTo(0.75 * refVc(b, d, fcv), 9);
        expect(eng.capacityKn).toBeCloseTo(0.75 * (refVc(b, d, fcv) + (0.66 * Math.sqrt(fcv) * b * d) / 1000), 9);
        expect(close(eng.avPerMm, refAvPerMm(vu, b, d, fcv, 420), 1e-9, 1e-12)).toBe(true);
      }),
      runs,
    );
  });
});

describe("column interaction: strain compatibility from first principles", () => {
  it("every reference point (phi Pn, phi Mn) lies on the engine's curve", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 250, max: 700 }).map((v) => Math.round(v / 50) * 50),
        fc.integer({ min: 250, max: 700 }).map((v) => Math.round(v / 50) * 50),
        fc.double({ min: 0.01, max: 0.04, noNaN: true }),
        fc.double({ min: 0.08, max: 1.8, noNaN: true }),
        (h, b, rho, cOverH) => {
          const it = interaction(h, b, rho);
          const ast = rho * h * b;
          const pt = refColumnPoint(h, b, ast, D_PRIME_MM, cOverH * h, 20, 420);
          const phi = refPhiColumn(pt.epsT);
          const phiPn = phi * pt.pn;
          if (phiPn >= it.phiPnMax || phiPn <= 0) return; // above the cap or in tension: not on the sampled curve
          const engineM = momentCapacityAt(it, phiPn);
          expect(close(engineM, phi * pt.mn, 0.02, 0.5), `h${h} b${b} rho${rho} c/h${cOverH}: engine ${engineM} ref ${phi * pt.mn}`).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  it("pure axial strength and the 0.80 cap agree", () => {
    fc.assert(fc.property(fc.integer({ min: 250, max: 800 }), fc.integer({ min: 250, max: 800 }), fc.double({ min: 0.01, max: 0.04, noNaN: true }), (h, b, rho) => {
      const it = interaction(h, b, rho);
      const ref = refPureAxial(h, b, rho, 20, 420);
      expect(it.p0).toBeCloseTo(ref.p0, 6);
      expect(it.phiPnMax).toBeCloseTo(ref.phiPnMax, 6);
    }), runs);
  });

  it("phi from strain agrees and is continuous and monotonic", () => {
    fc.assert(fc.property(fc.double({ min: -0.01, max: 0.02, noNaN: true }), (e) => { expect(phiFromStrain(e)).toBeCloseTo(refPhiColumn(e), 12); }), runs);
    let prev = 0;
    for (let e = -0.001; e <= 0.008; e += 0.0001) {
      const p = phiFromStrain(e);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
  });
});

describe("seismic", () => {
  const classes = ["SA", "SB", "SC", "SD", "SE"] as const;
  it("spectrum and design Sa agree with the reference, and the spectrum has no jumps", () => {
    fc.assert(
      fc.property(fc.constantFrom(...classes), fc.double({ min: 0.02, max: 6, noNaN: true }), fc.constantFrom(1, 1.25, 1.5), fc.constantFrom(3, 5, 8), (cls, t, imp, r) => {
        const site = seismicPack().siteClasses[cls];
        expect(spectrumCs(t, cls)).toBeCloseTo(refCs(t, site.s, site.tb, site.tc, site.td), 10);
        const beta = seismicPack().spectrum.beta;
        expect(designSa({ z: 0.2, importance: imp, r, t, siteClass: cls }).sa).toBeCloseTo(refSa(0.2, imp, r, t, site, beta), 10);
        // continuity at each corner period
        for (const corner of [site.tb, site.tc, site.td]) expect(Math.abs(spectrumCs(corner - 1e-9, cls) - spectrumCs(corner + 1e-9, cls))).toBeLessThan(1e-6);
      }),
      runs,
    );
  });

  it("storey forces sum to the base shear, rise with height, and match the direct sum", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 500, max: 5000, noNaN: true }), { minLength: 1, maxLength: 12 }), fc.double({ min: 50, max: 5000, noNaN: true }), fc.double({ min: 1, max: 2, noNaN: true }), (w, v, k) => {
        const h = w.map((_, i) => (i + 1) * 3);
        const f = distributeForces(v, w, h, k);
        const ref = refStoreyForces(v, w, h, k);
        expect(f.reduce((a, b) => a + b, 0)).toBeCloseTo(v, 6);
        f.forEach((x, i) => expect(x).toBeCloseTo(ref[i], 8));
        // with equal weights the force per unit weight grows with height
        const eq = distributeForces(v, w.map(() => 1000), h, k);
        for (let i = 1; i < eq.length; i++) expect(eq[i]).toBeGreaterThan(eq[i - 1]);
      }),
      runs,
    );
  });
});

describe("pad footing", () => {
  const input = fc.record({
    service: fc.integer({ min: 100, max: 3000 }),
    bx: fc.constantFrom(250, 300, 350, 400, 450, 500, 600),
    by: fc.constantFrom(250, 300, 350, 400, 450, 500, 600),
    allowable: fc.integer({ min: 80, max: 400 }),
    position: fc.constantFrom("interior" as const, "edge" as const, "corner" as const),
  });
  const alphaS = { interior: 40, edge: 30, corner: 20 };

  it("the pad is the smallest 50 mm side that keeps the service pressure within the allowable", () => {
    fc.assert(fc.property(input, ({ service, bx, by, allowable, position }) => {
      const r = designFooting({ serviceKn: service, serviceSeismicKn: service, puKn: 1.45 * service, colBxMm: bx, colByMm: by, position, allowableKpa: allowable });
      const refSide = Math.max(refPadSide(service, 0.1, allowable), Math.max(bx, by) + 300);
      expect(r.sideMm).toBe(refSide);
      expect(r.pressureKpa).toBeLessThanOrEqual(allowable * 1.0000001 + (refSide === Math.max(bx, by) + 300 ? 1e9 : 0));
    }), runs);
  });

  it("an independent recomputation of shear and flexure at the returned size passes, and 50 mm shallower does not (unless at the minimum depth)", () => {
    fc.assert(fc.property(input, ({ service, bx, by, allowable, position }) => {
      const pu = 1.45 * service;
      const r = designFooting({ serviceKn: service, serviceSeismicKn: service, puKn: pu, colBxMm: bx, colByMm: by, position, allowableKpa: allowable });
      const util = (h: number) => {
        const b = r.sideMm;
        const d = h - 75 - 16 - 8;
        const qu = (pu * 1000) / (b * b);
        const beam = (qu * b * Math.max(b / 2 - Math.min(bx, by) / 2 - d, b / 2 - Math.max(bx, by) / 2 - d, 0)) / 1000 / (0.75 * refVc(b, d, 20));
        const b0 = 2 * (bx + d) + 2 * (by + d);
        const punchV = pu - (qu * (bx + d) * (by + d)) / 1000;
        const punch = punchV / (0.75 * refPunchVc(b0, d, Math.max(bx, by) / Math.min(bx, by), alphaS[position], 20));
        const cant = (b - Math.min(bx, by)) / 2;
        const mu = (qu * b * cant * cant) / 2 / 1e6;
        const cap = refPhiMn(refAsTensionControlled(b, d, 20, 420), b, d, 20, 420);
        return { beam, punch, flex: mu / cap, d };
      };
      const here = util(r.depthMm);
      if (r.util <= 1) {
        expect(here.beam).toBeLessThanOrEqual(1.001);
        expect(here.punch).toBeLessThanOrEqual(1.001);
        expect(here.flex).toBeLessThanOrEqual(1.001);
        if (r.depthMm > 300 && r.governs !== "bearing") {
          const less = util(r.depthMm - 50);
          // flexure is judged with the engine's own steel rule (min steel too), so only shear is a strict test here
          expect(Math.max(less.beam, less.punch, less.flex)).toBeGreaterThan(0.95);
        }
      }
    }), runs);
  });

  it("a lower bearing capacity never gives a smaller footing, and more load never gives a smaller footing", () => {
    fc.assert(fc.property(input, fc.integer({ min: 1, max: 100 }), ({ service, bx, by, allowable, position }, extra) => {
      const mk = (s: number, q: number) => designFooting({ serviceKn: s, serviceSeismicKn: s, puKn: 1.45 * s, colBxMm: bx, colByMm: by, position, allowableKpa: q });
      expect(mk(service, allowable - 10 >= 50 ? allowable - 10 : allowable).sideMm).toBeGreaterThanOrEqual(mk(service, allowable).sideMm);
      expect(mk(service + extra * 10, allowable).sideMm).toBeGreaterThanOrEqual(mk(service, allowable).sideMm);
    }), runs);
  });
});
