import { describe, expect, it } from "vitest";
import { barsPerFace, confinementDesign } from "./confinement";

// Hand-worked expectations from BNBC 2020 Part 6 Sec 8.3.5.4 (gazette pp. 3678-3679, equations 6.8.7 and 6.8.8), fc 20 MPa, fyt 420 MPa, cover 40 mm.
// Hoop core dimension bc = b - 2 x 40 (to the outside of the hoop).

describe("bars per face", () => {
  it("splits the perimeter count by side length, corners on both faces", () => {
    expect(barsPerFace(4, 300, 300)).toEqual({ barsPerXFace: 2, barsPerYFace: 2 });
    expect(barsPerFace(8, 450, 450)).toEqual({ barsPerXFace: 3, barsPerYFace: 3 });
    expect(barsPerFace(12, 600, 300)).toEqual({ barsPerXFace: 5, barsPerYFace: 3 });
  });
});

describe("column confinement, Sec 8.3.5.4", () => {
  it("450 x 450 with 8 bars (3 per face), 16 mm bars, 3 m storey: 10 mm ties at 75 mm in the zone", () => {
    // lo = max(450, 3000/6 = 500, 450) = 500. hx = (450 - 80 - 20)/2 = 175, so cap = 100 + (350 - 175)/3 = 158 -> 150.
    // so = min(450/4 = 112, 6 x 16 = 96, 150) = 96, rounded down to 75 mm.
    // Ash req at s = 75 with bc = 370: 0.3 x 75 x 370 x (202500/136900 - 1) x 20/420 = 190 mm2 (eq 6.8.7 governs over 6.8.8 = 119 mm2).
    // Provided: closed hoop plus one cross tie each way = 3 legs x 78.5 = 236 mm2.
    const r = confinementDesign({ bxMm: 450, byMm: 450, luMm: 3000, longDiaMm: 16, barsPerXFace: 3, barsPerYFace: 3 });
    expect(r.ok).toBe(true);
    expect(r.loMm).toBe(500);
    expect(r.tieDiaMm).toBe(10);
    expect(r.endSpacingMm).toBe(75);
    expect(r.midSpacingMm).toBe(75);
    expect(r.hxMm).toBe(175);
    expect(r.crossTiesX).toBe(1);
    expect(r.crossTiesY).toBe(1);
    expect(r.asReqMm2).toBeCloseTo(190, 0);
    expect(r.asProvMm2).toBeCloseTo(3 * (Math.PI * 100) / 4, 1);
  });

  it("300 x 300 with 4 corner bars: no cross ties, so the 10 mm closed hoop cannot meet Ash at 75 mm; 12 mm at 75 mm is chosen", () => {
    // lo = max(300, 2700/6 = 450, 450) = 450. hx = 200, cap = 150, so = min(75, 96, 150) = 75.
    // Ash req at 75 mm, bc = 220: eq 6.8.7 gives 203 mm2. 10 mm legs: 2 x 78.5 = 157 (fails); 12 mm legs: 2 x 113.1 = 226 (passes).
    const r = confinementDesign({ bxMm: 300, byMm: 300, luMm: 2700, longDiaMm: 16, barsPerXFace: 2, barsPerYFace: 2 });
    expect(r.ok).toBe(true);
    expect(r.loMm).toBe(450);
    expect(r.tieDiaMm).toBe(12);
    expect(r.endSpacingMm).toBe(75);
    expect(r.crossTiesX).toBe(0);
    expect(r.asReqMm2).toBeCloseTo(202.6, 0);
  });

  it("25 mm bars: the 6 db limit (150) does not govern a 450 column, so the 1/4 width rule gives 112 -> 100 mm", () => {
    const r = confinementDesign({ bxMm: 450, byMm: 450, luMm: 3000, longDiaMm: 25, barsPerXFace: 3, barsPerYFace: 3 });
    expect(r.ok).toBe(true);
    expect(r.endSpacingMm).toBe(100);
    // Outside the zone, (f) allows min(6 db, 150) = 150 for 25 mm bars.
    expect(r.midSpacingMm).toBe(150);
  });

  it("the zone is never shorter than 450 mm nor than the largest side", () => {
    const r = confinementDesign({ bxMm: 600, byMm: 600, luMm: 1200, longDiaMm: 16, barsPerXFace: 3, barsPerYFace: 3 });
    expect(r.loMm).toBe(600);
  });
});
