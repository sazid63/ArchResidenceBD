/**
 * The plan validator (BUILD_PLAN.md §5.4): checks a fitted plan the way a reviewer would.
 * Every plan in the library must pass it across its whole fit range (see plans.test.ts).
 */

import { planStair } from "../cad/stairBuilder";
import { checkDefinition } from "./fit";
import { deriveGeometry, OUTSIDE, type FloorGeometry } from "./geometry";
import { MAX_SPAN_MM, ROOM_RULES, RULES_SOURCE, WALL_MM } from "./rules";
import type { FittedPlan } from "./types";

export type IssueCode =
  | "definition"
  | "room_too_small"
  | "room_too_narrow"
  | "no_daylight"
  | "no_ventilation"
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
  /** "assumption" until the threshold is sourced from BNBC 2020 (T3.0). */
  basis: "assumption" | "geometry";
}

export interface ValidateOptions {
  /** Floor-to-floor height used to size the stair, mm. */
  floorToFloorMm?: number;
}

const m = (mm: number) => (mm / 1000).toFixed(2);

export function validateFloor(geo: FloorGeometry, opts: ValidateOptions = {}): Issue[] {
  const f: FittedPlan = geo.fitted;
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);

  for (const e of checkDefinition(f.plan)) add({ code: "definition", severity: "error", message: e, basis: "geometry" });

  // Room sizes and daylight.
  f.rooms.forEach((room, i) => {
    const rule = ROOM_RULES[room.def.kind];
    const met = geo.metrics[i];
    const id = room.def.id;
    if (rule?.minAreaM2 !== undefined && met.netAreaM2 < rule.minAreaM2)
      add({ code: "room_too_small", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} is ${met.netAreaM2.toFixed(1)} m² net; working minimum ${rule.minAreaM2} m².` });
    if (rule?.minWidthMm !== undefined && met.netWidthMm < rule.minWidthMm)
      add({ code: "room_too_narrow", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} is ${m(met.netWidthMm)} m wide net; working minimum ${m(rule.minWidthMm)} m.` });
    if (rule?.needs === "exterior" && met.exteriorMm === 0)
      add({ code: "no_daylight", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} has no outside wall for a window.` });
    if (rule?.needs === "exterior_or_shaft" && met.exteriorMm === 0 && met.shaftMm === 0)
      add({ code: "no_ventilation", severity: "error", roomId: id, basis: RULES_SOURCE.status, message: `${room.def.name.en} has neither an outside wall nor a light shaft.` });
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
      });
  });

  // Doors that could not be placed.
  for (const p of geo.doorProblems)
    add({ code: "door_not_placeable", severity: "error", basis: "geometry", message: `Door ${p.between[0]} ↔ ${p.between[1]}: ${p.reason}.` });

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
      add({ code: "no_entrance", severity: "error", basis: "geometry", message: `Dwelling ${unit} has ${mains.length} entrance doors; it needs exactly one.` });
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
        add({ code: "unreachable", severity: "error", roomId: r.def.id, basis: "geometry", message: `${r.def.name.en} can't be reached from dwelling ${unit}'s entrance.` });
    });
    // Composition.
    const kinds = f.rooms.filter((r) => r.def.unit === unit).map((r) => r.def.kind);
    const count = (k: string) => kinds.filter((x) => x === k).length;
    const missing: string[] = [];
    if (count("bedroom") < f.plan.bedroomsPerUnit) missing.push(`${f.plan.bedroomsPerUnit} bedrooms (has ${count("bedroom")})`);
    if (count("kitchen") < 1) missing.push("a kitchen");
    if (count("toilet") < 1) missing.push("a toilet");
    if (count("living") < 1) missing.push("a living room");
    if (missing.length) add({ code: "unit_incomplete", severity: "error", basis: "geometry", message: `Dwelling ${unit} is missing ${missing.join(", ")}.` });
  }
  if (units.length !== f.plan.unitsPerFloor)
    add({ code: "unit_incomplete", severity: "error", basis: "geometry", message: `Plan says ${f.plan.unitsPerFloor} dwellings per floor but defines ${units.length}.` });

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
        add({ code: "unreachable", severity: "error", roomId: f.rooms[i].def.id, basis: "geometry", message: `${f.rooms[i].def.name.en} doesn't open onto the lobby.` });
    for (const d of geo.doors.filter((x) => x.main)) {
      const coreSide = [d.a, d.b].find((x) => x !== OUTSIDE && !f.rooms[x].def.unit);
      if (coreSide === undefined)
        add({ code: "no_entrance", severity: "error", basis: "geometry", message: "An entrance door doesn't open onto the shared core." });
    }
  }

  // Structural spans between column lines.
  for (const b of geo.beams)
    if (b.spanMm > MAX_SPAN_MM)
      add({ code: "span_too_long", severity: "error", basis: RULES_SOURCE.status, message: `Beam span ${m(b.spanMm)} m exceeds the ${m(MAX_SPAN_MM)} m screening limit.` });

  return issues;
}

/** Fit-and-check helper used by tests and the plan picker. */
export function validateFitted(f: FittedPlan, opts?: ValidateOptions) {
  const geo = deriveGeometry(f);
  return { geo, issues: validateFloor(geo, opts) };
}

export { WALL_MM };
