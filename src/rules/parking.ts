/**
 * B4: lay out the ground-floor parking so the Schedule 4 count can be checked against stalls that really fit.
 *
 * The ground floor is open stilts (columns and the core only). One drive aisle runs from the front face of the building
 * towards the back, or along the front setback; stalls sit on one or both sides. Figures come from RAJUK 2008 section 56(1)-(3) (spec/rules/rajuk-2008.yaml,
 * parkingGeometry): car stall 2.40 x 4.60 m, motorcycle 1.00 x 2.00 m, driveway widths by stall angle (90 degrees: 4.25 m;
 * 0 degrees single loaded 3.50 m, double loaded 4.00 m).
 *
 * Assumptions (stated on the Compliance screen): each column blocks a square of COLUMN_BLOCK_MM; stalls are counted inside the
 * building footprint only (no surface parking in the setbacks); the aisle must be clear from the front face to the last stall;
 * 45 degree stalls are not tried. Everything is mm in the building frame (origin: front-left corner).
 */

import type { BuildingModel } from "../model/building";
import type { Rect } from "../plans/types";
import { rajukPack } from "./pack";

export const COLUMN_BLOCK_MM = 600;

interface StallSpec { widthM: number; lengthM: number }
interface Geometry {
  stalls: Array<StallSpec & { vehicle: string }>;
  drivewayWidths: Array<{ angleDeg: number; singleLoadedM: number; doubleLoadedM: number; twoWayM: number }>;
}

const geometry = (): Geometry => (rajukPack() as unknown as { parkingGeometry: Geometry }).parkingGeometry;

export interface ParkingLayout {
  option: "perpendicular-double" | "perpendicular-single" | "front-setback" | "parallel-double" | "parallel-single" | "none";
  aisle: Rect | null;
  cars: Rect[];
  motorcycles: Rect[];
  /** Why no layout was possible, when there is no ground parking at all. */
  note?: string;
}

const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const cache = new WeakMap<BuildingModel, ParkingLayout>();

export function layoutParking(model: BuildingModel): ParkingLayout {
  const hitCache = cache.get(model);
  if (hitCache) return hitCache;
  const out = compute(model);
  cache.set(model, out);
  return out;
}

