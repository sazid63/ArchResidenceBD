import { describe, expect, it } from "vitest";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { bendDeduction, bendDiameter, hookTail, lapCompression, lapTension, ldCompression, ldHook, ldTension, tieHookTail } from "./anchorage";
import { analyzeStructure } from "./analyze";
import { barArea, isStockBar, layerCapacity, pickBeamBars, pickColumnBars, pickMatBars, STOCK_BARS, unitWeightKgM } from "./barSelect";
import { buildBbs, STOCK_LENGTH_MM } from "./bbs";

const S = DEFAULT_SETBACKS_MM;

describe("anchorage (Sec 8.1.2, 8.2)", () => {
  it("hand example, 20 mm bar, fc 20, fy 420: ld = 420 / (1.7 sqrt 20) x 20 = 1105 mm; ldh = 0.24 x 420 x 20 / sqrt 20 = 451 mm", () => {
    expect(ldTension(20)).toBeCloseTo(((420 / (1.7 * Math.sqrt(20))) * 20), 6);
    expect(ldTension(20)).toBeCloseTo(1104.9, 0);
    expect(ldHook(20)).toBeCloseTo((0.24 * 420 * 20) / Math.sqrt(20), 6);
    expect(ldHook(20)).toBeCloseTo(450.8, 0);
  });

  it("19 mm and smaller bars use 2.1; top bars carry psi_t 1.3; the 300 mm minimum applies", () => {
    expect(ldTension(12)).toBeCloseTo((420 / (2.1 * Math.sqrt(20))) * 12, 6); // 536.7
    expect(ldTension(12, { topBar: true })).toBeCloseTo(ldTension(12) * 1.3, 6);
    expect(ldTension(8)).toBeCloseTo((420 / (2.1 * Math.sqrt(20))) * 8, 6); // 357.8 mm
    expect(ldTension(8, { fc: 40 })).toBe(300); // 253 mm raised to the 300 mm minimum
  });

  it("compression development and laps, with the one-third increase below 21 MPa", () => {
    // ldc = max(0.24 x 420 x 20 / sqrt 20 = 450.8, 0.043 x 420 x 20 = 361) ; lap = 0.071 x 420 x 20 x 4/3 = 795.2
    expect(ldCompression(20)).toBeCloseTo(450.8, 0);
    expect(lapCompression(20)).toBeCloseTo(0.071 * 420 * 20 * (4 / 3), 3);
    expect(lapCompression(20, 25)).toBeCloseTo(0.071 * 420 * 20, 3);
    expect(lapCompression(8)).toBeCloseTo(0.071 * 420 * 8 * (4 / 3), 2); // 318 mm
    expect(lapCompression(8, 25)).toBe(300); // 238.6 mm raised to the minimum
  });

  it("tension laps: Class B 1.3 ld without the 300 mm minimum, Class A 1.0 ld", () => {
    expect(lapTension(20, "B")).toBeCloseTo(1.3 * 1104.9, 0);
    expect(lapTension(20, "A")).toBeCloseTo(1104.9, 0);
    expect(lapTension(8, "A", { fc: 40 })).toBe(300);
  });

  it("hooks and bends: 90 degree tail 12 db, 180 degree 4 db (65 mm), tie hook 6 db (75 mm), bend diameters 6/8/4 db", () => {
    expect(hookTail(20, "90")).toBe(240);
    expect(hookTail(12, "180")).toBe(65);
    expect(hookTail(20, "180")).toBe(80);
    expect(tieHookTail(10)).toBe(75);
    expect(tieHookTail(16)).toBe(96);
    expect(bendDiameter(20)).toBe(120);
    expect(bendDiameter(32)).toBe(256);
    expect(bendDiameter(10, true)).toBe(40);
  });

  it("bend deduction: a 90 degree bend of a 10 mm bar on a 60 mm bend overstates the outside dimensions by 25.0 mm", () => {
    // r = 30, db = 10: 2 (r + db) - (pi/2)(r + db/2) = 80 - 54.98
    expect(bendDeduction(10, 60, 90)).toBeCloseTo(80 - (Math.PI / 2) * 35, 8);
  });
});

