/**
 * Published benchmark problems (spec/reference/benchmarks/*.json) against the engine and the independent reference.
 * Inputs and printed answers are in the source's US units; this file converts to SI and states, for every tolerance, why
 * it is as large as it is. A gap larger than its stated reason is a finding, not a tolerance to loosen.
 */
import { describe, expect, it } from "vitest";
import colJson from "../../spec/reference/benchmarks/structurepoint-tied-column-aci318-19.json";
import beamJson from "../../spec/reference/benchmarks/structurepoint-simple-beam-aci318-14.json";
import footJson from "../../spec/reference/benchmarks/structurepoint-spread-footing-aci318-14.json";
import { interaction, momentCapacityAt } from "../structure/column";
import { designFooting } from "../structure/footing";
import { beamMinAs, flexure, shear } from "../structure/section";
import { refAsForMoment, refColumnPoint, refPunchVc, refVc } from "./reference";

const IN = 25.4;
const KSI = 6.894757;
const PSI = KSI / 1000;
const KIP = 4.4482216;
const KIPFT = 1.3558179;
const IN2 = IN * IN;
const near = (got: number, want: number, rel: number, what: string) =>
  expect(Math.abs(got - want) / Math.abs(want), `${what}: got ${got}, printed ${want}`).toBeLessThanOrEqual(rel);

describe("benchmark: StructurePoint tied column, ACI 318-19 (Wight Example 11-1)", () => {
  const { inputs: i, printed: p } = colJson;
  const h = i.hIn * IN;
  const b = i.bIn * IN;
  const ast = i.barsPerLayer * i.layers * i.barAreaIn2 * IN2;
  const rho = ast / (h * b);
  const fc = i.fcKsi * KSI;
  const fy = i.fyKsi * KSI;
  const es = i.esKsi * KSI;
  const dPrime = i.barCentreFromFaceIn * IN;
  const d1 = (i.hIn - i.barCentreFromFaceIn) * IN; // extreme tension steel

  it("the independent reference reproduces every printed nominal Pn and Mn from strain compatibility (1 %: beta1 in SI steps from 28 MPa = 4061 psi, so 0.8038 where the US form gives exactly 0.80 at 5000 psi, plus the example rounding c to 2 decimals)", () => {
    for (const pt of p.points) {
      const c = pt.cIn * IN;
      const r = refColumnPoint(h, b, ast, dPrime, c, fc, fy, es);
      if (pt.Pn === 0) expect(Math.abs(r.pn / KIP), `${pt.name} Pn should be ~0`).toBeLessThan(1);
      else near(r.pn / KIP, pt.Pn, 0.01, `${pt.name} Pn`);
      near(r.mn / KIPFT, pt.Mn, 0.01, `${pt.name} Mn`);
    }
  });

  it("the engine: pure axial strength and the 0.80 cap (0.2 %: rounding of the printed values)", () => {
    const it = interaction(h, b, rho, fc, fy, dPrime);
    near(it.p0 / KIP, p.P0, 0.002, "P0");
    near(it.phiPnMax / KIP, p.phiPnMax, 0.003, "phi Pn,max");
    near((0.65 * it.p0) / KIP, p.phiP0, 0.002, "phi P0");
  });

  it("the engine: design moment at each printed design axial load matches the printed phi Mn (1.5 %: curve sampling and Es 200000 vs 29000 ksi)", () => {
    const it = interaction(h, b, rho, fc, fy, dPrime);
    for (const pt of p.points) {
      const m = momentCapacityAt(it, pt.phiPn * KIP) / KIPFT;
      near(m, pt.phiMn, 0.015, `${pt.name} phi Mn`);
    }
  });

  it("maximum tension is phi fy Ast = 0.9 x 60 x 8", () => {
    near(0.9 * i.fyKsi * (i.barsPerLayer * i.layers * i.barAreaIn2), p.maxTensionPhiPnt, 1e-9, "max tension");
    expect(d1).toBeGreaterThan(0);
  });
});

