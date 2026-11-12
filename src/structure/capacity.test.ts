import { describe, expect, it } from "vitest";
import { beamMn, beamMpr, beamVe, beamVeFromSteel, columnMnAt, columnSectionMn, strongColumnCheck } from "./capacity";
import { D_PRIME_MM, interaction, momentCapacityAt } from "./column";

// Hand-worked values, BNBC 2020 Part 6 Sec 8.3.5.2 and 8.3.8.1, fc 20 MPa, fy 420 MPa.
// Beam 300 x 500, effective depth 440 mm (cover 40, stirrup 10, half of 20 mm bar).

describe("beam probable and nominal moments", () => {
  it("Mpr with 1000 mm2 at 1.25 fy: a = 525000/5100 = 102.9 mm, Mpr = 525000 (440 - 51.5)/1e6 = 204.0 kN.m", () => {
    expect(beamMpr(1000, 300, 440)).toBeCloseTo(203.98, 1);
  });

  it("nominal Mn with 1000 mm2 at fy: a = 420000/5100 = 82.4 mm, Mn = 420000 (440 - 41.2)/1e6 = 167.5 kN.m", () => {
    expect(beamMn(1000, 300, 440)).toBeCloseTo(167.5, 1);
  });

  it("Mpr is larger than Mn for the same steel (1.25 fy against fy)", () => {
    expect(beamMpr(1000, 300, 440)).toBeGreaterThan(beamMn(1000, 300, 440));
  });
});

describe("eq 6.8.5 strong column / weak beam", () => {
  it("passes at a ratio of 1.25 and fails at 1.04", () => {
    expect(strongColumnCheck(300, 240).ratio).toBeCloseTo(1.25, 6);
    expect(strongColumnCheck(300, 240).ok).toBe(true);
    expect(strongColumnCheck(250, 240).ok).toBe(false);
  });

  it("a joint with no beam framing in has an infinite ratio and passes", () => {
    const r = strongColumnCheck(100, 0);
    expect(r.ratio).toBe(Infinity);
    expect(r.ok).toBe(true);
  });

  it("exactly 1.2 passes (the equation is >=)", () => {
    expect(strongColumnCheck(240, 200).ok).toBe(true);
  });
});

describe("beam design shear from probable moments, Sec 8.3.8.1 (a)", () => {
  it("Ve = (Mpr1 + Mpr2)/ln + wu ln/2: Mpr 204 each, ln 5.0 m, wu 30 kN/m gives 81.6 + 75.0 = 156.6 kN", () => {
    expect(beamVe(204, 204, 5000, 30)).toBeCloseTo(156.6, 1);
  });

  it("is never below the analysed factored shear", () => {
    expect(beamVe(10, 10, 5000, 5, 200)).toBe(200);
  });

  it("from steel: 1000 mm2 at both ends gives the same Ve as the Mpr route", () => {
    const direct = beamVe(beamMpr(1000, 300, 440), beamMpr(1000, 300, 440), 5000, 30);
    expect(beamVeFromSteel(1000, 1000, 300, 440, 5000, 30)).toBeCloseTo(direct, 6);
  });
});

describe("nominal column moment", () => {
  const sec = { bx: 400, by: 400 };
  const it400 = interaction(400, 400, 0.02, 20, 420, D_PRIME_MM);

  it("nominal is at least the design value at the same point (phi <= 1)", () => {
    for (const p of [0, 500, 1000]) {
      expect(columnMnAt(it400, p)).toBeGreaterThanOrEqual(momentCapacityAt(it400, p) - 1e-9);
    }
  });

  it("columnSectionMn returns a positive moment at zero axial load", () => {
    expect(columnSectionMn(sec, 0.02, 0)).toBeGreaterThan(0);
  });

  it("returns zero at or above the axial cap", () => {
    expect(columnMnAt(it400, it400.p0 + 100)).toBe(0);
  });
});