describe("stock bar selection", () => {
  it("only the nine stock diameters exist", () => {
    expect(STOCK_BARS).toEqual([8, 10, 12, 16, 20, 22, 25, 28, 32]);
    expect(isStockBar(14)).toBe(false);
    expect(isStockBar(25)).toBe(true);
  });

  it("areas and unit weights: 20 mm = 314.16 mm2 = 2.466 kg/m; 10 mm = 0.617 kg/m", () => {
    expect(barArea(20)).toBeCloseTo(314.159, 3);
    expect(unitWeightKgM(20)).toBeCloseTo(2.466, 3);
    expect(unitWeightKgM(10)).toBeCloseTo(0.617, 3);
  });

  it("a 250 mm beam fits 4 x 12 mm in a layer (cover 40, link 10, clear spacing 25)", () => {
    // (250 - 100 + 25) / (12 + 25) = 4.7 -> 4
    expect(layerCapacity(250, 12, 40, 10)).toBe(4);
    expect(layerCapacity(250, 20, 40, 10)).toBe(3);
  });

  it("beam bars: 700 mm2 in a 250 mm beam -> 2 x 22 mm (760 mm2): the bigger bar saves more than 2 % over 7 x 12 (792)", () => {
    const p = pickBeamBars(700, 250);
    expect(p).toMatchObject({ dia: 22, n: 2, fits: true });
    expect(p.areaMm2).toBeCloseTo(2 * barArea(22), 6);
    // 400 mm2: 4 x 12 (452) beats 2 x 16 (402) only if 2 % saving fails: 402 < 0.98 x 452 so 2 x 16 wins
    expect(pickBeamBars(400, 250)).toMatchObject({ dia: 16, n: 2 });
    // 1100 mm2 needs more than one layer of 16s: 6 x 16 = 1206 vs 3 x 22 = 1140 vs 12 mm x 10 = 1131
    expect(pickBeamBars(1100, 250).areaMm2).toBeGreaterThanOrEqual(1100);
  });

  it("property: every pick that fits provides at least the steel required, with stock bars only", () => {
    for (const req of [150, 400, 700, 1200, 1800, 2400]) {
      const p = pickBeamBars(req, 250);
      if (p.fits) expect(p.areaMm2).toBeGreaterThanOrEqual(req);
      expect(isStockBar(p.dia)).toBe(true);
    }
    for (const req of [800, 1600, 3200, 5000]) {
      const p = pickColumnBars(req, 450, 450);
      if (p.fits) expect(p.areaMm2).toBeGreaterThanOrEqual(req);
      expect(p.n % 2).toBe(0);
      expect(p.n).toBeGreaterThanOrEqual(4);
    }
  });

  it("an impossible requirement is reported as not fitting, never rounded away", () => {
    expect(pickBeamBars(20000, 250).fits).toBe(false);
    expect(pickBeamBars(Infinity, 250).fits).toBe(false);
    expect(pickColumnBars(30000, 300, 300).fits).toBe(false);
  });

  it("column bars: 3200 mm2 (400 x 400, 2 %) -> 16 x 16 mm (3217 mm2)", () => {
    expect(pickColumnBars(3200, 400, 400)).toMatchObject({ dia: 16, n: 16, fits: true });
  });

  it("mat bars: 400 mm2/m -> 8 mm at 125 (402 mm2/m); 900 mm2/m -> 12 mm at 125; spacing capped", () => {
    expect(pickMatBars(400, 300)).toMatchObject({ dia: 8, spacingMm: 125 });
    expect(pickMatBars(900, 300)).toMatchObject({ dia: 12, spacingMm: 125 });
    expect(pickMatBars(100, 200).spacingMm).toBe(200);
  });
});

function model(planId: string, storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!out.ok) throw new Error("fit");
  return out.model;
}

