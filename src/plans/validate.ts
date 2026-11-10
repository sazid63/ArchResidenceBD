/**
 * The plan validator (BUILD_PLAN.md §5.4): checks a fitted plan the way a reviewer would.
 * Every plan in the library must pass it across its whole fit range (see plans.test.ts).
 */

import { planStair } from "../cad/stairBuilder";
import { checkDefinition } from "./fit";
import { deriveGeometry, OUTSIDE, type FloorGeometry } from "./geometry";
import { MAX_SPAN_MM, OPENING_PERCENT, ROOM_RULES, RULES_SOURCE, WALL_MM, WINDOW_HEIGHT_MM, roomRuleBasis } from "./rules";
import type { FittedPlan } from "./types";

export type IssueCode =
  | "definition"
  | "room_too_small"
  | "room_too_narrow"
  | "no_daylight"
  | "no_ventilation"
  | "window_area_low"
  | "stair_too_small"
  | "door_not_placeable"
  | "unreachable"
  | "no_entrance"
  | "unit_incomplete"
  | "span_too_long";

export interface Issue {
  code: IssueCode;
  severity: "error" | "warning";
  roomId?: string;
  message: string;
  /** The same message in Bangla (digits in Bangla numerals). */
  messageBn: string;
  /** "cited" = BNBC 2020 figure, "assumption" = working value, "geometry" = a pure geometry fact. */
  basis: "cited" | "assumption" | "geometry";
}

export interface ValidateOptions {
  /** Floor-to-floor height used to size the stair, mm. */
  floorToFloorMm?: number;
}

const m = (mm: number) => (mm / 1000).toFixed(2);
const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
/** Bangla numerals for a number or numeric string. */
const bn = (v: number | string) => String(v).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

