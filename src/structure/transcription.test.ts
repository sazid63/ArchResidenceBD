/**
 * Consistency checks on spec/rules/bnbc-2020-structure.yaml. The digits themselves were compared with the gazette
 * page text in cell order when the pack was transcribed (the PDF is not in the repository); these tests catch the
 * slips a later edit could introduce.
 */
import { describe, expect, it } from "vitest";
import { coefficient, structurePack, twoWayCase, type CoefficientKey } from "../rules/bnbcStructure";

const p = structurePack();
const KEYS: CoefficientKey[] = ["negA", "negB", "deadA", "deadB", "liveA", "liveB", "shareA", "shareB"];

describe("BNBC structure pack", () => {
  it("is a candidate pack with citations on every table", () => {
    expect(p.id).toBe("bnbc-structure@2020.1");
    expect(p.status).toBe("candidate");
    for (const k of KEYS) expect(p.citations[p.coefficients[k].cite]).toBeDefined();
  });

  it("has 11 rows (m = 1.00 to 0.50 by 0.05) of 9 cases in every table", () => {
    for (const k of KEYS) {
      const rows = p.coefficients[k].rows;
      expect(rows.map((r) => r.m)).toEqual([1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]);
      for (const r of rows) expect(r.v).toHaveLength(9);
    }
  });

  it("Table 6.6.11: w_a + w_b = 1 in every cell (printed to 2 decimals)", () => {
    p.coefficients.shareA.rows.forEach((r, i) =>
      r.v.forEach((a, c) => expect((a as number) + (p.coefficients.shareB.rows[i].v[c] as number)).toBeCloseTo(1, 1)),
    );
  });

  it("positive-moment coefficients fall with m in the b direction and rise in the a direction", () => {
    for (const k of ["deadA", "liveA"] as const)
      for (let c = 0; c < 9; c++) {
        const col = p.coefficients[k].rows.map((r) => r.v[c] as number);
        for (let i = 1; i < col.length; i++) expect(col[i]).toBeGreaterThanOrEqual(col[i - 1] - 1e-12);
      }
    for (const k of ["deadB", "liveB"] as const)
      for (let c = 0; c < 9; c++) {
        const col = p.coefficients[k].rows.map((r) => r.v[c] as number);
        for (let i = 1; i < col.length; i++) expect(col[i]).toBeLessThanOrEqual(col[i - 1] + 1e-12);
      }
  });

  it("mirror-image cases agree at m = 1 (3 and 5, 6 and 7, 8 and 9 swap the a and b directions)", () => {
    const at = (k: CoefficientKey, c: number) => coefficient(k, c, 1) as number;
    for (const [x, y] of [[3, 5], [6, 7], [8, 9]]) {
      for (const [ka, kb] of [["deadA", "deadB"], ["liveA", "liveB"], ["shareA", "shareB"]] as const) {
        expect(at(ka, x)).toBeCloseTo(at(kb, y), 10);
        expect(at(kb, x)).toBeCloseTo(at(ka, y), 10);
      }
      // negatives are printed to match within one unit in the third decimal (0.076 against 0.075 for 3 and 5)
      expect(Math.abs((at("negB", x) ?? 0) - (at("negA", y) ?? 0))).toBeLessThanOrEqual(0.0011);
    }
  });

  it("blank negative cells: none for case 1, a-direction blank for cases 3 and 7, b-direction blank for 5 and 6", () => {
    expect(coefficient("negA", 1, 1)).toBeNull();
    expect(coefficient("negB", 1, 1)).toBeNull();
    expect(coefficient("negA", 3, 1)).toBeNull();
    expect(coefficient("negA", 7, 1)).toBeNull();
    expect(coefficient("negB", 5, 1)).toBeNull();
    expect(coefficient("negB", 6, 1)).toBeNull();
  });

  it("edge-continuity mapping gives each case once", () => {
    const got = [[0, 0], [2, 2], [2, 0], [1, 1], [0, 2], [0, 1], [1, 0], [2, 1], [1, 2]].map(([s, l]) => twoWayCase(s, l));
    expect(got).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("hand-read values: Case 2 at m = 1.00 is 0.045 / 0.045 negative, 0.018 dead, 0.027 live; 0.925 interpolates between rows", () => {
    expect(coefficient("negA", 2, 1)).toBe(0.045);
    expect(coefficient("negB", 2, 1)).toBe(0.045);
    expect(coefficient("deadA", 2, 1)).toBe(0.018);
    expect(coefficient("liveA", 2, 1)).toBe(0.027);
    // midway between m = 0.95 (0.050) and m = 0.90 (0.055)
    expect(coefficient("negA", 2, 0.925)).toBeCloseTo(0.0525, 10);
    // outside the table the nearest row is used
    expect(coefficient("negA", 2, 0.4)).toBe(0.086);
  });

  it("dead-load values come from Table 6.2.1 and 6.2.2", () => {
    expect(p.unitWeights.brick).toBe(18.9);
    expect(p.unitWeights.concreteStoneUnreinforced).toBe(22.8);
    expect(p.unitWeights.reinforcementAddKnM3PerPercent).toBe(0.63);
    expect(p.constructionWeights.concreteSlabStone.per100mmKnM2).toBe(2.36);
    expect(p.constructionWeights.brickMasonryBurntClayPer100mm).toBe(1.91);
    expect(p.constructionWeights.cementPlasterPer10mm).toBe(0.23);
  });
});
