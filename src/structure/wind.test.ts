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