function compute(model: BuildingModel): ParkingLayout {
  const g = geometry();
  const car = g.stalls.find((s) => s.vehicle === "car")!;
  const moto = g.stalls.find((s) => s.vehicle === "motorcycle")!;
  const w0 = g.drivewayWidths.find((d) => d.angleDeg === 0)!;
  const w90 = g.drivewayWidths.find((d) => d.angleDeg === 90)!;
  const ground = model.storeys[0];
  const fitted = ground.geometry.fitted;
  const park = fitted.rooms.filter((r) => r.def.kind === "parking").flatMap((r) => r.rects);
  if (!park.length) return { option: "none", aisle: null, cars: [], motorcycles: [], note: "no parking room on the ground floor" };

  const blocked: Rect[] = [
    ...fitted.rooms.filter((r) => r.def.kind !== "parking").flatMap((r) => r.rects),
    ...ground.geometry.columns.map((c) => ({ x0: c.x - COLUMN_BLOCK_MM / 2, y0: c.y - COLUMN_BLOCK_MM / 2, x1: c.x + COLUMN_BLOCK_MM / 2, y1: c.y + COLUMN_BLOCK_MM / 2 })),
  ];
  const D = fitted.depthMm;
  const W = fitted.widthMm;
  // 100 mm occupancy grid with a summed-area table: a rectangle is free when every cell under it is parking floor and not blocked.
  const CELL = 100;
  const nx = Math.ceil(W / CELL);
  const ny = Math.ceil(D / CELL);
  const ok = new Uint8Array(nx * ny);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      const cell: Rect = { x0: i * CELL, y0: j * CELL, x1: Math.min((i + 1) * CELL, W), y1: Math.min((j + 1) * CELL, D) };
      const at = (px: number, py: number) => park.some((q) => px >= q.x0 && px < q.x1 && py >= q.y0 && py < q.y1);
      const inside = at(cell.x0 + 1, cell.y0 + 1) && at(cell.x1 - 1, cell.y0 + 1) && at(cell.x0 + 1, cell.y1 - 1) && at(cell.x1 - 1, cell.y1 - 1);
      const hitB = blocked.some((b) => hit(cell, b));
      ok[i * ny + j] = inside && !hitB ? 1 : 0;
    }
  const sat = new Int32Array((nx + 1) * (ny + 1));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) sat[(i + 1) * (ny + 1) + j + 1] = ok[i * ny + j] + sat[i * (ny + 1) + j + 1] + sat[(i + 1) * (ny + 1) + j] - sat[i * (ny + 1) + j];
  const free = (r: Rect, taken: Rect[]): boolean => {
    if (r.x0 < 0 || r.y0 < 0 || r.x1 > W || r.y1 > D) return false;
    const i0 = Math.floor(r.x0 / CELL);
    const i1 = Math.ceil(r.x1 / CELL);
    const j0 = Math.floor(r.y0 / CELL);
    const j1 = Math.ceil(r.y1 / CELL);
    const n = sat[i1 * (ny + 1) + j1] - sat[i0 * (ny + 1) + j1] - sat[i1 * (ny + 1) + j0] + sat[i0 * (ny + 1) + j0];
    return n === (i1 - i0) * (j1 - j0) && !taken.some((b) => hit(r, b));
  };

  const carW = Math.round(car.widthM * 1000);
  const carL = Math.round(car.lengthM * 1000);
  const GATE_MM = 3000; // one-way passage, RAJUK section 56(10)
  const STEP = 100;
  const cands: ParkingLayout[] = [];

  type Opt = { option: ParkingLayout["option"]; aisleMm: number; sides: Array<"L" | "R">; perp: boolean };
  const opts: Opt[] = [
    { option: "perpendicular-double", aisleMm: Math.round(w90.doubleLoadedM * 1000), sides: ["L", "R"], perp: true },
    { option: "perpendicular-single", aisleMm: Math.round(w90.singleLoadedM * 1000), sides: ["L"], perp: true },
    { option: "perpendicular-single", aisleMm: Math.round(w90.singleLoadedM * 1000), sides: ["R"], perp: true },
    { option: "parallel-double", aisleMm: Math.round(w0.doubleLoadedM * 1000), sides: ["L", "R"], perp: false },
    { option: "parallel-single", aisleMm: Math.round(w0.singleLoadedM * 1000), sides: ["L"], perp: false },
    { option: "parallel-single", aisleMm: Math.round(w0.singleLoadedM * 1000), sides: ["R"], perp: false },
  ];

  // Aisle along y from the front face. "L"/"R" are the two sides of the aisle.
  for (const o of opts) {
    const depthX = o.perp ? carL : carW;
    const pitch = o.perp ? carW : carL;
    for (let ax = 0; ax + o.aisleMm <= W; ax += STEP) {
      let reach = 0;
      while (reach < D && free({ x0: ax, y0: reach, x1: ax + o.aisleMm, y1: Math.min(reach + STEP, D) }, [])) reach += STEP;
      if (reach < pitch) continue;
      const stalls: Rect[] = [];
      for (const side of o.sides) {
        const x0 = side === "L" ? ax - depthX : ax + o.aisleMm;
        let y = 0;
        while (y + pitch <= reach) {
          const r = { x0, y0: y, x1: x0 + depthX, y1: y + pitch };
          if (free(r, stalls)) { stalls.push(r); y += pitch; } else y += STEP;
        }
      }
      if (stalls.length) cands.push({ option: o.option, aisle: { x0: ax, y0: 0, x1: ax + o.aisleMm, y1: Math.max(...stalls.map((q) => q.y1)) }, cars: stalls, motorcycles: [] });
    }
  }

  // Aisle along x (wide plots): a 3.0 m passage from the front face leads to it; stalls sit on either side of the aisle.
  for (const o of opts) {
    const depthY = o.perp ? carL : carW;
    const pitch = o.perp ? carW : carL;
    for (let ay = 0; ay + o.aisleMm <= D; ay += 2 * STEP) {
      for (let gx = 0; gx + GATE_MM <= W; gx += 2 * STEP) {
        const gate: Rect = { x0: gx, y0: 0, x1: gx + GATE_MM, y1: ay };
        if (ay > 0 && !free(gate, [])) continue;
        // Aisle segment that contains the gate (or starts at the front when the aisle is on the front face).
        let lo = gx;
        while (lo - STEP >= 0 && free({ x0: lo - STEP, y0: ay, x1: lo, y1: ay + o.aisleMm }, [])) lo -= STEP;
        let hi = gx + GATE_MM;
        if (!free({ x0: gx, y0: ay, x1: gx + GATE_MM, y1: ay + o.aisleMm }, [])) continue;
        while (hi + STEP <= W && free({ x0: hi, y0: ay, x1: hi + STEP, y1: ay + o.aisleMm }, [])) hi += STEP;
        const stalls: Rect[] = [];
        const keep: Rect[] = ay > 0 ? [gate] : [];
        for (const side of o.sides) {
          const y0 = side === "L" ? ay - depthY : ay + o.aisleMm;
          let x = lo;
          while (x + pitch <= hi) {
            const r = { x0: x, y0, x1: x + pitch, y1: y0 + depthY };
            if (free(r, [...stalls, ...keep])) { stalls.push(r); x += pitch; } else x += STEP;
          }
        }
        if (stalls.length) cands.push({ option: o.option, aisle: { x0: lo, y0: ay, x1: hi, y1: ay + o.aisleMm }, cars: stalls, motorcycles: [] });
      }
    }
  }

  // Stilt bays are about as wide as a car, so the usual Dhaka arrangement has no aisle inside: cars drive along the front setback and park
  // in the front row of bays, nose in (perpendicular, setback at least 4.25 m) or parallel to the front (setback at least 3.50 m).
  const front = model.origin.y - model.plot.y0;
  for (const perp of [true, false]) {
    const need = Math.round((perp ? w90.singleLoadedM : w0.singleLoadedM) * 1000);
    if (front < need) continue;
    const ext = perp ? carL : carW;
    const pitch = perp ? carW : carL;
    const stalls: Rect[] = [];
    for (let x = 0; x + pitch <= W; ) {
      const r = { x0: x, y0: 0, x1: x + pitch, y1: ext };
      if (free(r, stalls)) { stalls.push(r); x += pitch; } else x += STEP;
    }
    if (stalls.length) cands.push({ option: "front-setback", aisle: { x0: 0, y0: -front, x1: W, y1: 0 }, cars: stalls, motorcycles: [] });
  }

  const best = cands.reduce<ParkingLayout>((b, c) => (c.cars.length > b.cars.length ? c : b), { option: "none", aisle: null, cars: [], motorcycles: [] });

  // Motorcycles fill what is left: 1.00 x 2.00 m, long side along y, on a 250 mm grid, off the aisle and the stalls.
  const mw = Math.round(moto.widthM * 1000);
  const ml = Math.round(moto.lengthM * 1000);
  const taken = [...best.cars, ...(best.aisle ? [best.aisle] : [])];
  const motos: Rect[] = [];
  for (let y = 0; y + ml <= D; y += 250)
    for (let x = 0; x + mw <= W; x += 250) {
      const r = { x0: x, y0: y, x1: x + mw, y1: y + ml };
      if (free(r, [...taken, ...motos])) motos.push(r);
    }
  return { ...best, motorcycles: motos };
}
