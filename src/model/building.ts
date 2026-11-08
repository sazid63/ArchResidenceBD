/**
 * The building model (BUILD_PLAN.md §4.2): everything derived from the plot, the chosen plan and
 * the number of storeys. 3D, structure, quantities and drawings all read this, so they can't
 * disagree. Pure and deterministic; all lengths are integer mm.
 *
 * Coordinates: plot frame, x across the frontage left to right (facing the plot from the road),
 * y from the road-side boundary (y = 0) to the back. Floor geometry stays in the plan's own frame
 * (origin at the building's front-left corner); add `origin` to place it on the plot.
 */

import { fitPlan, type Envelope } from "../plans/fit";
import { deriveGeometry, type FloorGeometry } from "../plans/geometry";
import { getPlan } from "../plans/library";
import type { CellRect, FitRejection, PlanDefinition, Rect, RoomDef } from "../plans/types";
import { validateFloor, type Issue } from "../plans/validate";

export interface Setbacks {
  front: number;
  rear: number;
  left: number;
  right: number;
}

/**
 * ASSUMPTION: the values the v2 app used. Replaced by the RAJUK 2008 setback schedule (by plot
 * area, road width and height) in ticket M3-2; until then results say so.
 */
export const DEFAULT_SETBACKS_MM: Setbacks = { front: 1500, rear: 2000, left: 1000, right: 1000 };

export interface BuildingInput {
  plotWidthMm: number;
  plotDepthMm: number;
  /** Storeys including the ground floor (a "4-storey" building has a ground floor and 3 floors above). */
  storeys: number;
  planId: string;
  mirror?: boolean;
  floorToFloorMm?: number;
  setbacksMm?: Setbacks;
}

export interface StoreyModel {
  /** 0 = ground floor. */
  index: number;
  levelMm: number;
  heightMm: number;
  use: "ground" | "typical";
  /** Matches the phase ids the UI and mesh use (phase-ground-floor, phase-floor-<i>). */
  phaseId: string;
  geometry: FloorGeometry;
  issues: Issue[];
}

export interface RoofModel {
  levelMm: number;
  parapetMm: number;
  /** Plan-frame rectangles (add `origin` for plot coordinates); null when the plan has none. */
  stairCover: Rect | null;
  liftRoom: Rect | null;
  coverHeightMm: number;
  phaseId: "phase-rooftop";
}

export interface BuildingModel {
  input: Required<Omit<BuildingInput, "setbacksMm">> & { setbacksMm: Setbacks };
  plot: Rect;
  envelope: Rect;
  /** Building's front-left corner on the plot. */
  origin: { x: number; y: number };
  widthMm: number;
  depthMm: number;
  planId: string;
  storeys: StoreyModel[];
  roof: RoofModel;
  plotAreaM2: number;
  footprintAreaM2: number;
}

export type BuildingResult =
  | { ok: true; model: BuildingModel; notes: Array<{ en: string; bn: string }> }
  | { ok: false; reasons: FitRejection[] };

const COVER_HEIGHT_MM = 2400;
const PARAPET_MM = 1000;
const round10 = (v: number) => Math.round(v / 10) * 10;

const reject = (en: string, bn: string): BuildingResult => ({ ok: false, reasons: [{ code: "invalid_plan", message: { en, bn } }] });

/** The ground floor of a plan: the core (stair, lift, lobby) stays; every other cell is one parking room. */
export function groundFloorPlan(plan: PlanDefinition): PlanDefinition {
  const nx = plan.baysX.length;
  const ny = plan.baysY.length;
  const core: RoomDef[] = plan.rooms.filter((r) => !r.unit);
  const taken = Array.from({ length: nx }, () => Array<boolean>(ny).fill(false));
  for (const r of core) for (const [x0, y0, x1, y1] of r.cells) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) taken[x][y] = true;
  // Runs along x per row keep the cell list short.
  const cells: CellRect[] = [];
  for (let y = 0; y < ny; y++) {
    let x = 0;
    while (x < nx) {
      if (taken[x][y]) { x++; continue; }
      let e = x;
      while (e + 1 < nx && !taken[e + 1][y]) e++;
      cells.push([x, y, e, y]);
      x = e + 1;
    }
  }
  const lobby = core.find((r) => r.kind === "lobby");
  const coreIds = new Set(core.map((r) => r.id));
  const rooms: RoomDef[] = [...core];
  const doors = plan.doors.filter((d) => coreIds.has(d.between[0]) && coreIds.has(d.between[1]));
  if (cells.length) {
    rooms.push({ id: "parking", kind: "parking", name: { en: "Parking", bn: "পার্কিং" }, cells });
    if (lobby) doors.push({ between: [lobby.id, "parking"] });
  }
  return {
    ...plan,
    id: `${plan.id}:ground`,
    name: { en: `${plan.name.en} (ground floor)`, bn: `${plan.name.bn} (নিচতলা)` },
    unitsPerFloor: 0,
    bedroomsPerUnit: 0,
    rooms,
    doors,
  };
}

