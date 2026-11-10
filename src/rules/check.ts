/**
 * RAJUK 2008 checks on a BuildingModel: setbacks, FAR, ground coverage, parking.
 * `check(model, ctx)` returns one result per rule with expected, actual and the gazette source.
 * Anything the model cannot decide is "not_checked" - never guessed (CLAUDE.md, settled rules).
 */

import type { BuildingModel } from "../model/building";
import { farRow, farRowByArea, parkingSpaces, type FarResult, type ParkingRow } from "./engine";
import { rajukPack } from "./pack";
import { layoutParking } from "./parking";
import { rajukSetbacks } from "./setbacks";

export type CheckStatus = "pass" | "fail" | "not_checked";

export interface CheckValue {
  value: number | string;
  unit: string;
}

export interface CheckSource {
  pack: string;
  cite: string;
  clause: string;
  /** The clause in Bangla numerals/words, for the Bangla UI. */
  clauseBn: string;
  gazettePage: string;
  pdfPage: string;
}

export interface Bilingual {
  en: string;
  bn: string;
}

export interface CheckResult {
  ruleId: string;
  status: CheckStatus;
  title: Bilingual;
  expected: CheckValue | null;
  actual: CheckValue | null;
  source: CheckSource;
  /** Why it is not checked, or an assumption behind the number. */
  note?: Bilingual;
}

export interface CheckContext {
  /** Width of the adjoining road. FAR, coverage and parking-free rules need it. */
  roadWidthM?: number;
  /** Pack use class; default A1-A4 (residential building). */
  useClass?: string;
  /** Skip the parking layout (the plan picker only needs coverage). */
  skipParking?: boolean;
}

const ROAD_STEPS = [6, 9, 12, 18, 24];

function source(cite: string, clause: string, clauseBn: string): CheckSource {
  const pack = rajukPack();
  const c = pack.citations[cite];
  return { pack: pack.id, cite, clause, clauseBn, gazettePage: c?.gazettePage ?? "", pdfPage: c?.pdfPage ?? "" };
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Largest printed road step not above the road; null under 6 m (narrow-road rows are not modelled). */
export function roadStep(roadWidthM: number): number | null {
  const steps = ROAD_STEPS.filter((s) => s <= roadWidthM);
  return steps.length ? steps[steps.length - 1] : null;
}

function farFor(model: BuildingModel, ctx: CheckContext): { hit: FarResult | null; note?: Bilingual; reason?: Bilingual } {
  const pack = rajukPack();
  const cls = ctx.useClass ?? "A1-A4";
  const area = model.plotAreaM2;
  if (ctx.roadWidthM === undefined) {
    return { hit: null, reason: { en: "Road width not entered.", bn: "রাস্তার প্রস্থ দেওয়া হয়নি।" } };
  }
  const step = roadStep(ctx.roadWidthM);
  if (step === null) {
    return { hit: null, reason: { en: "Roads under 6 m use a separate rule (section 51(9)-(10)) that is not modelled yet.", bn: "৬ মিটারের কম প্রস্থের রাস্তার জন্য আলাদা বিধি (ধারা ৫১(৯)-(১০)) আছে, যা এখনো মডেল করা হয়নি।" } };
  }
  const exact = farRow(pack.farTables, cls, area, step);
  if (exact) return { hit: exact };
  const byArea = farRowByArea(pack.farTables, cls, area);
  if (byArea) {
    return {
      hit: byArea,
      note: {
        en: `The table row for this plot area was used (section 51(14)); the road-width bonus of section 51(11) is not applied.`,
        bn: "এই জমির আকারের সারণি-সারি ব্যবহার করা হয়েছে (ধারা ৫১(১৪)); ধারা ৫১(১১) অনুযায়ী রাস্তা-প্রস্থ বোনাস যোগ করা হয়নি।",
      },
    };
  }
  return { hit: null, reason: { en: "No table row applies to this use class, plot area and road.", bn: "এই ব্যবহার-শ্রেণী, জমির আকার ও রাস্তার জন্য কোনো সারি প্রযোজ্য নয়।" } };
}

/** FAR-counted floor area in mm2: every storey's footprint, less the parking rooms (section 51(5): parking is exempt). */
function farAreaMm2(model: BuildingModel): number {
  const footprint = model.widthMm * model.depthMm;
  let total = 0;
  for (const s of model.storeys) {
    let a = footprint;
    for (const r of s.geometry.fitted.rooms) if (r.def.kind === "parking") a -= r.grossAreaMm2;
    total += a;
  }
  return total;
}

/** Ground-floor built area in mm2: the bounding box less the unbuilt notches (balcony gaps open to the sky). */
export function groundBuiltAreaMm2(model: BuildingModel): number {
  const notch = (model.storeys[0]?.geometry.fitted.voidRects ?? []).reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0);
  return model.widthMm * model.depthMm - notch;
}

