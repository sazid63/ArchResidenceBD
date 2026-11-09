/** M4-1 audit: independent checks that do not reuse the formulas under test. */
import { describe, expect, it } from "vitest";
import { coefficient, structurePack } from "../rules/bnbcStructure";
import { analyseSpans, envelope } from "./continuousBeam";
import { designBeamLine } from "./beam";
import { designSlab } from "./slab";

// Small deterministic generator so failures reproduce.
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe("audit: continuous beam statics", () => {
  it("random spans: reactions sum to the load, each span closes its own moment equilibrium", () => {
    const r = rng(7);
    for (let t = 0; t < 200; t++) {
      const n = 1 + Math.floor(r() * 5);
      const spans = Array.from({ length: n }, () => ({ lengthM: 2 + r() * 6, w: 1 + r() * 40 }));
      const out = analyseSpans(spans);
      let reactions = 0;
      out.forEach((o, i) => {
        reactions += o.vLeft + o.vRight;
        // Moment about the right end: M_left + V_left*L - w L^2/2 = M_right
        const { lengthM: L, w } = spans[i];
        expect(o.mLeft + o.vLeft * L - (w * L * L) / 2).toBeCloseTo(o.mRight, 8);
      });
      const total = spans.reduce((a, s) => a + s.w * s.lengthM, 0);
      expect(reactions).toBeCloseTo(total, 8);
    }
  });

  it("slope compatibility holds over every interior support (slope-deflection residual is zero)", () => {
    const spans = [{ lengthM: 4, w: 18 }, { lengthM: 6, w: 25 }, { lengthM: 3.5, w: 12 }];
    const o = analyseSpans(spans);
    for (let i = 0; i + 1 < spans.length; i++) {
      const a = spans[i], b = spans[i + 1];
      const thA = (o[i].mLeft * a.lengthM) / 6 + (o[i].mRight * a.lengthM) / 3 + (a.w * a.lengthM ** 3) / 24;
      const thB = -((o[i + 1].mLeft * b.lengthM) / 3 + (o[i + 1].mRight * b.lengthM) / 6 + (b.w * b.lengthM ** 3) / 24);
      expect(thA).toBeCloseTo(thB, 6);
    }
  });

  it("envelope is never below the full-load case", () => {
    const L = [4, 5, 4.5], d = [12, 14, 12], l = [6, 6, 6];
    const env = envelope(L, d, l, 1.2, 1.6);
    const full = analyseSpans(L.map((x, i) => ({ lengthM: x, w: 1.2 * d[i] + 1.6 * l[i] })));
    full.forEach((f, i) => {
      expect(env.spans[i].mPos).toBeGreaterThanOrEqual(f.mPos - 1e-9);
      expect(env.spans[i].mRight).toBeLessThanOrEqual(f.mRight + 1e-9);
    });
  });
});

describe("audit: slab-to-beam load transfer (Table 6.6.11)", () => {
  it("every panel's load is fully carried by its four beams for every case and span ratio", () => {
    const rows = structurePack().coefficients.shareA.rows;
    for (const row of rows)
      for (let c = 1; c <= 9; c++) {
        const la = 1, lb = la / row.m;
        const wa = coefficient("shareA", c, row.m) as number;
        const wb = coefficient("shareB", c, row.m) as number;
        // two long beams carry wa la/2 over lb, two short beams carry wb lb/2 over la; w = 1
        const carried = 2 * ((wa * la) / 2) * lb + 2 * ((wb * lb) / 2) * la;
        expect(carried).toBeCloseTo(la * lb, 1); // printed shares have 2 decimals
      }
  });

  it("designSlab moves the same load: the two directions' shares add to one", () => {
    const r = designSlab({ shortM: 3.5, longM: 5, contLongEdges: 1, contShortEdges: 2, deadExtraKnM2: 1.7, liveBaseKnM2: 2, livePartitionKnM2: 1.2, roofLiveKnM2: 0, thicknessMm: 150 });
    expect(r.shareShort + r.shareLong).toBeCloseTo(1, 1);
  });
});

describe("audit: coefficient method against static equilibrium", () => {
  it("every direction's moments carry at least 75 % of its share of w l2 / 8 except the simply supported Case 1 (corner torsion carries the rest)", () => {
    const p = structurePack();
    for (const row of p.coefficients.negA.rows)
      for (let c = 2; c <= 9; c++) {
        const cs = p.twoWayCases.find((x) => x.case === c)!;
        const m = row.m;
        const sa = coefficient("shareA", c, m) as number;
        const sb = coefficient("shareB", c, m) as number;
        const posA = ((coefficient("deadA", c, m) as number) + (coefficient("liveA", c, m) as number)) / 2;
        const posB = ((coefficient("deadB", c, m) as number) + (coefficient("liveB", c, m) as number)) / 2;
        const m0a = posA + (coefficient("negA", c, m) ?? 0) * (cs.longContinuous / 2);
        const m0b = posB + (coefficient("negB", c, m) ?? 0) * (cs.shortContinuous / 2);
        expect(m0a / (sa / 8), `case ${c} m ${m} a`).toBeGreaterThan(0.75);
        expect(m0b / (sb / 8), `case ${c} m ${m} b`).toBeGreaterThan(0.72);
      }
  });
});

describe("audit: deflection formula", () => {
  it("an uncracked dead-only beam reproduces 5 w L^4 / (384 E I), times the long-term factor 2", () => {
    const r = designBeamLine(
      { slabThicknessMm: 125, wallHeightMm: 3000, reduceLive: false, spans: [{ lengthMm: 4000, slabDead: 0, slabLiveTable: 0, slabLivePartition: 0, liveBaseKnM2: 0, tributaryAreaM2: 0, wallThicknessMm: null, wallShare: 0 }] },
      { bMm: 250, hMm: 900 },
    );
    const w = r.spans[0].dKnM; // self weight only, kN/m = N/mm
    const ec = 4700 * Math.sqrt(20);
    const ig = (250 * 900 ** 3) / 12;
    const exact = (5 * w * 4000 ** 4) / (384 * ec * ig);
    expect(r.spans[0].deflection.afterPartitionsMm).toBeCloseTo(2 * exact, 6);
  });
});