export function deriveBuilding(input: BuildingInput): BuildingResult {
  const plan = getPlan(input.planId);
  if (!plan) return reject(`Unknown plan "${input.planId}".`, `অজানা প্ল্যান "${input.planId}"।`);
  if (!Number.isInteger(input.storeys) || input.storeys < 1 || input.storeys > 30)
    return reject("Storeys must be a whole number from 1 to 30.", "তলার সংখ্যা ১ থেকে ৩০ এর মধ্যে পূর্ণসংখ্যা হতে হবে।");
  const floorToFloorMm = input.floorToFloorMm ?? 3000;
  if (!(floorToFloorMm >= 2700 && floorToFloorMm <= 5500))
    return reject("Floor-to-floor height must be between 2.7 m and 5.5 m.", "তল থেকে তলার উচ্চতা ২.৭ থেকে ৫.৫ মিটারের মধ্যে হতে হবে।");
  const setbacksMm = input.setbacksMm ?? DEFAULT_SETBACKS_MM;
  const mirror = !!input.mirror;

  const plot: Rect = { x0: 0, y0: 0, x1: input.plotWidthMm, y1: input.plotDepthMm };
  const envelope: Rect = {
    x0: setbacksMm.left,
    y0: setbacksMm.front,
    x1: input.plotWidthMm - setbacksMm.right,
    y1: input.plotDepthMm - setbacksMm.rear,
  };
  const env: Envelope = { widthMm: envelope.x1 - envelope.x0, depthMm: envelope.y1 - envelope.y0 };

  const typical = fitPlan(plan, env, { mirror });
  if (!typical.ok) return { ok: false, reasons: typical.reasons };
  // Same bays and envelope, so the ground floor lands on exactly the same grid lines.
  const ground = fitPlan(groundFloorPlan(plan), env, { mirror });
  if (!ground.ok) return { ok: false, reasons: ground.reasons };

  const typicalGeo = deriveGeometry(typical.fitted);
  const groundGeo = deriveGeometry(ground.fitted);
  const opts = { floorToFloorMm };
  const typicalIssues = validateFloor(typicalGeo, opts);
  const groundIssues = validateFloor(groundGeo, opts);

  const storeys: StoreyModel[] = [];
  for (let i = 0; i < input.storeys; i++) {
    const isGround = i === 0;
    storeys.push({
      index: i,
      levelMm: i * floorToFloorMm,
      heightMm: floorToFloorMm,
      use: isGround ? "ground" : "typical",
      phaseId: isGround ? "phase-ground-floor" : `phase-floor-${i}`,
      geometry: isGround ? groundGeo : typicalGeo,
      issues: isGround ? groundIssues : typicalIssues,
    });
  }

  const f = typical.fitted;
  const bounds = (kind: "stair" | "lift"): Rect | null => {
    const room = f.rooms.find((r) => r.def.kind === kind);
    return room ? room.rects[0] : null;
  };

  const widthMm = f.widthMm;
  const depthMm = f.depthMm;
  const origin = {
    x: envelope.x0 + round10((env.widthMm - widthMm) / 2),
    y: envelope.y0,
  };

  return {
    ok: true,
    notes: typical.notes,
    model: {
      input: { ...input, mirror, floorToFloorMm, setbacksMm },
      plot,
      envelope,
      origin,
      widthMm,
      depthMm,
      planId: plan.id,
      storeys,
      roof: {
        levelMm: input.storeys * floorToFloorMm,
        parapetMm: PARAPET_MM,
        stairCover: bounds("stair"),
        liftRoom: bounds("lift"),
        coverHeightMm: COVER_HEIGHT_MM,
        phaseId: "phase-rooftop",
      },
      plotAreaM2: (input.plotWidthMm * input.plotDepthMm) / 1e6,
      footprintAreaM2: (widthMm * depthMm) / 1e6,
    },
  };
}
