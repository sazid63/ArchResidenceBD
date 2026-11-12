/**
 * The foundation as it can be built (A2). Each column gets an isolated pad sized by footing.ts; where neighbouring pads would overlap
 * they cannot be separate footings, so they are merged into one combined footing (up to 4 columns) or a raft (more), repeatedly,
 * until no two footings overlap.
 *
 * Screening rules, stated on the Structure screen:
 * - the merged footing is the bounding rectangle of its pads, grown evenly if that is smaller than the sum of the pad areas, so
 *   it keeps at least the bearing area the separate pads needed;
 * - its depth is the deepest member pad, or span / 6 (capped at 300 mm + 100 mm per storey), rounded up to 50 mm, whichever is more;
 * - a merged footing is checked for punching of every column (Eq 6.6.72-6.6.74 at d/2, with the alpha_s of the column position) and for
 *   bending along each axis as a strip: column loads down, one uniform soil reaction up (resultant taken at the footing centre). The
 *   depth grows by 50 mm until both pass, up to 2000 mm. The stiffness of a raft, uneven settlement and the soil model are NOT
 *   checked: a merged footing still needs a detailed design before it is built.
 * Units: mm, mm2.
 */

import type { ColumnResult } from "./frame";
import { BAR_MM, COVER_MM } from "./footing";
import { footingPack } from "../rules/bnbcStructure";
import { DESIGN, MATERIALS } from "./materials";
import { flexure, slabMinAs } from "./section";
import { pickBeamBars } from "./barSelect";

/** The top of every pad sits this far below the ground-floor finish; the column stub rises from it. Plinth (tie) beams are this deep, below the finish. */
export const PAD_TOP_BELOW_FINISH_MM = 1050;
export const PLINTH_BEAM_DEPTH_MM = 450;
export const PLINTH_BEAM_WIDTH_MM = 250;

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
  /** Merged footings only: demand / capacity of the worst column punching and of bending between the columns, and what governs. */
  mergedCheck?: MergedFootingCheck;
}

export interface MergedFootingCheck {
  punchUtil: number;
  bendingUtil: number;
  util: number;
  governs: "punching" | "bending";
  /** Largest bending moment along either axis, kN.m, and the factored soil pressure, kPa. */
  muKnM: number;
  quKpa: number;
}

/**
 * Tie beam between two neighbouring columns on a grid line (common practice: tie force 10 % of the larger column load; BNBC
 * Part 6 Sec 6.4 not read for this rule). Tension steel = Tu / (phi fy), phi 0.9 (DESIGN.phiFlexure). The bars are picked
 * from the stock bars (pickBeamBars, 250 mm wide plinth beam); `fits` is false when no stock arrangement carries the tension.
 * Not yet in the bar schedule.
 */
export interface TieBeam {
  a: string;
  b: string;
  forceKn: number;
  asReqMm2: number;
  asProvMm2: number;
  fits: boolean;
  util: number;
}

export const TIE_FORCE_FRACTION = 0.1;
/** Plinth tie beam width, mm (the tie bars are picked for this width). */
const TIE_WIDTH_MM = 250;

export function planTies(columns: ColumnResult[]): TieBeam[] {
  const ties: TieBeam[] = [];
  for (const c of columns)
    for (const d of columns) {
      const adjacentX = d.iy === c.iy && d.ix === c.ix + 1;
      const adjacentY = d.ix === c.ix && d.iy === c.iy + 1;
      if (!adjacentX && !adjacentY) continue;
      const forceKn = TIE_FORCE_FRACTION * Math.max(c.footing.puKn, d.footing.puKn);
      const asReqMm2 = (forceKn * 1000) / (DESIGN.phiFlexure * MATERIALS.fyMPa);
      const pick = pickBeamBars(asReqMm2, TIE_WIDTH_MM, { minN: 2 });
      ties.push({ a: c.id, b: d.id, forceKn, asReqMm2, asProvMm2: pick.areaMm2, fits: pick.fits, util: pick.fits ? asReqMm2 / pick.areaMm2 : Infinity });
    }
  return ties;
}