function notChecked(ruleId: string, title: Bilingual, src: CheckSource, reason: Bilingual, expected: CheckValue | null = null): CheckResult {
  return { ruleId, status: "not_checked", title, expected, actual: null, source: src, note: reason };
}

function setbackResults(model: BuildingModel): CheckResult[] {
  const req = rajukSetbacks(model.plotAreaM2, model.input.storeys, model.input.floorToFloorMm);
  const left = model.origin.x;
  const right = model.plot.x1 - (model.origin.x + model.widthMm);
  const front = model.origin.y;
  const rear = model.plot.y1 - (model.origin.y + model.depthMm);
  const src = source(req.cite, "§46(1)-(2)", "§৪৬(১)-(২)");
  const mk = (id: string, en: string, bn: string, need: number, got: number): CheckResult => ({
    ruleId: `rajuk.setback.${id}`,
    status: got >= need ? "pass" : "fail",
    title: { en: `${en} setback`, bn: `${bn} সেটব্যাক` },
    expected: { value: need, unit: "mm" },
    actual: { value: got, unit: "mm" },
    source: src,
    note: req.row.beyond ? { en: "Taller than 33 m or 10 storeys: the larger setbacks apply.", bn: "৩৩ মিটার বা ১০ তলার বেশি উঁচু: বড় সেটব্যাক প্রযোজ্য।" } : undefined,
  });
  return [
    mk("front", "Front", "সামনের", req.setbacksMm.front, front),
    mk("rear", "Rear", "পিছনের", req.setbacksMm.rear, rear),
    mk("side", "Side", "পাশের", req.setbacksMm.left, Math.min(left, right)),
  ];
}

function farAndCoverage(model: BuildingModel, ctx: CheckContext): CheckResult[] {
  const farTitle = { en: "Floor area ratio (FAR)", bn: "ফ্লোর এরিয়া রেশিও (FAR)" };
  const mgcTitle = { en: "Maximum ground coverage", bn: "সর্বোচ্চ ভূমি আচ্ছাদন" };
  const farSrc = source("far-3ka", "Table 3(ka)", "সারণি-৩(ক)");
  const { hit, note, reason } = farFor(model, ctx);
  if (!hit) {
    const r = reason as Bilingual;
    return [notChecked("rajuk.far", farTitle, farSrc, r), notChecked("rajuk.mgc", mgcTitle, farSrc, r)];
  }
  if (hit.prohibited) {
    const n = { en: "This use is not approved on a plot of this size.", bn: "এই আকারের জমিতে এই ব্যবহার অনুমোদিত নয়।" };
    return [
      { ruleId: "rajuk.far", status: "fail", title: farTitle, expected: { value: "not permitted", unit: "" }, actual: null, source: farSrc, note: n },
      { ruleId: "rajuk.mgc", status: "fail", title: mgcTitle, expected: { value: "not permitted", unit: "" }, actual: null, source: farSrc, note: n },
    ];
  }
  const plotMm2 = model.plotAreaM2 * 1e6;
  const farActual = farAreaMm2(model) / plotMm2;
  const results: CheckResult[] = [];
  const farCap = hit.far;
  results.push({
    ruleId: "rajuk.far",
    status: farCap === "NR" || farActual <= farCap ? "pass" : "fail",
    title: farTitle,
    expected: { value: farCap === "NR" ? "no cap" : farCap, unit: farCap === "NR" ? "" : "x plot" },
    actual: { value: round2(farActual), unit: "x plot" },
    source: farSrc,
    note,
  });
  const mgcActual = (groundBuiltAreaMm2(model) / plotMm2) * 100;
  results.push({
    ruleId: "rajuk.mgc",
    status: mgcActual <= hit.mgcPercent ? "pass" : "fail",
    title: mgcTitle,
    expected: { value: hit.mgcPercent, unit: "%" },
    actual: { value: round2(mgcActual), unit: "%" },
    source: farSrc,
    note,
  });
  return results;
}

