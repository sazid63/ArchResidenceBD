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
import { liftCore } from "../model/lift";
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
  /**
   * Labour and machine output per day (common practice in Bangladesh; the rate card has day rates but no norms). Assumptions,
   * listed in BOQ_ASSUMPTIONS: a mason lays 500 bricks (1 m3) a day; plasters 9 m2 of 12 mm; screeds 12 m2 of 50 mm; fixes 6 m2 of tiles;
   * a painter finishes 15 m2 of wall or ceiling; a diesel mixer turns out 8 m3 of concrete a day (one operator) and a vibrator
   * serves 10 m3; a labourer digs 3 m3 a day. A helper works with every mason day (brickwork, plaster, screed, tiles).
   */
  labour: { masonM3PerDay: 1, plasterM2PerDay: 9, screedM2PerDay: 12, tileM2PerDay: 6, paintM2PerDay: 15, mixerM3PerDay: 8, vibratorM3PerDay: 10, excavationM3PerDay: 3 },
} as const;

export const BOQ_ASSUMPTIONS: Array<{ id: string; en: string; bn: string }> = [
  { id: "concrete-mix", en: "Concrete 1 : 1.5 : 3 (cement : sand : stone chips) by volume, dry volume 1.54 x wet; one 50 kg bag = 0.0347 m3.", bn: "কংক্রিট ১ : ১.৫ : ৩ (সিমেন্ট : বালি : পাথর) আয়তনে, শুকনো আয়তন ভেজার ১.৫৪ গুণ; ৫০ কেজির ব্যাগ = ০.০৩৪৭ ঘনমিটার।" },
  { id: "mortar", en: "Mortar 1 : 4 for brickwork, plaster and screed, dry volume 1.27 x wet; brickwork takes 0.25 m3 mortar per m3 of wall and 500 bricks per m3.", bn: "ইটের গাঁথুনি, প্লাস্টার ও স্ক্রিডে মর্টার ১ : ৪, শুকনো আয়তন ভেজার ১.২৭ গুণ; গাঁথুনিতে প্রতি ঘনমিটারে ০.২৫ ঘনমিটার মর্টার ও ৫০০টি ইট।" },
  { id: "wall-height", en: "Wall height = storey height - 500 mm (beam or slab above); doors 2.1 m and windows 1.2 m high are deducted from wall and plaster at the thickness of the wall they sit in. The roof parapet (1 m) and the stair and lift cover walls are 125 mm.", bn: "দেয়ালের উচ্চতা = তলার উচ্চতা - ৫০০ মিমি; ২.১ মিটার দরজা ও ১.২ মিটার জানালা নিজ দেয়ালের পুরুত্বে বাদ। ছাদের ১ মিটার প্যারাপেট এবং সিঁড়ি ও লিফট ঘরের দেয়াল ১২৫ মিমি।" },
  { id: "finishes", en: "Plaster 12 mm on both wall faces; 50 mm screed on every floor and the roof. Floor tiles, paint on walls and ceilings, roof waterproofing, doors, windows, the lift and foundation earthwork are quantities from the model and the plan; services (plumbing, electrical, drainage) are not taken off.", bn: "দেয়ালের দুই পাশে ১২ মিমি প্লাস্টার; প্রতি তলা ও ছাদে ৫০ মিমি স্ক্রিড। মেঝের টাইলস, দেয়াল ও সিলিংয়ের রং, ছাদের ওয়াটারপ্রুফিং, দরজা-জানালা, লিফট ও ফুটিংয়ের মাটির কাজ মডেল ও প্ল্যান থেকে পরিমাণ; সার্ভিস (পানি, বিদ্যুৎ, ড্রেনেজ) ধরা হয়নি।" },
  { id: "labour", en: "Labour and machines in man-days from output norms (common practice): mason 1 m3 of brickwork, 9 m2 of plaster, 12 m2 of screed or 6 m2 of tiles a day; painter 15 m2; diesel mixer 8 m3 and vibrator 10 m3 of concrete a day with one operator; labourer 3 m3 of digging. Masons, mixer, vibrator and operator are priced at the card's day rates; helpers, painters and diggers have no rate on the card.", bn: "শ্রম ও যন্ত্র জনদিবসে, দৈনিক উৎপাদন হারে (প্রচলিত অনুশীলন): রাজমিস্ত্রি দিনে ১ ঘনমিটার গাঁথুনি, ৯ বর্গমিটার প্লাস্টার, ১২ বর্গমিটার স্ক্রিড বা ৬ বর্গমিটার টাইলস; রংমিস্ত্রি ১৫ বর্গমিটার; ডিজেল মিক্সার ৮ ঘনমিটার ও ভাইব্রেটর ১০ ঘনমিটার কংক্রিট, একজন অপারেটরসহ; শ্রমিক ৩ ঘনমিটার মাটি কাটা। মিস্ত্রি, মিক্সার, ভাইব্রেটর ও অপারেটর কার্ডের দৈনিক দরে; সহকারী, রংমিস্ত্রি ও মাটি কাটার শ্রমিকের দর কার্ডে নেই।" },
  { id: "formwork", en: "Formwork is the contact area of slab soffits, beam bottoms and sides below the slab, column faces and footing sides, priced at the book's steel-form rates; nothing is deducted where members meet and slab edges and stair flights are not counted. Rebar fixing is derived from the book (item 08.1.2 minus the bar).", bn: "ফর্মওয়ার্ক হলো স্ল্যাবের নিচ, বিমের তলা ও স্ল্যাবের নিচের দুই পাশ, কলামের চার পাশ ও ফুটিংয়ের পাশের সংস্পর্শ ক্ষেত্রফল, বইয়ের স্টিল ফর্মের দরে; সংযোগস্থলে বাদ দেওয়া হয়নি, স্ল্যাবের কিনারা ও সিঁড়ি ধরা হয়নি। রড বাঁধার দাম বই থেকে হিসাবকৃত (আইটেম ০৮.১.২ থেকে রডের দাম বাদ)।" },
  { id: "steel", en: "Steel is the bar bending schedule total plus 3 % cutting wastage (assumption); binding wire is in the fixing rate; the card's rod line (Schedule of Rates item 289) covers Grade 400/420.", bn: "রড বার বেন্ডিং শিডিউলের মোট ও ৩% কাটার অপচয় (অনুমান); বাইন্ডিং তার বাঁধার দরে ধরা; কার্ডের রডের লাইন (রেট শিডিউল আইটেম ২৮৯) গ্রেড ৪০০/৪২০ দুটোই ধরে।" },
  { id: "rates", en: "Prices come from the rate card (source and date shown). Cement, sand, stone chips, rods and bricks are priced; the materials, the masons, the mixer, vibrator and operator are priced from the day rates; helpers, painters, diggers, joinery, tiles, paint, waterproofing, earthwork, the lift and services have no line in the card, so the total is a lower bound.", bn: "দাম রেট কার্ড থেকে (উৎস ও তারিখ দেখানো)। উপকরণ, মিস্ত্রি, মিক্সার, ভাইব্রেটর ও অপারেটর দৈনিক দরে; সহকারী, রংমিস্ত্রি, মাটি কাটার শ্রমিক, দরজা-জানালা, টাইলস, রং, ওয়াটারপ্রুফিং, মাটির কাজ, লিফট ও সার্ভিসের লাইন কার্ডে নেই, তাই মোট একটি নিম্নসীমা।" },
];

