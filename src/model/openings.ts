/**
 * Holes in the floor and roof slabs, in the plan frame (mm): the stair flights, the lift shaft and light shafts. The 3D model cuts
 * them out of the slabs (toMesh.ts) and the quantities subtract them (structure/bbs.ts, quantities/takeoff.ts), from these same
 * rectangles, so the concrete and screed counted are the slab that is drawn.
 */

import { planStair, type StairPlacement } from "../cad/stairBuilder";
import type { FloorGeometry } from "../plans/geometry";
import type { Rect } from "../plans/types";
import type { BuildingModel } from "./building";

/** Clear space at the foot of the stair inside the stair room (arrival landing). */
export const STAIR_ARRIVAL = 1000;

/**
 * The stair sits inside its room (clear of the wall faces), flights along the room's long side,
 * with the arrival landing at the start. A room edge at 0 is an outside wall (250 mm), else 125 mm.
 */
export function stairPlacement(rect: Rect, ox: number, oy: number): StairPlacement {
  const insetX = rect.x0 === 0 ? 125 : 63;
  const insetY = rect.y0 === 0 ? 125 : 63;
  const alongX = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
  return alongX
    ? { originX: ox + rect.x0 + insetX + STAIR_ARRIVAL, originY: oy + rect.y0 + insetY, axis: "X", uDir: 1, vDir: 1 }
    : { originX: ox + rect.x0 + insetX, originY: oy + rect.y0 + insetY + STAIR_ARRIVAL, axis: "Y", uDir: 1, vDir: 1 };
}

export interface SlabOpening {
  id: string;
  /** Plan rectangle, mm, plan frame (add the building origin for plot coordinates). */
  rect: Rect;
}

/** The slab openings of one floor plan. */
export function slabOpeningRects(geo: FloorGeometry, model: BuildingModel): SlabOpening[] {
  const out: SlabOpening[] = [];
  for (const room of geo.fitted?.rooms ?? []) {
    const kind = room.def.kind;
    const r = room.rects[0];
    if (kind === "stair") {
      const pl = stairPlacement(r, 0, 0);
      const layout = planStair(model.input.floorToFloorMm);
      const [x0, y0, x1, y1] = pl.axis === "X"
        ? [pl.originX, pl.originY, pl.originX + layout.lengthMm, pl.originY + layout.widthMm]
        : [pl.originX, pl.originY, pl.originX + layout.widthMm, pl.originY + layout.lengthMm];
      out.push({ id: "stair_hole", rect: { x0, y0, x1, y1 } });
    } else if (kind === "lift" || kind === "shaft") {
      out.push({ id: `${room.def.id}_hole`, rect: { x0: r.x0 + 125, y0: r.y0 + 125, x1: r.x1 - 125, y1: r.y1 - 125 } });
    }
  }
  return out;
}

/** Area of the slab openings of a floor plan, m2. */
export function slabOpeningAreaM2(geo: FloorGeometry, model: BuildingModel): number {
  return slabOpeningRects(geo, model).reduce((a, o) => a + ((o.rect.x1 - o.rect.x0) * (o.rect.y1 - o.rect.y0)) / 1e6, 0);
}
