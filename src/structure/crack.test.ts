import { describe, expect, it } from "vitest";
import { pickBeamBars } from "./barSelect";
import { barCentreSpacingMm, crackControlSpacingMm, needsSkinSteel } from "./section";

describe("beam crack control and skin steel (common practice)", () => {
  it("limit at fy 420, cover 40: fs = 280, s <= min(380 - 100, 300) = 280 mm", () => {
    expect(crackControlSpacingMm(40, 420)).toBeCloseTo(280, 9);
  });

  it("centre spacing of 3 x 20 mm in a 300 mm beam with 40 cover and 10 links: (300 - 100 - 20) / 2 = 90 mm", () => {
    expect(barCentreSpacingMm(300, 3, 20)).toBeCloseTo(90, 9);
    expect(barCentreSpacingMm(300, 1, 20)).toBe(Infinity);
  });

  it("every bar arrangement the picker gives for beam widths 250 to 400 mm meets the limit", () => {
    for (const b of [250, 300, 350, 400]) {
      for (let as = 300; as <= 4000; as += 100) {
        const p = pickBeamBars(as, b);
        if (!p.fits) continue;
        const perLayer = Math.ceil(p.n / p.layers);
        expect(barCentreSpacingMm(b, perLayer, p.dia)).toBeLessThanOrEqual(crackControlSpacingMm(40, 420) + 1e-9);
      }
    }
  });

  it("skin steel is needed above 750 mm of depth", () => {
    expect(needsSkinSteel(750)).toBe(false);
    expect(needsSkinSteel(751)).toBe(true);
  });
});