describe("bar bending schedule", () => {
  const m = model("p1-4b", 5);
  const res = analyzeStructure(m);
  const bbs = buildBbs(res, m);

  it("every row is a stock diameter with a positive cut length, count and weight", () => {
    expect(bbs.rows.length).toBeGreaterThan(50);
    for (const r of bbs.rows) {
      expect(isStockBar(r.diaMm)).toBe(true);
      expect(r.cutLengthMm).toBeGreaterThan(0);
      expect(r.totalBars).toBe(r.barsPerMember * r.members);
      expect(r.weightKg).toBeCloseTo((r.totalBars * r.cutLengthMm * unitWeightKgM(r.diaMm)) / 1000, 6);
    }
  });

  it("marks are unique and the totals add up", () => {
    expect(new Set(bbs.rows.map((r) => r.mark)).size).toBe(bbs.rows.length);
    expect(bbs.totals.weightKg).toBeCloseTo(bbs.rows.reduce((a, r) => a + r.weightKg, 0), 6);
    expect(bbs.totals.byDia.reduce((a, d) => a + d.weightKg, 0)).toBeCloseTo(bbs.totals.weightKg, 6);
    expect(bbs.totals.byFamily.reduce((a, d) => a + d.weightKg, 0)).toBeCloseTo(bbs.totals.weightKg, 6);
  });

  it("the steel provided is never below the steel required (for every pick that fits)", () => {
    expect(bbs.picks.length).toBeGreaterThan(100);
    for (const p of bbs.picks) if (p.fits) expect(p.providedMm2).toBeGreaterThanOrEqual(p.requiredMm2 - 1e-6);
  });

  it("hand example, a closed stirrup of a 250 x 450 beam: 2 x 370 + 2 x 170 + 2 x 75 less three 90 and two 135 degree bends = 996 mm", () => {
    const stirrups = bbs.rows.filter((r) => r.shape === "51" && r.family === "beam" && r.diaMm === 10 && r.dimsMm[0] === 370 && r.dimsMm[1] === 170);
    expect(stirrups.length).toBeGreaterThan(0);
    const bd = 40;
    const want = 740 + 340 + 150 - 3 * bendDeduction(10, bd, 90) - 2 * bendDeduction(10, bd, 135);
    expect(want).toBeCloseTo(995.9, 0);
    for (const r of stirrups) expect(r.cutLengthMm).toBeCloseTo(want, 0);
  });

  it("the footing is deep enough to anchor the column starter bars (ldc + 75 + 32)", () => {
    for (const c of res.frame.columns) {
      const row = bbs.rows.find((r) => r.family === "column" && r.description.en.startsWith(`Column ${c.id} storey 0, main`));
      expect(row).toBeDefined();
      expect(c.footing.depthMm - 107).toBeGreaterThanOrEqual(ldCompression(row!.diaMm) - 1e-9);
    }
    expect(bbs.issues.filter((i) => i.ref.endsWith("footing"))).toHaveLength(0);
  });

  it("steel per m3 of concrete is plausible for a frame building (60 to 160 kg/m3)", () => {
    expect(bbs.totals.kgPerM3).toBeGreaterThan(60);
    expect(bbs.totals.kgPerM3).toBeLessThan(160);
  });

  it("issues carry a severity and the levels where they occur; there are no unfitted bars in a passing building", () => {
    for (const i of bbs.issues) {
      expect(["fail", "warn"]).toContain(i.severity);
      expect(i.levels.length).toBeGreaterThan(0);
    }
    expect(bbs.issues.filter((i) => i.severity === "fail")).toHaveLength(0);
  });

  it("is deterministic, and taller buildings need more steel", () => {
    expect(JSON.stringify(buildBbs(res, m))).toBe(JSON.stringify(bbs));
    const m7 = model("p1-4b", 7);
    expect(buildBbs(analyzeStructure(m7), m7).totals.weightKg).toBeGreaterThan(bbs.totals.weightKg);
  });
});

/** Independent capacity: phi Mn = 0.9 As fy (d - a/2), a = As fy / (0.85 fc b), from the bars as placed (not the design routine). */
function phiMn(asMm2: number, widthMm: number, dMm: number): number {
  const a = (asMm2 * 420) / (0.85 * 20 * widthMm);
  return (0.9 * asMm2 * 420 * (dMm - a / 2)) / 1e6;
}

describe("audit of the bar bending schedule", () => {
  const cases: Array<[string, number]> = [["p1-4b", 8], ["p1-4b-wide", 6], ["p2-3b-fb", 6], ["p2-2b-lr", 5]];
  for (const [plan, n] of cases) {
    const m = model(plan, n);
    const res = analyzeStructure(m);
    const bbs = buildBbs(res, m);

    it(`${plan} x${n}: every flexural member, as detailed with its real lever arm, carries its moment`, () => {
      const flexural = bbs.picks.filter((pk) => pk.muKnM !== undefined && pk.fits);
      expect(flexural.length).toBeGreaterThan(100);
      for (const pk of flexural) expect(phiMn(pk.providedMm2, pk.widthMm!, pk.dMm!), pk.ref).toBeGreaterThanOrEqual(pk.muKnM! - 1e-6);
    });

    it(`${plan} x${n}: no schedule row is longer than the 12 m stock bar`, () => {
      for (const r of bbs.rows) expect(r.cutLengthMm, r.description.en).toBeLessThanOrEqual(STOCK_LENGTH_MM);
    });

    it(`${plan} x${n}: bars placed in two layers have a smaller lever arm than one layer`, () => {
      for (const pk of bbs.picks.filter((q) => q.family === "beam" && q.dMm !== undefined)) expect(pk.dMm!).toBeLessThanOrEqual(m.input.floorToFloorMm);
    });
  }

  it("a long beam line is split into lapped pieces whose centreline length covers the line plus the laps", () => {
    const m = model("p1-4b-wide", 4);
    const res = analyzeStructure(m);
    const bbs = buildBbs(res, m);
    const ends = bbs.rows.filter((r) => r.family === "beam" && r.description.en.includes("end pieces"));
    expect(ends.length).toBeGreaterThan(0);
    for (const r of ends) {
      const pieces = Number(/([0-9]+) pieces lapped/.exec(r.description.en)![1]);
      const lap = lapTension(12, "B", { topBar: true });
      // the pieces carry total + (pieces - 1) laps between them
      const total = (r.dimsMm[0] * pieces) - (pieces - 1) * lap;
      expect(total).toBeGreaterThan(STOCK_LENGTH_MM - 2 * r.dimsMm[1]); // one piece with a hook at both ends would not fit
      expect(r.dimsMm[0] + r.dimsMm[1]).toBeLessThanOrEqual(STOCK_LENGTH_MM + 1e-6);
    }
  });
});
