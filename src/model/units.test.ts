import { describe, expect, it } from "vitest";
import { landAreaToSqm, normaliseLandUnit, sqmToLandArea, type LandUnit } from "./units";

describe("land units", () => {
  it("converts the Bangladeshi land units to square metres", () => {
    expect(landAreaToSqm(1, "katha")).toBeCloseTo(66.8902, 4);
    expect(landAreaToSqm(1, "shotok")).toBeCloseTo(40.4686, 4);
    expect(landAreaToSqm(1, "bigha")).toBeCloseTo(1337.8038, 4);
    expect(landAreaToSqm(1, "sqft")).toBeCloseTo(0.0929, 4);
    expect(landAreaToSqm(250, "sqm")).toBe(250);
  });

  it("keeps 1 bigha = 20 katha", () => {
    expect(landAreaToSqm(1, "bigha")).toBeCloseTo(landAreaToSqm(20, "katha"), 9);
  });

  it("round-trips every unit", () => {
    for (const unit of ["sqm", "sqft", "katha", "shotok", "bigha"] as LandUnit[]) {
      expect(sqmToLandArea(landAreaToSqm(3.5, unit), unit)).toBeCloseTo(3.5, 9);
    }
  });

  it("reads the v2 'decimal' spelling as shotok and rejects unknown units", () => {
    expect(normaliseLandUnit("Decimal")).toBe("shotok");
    expect(normaliseLandUnit(" katha ")).toBe("katha");
    expect(normaliseLandUnit("acre")).toBeNull();
  });
});
