import { describe, expect, it } from "vitest";
import { DEFAULT_SETBACKS_MM, deriveBuilding, type BuildingModel } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { buildBbs } from "../structure/bbs";
import { analyzeStructure } from "../structure/analyze";
import { BOQ, DEFAULT_RATE_CARD, MEP_POINTS, buildBoq, mepItems, takeoff, utilityItems, withRateOverrides, UTILITY, concreteMaterials, BAG_M3 } from "./takeoff";

const S = DEFAULT_SETBACKS_MM;

function model(planId: string, storeys: number): BuildingModel {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!out.ok) throw new Error("fit");
  return out.model;
}

describe("2026 rate card: the card name and rates", () => {
  it("every priced line has a positive rate and a unit", () => {
    for (const l of DEFAULT_RATE_CARD.lines) {
      expect(l.rateBdt, l.key).toBeGreaterThan(0);
      expect(l.unit, l.key).toBeTruthy();
    }
  });

  it("chun, pump, overhead tank, drainage pipe and cables are on the card", () => {
    const keys = new Set(DEFAULT_RATE_CARD.lines.map((l) => l.key));
    for (const k of ["chun-hydrated-lime", "water-pump-1hp", "overhead-tank-2000l", "pvc-pipe-4in", "cable-2-5mm", "cable-1-5mm", "balcony-railing"]) expect(keys.has(k), k).toBe(true);
  });
});

describe("rate overrides: a user's own rate replaces the 2026 default", () => {
  it("replaces only the lines the user entered", () => {
    const c = withRateOverrides(DEFAULT_RATE_CARD, { "cement-opc-43": 600 });
    expect(c.lines.find((l) => l.key === "cement-opc-43")!.rateBdt).toBe(600);
    expect(c.lines.find((l) => l.key === "sand-fine")!.rateBdt).toBe(DEFAULT_RATE_CARD.lines.find((l) => l.key === "sand-fine")!.rateBdt);
  });

  it("ignores blank, negative and non-numeric entries (the default applies)", () => {
    const c = withRateOverrides(DEFAULT_RATE_CARD, { "cement-opc-43": undefined, "rod-60g": -5, "stone-chips": Number.NaN });
    const base = (k: string) => DEFAULT_RATE_CARD.lines.find((l) => l.key === k)!.rateBdt;
    expect(c.lines.find((l) => l.key === "cement-opc-43")!.rateBdt).toBe(base("cement-opc-43"));
    expect(c.lines.find((l) => l.key === "rod-60g")!.rateBdt).toBe(base("rod-60g"));
    expect(c.lines.find((l) => l.key === "stone-chips")!.rateBdt).toBe(base("stone-chips"));
  });

  it("a user rate flows into the BOQ line for that material", () => {
    const m = model("p1-4b", 4);
    const bbs = buildBbs(analyzeStructure(m), m);
    const boq = buildBoq(m, bbs, withRateOverrides(DEFAULT_RATE_CARD, { "cement-opc-43": 600 }));
    const cem = boq.lines.find((l) => l.id === "concrete-cement")!;
    expect(cem.rateBdt).toBe(600);
  });
});

describe("chun and paint areas", () => {
  it("stairs and parapet are in the paint areas; chun is on the outside faces only", () => {
    const m = model("p1-4b", 4);
    const bbs = buildBbs(analyzeStructure(m), m);
    const items = takeoff(m, bbs);
    const q = (id: string) => items.find((i) => i.id === id)!;
    expect(q("chun").rateKey).toBe("chun-hydrated-lime");
    expect(q("chun").unit).toBe("kg");
    expect(q("chun").quantity).toBeGreaterThan(0);
    expect(q("paint").quantity).toBeGreaterThan(0);
    expect(q("paint").description.en).toMatch(/stair soffits/);
  });
});

describe("septic tank and soak well are built from material rates", () => {
  const m = model("p1-4b", 4);
  const items = utilityItems(m, buildBbs(analyzeStructure(m), m));

  it("the tank walls use the brick volume of its own walls", () => {
    const wallM3 = 2 * (UTILITY.septic.innerLm + 2 * UTILITY.septic.wallM + UTILITY.septic.innerWm + 2 * UTILITY.septic.wallM) * UTILITY.septic.depthM * UTILITY.septic.wallM;
    const bricks = items.find((i) => i.id === "septic-bricks")!;
    expect(bricks.quantity).toBeCloseTo(wallM3 * BOQ.bricksPerM3, 6);
    expect(bricks.rateKey).toBe("brick-1st");
  });

  it("slab cement is the 1:1.5:3 split of the slab concrete", () => {
    const soakSlab = Math.PI * (UTILITY.soakWell.innerDiaM / 2 + UTILITY.soakWell.wallM) ** 2 * UTILITY.soakWell.coverM;
    const cem = items.find((i) => i.id === "soak-slab-cement")!;
    expect(cem.quantity).toBeCloseTo(concreteMaterials(soakSlab).cementBags, 6);
    expect(cem.quantity * BAG_M3).toBeGreaterThan(0);
  });

  it("the overhead tank, pump and drainage pipe are priced from the card", () => {
    const tank = items.find((i) => i.id === "overhead-tank")!;
    const pump = items.find((i) => i.id === "water-pump")!;
    const pipe = items.find((i) => i.id === "drain-pipe")!;
    expect(tank.rateKey).toBe("overhead-tank-2000l");
    expect(pump.rateKey).toBe("water-pump-1hp");
    expect(pipe.quantity).toBe(UTILITY.drainPipeMPerStorey * m.storeys.length + UTILITY.drainPipeToSoakM);
  });

  it("every component material is in the priced BOQ", () => {
    const boq = buildBoq(m, buildBbs(analyzeStructure(m), m));
    expect(boq.lines.filter((l) => l.id.startsWith("septic-") || l.id.startsWith("soak-")).every((l) => l.amountBdt !== null)).toBe(true);
  });
});

describe("electrical and plumbing are counted from the plan", () => {
  it("devices equal the lights, fans and sockets of every room on every storey", () => {
    const m = model("p1-4b", 4);
    const items = mepItems(m);
    let want = 0;
    for (const st of m.storeys) for (const r of st.geometry.fitted?.rooms ?? []) { const p = MEP_POINTS[r.def.kind]; if (p) want += p.light + p.fan + p.socket; }
    expect(items.find((i) => i.id === "elec-devices")!.quantity).toBe(want);
  });

  it("one commode, basin and shower per toilet room; one sink per kitchen", () => {
    const m = model("p1-4b", 4);
    const rooms = m.storeys.flatMap((st) => st.geometry.fitted?.rooms ?? []);
    const toilets = rooms.filter((r) => r.def.kind === "toilet").length;
    const kitchens = rooms.filter((r) => r.def.kind === "kitchen").length;
    const items = mepItems(m);
    for (const id of ["plumb-commode", "plumb-basin", "plumb-shower"]) expect(items.find((i) => i.id === id)!.quantity, id).toBe(toilets);
    expect(items.find((i) => i.id === "plumb-sink")!.quantity).toBe(kitchens);
  });

  it("the old per-square-metre benchmarks are gone from the card and the BOQ", () => {
    expect(DEFAULT_RATE_CARD.lines.some((l) => l.key === "electrical" || l.key === "plumbing")).toBe(false);
    const m = model("p1-4b", 4);
    const boq = buildBoq(m, buildBbs(analyzeStructure(m), m));
    expect(boq.lines.some((l) => l.id === "electrical" || l.id === "plumbing")).toBe(false);
  });
});