describe("benchmark: StructurePoint simply supported beam, ACI 318-14 (Chaallal)", () => {
  const { inputs: i, printed: p } = beamJson;
  const b = i.bIn * IN;
  const d = p.dIn * IN;
  const fc = i.fcKsi * KSI;
  const fy = i.fyKsi * KSI;

  it("loads, moment, shear and effective depth recompute exactly", () => {
    const wu = 1.2 * i.deadKipFt + 1.6 * i.liveKipFt; // 2.584: the example prints it as 2.58 and carries the exact value into Mu and Vu
    near(wu, p.wuKipFt, 0.002, "wu");
    near((wu * i.spanFt ** 2) / 8, p.MuKipFt, 0.0001, "Mu");
    near((wu * i.spanFt) / 2, p.VuKip, 0.001, "Vu");
    near(i.hIn - (i.clearCoverIn + i.stirrupDiaIn + i.barDiaIn / 2), p.dIn, 0.0005, "d");
  });

  it("required steel: engine and independent bisection both give the printed 2.872 in2 (0.3 %)", () => {
    const mu = p.MuKipFt * KIPFT;
    const eng = flexure(mu, b, d, 0, fc, fy);
    near(eng.asCalcMm2 / IN2, p.AsRequiredIn2, 0.003, "engine As");
    near(refAsForMoment(mu, b, d, fc, fy) / IN2, p.AsRequiredIn2, 0.003, "reference As");
    expect(eng.util).toBeLessThan(1);
  });

  it("minimum steel: engine is the larger ACI expression (2 %: ACI 318M states 1.4 MPa where the US form is 200 psi = 1.379 MPa)", () => {
    near(beamMinAs(b, d, fc, fy) / IN2, p.AsMinIn2, 0.02, "As,min");
  });

  it("shear: phi Vc within 3 % (ACI 318M 0.17 vs US 2/sqrt(psi) = 0.1654: the code's own 2.8 % unit rounding), stirrups agree", () => {
    const vu = p.VuAtDKip * KIP;
    const s = shear(vu, b, d, fc, i.fytKsi * KSI);
    near(s.phiVcKn / KIP, p.phiVcKip, 0.03, "phi Vc");
    expect(s.phiVcKn / KIP).toBeGreaterThanOrEqual(p.phiVcKip); // engine is the SI form: never below the US form
    near(0.75 * refVc(b, d, fc) / KIP, p.phiVcKip, 0.03, "reference phi Vc");
    // the minimum stirrup area governs in the example (0.0100 in2/in) and in the engine; 1 in2/in = 25.4 mm2/mm
    near(s.avPerMm, p.AvPerSMinIn2PerIn * IN, 0.03, "Av/s");
    expect(s.avPerMm).toBeGreaterThan(p.AvPerSRequiredIn2PerIn * IN * 0.9);
    // the section limit: Vs must stay under 8 sqrt(fc) b d = 111.19 kip in the example (4.4 % in SI, 0.66 vs 8/12.09)
    expect(s.capacityKn).toBeGreaterThan(p.VuAtDKip * KIP);
  });
});