export function validateFloor(geo: FloorGeometry, opts: ValidateOptions = {}): Issue[] {
  const f: FittedPlan = geo.fitted;
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  for (const e of checkDefinition(f.plan)) add({ code: "definition", severity: "error", message: e, messageBn: `পরিকল্পনার সংজ্ঞায় ত্রুটি: ${e}`, basis: "geometry" });

  // Room sizes and daylight.
  f.rooms.forEach((room, i) => {
    const rule = ROOM_RULES[room.def.kind];
    const met = geo.metrics[i];
    const id = room.def.id;
    const sized = roomRuleBasis(room.def.kind);
    if (rule?.minAreaM2 !== undefined && met.netAreaM2 < rule.minAreaM2)
      add({ code: "room_too_small", severity: "error", roomId: id, basis: sized, message: `${room.def.name.en} is ${met.netAreaM2.toFixed(1)} m² net; ${sized === "cited" ? "BNBC minimum" : "working minimum"} ${rule.minAreaM2} m².`, messageBn: `${room.def.name.bn}-এর নিট ক্ষেত্রফল ${bn(met.netAreaM2.toFixed(1))} বর্গমিটার; ${sized === "cited" ? "বিএনবিসি ন্যূনতম" : "কাজের ন্যূনতম"} ${bn(rule.minAreaM2)} বর্গমিটার।` });
    if (rule?.minWidthMm !== undefined && met.netWidthMm < rule.minWidthMm)
      add({ code: "room_too_narrow", severity: "error", roomId: id, basis: sized, message: `${room.def.name.en} is ${m(met.netWidthMm)} m wide net; ${sized === "cited" ? "BNBC minimum" : "working minimum"} ${m(rule.minWidthMm)} m.`, messageBn: `${room.def.name.bn}-এর নিট প্রস্থ ${bn(m(met.netWidthMm))} মিটার; ${sized === "cited" ? "বিএনবিসি ন্যূনতম" : "কাজের ন্যূনতম"} ${bn(m(rule.minWidthMm))} মিটার।` });
    if (rule?.needs === "exterior" && met.exteriorMm === 0)
      add({ code: "no_daylight", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} has no outside wall for a window.`, messageBn: `${room.def.name.bn}-এর জানালার জন্য বাইরের দেয়াল নেই।` });
    if (rule?.needs === "exterior_or_shaft" && met.exteriorMm === 0 && met.shaftMm === 0)
      add({ code: "no_ventilation", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} has neither an outside wall nor a light shaft.`, messageBn: `${room.def.name.bn}-এর বাইরের দেয়ালও নেই, আলো-বাতাসের শাফটও নেই।` });
  });

  // Window area (Table 3.1.12): a room with a window needs 15 % (habitable) or 18 % (kitchen) of its net floor area.
  f.rooms.forEach((room, i) => {
    const pct = OPENING_PERCENT[room.def.kind];
    if (pct === undefined) return;
    const wins = geo.windows.filter((w) => w.a === i);
    if (!wins.length) return;
    const have = (wins.reduce((a, w) => a + (w.to - w.from), 0) * WINDOW_HEIGHT_MM) / 1e6;
    const need = (pct / 100) * geo.metrics[i].netAreaM2;
    if (have + 1e-9 < need)
      add({ code: "window_area_low", severity: "warning", roomId: room.def.id, basis: "cited", message: `${room.def.name.en} window is ${have.toFixed(2)} m²; BNBC Table 3.1.12 needs ${pct} % of ${geo.metrics[i].netAreaM2.toFixed(1)} m² = ${need.toFixed(2)} m².`, messageBn: `${room.def.name.bn}-এর জানালা ${bn(have.toFixed(2))} বর্গমিটার; বিএনবিসি সারণি ৩.১.১২ অনুযায়ী ${bn(geo.metrics[i].netAreaM2.toFixed(1))} বর্গমিটারের ${bn(pct)} % = ${bn(need.toFixed(2))} বর্গমিটার দরকার।` });
  });

  // Stair: must hold a dog-leg stair for this floor height plus an arrival landing.
  const stairLayout = planStair(opts.floorToFloorMm ?? 3000);
  const needLong = stairLayout.lengthMm + 1000; // flights + landing at the far end + arrival landing
  const needWide = stairLayout.widthMm;
  f.rooms.forEach((room, i) => {
    if (room.def.kind !== "stair") return;
    const met = geo.metrics[i];
    if (met.netDepthMm < needLong || met.netWidthMm < needWide)
      add({
        code: "stair_too_small",
        severity: "error",
        roomId: room.def.id,
        basis: "geometry",
        message: `Stair room is ${m(met.netDepthMm)} × ${m(met.netWidthMm)} m net; a dog-leg stair for ${m(opts.floorToFloorMm ?? 3000)} m floors needs ${m(needLong)} × ${m(needWide)} m.`,
        messageBn: `সিঁড়িঘরের নিট মাপ ${bn(m(met.netDepthMm))} × ${bn(m(met.netWidthMm))} মিটার; ${bn(m(opts.floorToFloorMm ?? 3000))} মিটার উচ্চতার তলার ডগ-লেগ সিঁড়ির জন্য দরকার ${bn(m(needLong))} × ${bn(m(needWide))} মিটার।`,
      });
  });

  // Doors that could not be placed.
  for (const p of geo.doorProblems)
    add({ code: "door_not_placeable", severity: "error", basis: "geometry", message: `Door ${p.between[0]} ↔ ${p.between[1]}: ${p.reason}.`, messageBn: `দরজা ${p.between[0]} ↔ ${p.between[1]}: ${p.reasonBn}।` });

  // Reachability: within each dwelling from its entrance; the core from any entrance.
  const n = f.rooms.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const d of geo.doors) {
    if (d.a === OUTSIDE || d.b === OUTSIDE) continue;
    adj[d.a].push(d.b);
    adj[d.b].push(d.a);
  }
  const units = [...new Set(f.rooms.map((r) => r.def.unit).filter((u): u is string => !!u))];
  for (const unit of units) {
    const mains = geo.doors.filter((d) => d.main && [d.a, d.b].some((x) => x !== OUTSIDE && f.rooms[x].def.unit === unit));
    if (mains.length !== 1) {
      add({ code: "no_entrance", severity: "error", basis: "geometry", message: `Dwelling ${unit} has ${mains.length} entrance doors; it needs exactly one.`, messageBn: `ইউনিট ${unit}-এ প্রবেশের দরজা ${bn(mains.length)}টি; ঠিক একটি থাকতে হবে।` });
      continue;
    }
    const start = [mains[0].a, mains[0].b].find((x) => f.rooms[x].def.unit === unit)!;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj[cur]) if (!seen.has(nb) && f.rooms[nb].def.unit === unit) { seen.add(nb); queue.push(nb); }
    }
    f.rooms.forEach((r, i) => {
      if (r.def.unit === unit && !seen.has(i) && r.def.kind !== "shaft")
        add({ code: "unreachable", severity: "error", roomId: r.def.id, basis: "geometry", message: `${r.def.name.en} can't be reached from dwelling ${unit}'s entrance.`, messageBn: `ইউনিট ${unit}-এর প্রবেশপথ থেকে ${r.def.name.bn}-এ পৌঁছানো যায় না।` });
    });
    // Composition.
    const kinds = f.rooms.filter((r) => r.def.unit === unit).map((r) => r.def.kind);
    const count = (k: string) => kinds.filter((x) => x === k).length;
    const missing: string[] = [];
    const missingBn: string[] = [];
    if (count("bedroom") < f.plan.bedroomsPerUnit) { missing.push(`${f.plan.bedroomsPerUnit} bedrooms (has ${count("bedroom")})`); missingBn.push(`${bn(f.plan.bedroomsPerUnit)}টি শয়নকক্ষ (আছে ${bn(count("bedroom"))}টি)`); }
    if (count("kitchen") < 1) { missing.push("a kitchen"); missingBn.push("রান্নাঘর"); }
    if (count("toilet") < 1) { missing.push("a toilet"); missingBn.push("টয়লেট"); }
    if (count("living") < 1) { missing.push("a living room"); missingBn.push("বসার ঘর"); }
    if (missing.length) add({ code: "unit_incomplete", severity: "error", basis: "geometry", message: `Dwelling ${unit} is missing ${missing.join(", ")}.`, messageBn: `ইউনিট ${unit}-এ নেই: ${missingBn.join(", ")}।` });
  }
  if (units.length !== f.plan.unitsPerFloor)
    add({ code: "unit_incomplete", severity: "error", basis: "geometry", message: `Plan says ${f.plan.unitsPerFloor} dwellings per floor but defines ${units.length}.`, messageBn: `পরিকল্পনায় প্রতি তলায় ${bn(f.plan.unitsPerFloor)}টি ইউনিট বলা আছে, কিন্তু সংজ্ঞায় আছে ${bn(units.length)}টি।` });

  // Core: stair and lift reachable from a lobby; every entrance opens onto the core.
  const core = f.rooms.map((r, i) => (!r.def.unit ? i : -1)).filter((i) => i >= 0);
  if (core.length) {
    const lobby = core.find((i) => f.rooms[i].def.kind === "lobby");
    const seen = new Set<number>(lobby !== undefined ? [lobby] : []);
    const queue = [...seen];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj[cur]) if (!seen.has(nb) && !f.rooms[nb].def.unit) { seen.add(nb); queue.push(nb); }
    }
    for (const i of core)
      if (!seen.has(i) && f.rooms[i].def.kind !== "shaft")
        add({ code: "unreachable", severity: "error", roomId: f.rooms[i].def.id, basis: "geometry", message: `${f.rooms[i].def.name.en} doesn't open onto the lobby.`, messageBn: `${f.rooms[i].def.name.bn} লবিতে খোলে না।` });
    for (const d of geo.doors.filter((x) => x.main)) {
      const coreSide = [d.a, d.b].find((x) => x !== OUTSIDE && !f.rooms[x].def.unit);
      if (coreSide === undefined)
        add({ code: "no_entrance", severity: "error", basis: "geometry", message: "An entrance door doesn't open onto the shared core.", messageBn: "একটি প্রবেশের দরজা সাধারণ কোরে খোলে না।" });
    }
  }

  // Structural spans between column lines.
  for (const b of geo.beams)
    if (b.spanMm > MAX_SPAN_MM)
      add({ code: "span_too_long", severity: "error", basis: RULES_SOURCE.status, message: `Beam span ${m(b.spanMm)} m exceeds the ${m(MAX_SPAN_MM)} m screening limit.`, messageBn: `বিমের স্প্যান ${bn(m(b.spanMm))} মিটার, যা ${bn(m(MAX_SPAN_MM))} মিটারের যাচাই-সীমা ছাড়িয়েছে।` });

  return issues;
}

/** Fit-and-check helper used by tests and the plan picker. */
export function validateFitted(f: FittedPlan, opts?: ValidateOptions) {
  const geo = deriveGeometry(f);
  return { geo, issues: validateFloor(geo, opts) };
}

export { WALL_MM };
