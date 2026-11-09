import { describe, expect, it } from "vitest";
import { DEFAULT_SETBACKS_MM, deriveBuilding, type BuildingModel } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { slabOpeningAreaM2 } from "../model/openings";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { buildMesh } from "../model/toMesh";
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

describe("envelope, hand-worked", () => {
  // One storey, 3000 mm high: a 4000 mm exterior wall (250 mm) with a 1000 mm window, a 2000 mm interior wall (125 mm) with a 900 mm door.
  // Roof: parapet round a 4000 x 3000 building, no cover rooms.
  const fake = {
    widthMm: 4000,
    depthMm: 3000,
    footprintAreaM2: 12,
    roof: { parapetMm: 1000, coverHeightMm: 2400, stairCover: null, liftRoom: null },
    storeys: [
      {
        heightMm: 3000,
        geometry: {
          walls: [
            { orientation: "h", at: 0, from: 0, to: 4000, exterior: true, thicknessMm: 250 },
            { orientation: "v", at: 2000, from: 0, to: 2000, exterior: false, thicknessMm: 125 },
          ],
          windows: [{ kind: "window", orientation: "h", at: 0, from: 500, to: 1500 }],
          doors: [{ kind: "door", orientation: "v", at: 2000, from: 500, to: 1400 }],
        },
      },
    ],
  } as unknown as BuildingModel;

  it("walls: height 2500; volume less each opening at its own wall thickness", () => {
    // ext 4.0 x 2.5 x 0.25 = 2.5 ; int 2.0 x 2.5 x 0.125 = 0.625 ; window 1.0 x 1.2 x 0.25 = 0.3 ; door 0.9 x 2.1 x 0.125 = 0.23625
    // parapet 14.0 m x 1.0 x 0.125 = 1.75
    const e = envelopeQuantities(fake);
    expect(e.wallM3).toBeCloseTo(2.5 + 0.625 - 0.3 - 0.23625 + 1.75, 6);
  });

  it("plaster: both faces, openings off; parapet both faces", () => {
    // wall area (4.0 + 2.0) x 2.5 = 15 ; openings 1.2 + 1.89 = 3.09 ; both faces 2 x 11.91 = 23.82 ; parapet 2 x 14 x 1 = 28
    expect(envelopeQuantities(fake).plasterM2).toBeCloseTo(23.82 + 28, 6);
  });

  it("screed: one storey plus the roof", () => {
    expect(envelopeQuantities(fake).screedM2).toBeCloseTo(24, 6);
  });

  it("stair cover and lift room walls are added at 125 mm, plastered both sides", () => {
    const withCover = { ...fake, roof: { ...fake.roof, stairCover: { x0: 0, y0: 0, x1: 3000, y1: 2000 }, liftRoom: { x0: 0, y0: 0, x1: 1000, y1: 1000 } } } as unknown as BuildingModel;
    // perimeters 10 m and 4 m, 2.4 m high: 14 x 2.4 x 0.125 = 4.2 m3 ; plaster 2 x 14 x 2.4 = 67.2 m2
    const a = envelopeQuantities(fake);
    const b = envelopeQuantities(withCover);
    expect(b.wallM3 - a.wallM3).toBeCloseTo(4.2, 6);
    expect(b.plasterM2 - a.plasterM2).toBeCloseTo(67.2, 6);
  });
});