describe("benchmark: StructurePoint spread footing, ACI 318-14", () => {
  const { inputs: i, printed: p } = footJson;
  const fc = i.footingFcPsi * PSI;
  const side = i.footingSideFt * 12 * IN;
  const d = i.averageEffectiveDepthIn * IN;
  const col = i.columnSideIn * IN;

  it("factored load and net pressure recompute", () => {
    near(Math.max(1.4 * i.deadKip, 1.2 * i.deadKip + 1.6 * i.liveKip), p.PuKip, 1e-9, "Pu");
    near((p.PuKip * 1000) / (i.footingSideFt * i.footingSideFt), p.factoredNetPressurePsf, 0.002, "qu");
  });

  it("punching: the independent three-term rule gives the printed 164 psi governing value (1 %: ACI 318M 0.33 vs US 4 / sqrt(psi) = 0.3315)", () => {
    const b0 = 4 * (col + d);
    near(b0 / IN, p.twoWay.boIn, 1e-9, "bo");
    const vcN = refPunchVc(b0, d, 1, 40, fc); // kN
    const phiVcPsi = (0.75 * vcN * 1000) / (b0 * d) / PSI;
    near(phiVcPsi, p.twoWay.phiVcPsiGoverning, 0.01, "phi vc");
    // each of the three terms
    const root = Math.sqrt(fc);
    near((0.75 * 0.33 * root) / PSI, p.twoWay.phiVcPsiByTerm.fourRootFc, 0.01, "4 sqrt(fc) term");
    near((0.75 * 0.17 * 3 * root) / PSI, p.twoWay.phiVcPsiByTerm.twoPlusFourOverBetaRootFc, 0.03, "2 + 4/beta term");
    near((0.75 * 0.083 * ((40 * d) / b0 + 2) * root) / PSI, p.twoWay.phiVcPsiByTerm.alphaSdOverBoPlus2RootFc, 0.03, "alpha_s d / bo + 2 term");
    // demand: Vu = qu (A - (c + d)^2)
    const qu = (p.PuKip * KIP * 1000) / (side * side);
    const vu = (p.PuKip * KIP) - (qu * (col + d) ** 2) / 1000;
    near(vu / KIP, p.twoWay.VuKip, 0.005, "Vu");
  });

  it("one-way shear capacity within 3 % (same 0.17 vs 2 unit rounding)", () => {
    near((0.75 * refVc(side, d, fc)) / KIP, p.oneWay.phiVcKip, 0.03, "phi Vc one-way");
  });

  it("flexure: engine required steel equals the printed 7.76 in2 (0.5 %)", () => {
    const qu = (p.PuKip * KIP * 1000) / (side * side); // N/mm2 x 1e3? kN/mm2 -> use N/mm
    const cant = (side - col) / 2;
    const mu = (qu * side * cant * cant) / 2 / 1e6; // kN.m
    near(mu / KIPFT, p.flexure.MuKipFt, 0.005, "Mu");
    const fl = flexure(mu, side, d, 0, fc, i.fyPsi * PSI);
    near(fl.asCalcMm2 / IN2, p.flexure.AsRequiredIn2, 0.005, "As");
    near(refAsForMoment(mu, side, d, fc, i.fyPsi * PSI) / IN2, p.flexure.AsRequiredIn2, 0.005, "reference As");
  });

  it("whole-footing design: the engine's pad is within 1 % of the example's side (3400 vs 3405 mm) and 3 % of its thickness (800 vs 813 mm, punching governs in both)", () => {
    const r = designFooting({
      serviceKn: (i.deadKip + i.liveKip) * KIP,
      serviceSeismicKn: (i.deadKip + i.liveKip) * KIP,
      puKn: p.PuKip * KIP,
      colBxMm: col,
      colByMm: col,
      position: "interior",
      allowableKpa: i.allowableBearingPsf * 0.04788026,
      fcMPa: i.footingFcPsi * 0.006894757, // 3000 psi = 20.7 MPa
    });
    near(r.sideMm, side, 0.01, "side");
    // thickness differs because the example places #8 bars (d = h - 4 in.) and the engine 16 mm bars, and the two size the self-weight differently
    // the depth loop stops at the first depth that passes, so bearing (0.998, set by the pad side) and punching (0.987) are near the limit together:
    // the governing check must be the largest reported utilisation, not whichever a rounding step favours
    const punch = r.punchVuKn / r.punchPhiVcKn;
    const checks = { bearing: r.bearingUtil, punching: punch, "one-way shear": r.oneWayVuKn / r.oneWayPhiVcKn, flexure: r.flexure.util };
    expect(r.util).toBeCloseTo(Math.max(...Object.values(checks)), 9);
    expect(checks[r.governs as keyof typeof checks]).toBeCloseTo(r.util, 9);
    expect(punch).toBeLessThanOrEqual(1);
    expect(r.bearingUtil).toBeLessThanOrEqual(1);
    near(r.depthMm, i.footingThicknessIn * IN, 0.03, "thickness");
    expect(r.util).toBeLessThanOrEqual(1);
  });
});