export interface FoundationResult {
  footings: FoundationFooting[];
  /** Tie beams between neighbouring columns on each grid line. */
  ties: TieBeam[];
  /** Largest and smallest service bearing pressure of the isolated pads, kPa, and the ratio: a screen for uneven settlement. */
  pressureRatio: number;
  /** True when the ratio exceeds 1.5 (screen only: a geotechnical check is needed; not a utilisation). */
  settlementScreen: boolean;
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

/**
 * Bending moment envelope of a footing strip: point loads `loads` (kN at positions along the strip, mm) held up by one uniform
 * reaction w = sum / length. Returns the largest absolute moment, kN.m, scanning every 10 mm.
 */
export function stripMaxMomentKnM(loads: Array<{ x: number; p: number }>, from: number, to: number): number {
  const L = (to - from) / 1000;
  const total = loads.reduce((a, l) => a + l.p, 0);
  if (L <= 0 || total <= 0) return 0;
  const w = total / L; // kN/m upward
  let max = 0;
  for (let x = from; x <= to; x += 10) {
    const xm = (x - from) / 1000;
    let m = (w * xm * xm) / 2; // reaction to the left of the cut, taking moments about the cut
    for (const l of loads) if (l.x <= x) m -= l.p * ((x - l.x) / 1000);
    max = Math.max(max, Math.abs(m));
  }
  return max;
}

/** Punching and bending checks of one merged footing at depth `hMm`. */
export function checkMergedFooting(f: FoundationFooting, cols: ColumnResult[], hMm: number): MergedFootingCheck {
  const fc = MATERIALS.fcMPa;
  const d = hMm - COVER_MM - BAR_MM - BAR_MM / 2;
  const B = f.x1 - f.x0;
  const L = f.y1 - f.y0;
  const total = cols.reduce((a, c) => a + c.footing.puKn, 0);
  const qu = (total * 1000) / (B * L); // N/mm2
  let punch = 0;
  for (const c of cols) {
    const s = c.storeys[0].section;
    const b0 = 2 * (s.bx + d) + 2 * (s.by + d);
    const beta = Math.max(s.bx, s.by) / Math.min(s.bx, s.by);
    const alphaS = footingPack().alphaS[c.position];
    const vu = c.footing.puKn - (qu * (s.bx + d) * (s.by + d)) / 1000;
    const vc = (Math.min(0.17 * (1 + 2 / beta), 0.083 * ((alphaS * d) / b0 + 2), 0.33) * Math.sqrt(fc) * b0 * d) / 1000;
    punch = Math.max(punch, vu / (DESIGN.phiShear * vc));
  }
  // Bending: the strip along x (width = footing depth in y) and along y, each carrying every column load.
  // the largest column base moment about each axis is added to that strip (screening; summing all columns is far too conservative)
  const baseMx = Math.max(0, ...cols.map((c) => c.footing.momentXKnM));
  const baseMy = Math.max(0, ...cols.map((c) => c.footing.momentYKnM));
  const mx = stripMaxMomentKnM(cols.map((c) => ({ x: c.xMm, p: c.footing.puKn })), f.x0, f.x1) + baseMx;
  const my = stripMaxMomentKnM(cols.map((c) => ({ x: c.yMm, p: c.footing.puKn })), f.y0, f.y1) + baseMy;
  const bendX = flexure(mx, L, d, slabMinAs(L, hMm)).util;
  const bendY = flexure(my, B, d, slabMinAs(B, hMm)).util;
  const bending = Math.max(bendX, bendY);
  return { punchUtil: punch, bendingUtil: bending, util: Math.max(punch, bending), governs: punch >= bending ? "punching" : "bending", muKnM: Math.max(mx, my), quKpa: qu * 1000 };
}

/** The smallest depth (50 mm steps up to 2000) at which the merged footing passes its checks, or 2000 with the failing check. */
function designMerged(f: FoundationFooting, cols: ColumnResult[]): { depthMm: number; check: MergedFootingCheck } {
  let h = f.depthMm;
  let check = checkMergedFooting(f, cols, h);
  while (check.util > 1 && h < 2000) {
    h += 50;
    check = checkMergedFooting(f, cols, h);
  }
  return { depthMm: h, check };
}

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
    const base: FoundationFooting = { id, kind, columnIds: r.ids, x0, y0, x1, y1, depthMm: depth, areaM2: ((x1 - x0) * (y1 - y0)) / 1e6 };
    if (!merged) return base;
    const cols = columns.filter((c) => r.ids.includes(c.id));
    const done = designMerged(base, cols);
    return { ...base, depthMm: done.depthMm, mergedCheck: done.check };
  });
  footings.sort((p, q) => p.y0 - q.y0 || p.x0 - q.x0);
  const pressures = columns.map((c) => c.footing.pressureKpa).filter((p) => p > 0);
  const pressureRatio = pressures.length ? Math.max(...pressures) / Math.min(...pressures) : 1;
  return { footings, ties: planTies(columns), pressureRatio, settlementScreen: pressureRatio > 1.5, mergedCount: footings.filter((f) => f.kind !== "isolated").length, overlappingPads };
}

/** Do any two footings of the plan overlap? (A built foundation must not.) */
export function footingsOverlap(f: FoundationFooting[]): boolean {
  for (let i = 0; i < f.length; i++)
    for (let j = i + 1; j < f.length; j++)
      if (Math.min(f[i].x1, f[j].x1) - Math.max(f[i].x0, f[j].x0) > 0 && Math.min(f[i].y1, f[j].y1) - Math.max(f[i].y0, f[j].y0) > 0) return true;
  return false;
}
