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
  /** Wall height lost to the beam or slab above, mm. */
  wallDeductMm: 500,
  doorHeightMm: 2100,
  windowHeightMm: 1200,
  plasterMm: 12,
  screedMm: 50,
} as const;

export const BOQ_ASSUMPTIONS: Array<{ id: string; en: string; bn: string }> = [
  { id: "concrete-mix", en: "Concrete 1 : 1.5 : 3 (cement : sand : stone chips) by volume, dry volume 1.54 x wet; one 50 kg bag = 0.0347 m3.", bn: "কংক্রিট ১ : ১.৫ : ৩ (সিমেন্ট : বালি : পাথর) আয়তনে, শুকনো আয়তন ভেজার ১.৫৪ গুণ; ৫০ কেজির ব্যাগ = ০.০৩৪৭ ঘনমিটার।" },
  { id: "mortar", en: "Mortar 1 : 4 for brickwork, plaster and screed, dry volume 1.27 x wet; brickwork takes 0.25 m3 mortar per m3 of wall and 500 bricks per m3.", bn: "ইটের গাঁথুনি, প্লাস্টার ও স্ক্রিডে মর্টার ১ : ৪, শুকনো আয়তন ভেজার ১.২৭ গুণ; গাঁথুনিতে প্রতি ঘনমিটারে ০.২৫ ঘনমিটার মর্টার ও ৫০০টি ইট।" },
  { id: "wall-height", en: "Wall height = storey height - 500 mm (beam or slab above); doors 2.1 m and windows 1.2 m high are deducted from wall and plaster.", bn: "দেয়ালের উচ্চতা = তলার উচ্চতা - ৫০০ মিমি; ২.১ মিটার দরজা ও ১.২ মিটার জানালা দেয়াল ও প্লাস্টার থেকে বাদ।" },
  { id: "finishes", en: "Plaster 12 mm on both wall faces; 50 mm screed on every floor and the roof. Slab soffit plaster, tiles, paint, doors, windows, services and earthwork are not taken off.", bn: "দেয়ালের দুই পাশে ১২ মিমি প্লাস্টার; প্রতি তলা ও ছাদে ৫০ মিমি স্ক্রিড। সিলিং প্লাস্টার, টাইলস, রং, দরজা-জানালা, সার্ভিস ও মাটির কাজ ধরা হয়নি।" },
  { id: "steel", en: "Steel is the bar bending schedule total, no wastage or binding wire added.", bn: "রড বার বেন্ডিং শিডিউলের মোট, অপচয় বা বাইন্ডিং তার যোগ করা হয়নি।" },
  { id: "rates", en: "Prices come from the rate card (source and date shown). Items with no line in the card (stone chips, labour, machinery output) are listed without a price, so the total is a lower bound.", bn: "দাম রেট কার্ড থেকে (উৎস ও তারিখ দেখানো)। কার্ডে যে আইটেমের লাইন নেই (পাথর, শ্রম, যন্ত্র) সেগুলোর দাম নেই, তাই মোট একটি নিম্নসীমা।" },
];

