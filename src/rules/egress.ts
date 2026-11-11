/**
 * Fire and egress checks the plan geometry can decide (P2-4), BNBC 2020 Part 4 as transcribed in spec/rules/bnbc-2020.yaml:
 * travel distance and corridor width (Table 4.3.8), stair width (Table 4.3.6) and stair capacity (Table 4.3.2).
 *
 * Occupancy class is fixed to A3, apartment houses (owner decision 2026-11-12: not an input), and the building is taken as not
 * sprinklered, the stricter column of each table. A pack value the app cannot evaluate (second exit above six storeys, refuge
 * area, fire lift) is left to the report as "not checked".
 */

import { DEFAULT_STAIR } from "../cad/stairBuilder";
import type { BuildingModel } from "../model/building";
import { OUTSIDE } from "../plans/geometry";
import { bnbcPack } from "./bnbc";

export const OCCUPANCY_CLASS = "A3";
/** People per flat, the same working figure the lift sizing uses (assumption). */
export const PERSONS_PER_FLAT = 5;

interface EgressRow {
  classes: string[];
  travelPathUnsprinkleredM: number | null;
  corridorMinWidthMm?: number;
  corridorMaxDeadEndMm?: number;
}
interface EgressPack {
  rows: EgressRow[];
  requiredWidthPerOccupantMm: { unsprinklered: { stairways: number } };
}
interface StairRow {
  id: string;
  byClass?: Record<string, number | null>;
}

const pack = () => bnbcPack() as unknown as { egress: EgressPack; stairs: StairRow[] };

export interface EgressLimits {
  travelPathM: number;
  corridorMinWidthMm: number;
  corridorMaxDeadEndMm: number;
  stairMinWidthMm: number;
  stairMmPerOccupant: number;
}

export function egressLimits(): EgressLimits {
  const p = pack();
  const row = p.egress.rows.find((r) => r.classes.includes(OCCUPANCY_CLASS))!;
  const stair = p.stairs.find((s) => s.id === "stair-min-width")!;
  return {
    travelPathM: row.travelPathUnsprinkleredM as number,
    corridorMinWidthMm: row.corridorMinWidthMm as number,
    corridorMaxDeadEndMm: row.corridorMaxDeadEndMm as number,
    stairMinWidthMm: stair.byClass![OCCUPANCY_CLASS] as number,
    stairMmPerOccupant: p.egress.requiredWidthPerOccupantMm.unsprinklered.stairways,
  };
}

export interface EgressResult {
  limits: EgressLimits;
  /** Longest walking distance from a room of a flat to the stair, mm, through the doors, and where it starts. */
  travelMm: number;
  travelFrom: string;
  /** Narrowest corridor on the typical floor, mm (null when there is none). */
  corridorMm: number | null;
  /** Clear width of one stair flight, mm. */
  stairFlightMm: number;
  persons: number;
  /** Stair width needed for the persons of one floor, mm. */
  stairNeededMm: number;
}

type P = { x: number; y: number };

/** The typical floor's egress figures. */
export function evaluateEgress(model: BuildingModel): EgressResult | null {
  const typical = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  const rooms = typical.fitted.rooms;
  const stair = rooms.findIndex((r) => r.def.kind === "stair");
  if (stair < 0) return null;
  const centre = (i: number): P => {
    const r = [...rooms[i].rects].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0];
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const dist = (a: P, b: P) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y); // walls are orthogonal: walk along them
  // Graph over rooms: a door joins two rooms; walking through costs centre to door plus door to centre.
  const adj: Array<Array<{ to: number; cost: number }>> = rooms.map(() => []);
  for (const d of typical.doors) {
    if (d.a === OUTSIDE || d.b === OUTSIDE) continue;
    const m: P = d.orientation === "v" ? { x: d.at, y: (d.from + d.to) / 2 } : { x: (d.from + d.to) / 2, y: d.at };
    const cost = dist(centre(d.a), m) + dist(m, centre(d.b));
    adj[d.a].push({ to: d.b, cost });
    adj[d.b].push({ to: d.a, cost });
  }
  // Dijkstra from the stair.
  const best = rooms.map(() => Infinity);
  best[stair] = 0;
  const todo = new Set(rooms.map((_, i) => i));
  while (todo.size) {
    let u = -1;
    for (const i of todo) if (u < 0 || best[i] < best[u]) u = i;
    if (!isFinite(best[u])) break;
    todo.delete(u);
    for (const e of adj[u]) best[e.to] = Math.min(best[e.to], best[u] + e.cost);
  }
  let travelMm = 0;
  let travelFrom = "";
  rooms.forEach((r, i) => {
    if (!r.def.unit || r.def.kind === "shaft" || !isFinite(best[i])) return;
    if (best[i] > travelMm) {
      travelMm = best[i];
      travelFrom = r.def.name.en;
    }
  });
  const corridors = rooms.map((r, i) => (r.def.kind === "corridor" ? typical.metrics[i].netWidthMm : null)).filter((v): v is number => v !== null);
  const flats = typical.fitted.plan.unitsPerFloor;
  const persons = flats * PERSONS_PER_FLAT;
  const limits = egressLimits();
  return {
    limits,
    travelMm,
    travelFrom,
    corridorMm: corridors.length ? Math.min(...corridors) : null,
    stairFlightMm: DEFAULT_STAIR.flightWidthMm,
    persons,
    stairNeededMm: persons * limits.stairMmPerOccupant,
  };
}
