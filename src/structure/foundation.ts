/**
 * The foundation as it can be built (A2). Each column gets an isolated pad sized by footing.ts; where neighbouring pads would overlap
 * they cannot be separate footings, so they are merged into one combined footing (up to 4 columns) or a raft (more), repeatedly,
 * until no two footings overlap.
 *
 * Screening rules, stated on the Structure screen:
 * - the merged footing is the bounding rectangle of its pads, grown evenly if that is smaller than the sum of the pad areas, so
 *   it keeps at least the bearing area the separate pads needed;
 * - its depth is the deepest member pad, or span / 6 (capped at 300 mm + 100 mm per storey), rounded up to 50 mm, whichever is more;
 * - bending between columns, punching of each column in a shared footing and the stiffness of a raft are NOT checked: a merged
 *   footing needs a detailed design before it is built.
 * Units: mm, mm2.
 */

import type { ColumnResult } from "./frame";

export interface FoundationFooting {
  id: string;
  kind: "isolated" | "combined" | "raft";
  columnIds: string[];
  /** Plan rectangle in the building frame, mm. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  depthMm: number;
  /** Bearing area, m2. */
  areaM2: number;
}

export interface FoundationResult {
  footings: FoundationFooting[];
  /** Number of footings that carry more than one column. */
  mergedCount: number;
  /** How many isolated pads would have overlapped a neighbour. */
  overlappingPads: number;
}

interface Rect {
  ids: string[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  reqAreaMm2: number;
  depthMm: number;
}

const up50 = (v: number) => Math.ceil(v / 50) * 50;
const overlaps = (a: Rect, b: Rect) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 0 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0;

export function planFoundation(columns: ColumnResult[], storeys: number): FoundationResult {
  let rects: Rect[] = columns.map((c) => {
    const s = c.footing.sideMm;
    return { ids: [c.id], x0: c.xMm - s / 2, y0: c.yMm - s / 2, x1: c.xMm + s / 2, y1: c.yMm + s / 2, reqAreaMm2: s * s, depthMm: c.footing.depthMm };
  });
  let overlappingPads = 0;
  for (let i = 0; i < rects.length; i++) if (rects.some((r, j) => j !== i && overlaps(rects[i], r))) overlappingPads++;

  for (let guard = 0; guard < 500; guard++) {
    let hit: [number, number] | null = null;
    for (let i = 0; i < rects.length && !hit; i++) for (let j = i + 1; j < rects.length && !hit; j++) if (overlaps(rects[i], rects[j])) hit = [i, j];
    if (!hit) break;
    const [a, b] = [rects[hit[0]], rects[hit[1]]];
    let m: Rect = {
      ids: [...a.ids, ...b.ids],
      x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
      reqAreaMm2: a.reqAreaMm2 + b.reqAreaMm2,
      depthMm: Math.max(a.depthMm, b.depthMm),
    };
    const w = m.x1 - m.x0;
    const h = m.y1 - m.y0;
    if (w * h < m.reqAreaMm2) {
      const k = Math.sqrt(m.reqAreaMm2 / (w * h));
      const cx = (m.x0 + m.x1) / 2;
      const cy = (m.y0 + m.y1) / 2;
      m = { ...m, x0: cx - (w * k) / 2, x1: cx + (w * k) / 2, y0: cy - (h * k) / 2, y1: cy + (h * k) / 2 };
    }
    // snap outwards to 5 mm inside the loop, so a rounded edge can still trigger a further merge
    m = { ...m, x0: Math.floor(m.x0 / 5) * 5, y0: Math.floor(m.y0 / 5) * 5, x1: Math.ceil(m.x1 / 5) * 5, y1: Math.ceil(m.y1 / 5) * 5 };
    rects = rects.filter((_, k) => k !== hit![0] && k !== hit![1]);
    rects.push(m);
  }

  let n = 0;
  const footings: FoundationFooting[] = rects.map((r) => {
    const merged = r.ids.length > 1;
    const { x0, y0, x1, y1 } = r;
    const span = Math.max(x1 - x0, y1 - y0);
    const depth = merged ? Math.min(2000, Math.max(r.depthMm, up50(Math.min(span / 6, 300 + 100 * storeys)))) : r.depthMm;
    const kind: FoundationFooting["kind"] = !merged ? "isolated" : r.ids.length <= 4 ? "combined" : "raft";
    const id = merged ? `${kind === "raft" ? "FR" : "FC"}${++n}` : `F-${r.ids[0]}`;
    return { id, kind, columnIds: r.ids, x0, y0, x1, y1, depthMm: depth, areaM2: ((x1 - x0) * (y1 - y0)) / 1e6 };
  });
  footings.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
  return { footings, mergedCount: footings.filter((f) => f.kind !== "isolated").length, overlappingPads };
}

/** Do any two footings of the plan overlap? (A built foundation must not.) */
export function footingsOverlap(f: FoundationFooting[]): boolean {
  for (let i = 0; i < f.length; i++)
    for (let j = i + 1; j < f.length; j++)
      if (Math.min(f[i].x1, f[j].x1) - Math.max(f[i].x0, f[j].x0) > 0 && Math.min(f[i].y1, f[j].y1) - Math.max(f[i].y0, f[j].y0) > 0) return true;
  return false;
}
