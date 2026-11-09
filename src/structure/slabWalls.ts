/**
 * Walls that stand on a slab with no beam under them (A8). A wall on a structural grid line is a line load on that beam (beam.ts).
 * A wall elsewhere sits on the slab, so its weight must reach the slab design: it is spread over the panel it stands in as an
 * equivalent uniform load (wall weight / panel area), the usual screening simplification. Door and window openings are not deducted
 * (conservative). Units: kN, kN/m2, mm.
 */

import type { WallSegment } from "../plans/geometry";
import { wallLineLoadKnM } from "./loads";

export interface PanelRect {
  px: number;
  py: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const EPS = 1;

/** Weight in kN of the walls standing on slab inside each panel, keyed "px,py", for walls not on any structural line. */
export function slabWallKn(walls: WallSegment[], structuralLines: Set<string>, panels: PanelRect[], wallHeightMm: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of walls) {
    if (structuralLines.has(`${w.orientation}${w.at}`)) continue;
    const perM = wallLineLoadKnM(w.thicknessMm, wallHeightMm / 1000);
    for (const p of panels) {
      // the wall must lie strictly inside the panel across its axis, and its length counts where it overlaps the panel along its axis
      const across = w.orientation === "v" ? w.at > p.x0 + EPS && w.at < p.x1 - EPS : w.at > p.y0 + EPS && w.at < p.y1 - EPS;
      if (!across) continue;
      const lo = w.orientation === "v" ? p.y0 : p.x0;
      const hi = w.orientation === "v" ? p.y1 : p.x1;
      const len = Math.min(w.to, hi) - Math.max(w.from, lo);
      if (len > 0) out.set(`${p.px},${p.py}`, (out.get(`${p.px},${p.py}`) ?? 0) + (len / 1000) * perM);
    }
  }
  return out;
}
