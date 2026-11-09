import { describe, expect, it } from "vitest";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { BAG_M3, BOQ, boqToCsv, buildBoq, CFT_PER_M3, DEFAULT_RATE_CARD, envelopeQuantities, priceTakeoff, takeoff, type RateCard } from "./takeoff";

const S = DEFAULT_SETBACKS_MM;

function model(planId: string, storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!out.ok) throw new Error("fit");
  return out.model;
}

describe("rate card", () => {
  it("is the PWD SoR 2022 candidate card with source, date and hash shown", () => {
    expect(DEFAULT_RATE_CARD.status).toBe("candidate");
    expect(DEFAULT_RATE_CARD.currency).toBe("BDT");
    expect(DEFAULT_RATE_CARD.source.name).toMatch(/PWD Schedule of Rates 2022/);
    expect(DEFAULT_RATE_CARD.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(DEFAULT_RATE_CARD.asOf).toBe("2026-10-21");
    const keys = DEFAULT_RATE_CARD.lines.map((l) => l.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const l of DEFAULT_RATE_CARD.lines) {
      expect(l.rateBdt).toBeGreaterThanOrEqual(0);
      expect(l.label.en && l.label.bn).toBeTruthy();
    }
  });
});

describe("takeoff", () => {
  const m = model("p1-4b", 5);
  const bbs = buildBbs(analyzeStructure(m), m);
  const items = takeoff(m, bbs);
  const get = (id: string) => items.find((i) => i.id === id)!;

  it("concrete and steel are exactly the bar-schedule totals", () => {
    expect(get("concrete").quantity).toBe(bbs.totals.concreteM3);
    expect(get("steel").quantity).toBeCloseTo(bbs.totals.weightKg / 1000, 9);
  });

  it("concrete materials: dry volume 1.54 x wet split 1 : 1.5 : 3, hand check on 10 m3", () => {
    // cement 10 x 1.54 / 5.5 = 2.8 m3 = 80.64 bags; sand 4.2 m3 = 148.3 cft; stone 8.4 m3 = 296.6 cft
    const fake = { ...bbs, totals: { ...bbs.totals, concreteM3: 10 } };
    const it2 = takeoff(m, fake);
    const g = (id: string) => it2.find((i) => i.id === id)!.quantity;
    expect(g("concrete-cement")).toBeCloseTo((10 * 1.54 * (1 / 5.5)) / BAG_M3, 6);
    expect(g("concrete-cement")).toBeCloseTo(80.64, 1);
    expect(g("concrete-sand")).toBeCloseTo(4.2 * CFT_PER_M3, 1);
    expect(g("concrete-stone")).toBeCloseTo(8.4 * CFT_PER_M3, 1);
  });

  it("bricks are 500 per m3 of wall, and wall volume is positive and below the gross wall prism", () => {
    const env = envelopeQuantities(m);
    expect(get("bricks").quantity).toBeCloseTo(env.wallM3 * BOQ.bricksPerM3, 6);
    expect(env.wallM3).toBeGreaterThan(50);
    let gross = 0;
    for (const st of m.storeys) for (const w of st.geometry.walls) gross += ((w.to - w.from) * st.heightMm * w.thicknessMm) / 1e9;
    expect(env.wallM3).toBeLessThan(gross);
    // plaster is both faces of less than the gross wall area
    expect(env.plasterM2).toBeGreaterThan(0);
  });

  it("screed covers every storey plus the roof", () => {
    expect(get("screed").quantity).toBeCloseTo((m.storeys.length + 1) * m.footprintAreaM2, 6);
  });

  it("mortar cement equals the 1:4 share of brickwork + plaster + screed mortar", () => {
    const env = envelopeQuantities(m);
    const mortar = env.wallM3 * 0.25 + (env.plasterM2 * 12) / 1000 + (env.screedM2 * 50) / 1000;
    expect(get("mortar-cement").quantity).toBeCloseTo((mortar * 1.27 * (1 / 5)) / BAG_M3, 6);
    expect(get("mortar-sand").quantity).toBeCloseTo(mortar * 1.27 * (4 / 5) * CFT_PER_M3, 6);
  });

  it("more storeys give more of everything", () => {
    const m3 = model("p1-4b", 3);
    const i3 = takeoff(m3, buildBbs(analyzeStructure(m3), m3));
    for (const id of ["concrete", "steel", "bricks", "plaster", "screed"]) expect(items.find((i) => i.id === id)!.quantity).toBeGreaterThan(i3.find((i) => i.id === id)!.quantity);
  });
});

describe("pricing", () => {
  const m = model("p1-4b", 4);
  const bbs = buildBbs(analyzeStructure(m), m);

  it("amount = quantity x card rate; the total is the sum of priced lines; unpriced items are named", () => {
    const boq = buildBoq(m, bbs);
    const steel = boq.lines.find((l) => l.id === "steel")!;
    expect(steel.rateBdt).toBe(89000);
    expect(steel.amountBdt).toBeCloseTo((bbs.totals.weightKg / 1000) * 89000, 4);
    const cem = boq.lines.find((l) => l.id === "concrete-cement")!;
    expect(cem.amountBdt).toBeCloseTo(cem.quantity * 520, 6);
    expect(boq.totalBdt).toBeCloseTo(boq.lines.reduce((s, l) => s + (l.amountBdt ?? 0), 0), 4);
    expect(boq.byCategory.reduce((s, c) => s + c.amountBdt, 0)).toBeCloseTo(boq.totalBdt, 4);
    expect(boq.unpriced).toContain("concrete-stone");
    expect(boq.unpriced).not.toContain("steel");
    expect(boq.card.status).toBe("candidate");
  });

  it("a rate in another unit is not used silently", () => {
    const card: RateCard = { ...DEFAULT_RATE_CARD, lines: DEFAULT_RATE_CARD.lines.map((l) => (l.key === "rod-60g" ? { ...l, unit: "kg" } : l)) };
    const boq = priceTakeoff(takeoff(m, bbs), card);
    expect(boq.lines.find((l) => l.id === "steel")!.amountBdt).toBeNull();
    expect(boq.unpriced).toContain("steel");
  });

  it("CSV has a header, one row per item and the card and total rows", () => {
    const boq = buildBoq(m, bbs);
    const rows = boqToCsv(boq).split("\n");
    expect(rows[0]).toMatch(/^item,category,description,unit,quantity,rate_bdt,amount_bdt,basis$/);
    expect(rows.length).toBe(1 + boq.lines.length + 2);
    expect(rows.some((r) => r.startsWith("rate_card,pwd-sor-2022-civil-works"))).toBe(true);
    expect(rows[rows.length - 1]).toMatch(/excludes unpriced items: concrete-stone/);
  });
});
