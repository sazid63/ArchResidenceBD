/**
 * Quantities and bill of quantities (M5-1). Takeoff from the building model and the bar bending
 * schedule, priced from a rate card. Pure and deterministic. Concrete volume and steel weight come
 * from `buildBbs(...).totals` so the BOQ and the Rebar screen cannot disagree.
 *
 * Every mix ratio, wastage and opening size below is an assumption listed in `BOQ_ASSUMPTIONS`.
 * Only items that have a line in the rate card get a price; the rest stay visible as "no rate".
 */

import cardText from "../../spec/rates/pwd-sor-2022-civil-works-candidate.json?raw";
import type { BuildingModel } from "../model/building";
import { slabOpeningAreaM2 } from "../model/openings";
import type { BbsResult } from "../structure/bbs";

export interface Bilingual {
  en: string;
  bn: string;
}

export interface RateLine {
  key: string;
  label: Bilingual;
  costType: "material" | "labour" | "machinery" | "subcontract" | "other";
  unit: string;
  rateBdt: number;
  note?: string;
}

export interface RateCard {
  schemaVersion: string;
  cardId: string;
  region: string;
  currency: "BDT";
  status: "candidate" | "active" | "archived";
  effectiveFrom: string;
  asOf?: string;
  source: { kind: string; name: string; url?: string; retrievedAt?: string; sha256?: string; note?: string };
  lines: RateLine[];
  notes?: string;
}

export const DEFAULT_RATE_CARD: RateCard = JSON.parse(cardText) as RateCard;

/** Volume conversions. */
export const CFT_PER_M3 = 35.3147;
/** One 50 kg bag of cement, loose, at 1440 kg/m3. */
export const BAG_M3 = 50 / 1440;

/** Assumptions the BOQ rests on; shown on the screen. */
export const BOQ = {
  /** Structural concrete 1 : 1.5 : 3 by volume (suits fc' 20 MPa). */
  concreteMix: { cement: 1, sand: 1.5, stone: 3 },
  /** Dry volume per m3 of wet concrete. */
  concreteDryFactor: 1.54,
  /** Mortar 1 : 4 for brickwork and plaster. */
  mortarMix: { cement: 1, sand: 4 },
  /** Dry volume per m3 of mortar. */
  mortarDryFactor: 1.27,
  /** Mortar in brickwork, m3 per m3 of wall. */
  mortarInBrickworkM3PerM3: 0.25,
  /** Bricks per m3 of wall (standard 240 x 115 x 70 with 10 mm joints). */
  bricksPerM3: 500,
  /** Cutting and bending offcuts on the bars bought, as a fraction of the schedule weight (assumption; BD practice 3 to 5 percent). */
  steelWastage: 0.03,
  /** Wall height lost to the beam or slab above, mm. */
  wallDeductMm: 500,
  doorHeightMm: 2100,
  windowHeightMm: 1200,
  /** Interior partition and roof wall thickness, mm. */
  partitionMm: 125,
  plasterMm: 12,
  screedMm: 50,
} as const;