/** Cars (and motorcycles) required by Schedule 4 for the flats. Fractions are summed, then rounded up once (note s4-n-fraction). */
export function requiredParking(model: BuildingModel): { cars: number; motorcycles: number } | null {
  const pack = rajukPack();
  const typical = model.storeys.find((s) => s.use === "typical");
  if (!typical) return null;
  const areas = new Map<string, number>();
  for (const r of typical.geometry.fitted.rooms) {
    if (r.def.unit) areas.set(r.def.unit, (areas.get(r.def.unit) ?? 0) + r.grossAreaMm2 / 1e6);
  }
  if (!areas.size) return null;
  const floors = model.storeys.filter((s) => s.use === "typical").length;
  const LCD = 120;
  let carFractions = 0;
  let moto = 0;
  const flatRows = pack.parkingSchedule.rows.filter((r: ParkingRow) => r.spaces.basis === "unit");
  for (const sqm of areas.values()) {
    for (const row of flatRows) {
      const lo = row.unitAreaMinExclusiveSqm ?? 0;
      const hi = row.unitAreaMaxSqm ?? Infinity;
      if (!(sqm > lo && sqm <= hi)) continue;
      if (row.additive) moto += floors * row.spaces.numerator * (LCD / row.spaces.denominator);
      else carFractions += floors * row.spaces.numerator * (LCD / row.spaces.denominator);
    }
  }
  const singleCar = pack.parkingSchedule.rows.find((r) => r.id === "park-single-family-up-to-200") as ParkingRow;
  return { cars: Math.max(parkingSpaces(singleCar, 1), Math.ceil(carFractions / LCD)), motorcycles: Math.ceil(moto / LCD) };
}

function parkingResult(model: BuildingModel): CheckResult {
  const title = { en: "Car parking", bn: "গাড়ি পার্কিং" };
  const src = source("schedule4", "Schedule 4", "তফসিল-৪");
  const need = requiredParking(model);
  if (!need) return notChecked("rajuk.parking", title, src, { en: "No dwellings in the plan.", bn: "প্ল্যানে কোনো ফ্ল্যাট নেই।" });
  const lay = layoutParking(model);
  const cars = lay.cars.length;
  const motos = lay.motorcycles.length;
  const ok = cars >= need.cars && motos + (cars - need.cars) * 0 >= need.motorcycles;
  const layoutEn = lay.option === "none" ? "no stall fits" : lay.option.replace("-", " ");
  const layoutBn = lay.option === "none" ? "কোনো স্টল বসে না" : { "perpendicular-double": "লম্ব, দুই পাশে", "perpendicular-single": "লম্ব, এক পাশে", "parallel-double": "সমান্তরাল, দুই পাশে", "parallel-single": "সমান্তরাল, এক পাশে", "front-setback": "সামনের সেটব্যাক থেকে সামনের সারিতে" }[lay.option];
  return {
    ruleId: "rajuk.parking",
    status: ok ? "pass" : "fail",
    title,
    expected: { value: need.cars, unit: "cars" },
    actual: { value: cars, unit: "cars" },
    source: src,
    note: {
      en: `Needs ${need.cars} cars and ${need.motorcycles} motorcycles; the ground floor holds ${cars} car stalls (2.40 x 4.60 m, section 56(1)-(3); layout: ${layoutEn}) and ${motos} motorcycle stalls (1.00 x 2.00 m) inside the building footprint. Columns are taken as 600 mm squares, no parking in the setbacks, one drive aisle clear from the front face (assumptions). Flat size is the sum of its room areas (assumption). Ramp, gate and clearance (section 56(7)-(13)) are not checked: the ground floor is level with the road.`,
      bn: `${need.cars}টি গাড়ি ও ${need.motorcycles}টি মোটরসাইকেল লাগবে; নিচতলায় ভবনের ভিতরে ${cars}টি গাড়ির স্টল (২.৪০ x ৪.৬০ মিটার, ধারা ৫৬(১)-(৩); সাজানো: ${layoutBn}) ও ${motos}টি মোটরসাইকেল স্টল (১.০০ x ২.০০ মিটার) আছে। কলাম ৬০০ মিমি বর্গ ধরা হয়েছে, সেটব্যাকে পার্কিং ধরা হয়নি, সামনের মুখ থেকে একটি ড্রাইভ আইল ফাঁকা (অনুমান)। ফ্ল্যাটের আকার কক্ষগুলির ক্ষেত্রফলের যোগফল (অনুমান)। র‍্যাম্প, গেট ও ক্লিয়ারেন্স (ধারা ৫৬(৭)-(১৩)) যাচাই করা হয়নি: নিচতলা রাস্তার সমতলে।`,
    },
  };
}

export function check(model: BuildingModel, ctx: CheckContext = {}): CheckResult[] {
  return [...setbackResults(model), ...farAndCoverage(model, ctx), ...(ctx.skipParking ? [] : [parkingResult(model)])];
}