export type BoqCategory = "concrete" | "steel" | "masonry" | "finishes";

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
  for (const st of model.storeys) {
    const h = Math.max(st.heightMm - BOQ.wallDeductMm, 0);
    const g = st.geometry;
    let openingM2 = 0;
    let openingWallM3 = 0;
    for (const o of g.doors) {
      openingM2 += ((o.to - o.from) * BOQ.doorHeightMm) / 1e6;
    }
    for (const o of g.windows) {
      openingM2 += ((o.to - o.from) * BOQ.windowHeightMm) / 1e6;
    }
    let wallAreaM2 = 0;
    for (const w of g.walls) {
      const len = w.to - w.from;
      wallAreaM2 += (len * h) / 1e6;
      wallM3 += (len * h * w.thicknessMm) / 1e9;
    }
    // Openings sit in walls of both thicknesses; take them off at the interior thickness (125 mm) for doors and 250 mm for windows.
    openingWallM3 += g.doors.reduce((s, o) => s + ((o.to - o.from) * BOQ.doorHeightMm * 125) / 1e9, 0);
    openingWallM3 += g.windows.reduce((s, o) => s + ((o.to - o.from) * BOQ.windowHeightMm * 250) / 1e9, 0);
    wallM3 -= openingWallM3;
    plasterM2 += 2 * Math.max(wallAreaM2 - openingM2, 0);
  }
  const floors = model.storeys.length + 1; // every storey slab plus the roof
  const screedM2 = floors * model.footprintAreaM2;
  return { wallM3: Math.max(wallM3, 0), plasterM2, screedM2 };
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

  return [
    { id: "concrete", category: "concrete", description: bi("Structural concrete, 1:1.5:3 (footings, columns, beams, slabs)", "কাঠামোগত কংক্রিট ১:১.৫:৩ (ফুটিং, কলাম, বিম, স্ল্যাব)"), unit: "m3", quantity: conc, basis: bi("from the bar schedule volumes", "বার শিডিউলের আয়তন থেকে") },
    { id: "concrete-cement", category: "concrete", description: bi("Cement in concrete", "কংক্রিটে সিমেন্ট"), unit: "bag", quantity: cementConcM3 / BAG_M3, rateKey: "cement-opc-43", basis: bi("dry volume / 0.0347 m3 per bag", "শুকনো আয়তন / প্রতি ব্যাগ ০.০৩৪৭ ঘনমিটার") },
    { id: "concrete-sand", category: "concrete", description: bi("Sand in concrete", "কংক্রিটে বালি"), unit: "cft", quantity: sandConcM3 * CFT_PER_M3, rateKey: "sand-fine", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
    { id: "concrete-stone", category: "concrete", description: bi("Stone chips in concrete", "কংক্রিটে পাথর"), unit: "cft", quantity: stoneConcM3 * CFT_PER_M3, rateKey: "stone-chips", basis: bi("m3 x 35.31 (no rate in the card)", "ঘনমিটার × ৩৫.৩১ (কার্ডে দাম নেই)") },
    { id: "steel", category: "steel", description: bi("Reinforcement bars, Grade 420 (bar schedule total)", "রড গ্রেড ৪২০ (বার শিডিউলের মোট)"), unit: "ton", quantity: bbs.totals.weightKg / 1000, rateKey: "rod-60g", basis: bi("kg / 1000", "কেজি / ১০০০") },
    { id: "brickwork", category: "masonry", description: bi("Brick masonry, 250 mm and 125 mm walls, openings deducted", "ইটের গাঁথুনি ২৫০ ও ১২৫ মিমি দেয়াল, খোলা অংশ বাদে"), unit: "m3", quantity: env.wallM3, basis: bi("wall length x height x thickness", "দেয়ালের দৈর্ঘ্য × উচ্চতা × পুরুত্ব") },
    { id: "bricks", category: "masonry", description: bi("First-class bricks", "প্রথম শ্রেণির ইট"), unit: "each", quantity: env.wallM3 * BOQ.bricksPerM3, rateKey: "brick-1st", basis: bi("500 per m3 of wall", "প্রতি ঘনমিটারে ৫০০টি") },
    { id: "plaster", category: "finishes", description: bi("Cement plaster 12 mm, both wall faces", "সিমেন্ট প্লাস্টার ১২ মিমি, দেয়ালের দুই পাশ"), unit: "m2", quantity: env.plasterM2, basis: bi("area less openings, both faces", "খোলা অংশ বাদে দুই পাশের ক্ষেত্রফল") },
    { id: "screed", category: "finishes", description: bi("Cement-sand screed 50 mm, floors and roof", "সিমেন্ট-বালি স্ক্রিড ৫০ মিমি, মেঝে ও ছাদ"), unit: "m2", quantity: env.screedM2, basis: bi("footprint x (storeys + roof)", "ফুটপ্রিন্ট × (তলা + ছাদ)") },
    { id: "mortar-cement", category: "masonry", description: bi("Cement in mortar (brickwork, plaster, screed)", "মর্টারে সিমেন্ট (গাঁথুনি, প্লাস্টার, স্ক্রিড)"), unit: "bag", quantity: mortarCement(mortarM3) / BAG_M3, rateKey: "cement-opc-43", basis: bi("1:4 mortar, dry volume / 0.0347", "১:৪ মর্টার, শুকনো আয়তন / ০.০৩৪৭") },
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