export const BOQ_ASSUMPTIONS: Array<{ id: string; en: string; bn: string }> = [
  { id: "concrete-mix", en: "Concrete 1 : 1.5 : 3 (cement : sand : stone chips) by volume, dry volume 1.54 x wet; one 50 kg bag = 0.0347 m3.", bn: "কংক্রিট ১ : ১.৫ : ৩ (সিমেন্ট : বালি : পাথর) আয়তনে, শুকনো আয়তন ভেজার ১.৫৪ গুণ; ৫০ কেজির ব্যাগ = ০.০৩৪৭ ঘনমিটার।" },
  { id: "mortar", en: "Mortar 1 : 4 for brickwork, plaster and screed, dry volume 1.27 x wet; brickwork takes 0.25 m3 mortar per m3 of wall and 500 bricks per m3.", bn: "ইটের গাঁথুনি, প্লাস্টার ও স্ক্রিডে মর্টার ১ : ৪, শুকনো আয়তন ভেজার ১.২৭ গুণ; গাঁথুনিতে প্রতি ঘনমিটারে ০.২৫ ঘনমিটার মর্টার ও ৫০০টি ইট।" },
  { id: "wall-height", en: "Wall height = storey height - 500 mm (beam or slab above); doors 2.1 m and windows 1.2 m high are deducted from wall and plaster at the thickness of the wall they sit in. The roof parapet (1 m) and the stair and lift cover walls are 125 mm.", bn: "দেয়ালের উচ্চতা = তলার উচ্চতা - ৫০০ মিমি; ২.১ মিটার দরজা ও ১.২ মিটার জানালা নিজ দেয়ালের পুরুত্বে বাদ। ছাদের ১ মিটার প্যারাপেট এবং সিঁড়ি ও লিফট ঘরের দেয়াল ১২৫ মিমি।" },
  { id: "finishes", en: "Plaster 12 mm on both wall faces; 50 mm screed on every floor and the roof. Slab soffit plaster, tiles, paint, doors, windows, services and earthwork are not taken off.", bn: "দেয়ালের দুই পাশে ১২ মিমি প্লাস্টার; প্রতি তলা ও ছাদে ৫০ মিমি স্ক্রিড। সিলিং প্লাস্টার, টাইলস, রং, দরজা-জানালা, সার্ভিস ও মাটির কাজ ধরা হয়নি।" },
  { id: "formwork", en: "Formwork is the contact area of slab soffits, beam bottoms and sides below the slab, column faces and footing sides, priced at the book's steel-form rates; nothing is deducted where members meet and slab edges and stair flights are not counted. Rebar fixing is derived from the book (item 08.1.2 minus the bar).", bn: "ফর্মওয়ার্ক হলো স্ল্যাবের নিচ, বিমের তলা ও স্ল্যাবের নিচের দুই পাশ, কলামের চার পাশ ও ফুটিংয়ের পাশের সংস্পর্শ ক্ষেত্রফল, বইয়ের স্টিল ফর্মের দরে; সংযোগস্থলে বাদ দেওয়া হয়নি, স্ল্যাবের কিনারা ও সিঁড়ি ধরা হয়নি। রড বাঁধার দাম বই থেকে হিসাবকৃত (আইটেম ০৮.১.২ থেকে রডের দাম বাদ)।" },
  { id: "steel", en: "Steel is the bar bending schedule total plus 3 % cutting wastage (assumption); binding wire is in the fixing rate; the card's rod line (Schedule of Rates item 289) covers Grade 400/420.", bn: "রড বার বেন্ডিং শিডিউলের মোট ও ৩% কাটার অপচয় (অনুমান); বাইন্ডিং তার বাঁধার দরে ধরা; কার্ডের রডের লাইন (রেট শিডিউল আইটেম ২৮৯) গ্রেড ৪০০/৪২০ দুটোই ধরে।" },
  { id: "rates", en: "Prices come from the rate card (source and date shown). Cement, sand, stone chips, rods and bricks are priced; labour for concrete, brickwork and plaster, machinery, joinery, tiles, paint and services have no line in the card (the book has no man-day norms), so the total is a lower bound.", bn: "দাম রেট কার্ড থেকে (উৎস ও তারিখ দেখানো)। সিমেন্ট, বালি, পাথর, রড ও ইটের দাম ধরা হয়েছে; কংক্রিট, গাঁথুনি ও প্লাস্টারের শ্রম, যন্ত্র, দরজা-জানালা, টাইলস, রং ও সার্ভিসের লাইন কার্ডে নেই (বইয়ে জনদিবসের হার নেই), তাই মোট একটি নিম্নসীমা।" },
];

export type BoqCategory = "concrete" | "formwork" | "steel" | "masonry" | "finishes";

export interface TakeoffItem {
  id: string;
  category: BoqCategory;
  description: Bilingual;
  unit: string;
  quantity: number;
  /** Rate-card key this item is priced from, if any. */
  rateKey?: string;
  /** Unit the quantity is converted to for pricing (the card's unit for rateKey). */
  basis: Bilingual;
}

export interface BoqLine extends TakeoffItem {
  rateBdt: number | null;
  /** Quantity in the rate card's unit. */
  pricedQuantity: number | null;
  amountBdt: number | null;
}

export interface Boq {
  card: Pick<RateCard, "cardId" | "region" | "status" | "effectiveFrom" | "asOf" | "source">;
  lines: BoqLine[];
  byCategory: Array<{ category: BoqCategory; amountBdt: number }>;
  totalBdt: number;
  /** Items that need a rate the card does not have: the total leaves them out. Volume rows (concrete, brickwork, plaster, screed) are quantities only and are priced through their materials. */
  unpriced: string[];
  quantities: { concreteM3: number; steelKg: number; brickCount: number; plasterM2: number; screedM2: number };
}

