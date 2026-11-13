/**
 * B5: the lift sized from the flats it serves, with pit, overrun and the shaft as reinforced concrete.
 *
 * BNBC 2020 Part 8 Sec 4.2.1.1 (lift required above six storeys or 20 m) and the stretcher rule above ten storeys or 32 m (platform at least
 * 1275 x 2000 mm, opening 1050 mm) are in the pack. The pack does NOT carry the passenger-lift car and shaft tables (gap-lift-car-size), so the
 * car sizes, the clear shaft sizes, the pit depth and the overhead height below are ASSUMPTIONS taken from common 630 kg and 1000 kg
 * traction lift catalogues (EN 81-20 style): confirm with the supplier's drawing. Shaft walls are 150 mm reinforced concrete (assumption).
 */

import type { BuildingModel } from "./building";
import type { Rect } from "../plans/types";

export const LIFT_ASSUMPTIONS = {
  personsPerFlat: 5,
  flatsPerLift: 40,
  pitMm: 1500,
  /** Top landing to the underside of the machine-room slab. */
  overheadMm: 4200,
  /** 200 mm: a core wall must be at least the storey height / 16 thick (ACI 318-14 18.10.6.4, web-sourced; printed BNBC text not located). 3000 / 16 = 188 mm. */
  shaftWallMm: 200,
  pitSlabMm: 250,
  /** Lift door opening in the shaft wall (width x height), mm. */
  doorMm: [900, 2100] as const,
} as const;

export interface LiftClass {
  id: "630" | "1000" | "stretcher";
  kg: number;
  persons: number;
  /** Car clear width x depth, mm. */
  carMm: readonly [number, number];
  /** Shaft clear width x depth, mm. */
  shaftMm: readonly [number, number];
}

export const LIFT_CLASSES: readonly LiftClass[] = [
  { id: "630", kg: 630, persons: 8, carMm: [1100, 1400], shaftMm: [1700, 2000] },
  { id: "1000", kg: 1000, persons: 13, carMm: [1100, 2100], shaftMm: [1900, 2700] },
  // Above ten storeys or 32 m: stretcher platform at least 1275 x 2000 mm (BNBC Part 8 lift-stretcher).
  { id: "stretcher", kg: 1275, persons: 17, carMm: [1350, 2000], shaftMm: [1950, 2600] },
];

export interface LiftSpec {
  flatsServed: number;
  floorsServed: number;
  persons: number;
  liftsNeeded: number;
  cls: LiftClass;
  stretcher: boolean;
  /** The lift cell the plan gives: centre-line rectangle and its net clear size, mm. */
  cell: Rect;
  netMm: readonly [number, number];
  pitMm: number;
  travelMm: number;
  /** Top landing to the underside of the machine-room slab as built, mm. */
  overheadMm: number;
  /** How many shafts of this class fit side by side in the plan's lift cell (separated by 150 mm walls). */
  capacity: number;
  /** Lifts the cell will hold: the lifts needed, up to its capacity. */
  liftsProvided: number;
  fitsShaft: boolean;
  fitsOverhead: boolean;
  enoughLifts: boolean;
}

/** Null when the plan has no lift cell. */
export function liftSpec(model: BuildingModel): LiftSpec | null {
  const cell = model.roof.liftRoom;
  if (!cell) return null;
  const typical = model.storeys[Math.min(1, model.storeys.length - 1)];
  const unitsPerFloor = typical.geometry.fitted.plan.unitsPerFloor;
  const typicalFloors = model.storeys.filter((s) => s.use === "typical").length;
  const flatsServed = unitsPerFloor * typicalFloors;
  const heightM = (model.input.storeys * model.input.floorToFloorMm) / 1000;
  const stretcher = model.input.storeys > 10 || heightM > 32;
  const liftsNeeded = Math.max(1, Math.ceil(flatsServed / LIFT_ASSUMPTIONS.flatsPerLift));
  const perLift = flatsServed / liftsNeeded;
  const cls = stretcher ? LIFT_CLASSES[2] : perLift <= 24 ? LIFT_CLASSES[0] : LIFT_CLASSES[1];
  const idx = typical.geometry.fitted.rooms.findIndex((r) => r.def.kind === "lift");
  const m = typical.geometry.metrics[idx];
  const topLanding = (model.input.storeys - 1) * model.input.floorToFloorMm;
  const overhead = model.roof.levelMm + model.roof.coverHeightMm - 125 - topLanding;
  const net: readonly [number, number] = [Math.round(m.netWidthMm), Math.round(m.netDepthMm)];
  const [sw, sd] = cls.shaftMm;
  const fits = (net[0] >= sw && net[1] >= sd) || (net[0] >= sd && net[1] >= sw);
  // Shafts side by side: along either axis, each shaft plus a 150 mm wall; the other axis must hold one shaft.
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  const along = (a: number, b: number, ca: number, cb: number) => (b >= cb ? Math.floor((a + t) / (ca + t)) : 0);
  const capacity = Math.max(0, along(net[0], net[1], sw, sd), along(net[1], net[0], sw, sd), along(net[0], net[1], sd, sw), along(net[1], net[0], sd, sw));
  return {
    flatsServed,
    floorsServed: model.input.storeys,
    persons: flatsServed * LIFT_ASSUMPTIONS.personsPerFlat,
    liftsNeeded,
    cls,
    stretcher,
    cell,
    netMm: net,
    pitMm: LIFT_ASSUMPTIONS.pitMm,
    travelMm: topLanding,
    overheadMm: overhead,
    capacity,
    liftsProvided: Math.max(1, Math.min(liftsNeeded, capacity)),
    fitsShaft: fits,
    fitsOverhead: overhead >= LIFT_ASSUMPTIONS.overheadMm,
    enoughLifts: liftsNeeded <= capacity,
  };
}

/** Reinforced-concrete shaft: walls from the pit floor to the machine-room slab, and the pit slab. Centre-line rectangle, mm. */
export function liftCore(model: BuildingModel): { spec: LiftSpec; perimeterMm: number; heightMm: number; wallM3: number; pitSlabM3: number; doorM2: number } | null {
  const spec = liftSpec(model);
  if (!spec) return null;
  const { cell } = spec;
  const w = cell.x1 - cell.x0;
  const d = cell.y1 - cell.y0;
  const perimeter = 2 * (w + d);
  const height = spec.pitMm + model.roof.levelMm + model.roof.coverHeightMm;
  const doors = model.storeys.length * spec.liftsProvided; // one lift door per floor served and per lift
  const doorM2 = (doors * LIFT_ASSUMPTIONS.doorMm[0] * LIFT_ASSUMPTIONS.doorMm[1]) / 1e6;
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  return {
    spec,
    perimeterMm: perimeter,
    heightMm: height,
    // plus a partition between side-by-side shafts, across the shorter side of the cell
    wallM3: (perimeter * height * t) / 1e9 + ((spec.liftsProvided - 1) * Math.min(w, d) * height * t) / 1e9 - (doorM2 * t) / 1000,
    pitSlabM3: ((w + t) * (d + t) * LIFT_ASSUMPTIONS.pitSlabMm) / 1e9,
    doorM2,
  };
}