export type BoqCategory = "earthwork" | "concrete" | "formwork" | "steel" | "masonry" | "finishes" | "fittings" | "labour";

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
  let liftWallM3 = 0; // masonry-equivalent volume of the shaft walls that are concrete instead
  let doorsNr = 0;
  let doorsM2 = 0;
  let windowsNr = 0;
  let windowsM2 = 0;
  for (const st of model.storeys) {
    const h = Math.max(st.heightMm - BOQ.wallDeductMm, 0);
    const g = st.geometry;
    let wallAreaM2 = 0;
    const isLift = (o: number) => o >= 0 && g.fitted.rooms[o]?.def.kind === "lift";
    for (const w of g.walls) {
      const len = w.to - w.from;
      if (isLift(w.a) || isLift(w.b)) { wallAreaM2 += (len * h) / 1e6; liftWallM3 += (len * h * w.thicknessMm) / 1e9; continue; } // shaft walls are reinforced concrete (liftCore), plastered but not brick
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
      if (o.kind === "door") { doorsNr++; doorsM2 += area; } else { windowsNr++; windowsM2 += area; }
      if (host && (isLift(host.a) || isLift(host.b))) { liftWallM3 -= (area * host.thicknessMm) / 1000; continue; }
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
  const roofM2 = model.footprintAreaM2 - slabOpeningAreaM2(typical, model);
  let screedM2 = roofM2;
  model.storeys.forEach((st, i) => { screedM2 += model.footprintAreaM2 - (i > 0 ? slabOpeningAreaM2(st.geometry, model) : 0); });
  const roofPerimeterM = (2 * (model.widthMm + model.depthMm)) / 1000;
  return { wallM3: Math.max(wallM3, 0), liftWallM3, plasterM2, screedM2, railingM, roofM2, roofPerimeterM, doorsNr, doorsM2, windowsNr, windowsM2 };
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
  const floorsM2 = Math.max(env.screedM2 - env.roofM2, 0);
  const ew = bbs.totals.earthwork;
  const lift = liftCore(model);
  const quantityOnly = bi("quantity only: no rate on the card yet", "শুধু পরিমাণ: কার্ডে এখনো দর নেই");
  const more: TakeoffItem[] = [
    ...(ew ? [
      { id: "excavation", category: "earthwork" as const, description: bi("Earth excavation for footings, with 300 mm working space", "ফুটিংয়ের মাটি খনন, ৩০০ মিমি কাজের জায়গাসহ"), unit: "m3", quantity: ew.excavationM3, basis: bi("footing plan + working space each side, from ground-floor finish to the underside of the lean concrete; no rate on the card yet", "ফুটিংয়ের প্ল্যান + দুই পাশে কাজের জায়গা, নিচতলার ফিনিশ থেকে লিন কংক্রিটের নিচ পর্যন্ত; কার্ডে এখনো দর নেই") },
      { id: "backfill", category: "earthwork" as const, description: bi("Backfilling and compaction round footings and stubs", "ফুটিং ও স্টাবের চারপাশে মাটি ভরাট ও চাপ দেওয়া"), unit: "m3", quantity: ew.backfillM3, basis: bi("excavation less footing, stub and lean concrete; no rate on the card yet", "খননের পরিমাণ থেকে ফুটিং, স্টাব ও লিন কংক্রিট বাদ; কার্ডে এখনো দর নেই") },
      { id: "lean-concrete", category: "concrete" as const, description: bi("Lean concrete bed 75 mm under footings (1:3:6)", "ফুটিংয়ের নিচে ৭৫ মিমি লিন কংক্রিট (১:৩:৬)"), unit: "m3", quantity: ew.leanConcreteM3, basis: bi("footing plan + 100 mm each side x 75 mm; no rate on the card yet", "ফুটিংয়ের প্ল্যান + দুই পাশে ১০০ মিমি × ৭৫ মিমি; কার্ডে এখনো দর নেই") },
    ] : []),
    { id: "floor-finish", category: "finishes" as const, description: bi("Floor tiles (supply and fix) on the screed, all floors", "স্ক্রিডের ওপর মেঝের টাইলস (সরবরাহ ও স্থাপন), সব তলা"), unit: "m2", quantity: floorsM2, basis: bi("screed area less the roof; ordinary tile, no rate on the card yet", "ছাদ বাদে স্ক্রিডের ক্ষেত্রফল; সাধারণ টাইলস, কার্ডে এখনো দর নেই") },
    { id: "paint", category: "finishes" as const, description: bi("Putty and emulsion paint, walls and ceilings", "পুটি ও ইমালশন রং, দেয়াল ও সিলিং"), unit: "m2", quantity: env.plasterM2 + floorsM2, basis: bi("plastered wall area plus the ceiling under every floor slab; no rate on the card yet", "প্লাস্টার করা দেয়ালের ক্ষেত্রফল ও প্রতি তলার ছাদের নিচের সিলিং; কার্ডে এখনো দর নেই") },
    { id: "roof-waterproofing", category: "finishes" as const, description: bi("Roof waterproofing membrane with 300 mm upstand at the parapet", "ছাদের ওয়াটারপ্রুফিং মেমব্রেন, প্যারাপেটে ৩০০ মিমি উঠানো"), unit: "m2", quantity: env.roofM2 + env.roofPerimeterM * 0.3, basis: bi("roof area plus 0.3 m x perimeter; no rate on the card yet", "ছাদের ক্ষেত্রফল + ০.৩ মি × পরিসীমা; কার্ডে এখনো দর নেই") },
    { id: "doors", category: "fittings" as const, description: bi("Doors with frames and shutters (supply and fix)", "ফ্রেম ও পাল্লাসহ দরজা (সরবরাহ ও স্থাপন)"), unit: "nr", quantity: env.doorsNr, basis: bi(`${env.doorsM2.toFixed(1)} m2 of door leaf at 2.1 m high, from the plan openings; no rate on the card yet`, `পরিকল্পনার খোলা অংশ থেকে ২.১ মি উচ্চতায় ${env.doorsM2.toFixed(1)} বর্গমি; কার্ডে এখনো দর নেই`) },
    { id: "windows", category: "fittings" as const, description: bi("Windows with grills and glazing (supply and fix)", "গ্রিল ও কাচসহ জানালা (সরবরাহ ও স্থাপন)"), unit: "nr", quantity: env.windowsNr, basis: bi(`${env.windowsM2.toFixed(1)} m2 at 1.2 m high, from the plan openings; no rate on the card yet`, `পরিকল্পনার খোলা অংশ থেকে ১.২ মি উচ্চতায় ${env.windowsM2.toFixed(1)} বর্গমি; কার্ডে এখনো দর নেই`) },
    ...(lift ? [{ id: "lift", category: "fittings" as const, description: bi("Passenger lift, supply, install and commission", "যাত্রীবাহী লিফট, সরবরাহ, স্থাপন ও চালু"), unit: "nr", quantity: lift.spec.liftsProvided, basis: bi(`${model.storeys.length} stops each; a supplier allowance, ${quantityOnly.en}`, `প্রতিটি ${model.storeys.length} স্টপ; সরবরাহকারীর বরাদ্দ, ${quantityOnly.bn}`) }] : []),
  ];
  const L = BOQ.labour;
  const labour = (id: string, en: string, bnText: string, days: number, rateKey: string | undefined, norm: string): TakeoffItem => ({
    id,
    category: "labour",
    description: bi(en, bnText),
    unit: "day",
    quantity: days,
    ...(rateKey ? { rateKey } : {}),
    basis: bi(`${norm}${rateKey ? "" : "; no rate on the card yet"}`, `${norm}${rateKey ? "" : "; কার্ডে এখনো দর নেই"}`),
  });
  const labourItems: TakeoffItem[] = [
    labour("labour-mason-brick", "Mason, brickwork", "রাজমিস্ত্রি, ইটের গাঁথুনি", env.wallM3 / L.masonM3PerDay, "mason", "1 m3 of wall per mason-day"),
    labour("labour-helper-brick", "Helper, brickwork", "সহকারী, ইটের গাঁথুনি", env.wallM3 / L.masonM3PerDay, undefined, "one helper per mason-day"),
    labour("labour-mason-plaster", "Mason, plaster 12 mm", "রাজমিস্ত্রি, প্লাস্টার ১২ মিমি", env.plasterM2 / L.plasterM2PerDay, "mason", "9 m2 per mason-day"),
    labour("labour-mason-screed", "Mason, screed 50 mm", "রাজমিস্ত্রি, স্ক্রিড ৫০ মিমি", env.screedM2 / L.screedM2PerDay, "mason", "12 m2 per mason-day"),
    labour("labour-mason-tiles", "Mason, floor tiles", "রাজমিস্ত্রি, মেঝের টাইলস", floorsM2 / L.tileM2PerDay, "mason", "6 m2 per mason-day"),
    labour("labour-helper-finishes", "Helper, plaster, screed and tiles", "সহকারী, প্লাস্টার, স্ক্রিড ও টাইলস", env.plasterM2 / L.plasterM2PerDay + env.screedM2 / L.screedM2PerDay + floorsM2 / L.tileM2PerDay, undefined, "one helper per mason-day"),
    labour("labour-painter", "Painter, putty and emulsion", "রংমিস্ত্রি, পুটি ও ইমালশন", (env.plasterM2 + floorsM2) / L.paintM2PerDay, undefined, "15 m2 per painter-day"),
    labour("mixer-days", "Diesel concrete mixer", "ডিজেল কংক্রিট মিক্সার", conc / L.mixerM3PerDay, "mixer-diesel", "8 m3 of concrete per day"),
    labour("operator-days", "Machine operator, mixer", "মেশিন অপারেটর, মিক্সার", conc / L.mixerM3PerDay, "machine-operator", "one operator per mixer-day"),
    labour("vibrator-days", "Concrete vibrator", "কংক্রিট ভাইব্রেটর", conc / L.vibratorM3PerDay, "vibrator", "10 m3 of concrete per day"),
    ...(ew ? [labour("labour-excavation", "Labourer, excavation and backfill", "শ্রমিক, মাটি কাটা ও ভরাট", (ew.excavationM3 + ew.backfillM3) / L.excavationM3PerDay, undefined, "3 m3 per labourer-day")] : []),
  ];
  return [
    ...more,
    ...labourItems,
    { id: "concrete", category: "concrete", description: bi("Structural concrete, 1:1.5:3 (footings, columns, beams, slabs)", "কাঠামোগত কংক্রিট ১:১.৫:৩ (ফুটিং, কলাম, বিম, স্ল্যাব)"), unit: "m3", quantity: conc, basis: bi("from the bar schedule volumes", "বার শিডিউলের আয়তন থেকে") },
    { id: "concrete-cement", category: "concrete", description: bi("Cement in concrete", "কংক্রিটে সিমেন্ট"), unit: "bag", quantity: cementConcM3 / BAG_M3, rateKey: "cement-opc-43", basis: bi("dry volume / 0.0347 m3 per bag", "শুকনো আয়তন / প্রতি ব্যাগ ০.০৩৪৭ ঘনমিটার") },
    { id: "concrete-sand", category: "concrete", description: bi("Sand in concrete", "কংক্রিটে বালি"), unit: "cft", quantity: sandConcM3 * CFT_PER_M3, rateKey: "sand-fine", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
    { id: "concrete-stone", category: "concrete", description: bi("Stone chips in concrete", "কংক্রিটে পাথর"), unit: "cft", quantity: stoneConcM3 * CFT_PER_M3, rateKey: "stone-chips", basis: bi("m3 x 35.31", "ঘনমিটার × ৩৫.৩১") },
    formwork("formwork-footing", "footings", "ফুটিং", fw.footing, "formwork-footing"),
    formwork("formwork-column", "columns", "কলাম", fw.column, "formwork-column"),
    formwork("formwork-beam", "beams", "বিম", fw.beam, "formwork-beam"),
    formwork("formwork-slab", "slabs", "স্ল্যাব", fw.slab, "formwork-slab"),
    ...(fw.core > 0 ? [formwork("formwork-core", "lift shaft walls (priced at the column form rate)", "লিফট শাফটের দেয়াল (কলাম ফর্মের দরে)", fw.core, "formwork-column")] : []),
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