const bi = (en: string, bn: string): Bilingual => ({ en, bn });
const mortarCement = (m3: number) => (m3 * BOQ.mortarDryFactor * BOQ.mortarMix.cement) / (BOQ.mortarMix.cement + BOQ.mortarMix.sand);
const mortarSand = (m3: number) => (m3 * BOQ.mortarDryFactor * BOQ.mortarMix.sand) / (BOQ.mortarMix.cement + BOQ.mortarMix.sand);

/** Walls, plaster and floor areas of the whole building. */
export function envelopeQuantities(model: BuildingModel) {
  let wallM3 = 0;
  let plasterM2 = 0;
  let railingM = 0;
  for (const st of model.storeys) {
    const h = Math.max(st.heightMm - BOQ.wallDeductMm, 0);
    const g = st.geometry;
    let wallAreaM2 = 0;
    for (const w of g.walls) {
      const len = w.to - w.from;
      if (w.railing) { railingM += len / 1000; continue; } // balcony railing: counted in metres, not as masonry
      wallAreaM2 += (len * h) / 1e6;
      wallM3 += (len * h * w.thicknessMm) / 1e9;
    }
    // Each opening comes out of the wall it sits in, at that wall's own thickness.
    let openingM2 = 0;
    for (const o of [...g.doors, ...g.windows]) {
      const oh = o.kind === "door" ? BOQ.doorHeightMm : BOQ.windowHeightMm;
      const host = g.walls.find((w) => w.orientation === o.orientation && w.at === o.at && w.from <= o.from && w.to >= o.to);
      const area = ((o.to - o.from) * oh) / 1e6;
      openingM2 += area;
      wallM3 -= (area * (host?.thicknessMm ?? BOQ.partitionMm)) / 1000;
    }
    plasterM2 += 2 * Math.max(wallAreaM2 - openingM2, 0);
  }
  // Roof: parapet round the building and the walls of the stair cover and lift room, all 125 mm, plastered both faces.
  const roofRing = (perimeterMm: number, heightMm: number) => {
    wallM3 += (perimeterMm * heightMm * BOQ.partitionMm) / 1e9;
    plasterM2 += (2 * perimeterMm * heightMm) / 1e6;
  };
  roofRing(2 * (model.widthMm + model.depthMm), model.roof.parapetMm);
  for (const r of [model.roof.stairCover, model.roof.liftRoom]) {
    if (r) roofRing(2 * (r.x1 - r.x0 + (r.y1 - r.y0)), model.roof.coverHeightMm);
  }
  // Screed on every floor slab and the roof, less the stair, lift and shaft openings (the ground slab has none).
  const typical = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  let screedM2 = model.footprintAreaM2 - slabOpeningAreaM2(typical, model); // the roof
  model.storeys.forEach((st, i) => { screedM2 += model.footprintAreaM2 - (i > 0 ? slabOpeningAreaM2(st.geometry, model) : 0); });
  return { wallM3: Math.max(wallM3, 0), plasterM2, screedM2, railingM };
}

