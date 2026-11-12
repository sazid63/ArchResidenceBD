import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs, foundationEarthwork } from "../structure/bbs";
import { buildBoq, envelopeQuantities, takeoff } from "./takeoff";

const build = (storeys: number, planId = "p2-2b-fb") => {
  const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys, planId });
  if (!b.ok) throw new Error("fit");
  const res = analyzeStructure(b.model);
  return { model: b.model, bbs: buildBbs(res, b.model) };
};

describe("foundation earthwork, hand values", () => {
  // One 2000 x 2000 x 500 footing, one 400 x 400 column stub 1050 deep.
  const res = {
    foundation: { footings: [{ x0: 0, x1: 2000, y0: 0, y1: 2000, depthMm: 500 }] },
    frame: { columns: [{ storeys: [{ section: { bx: 400, by: 400 } }] }] },
  } as never;

  it("pit = (2.0 + 0.6)^2 x (1.05 + 0.5 + 0.075) = 10.985 m3", () => {
    expect(foundationEarthwork(res).excavationM3).toBeCloseTo(2.6 * 2.6 * 1.625, 9);
  });

  it("lean concrete = (2.0 + 0.2)^2 x 0.075 = 0.363 m3", () => {
    expect(foundationEarthwork(res).leanConcreteM3).toBeCloseTo(2.2 * 2.2 * 0.075, 9);
  });

  it("backfill = pit - footing (2.0 m3) - stub (0.168 m3) - lean (0.363 m3) = 8.454 m3", () => {
    expect(foundationEarthwork(res).backfillM3).toBeCloseTo(10.985 - 2 - 0.168 - 0.363, 3);
  });
});

describe("BOQ completeness lines", () => {
  it("earthwork, finishes, doors, windows and the lift are in the takeoff with quantities only", () => {
    const { model, bbs } = build(8);
    const items = takeoff(model, bbs);
    for (const id of ["excavation", "backfill", "lean-concrete", "floor-finish", "paint", "roof-waterproofing", "doors", "windows", "lift"]) {
      const it = items.find((i) => i.id === id);
      expect(it, id).toBeDefined();
      expect(it!.quantity).toBeGreaterThan(0);
      expect(it!.rateKey).toBeUndefined();
    }
  });

  it("floor finish = screed less the roof; paint = plaster + floor area; waterproofing = roof + 0.3 m x perimeter", () => {
    const { model, bbs } = build(4);
    const env = envelopeQuantities(model);
    const q = (id: string) => takeoff(model, bbs).find((i) => i.id === id)!.quantity;
    expect(q("floor-finish")).toBeCloseTo(env.screedM2 - env.roofM2, 9);
    expect(q("paint")).toBeCloseTo(env.plasterM2 + (env.screedM2 - env.roofM2), 9);
    expect(q("roof-waterproofing")).toBeCloseTo(env.roofM2 + env.roofPerimeterM * 0.3, 9);
  });

  it("doors and windows are counted from the plan openings", () => {
    const { model } = build(4);
    const env = envelopeQuantities(model);
    const want = (k: "doors" | "windows") => model.storeys.reduce((a, s) => a + s.geometry[k].length, 0);
    expect(env.doorsNr).toBe(want("doors"));
    expect(env.windowsNr).toBe(want("windows"));
  });

  it("the lift line counts the lifts the plan provides and is absent when the plan has none", async () => {
    const { liftCore } = await import("../model/lift");
    for (const storeys of [2, 8]) {
      const { model, bbs } = build(storeys);
      const lc = liftCore(model);
      const line = takeoff(model, bbs).find((i) => i.id === "lift");
      if (lc) expect(line!.quantity).toBe(lc.spec.liftsProvided);
      else expect(line).toBeUndefined();
    }
  });

  it("the new lines do not change the priced total (they have no rate)", () => {
    const { model, bbs } = build(4);
    const boq = buildBoq(model, bbs);
    const quantityOnly = boq.lines.filter((l) => ["excavation", "backfill", "lean-concrete", "floor-finish", "paint", "roof-waterproofing", "doors", "windows"].includes(l.id));
    expect(quantityOnly.every((l) => l.amountBdt === null)).toBe(true);
    expect(boq.unpriced.some((id) => quantityOnly.some((l) => l.id === id))).toBe(false);
  });
});

describe("labour and machine lines from output norms", () => {
  it("mason days follow the norms: 1 m3 of wall, 9 m2 plaster, 12 m2 screed, 6 m2 tiles a day", () => {
    const { model, bbs } = build(4);
    const env = envelopeQuantities(model);
    const items = takeoff(model, bbs);
    const q = (id: string) => items.find((i) => i.id === id)!.quantity;
    const floors = env.screedM2 - env.roofM2;
    expect(q("labour-mason-brick")).toBeCloseTo(env.wallM3 / 1, 9);
    expect(q("labour-mason-plaster")).toBeCloseTo(env.plasterM2 / 9, 9);
    expect(q("labour-mason-screed")).toBeCloseTo(env.screedM2 / 12, 9);
    expect(q("labour-mason-tiles")).toBeCloseTo(floors / 6, 9);
    expect(q("labour-painter")).toBeCloseTo((env.plasterM2 + floors) / 15, 9);
    expect(q("labour-helper-finishes")).toBeCloseTo(q("labour-mason-plaster") + q("labour-mason-screed") + q("labour-mason-tiles"), 9);
  });

  it("concrete machine days: 8 m3 a day for the mixer and operator, 10 m3 a day for the vibrator", () => {
    const { model, bbs } = build(4);
    const items = takeoff(model, bbs);
    const conc = items.find((i) => i.id === "concrete")!.quantity;
    expect(items.find((i) => i.id === "mixer-days")!.quantity).toBeCloseTo(conc / 8, 9);
    expect(items.find((i) => i.id === "operator-days")!.quantity).toBeCloseTo(conc / 8, 9);
    expect(items.find((i) => i.id === "vibrator-days")!.quantity).toBeCloseTo(conc / 10, 9);
  });

  it("masons, mixer, operator and vibrator are priced from the day rates; helpers, painters and diggers are quantities only", () => {
    const { model, bbs } = build(4);
    const boq = buildBoq(model, bbs);
    const line = (id: string) => boq.lines.find((l) => l.id === id)!;
    expect(line("labour-mason-brick").rateBdt).toBe(700);
    expect(line("mixer-days").rateBdt).toBe(1200);
    expect(line("operator-days").rateBdt).toBe(700);
    expect(line("vibrator-days").rateBdt).toBe(550);
    expect(line("labour-mason-brick").amountBdt).toBeCloseTo(line("labour-mason-brick").quantity * 700, 6);
    for (const id of ["labour-helper-brick", "labour-helper-finishes", "labour-painter", "labour-excavation"]) expect(line(id).amountBdt).toBeNull();
    expect(boq.unpriced.some((id) => id.startsWith("labour"))).toBe(false);
  });
});
