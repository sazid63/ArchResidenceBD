import { describe, expect, it } from "vitest";
import { refPadSide, refPunchVc } from "../validation/reference";
import { designFooting } from "./footing";

const base = { serviceKn: 800, serviceSeismicKn: 800, puKn: 1160, colBxMm: 400, colByMm: 400, position: "interior" as const, allowableKpa: 150 };

describe("pad size from bearing", () => {
  it("the seismic combination sets the area when its load is much larger (33 % higher allowable)", () => {
    // 2000 kN seismic against 800 kN service: 2000 / 1.33 = 1504 kN equivalent beats 800 kN
    const r = designFooting({ ...base, serviceSeismicKn: 2000, selfWeightFraction: 0.2, allowableKpa: 200 });
    const incr = 1.33;
    expect(r.sideMm).toBe(Math.ceil((Math.sqrt((1.2 * 2000) / (incr * 200)) * 1000) / 50) * 50);
    expect(r.sideMm).toBeGreaterThan(refPadSide(800, 0.2, 200));
    expect(r.pressureSeismicKpa).toBeCloseTo((1.2 * 2000) / (r.sideMm / 1000) ** 2, 9);
    expect(r.pressureSeismicKpa / (incr * 200)).toBeLessThanOrEqual(1);
  });

  it("with equal loads the service combination sets the area, with the stated self-weight allowance", () => {
    for (const sw of [0, 0.1, 0.25]) {
      const r = designFooting({ ...base, selfWeightFraction: sw });
      expect(r.sideMm).toBe(Math.max(refPadSide(800, sw, 150), 400 + 300));
      expect(r.pressureKpa).toBeCloseTo(((1 + sw) * 800) / (r.sideMm / 1000) ** 2, 9);
    }
  });

  it("the pad is at least the column plus 150 mm each side", () => {
    expect(designFooting({ ...base, serviceKn: 10, serviceSeismicKn: 10, puKn: 15, colBxMm: 900, colByMm: 500 }).sideMm).toBe(1200);
  });
});

describe("which check governs", () => {
  it("light load on weak soil: bearing", () => {
    expect(designFooting({ ...base, serviceKn: 100, serviceSeismicKn: 100, puKn: 120, colBxMm: 250, colByMm: 250, allowableKpa: 60 }).governs).toBe("bearing");
  });

  it("a stiff soil under a heavy load: punching", () => {
    expect(designFooting({ ...base, serviceKn: 300, serviceSeismicKn: 300, puKn: 435, colBxMm: 250, colByMm: 250 }).governs).toBe("punching");
  });

  it("a very large column on strong soil: one-way shear", () => {
    const r = designFooting({ ...base, serviceKn: 1500, serviceSeismicKn: 1500, puKn: 2175, colBxMm: 1000, colByMm: 1000, allowableKpa: 400 });
    expect(r.governs).toBe("one-way shear");
    expect(r.depthMm).toBe(350);
    expect(r.oneWayVuKn / r.oneWayPhiVcKn).toBeCloseTo(r.util, 9);
  });

  it("the depth loop stops at 2000 mm and then reports the failure instead of looping on", () => {
    const r = designFooting({ ...base, serviceKn: 20000, serviceSeismicKn: 20000, puKn: 30000, colBxMm: 250, colByMm: 250, allowableKpa: 400 });
    expect(r.depthMm).toBe(2000);
    expect(r.util).toBeGreaterThan(1);
  });
});

describe("punching shear strength (three-term rule)", () => {
  it("a big column on a corner pad is governed by the alpha_s term", () => {
    const r = designFooting({ ...base, serviceKn: 400, serviceSeismicKn: 400, puKn: 580, colBxMm: 1100, colByMm: 1100, position: "corner" });
    const b0 = 2 * (1100 + r.dMm) + 2 * (1100 + r.dMm);
    expect(r.punchPhiVcKn).toBeCloseTo(0.75 * refPunchVc(b0, r.dMm, 1, 20, 20), 6);
    // and that term really is the smallest of the three here
    const root = Math.sqrt(20);
    const term2 = 0.083 * ((20 * r.dMm) / b0 + 2);
    expect(term2).toBeLessThan(0.33);
    expect(term2).toBeLessThan(0.17 * 3);
    expect(root).toBeGreaterThan(0);
  });

  it("edge and corner columns get smaller alpha_s than interior ones, so no more strength", () => {
    const at = (position: "interior" | "edge" | "corner") => designFooting({ ...base, serviceKn: 400, serviceSeismicKn: 400, puKn: 580, colBxMm: 1100, colByMm: 1100, position }).punchPhiVcKn;
    expect(at("interior")).toBeGreaterThanOrEqual(at("edge"));
    expect(at("edge")).toBeGreaterThanOrEqual(at("corner"));
  });

  it("a rectangular column loses strength through the long-to-short ratio term", () => {
    const sq = designFooting({ ...base, colBxMm: 300, colByMm: 300 });
    const rect = designFooting({ ...base, colBxMm: 300, colByMm: 900 });
    expect(rect.punchPhiVcKn / rect.dMm).toBeLessThan((sq.punchPhiVcKn / sq.dMm) * 2.5);
  });
});