export function takeoff(model: BuildingModel, bbs: BbsResult): TakeoffItem[] {
  const conc = bbs.totals.concreteM3;
  const env = envelopeQuantities(model);
  const dry = conc * BOQ.concreteDryFactor;
  const mixSum = BOQ.concreteMix.cement + BOQ.concreteMix.sand + BOQ.concreteMix.stone;
  const cementConcM3 = (dry * BOQ.concreteMix.cement) / mixSum;
  const sandConcM3 = (dry * BOQ.concreteMix.sand) / mixSum;
  const stoneConcM3 = (dry * BOQ.concreteMix.stone) / mixSum;

  const brickMortarM3 = env.wallM3 * BOQ.mortarInBrickworkM3PerM3;
  const plasterMortarM3 = (env.plasterM2 * BOQ.plasterMm) / 1000;
  const screedMortarM3 = (env.screedM2 * BOQ.screedMm) / 1000;
  const mortarM3 = brickMortarM3 + plasterMortarM3 + screedMortarM3;

  const fw = bbs.totals.formworkM2;
  const formwork = (id: string, en: string, bnText: string, quantity: number, rateKey: string): TakeoffItem => ({ id, category: "formwork", description: bi(`Formwork, ${en}`, `ফর্মওয়ার্ক, ${bnText}`), unit: "m2", quantity, rateKey, basis: bi("form contact area, steel forms (SoR item 07.12)", "ফর্মের সংস্পর্শ ক্ষেত্রফল, স্টিল ফর্ম (এসওআর আইটেম ০৭.১২)") });

  const railing: TakeoffItem[] = env.railingM > 0
    ? [{ id: "balcony-railing", category: "finishes", description: bi("Balcony railing, 1.0 m high (MS or aluminium, supply and fix)", "বারান্দার রেলিং, ১.০ মিটার উঁচু (এমএস বা অ্যালুমিনিয়াম, সরবরাহ ও স্থাপন)"), unit: "m", quantity: env.railingM, basis: bi("running metres of balcony edge on every floor; no rate on the card yet", "প্রতি তলায় বারান্দার কিনারার চলমান মিটার; কার্ডে এখনো দর নেই") }]
    : [];
  return [
    { id: "concrete", category: "concrete", description: bi("Structural concrete, 1:1.5:3 (footings, columns, beams, slabs)", "কাঠামোগত কংক্রিট ১:১.৫:৩ (ফুটিং, কলাম, বিম, স্ল্যাব)"), unit: "m3", quantity: conc, basis: bi("from the bar schedule volumes", "বার শিডিউলের আয়তন থেকে") },
    { id: "concrete-cement", category: "concrete", description: bi("Cement in concrete", "কংক্রিটে সিমেন্ট"), unit: "bag", quantity: cementConcM3 / BAG_M3, rateKey: "cement-opc-43", basis: bi("dry volume / 0.0347 m3 per bag", "শুকনো আয়তন / প্রতি ব্যাগ ০.০৩৪৭ ঘনমিটার") },
    { id: "concrete-sand", category: "concrete", description: bi("Sand in concrete", "কংক্রিটে বালি"), unit: "cft", quantity: sandConcM3 * CFT_PER_M3, rateKey: "sand-fine", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
    { id: "concrete-stone", category: "concrete", description: bi("Stone chips in concrete", "কংক্রিটে পাথর"), unit: "cft", quantity: stoneConcM3 * CFT_PER_M3, rateKey: "stone-chips", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
    formwork("formwork-footing", "footings", "ফুটিং", fw.footing, "formwork-footing"),
    formwork("formwork-column", "columns", "কলাম", fw.column, "formwork-column"),
    formwork("formwork-beam", "beams", "বিম", fw.beam, "formwork-beam"),
    formwork("formwork-slab", "slabs", "স্ল্যাব", fw.slab, "formwork-slab"),
    { id: "steel", category: "steel", description: bi("Reinforcement bars, Grade 420 (bar schedule total; priced at the card's B400 rod line)", "রড গ্রেড ৪২০ (বার শিডিউলের মোট; কার্ডের বি৪০০ রডের দরে)"), unit: "ton", quantity: (bbs.totals.weightKg * (1 + BOQ.steelWastage)) / 1000, rateKey: "rod-60g", basis: bi("schedule kg x 1.03 (cutting wastage) / 1000", "শিডিউলের কেজি × ১.০৩ (কাটার অপচয়) / ১০০০") },
    { id: "rebar-fixing", category: "steel", description: bi("Rebar cutting, bending and fixing (labour and binding wire)", "রড কাটা, বাঁকানো ও বাঁধা (শ্রম ও জিআই তার)"), unit: "kg", quantity: bbs.totals.weightKg, rateKey: "rebar-fixing", basis: bi("bar schedule kg; SoR item 08.1.2 minus the bar (derived)", "বার শিডিউলের কেজি; এসওআর ০৮.১.২ থেকে রডের দাম বাদ (হিসাবকৃত)") },
    { id: "brickwork", category: "masonry", description: bi("Brick masonry, 250 mm and 125 mm walls, openings deducted", "ইটের গাঁথুনি ২৫০ ও ১২৫ মিমি দেয়াল, খোলা অংশ বাদে"), unit: "m3", quantity: env.wallM3, basis: bi("wall length x height x thickness", "দেয়ালের দৈর্ঘ্য × উচ্চতা × পুরুত্ব") },
    { id: "bricks", category: "masonry", description: bi("First-class bricks", "প্রথম শ্রেণির ইট"), unit: "each", quantity: env.wallM3 * BOQ.bricksPerM3, rateKey: "brick-1st", basis: bi("500 per m3 of wall", "প্রতি ঘনমিটারে ৫০০টি") },
    { id: "plaster", category: "finishes", description: bi("Cement plaster 12 mm, both wall faces", "সিমেন্ট প্লাস্টার ১২ মিমি, দেয়ালের দুই পাশ"), unit: "m2", quantity: env.plasterM2, basis: bi("area less openings, both faces", "খোলা অংশ বাদে দুই পাশের ক্ষেত্রফল") },
    { id: "screed", category: "finishes", description: bi("Cement-sand screed 50 mm, floors and roof", "সিমেন্ট-বালি স্ক্রিড ৫০ মিমি, মেঝে ও ছাদ"), unit: "m2", quantity: env.screedM2, basis: bi("footprint x (storeys + roof)", "ফুটপ্রিন্ট × (তলা + ছাদ)") },
    { id: "mortar-cement", category: "masonry", description: bi("Cement in mortar (brickwork, plaster, screed)", "মর্টারে সিমেন্ট (গাঁথুনি, প্লাস্টার, স্ক্রিড)"), unit: "bag", quantity: mortarCement(mortarM3) / BAG_M3, rateKey: "cement-opc-43", basis: bi("1:4 mortar, dry volume / 0.0347", "১:৪ মর্টার, শুকনো আয়তন / ০.০৩৪৭") },
    ...railing,
    { id: "mortar-sand", category: "masonry", description: bi("Sand in mortar", "মর্টারে বালি"), unit: "cft", quantity: mortarSand(mortarM3) * CFT_PER_M3, rateKey: "sand-fine", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
  ];
}

/** Prices the takeoff from a rate card. Quantities are already in the card's unit for priced items. */
export function priceTakeoff(items: TakeoffItem[], card: RateCard = DEFAULT_RATE_CARD): Boq {
  const rates = new Map(card.lines.map((l) => [l.key, l]));
  const lines: BoqLine[] = items.map((it) => {
    const rate = it.rateKey ? rates.get(it.rateKey) : undefined;
    if (!rate || rate.unit !== it.unit) return { ...it, rateBdt: null, pricedQuantity: null, amountBdt: null };
    return { ...it, rateBdt: rate.rateBdt, pricedQuantity: it.quantity, amountBdt: it.quantity * rate.rateBdt };
  });
  const cats = new Map<BoqCategory, number>();
  let total = 0;
  for (const l of lines) {
    if (l.amountBdt === null) continue;
    total += l.amountBdt;
    cats.set(l.category, (cats.get(l.category) ?? 0) + l.amountBdt);
  }
  const q = (id: string) => items.find((i) => i.id === id)?.quantity ?? 0;
  return {
    card: { cardId: card.cardId, region: card.region, status: card.status, effectiveFrom: card.effectiveFrom, asOf: card.asOf, source: card.source },
    lines,
    byCategory: [...cats].map(([category, amountBdt]) => ({ category, amountBdt })),
    totalBdt: total,
    unpriced: lines.filter((l) => l.rateKey && l.amountBdt === null).map((l) => l.id),
    quantities: { concreteM3: q("concrete"), steelKg: q("steel") * 1000, brickCount: q("bricks"), plasterM2: q("plaster"), screedM2: q("screed") },
  };
}

export function buildBoq(model: BuildingModel, bbs: BbsResult, card: RateCard = DEFAULT_RATE_CARD): Boq {
  return priceTakeoff(takeoff(model, bbs), card);
}

/** The BOQ as CSV: one row per item, then the card source and the total. */
export function boqToCsv(boq: Boq): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["item", "category", "description", "unit", "quantity", "rate_bdt", "amount_bdt", "basis"];
  const rows = boq.lines.map((l) => [l.id, l.category, q(l.description.en), l.unit, l.quantity.toFixed(2), l.rateBdt ?? "", l.amountBdt === null ? "" : l.amountBdt.toFixed(0), q(l.basis.en)].join(","));
  const meta = [
    ["rate_card", boq.card.cardId, q(boq.card.source.name), `status=${boq.card.status}`, `effective_from=${boq.card.effectiveFrom}`, `as_of=${boq.card.asOf ?? ""}`].join(","),
    ["total_priced_bdt", "", "", "", "", "", boq.totalBdt.toFixed(0), q(boq.unpriced.length ? `excludes unpriced items: ${boq.unpriced.join(" ")}` : "all items priced")].join(","),
  ];
  return [head.join(","), ...rows, ...meta].join("\n");
}
