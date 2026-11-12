import { describe, expect, it } from "vitest";
import { bearing, designFooting } from "./footing";
import { planTies } from "./foundation";

// Hand values: square pad B = 2 m, A = 4 m2, P = 1000 kN; kern B/6 = 0.333 m.
describe("bearing pressure with base moments", () => {
  it("uniform pressure with no moment: P/A", () => {
    const q = bearing(2000, 1000, 0, 0);
    expect(q.qMax).toBeCloseTo(250, 9);
    expect(q.qMin).toBeCloseTo(250, 9);
  });

  it("inside the middle third: linear, qmax = P/A + 6M/B^3 = 250 + 75 at M = 100 kN.m", () => {
    const q = bearing(2000, 1000, 100, 0);
    expect(q.qMax).toBeCloseTo(325, 9);
    expect(q.qMin).toBeCloseTo(175, 9);
  });

  it("beyond the middle third: triangular, qmax = 2P/(3B(B/2 - e)) = 555.6 at M = 400 kN.m, qmin = 0", () => {
    const q = bearing(2000, 1000, 400, 0);
    expect(q.qMax).toBeCloseTo(2000 / 3.6, 6);
    expect(q.qMin).toBe(0);
  });
});

describe("designFooting with base moments", () => {
  const base = { serviceKn: 800, serviceSeismicKn: 800, puKn: 1200, colBxMm: 450, colByMm: 450, position: "interior" as const, allowableKpa: 150 };

  it("a base moment makes the pad larger than the same pad without it", () => {
    const plain = designFooting(base);
    const withM = designFooting({ ...base, momentXKnM: 300, momentYKnM: 0 });
    expect(withM.sideMm).toBeGreaterThanOrEqual(plain.sideMm);
    expect(withM.bearingUtil).toBeLessThanOrEqual(1);
    expect(withM.qMinKpa).toBeGreaterThanOrEqual(0);
  });

  it("the design passes bearing and reports the service corner pressures", () => {
    const r = designFooting({ ...base, momentXKnM: 300, momentYKnM: 120 });
    expect(r.util).toBeLessThanOrEqual(1);
    expect(r.qMaxKpa).toBeGreaterThan(r.qMinKpa);
  });
});

describe("tie beams between neighbouring columns", () => {
  const col = (id: string, ix: number, iy: number, puKn: number) => ({ id, ix, iy, footing: { puKn } }) as never;

  it("tie force 10 % of the larger column load; steel from Tu / (0.9 fy); bars picked to carry it", () => {
    const ties = planTies([col("A", 0, 0, 1000), col("B", 1, 0, 600), col("C", 0, 1, 500)]);
    const ab = ties.find((t) => t.a === "A" && t.b === "B")!;
    expect(ab.forceKn).toBeCloseTo(100, 9);
    expect(ab.asReqMm2).toBeCloseTo((100 * 1000) / (0.9 * 420), 6);
    expect(ab.fits).toBe(true);
    expect(ab.asProvMm2).toBeGreaterThanOrEqual(ab.asReqMm2);
    expect(ab.util).toBeLessThanOrEqual(1);
  });

  it("only neighbours on a grid line are tied (no diagonals)", () => {
    const ties = planTies([col("A", 0, 0, 1000), col("D", 1, 1, 1000)]);
    expect(ties).toHaveLength(0);
  });
});