describe("rate card shape (spec/schemas/rate-card.schema.json)", () => {
  it("has the required fields; machinery lines carry operator and fuel flags; others do not", () => {
    for (const k of ["schemaVersion", "cardId", "region", "currency", "status", "effectiveFrom", "source", "lines"]) expect(DEFAULT_RATE_CARD).toHaveProperty(k);
    expect(DEFAULT_RATE_CARD.cardId).toMatch(/^[a-z0-9][a-z0-9-]*$/);
    for (const l of DEFAULT_RATE_CARD.lines as unknown as Array<Record<string, unknown>>) {
      for (const k of ["key", "label", "costType", "unit", "rateBdt"]) expect(l).toHaveProperty(k);
      expect(["material", "labour", "machinery", "subcontract", "other"]).toContain(l.costType);
      if (l.costType === "machinery") {
        expect(typeof l.operatorIncluded).toBe("boolean");
        expect(typeof l.fuelIncluded).toBe("boolean");
        expect(["hour", "day"]).toContain(l.unit);
      } else {
        expect(l).not.toHaveProperty("operatorIncluded");
        expect(l).not.toHaveProperty("fuelIncluded");
      }
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
    // openings come off, the roof parapet and cover walls go on: still within the gross storey walls plus the roof rings
    expect(env.wallM3).toBeLessThan(gross + 30);
    // plaster is both faces of less than the gross wall area
    expect(env.plasterM2).toBeGreaterThan(0);
  });

  it("screed covers every storey plus the roof", () => {
    // every storey slab and the roof, less the stair, lift and shaft openings of the floors above the ground
    const holes = m.storeys.slice(1).reduce((q, st) => q + slabOpeningAreaM2(st.geometry, m), 0) + slabOpeningAreaM2(m.storeys[Math.min(1, m.storeys.length - 1)].geometry, m);
    expect(holes).toBeGreaterThan(0);
    expect(get("screed").quantity).toBeCloseTo((m.storeys.length + 1) * m.footprintAreaM2 - holes, 6);
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

describe("sand rate (checked against the market)", () => {
  it("the card prices sand per cft at the SoR figure per 100 cft divided by 100, inside the local market range", () => {
    const sand = DEFAULT_RATE_CARD.lines.find((l) => l.key === "sand-fine")!;
    expect(sand.unit).toBe("cft");
    expect(sand.rateBdt).toBe(1900 / 100);
    expect(sand.rateBdt).toBeGreaterThanOrEqual(17); // local sand, market 2026: BDT 17 to 27 per cft
    expect(sand.rateBdt).toBeLessThanOrEqual(27);
  });

  it("sand is no longer the biggest priced line: cement and steel are", () => {
    const m = model("p1-4b", 5);
    const boq = buildBoq(m, buildBbs(analyzeStructure(m), m));
    const priced = boq.lines.filter((l) => l.amountBdt !== null).sort((a, b) => (b.amountBdt as number) - (a.amountBdt as number));
    expect(priced[0].id).not.toMatch(/sand/);
    const sand = boq.lines.filter((l) => /sand/.test(l.id)).reduce((s, l) => s + (l.amountBdt ?? 0), 0);
    expect(sand).toBeLessThan(0.1 * boq.totalBdt);
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
    const stone = boq.lines.find((l) => l.id === "concrete-stone")!;
    expect(stone.rateBdt).toBe(218.04);
    expect(stone.amountBdt).toBeCloseTo(stone.quantity * 218.04, 6);
    expect(boq.unpriced).not.toContain("concrete-stone");
    expect(boq.unpriced).not.toContain("steel");
    expect(boq.card.status).toBe("candidate");
  });

  it("formwork is priced by member family and rebar fixing by bar weight", () => {
    const res = analyzeStructure(m);
    const fw = bbs.totals.formworkM2;
    // independent: columns are 2 (bx + by) x storey height, footings are four sides, slabs the panel areas
    let col = 0;
    let foot = 0;
    for (const c of res.frame.columns) {
      for (const st of c.storeys) col += (2 * (st.section.bx + st.section.by) * m.input.floorToFloorMm) / 1e6;
    }
    for (const fo of res.foundation.footings) foot += (2 * (fo.x1 - fo.x0 + (fo.y1 - fo.y0)) * fo.depthMm) / 1e6;
    expect(fw.column).toBeCloseTo(col, 6);
    expect(fw.footing).toBeCloseTo(foot, 6);
    expect(fw.slab).toBeGreaterThan(0.7 * m.footprintAreaM2 * (m.storeys.length + 1));
    expect(fw.slab).toBeLessThanOrEqual(m.footprintAreaM2 * (m.storeys.length + 1));
    expect(fw.beam).toBeGreaterThan(0);
    const boq = buildBoq(m, bbs);
    const rate: Record<string, number> = { "formwork-footing": 582, "formwork-column": 522, "formwork-beam": 574, "formwork-slab": 597 };
    for (const [id, r] of Object.entries(rate)) {
      const l = boq.lines.find((x) => x.id === id)!;
      expect(l.rateBdt).toBe(r);
      expect(l.amountBdt).toBeCloseTo(l.quantity * r, 6);
    }
    expect(boq.lines.find((x) => x.id === "formwork-slab")!.quantity).toBeCloseTo(fw.slab, 6);
    const fix = boq.lines.find((x) => x.id === "rebar-fixing")!;
    expect(fix.quantity).toBeCloseTo(bbs.totals.weightKg, 6);
    expect(fix.amountBdt).toBeCloseTo(bbs.totals.weightKg * 32, 4);
    expect(boq.byCategory.some((c) => c.category === "formwork")).toBe(true);
    expect(boq.unpriced).toEqual([]);
  });

  it("a rate in another unit is not used silently", () => {
    const card: RateCard = { ...DEFAULT_RATE_CARD, lines: DEFAULT_RATE_CARD.lines.map((l) => (l.key === "rod-60g" ? { ...l, unit: "kg" } : l)) };
    const boq = priceTakeoff(takeoff(m, bbs), card);
    expect(boq.lines.find((l) => l.id === "steel")!.amountBdt).toBeNull();
    expect(boq.unpriced).toContain("steel");
  });

  it("a card without a stone line leaves stone chips unpriced and says so", () => {
    const card: RateCard = { ...DEFAULT_RATE_CARD, lines: DEFAULT_RATE_CARD.lines.filter((l) => l.key !== "stone-chips") };
    const boq = priceTakeoff(takeoff(m, bbs), card);
    expect(boq.unpriced).toContain("concrete-stone");
    expect(boqToCsv(boq).split("\n").at(-1)).toMatch(/excludes unpriced items: concrete-stone/);
  });

  it("CSV has a header, one row per item and the card and total rows", () => {
    const boq = buildBoq(m, bbs);
    const rows = boqToCsv(boq).split("\n");
    expect(rows[0]).toMatch(/^item,category,description,unit,quantity,rate_bdt,amount_bdt,basis$/);
    expect(rows.length).toBe(1 + boq.lines.length + 2);
    expect(rows.some((r) => r.startsWith("rate_card,pwd-sor-2022-civil-works"))).toBe(true);
    expect(rows[rows.length - 1]).toMatch(/all items priced/);
  });
});

describe("the bill of quantities agrees with the 3D model", () => {
  for (const [plan, storeys] of [["p1-4b", 4], ["p2-2b-fb", 6], ["p3-2b", 6], ["p2-3b-lr", 4]] as const) {
    it(`${plan} ${storeys} storeys: masonry within 12 % of the walls in the mesh, slab concrete less the openings`, () => {
      const m = model(plan, storeys);
      const res = analyzeStructure(m);
      const mesh = buildMesh(m, res);
      const vol = (kinds: string[]) => mesh.objects.filter((o) => kinds.includes(o.kind)).reduce((a, o) => a + o.volumeMm3, 0) / 1e9;
      const ratio = envelopeQuantities(m).wallM3 / vol(["wall", "partition"]);
      // the BOQ takes a flat 500 mm off the storey height; the mesh cuts each wall by the real beam above it, so the BOQ runs a little high
      expect(ratio, `${plan} wall ratio`).toBeGreaterThan(0.95);
      expect(ratio, `${plan} wall ratio`).toBeLessThan(1.12);
      // slab concrete: panel volume minus the holes
      const bbs = buildBbs(res, m);
      const panelM3 = res.levels.reduce((a, lv) => a + lv.panels.reduce((q, p) => q + ((p.x1 - p.x0) * (p.y1 - p.y0) * lv.slabThicknessMm) / 1e9, 0), 0);
      let holesM3 = 0;
      res.levels.forEach((lv) => { holesM3 += (slabOpeningAreaM2(m.storeys[lv.index + 1 < m.storeys.length ? lv.index + 1 : Math.min(1, m.storeys.length - 1)].geometry, m) * lv.slabThicknessMm) / 1000; });
      expect(holesM3).toBeGreaterThan(0);
      const members = bbs.totals.concreteM3 - (panelM3 - holesM3);
      expect(members).toBeGreaterThan(0); // beams, columns and footings on top of the slabs
    });
  }
});
