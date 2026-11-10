/**
 * Fitting a plan to a buildable envelope (BUILD_PLAN.md §5.3).
 *
 * Each axis is solved on its own: start from every bay's preferred size and move all bays together
 * towards their minimums (envelope smaller than preferred) or maximums (larger), in proportion to
 * how much room each bay has to give. No bay ever leaves its range. If the envelope is smaller than
 * the sum of minimums the plan is rejected with the size it needs; if it is larger than the sum of
 * maximums the building stops at its maximum and the rest stays open ground.
 */

import type { Bay, CellRect, FitRejection, FitResult, FittedPlan, PlanDefinition, Text } from "./types";

/** Lengths are rounded to this step so dimensions are buildable (10 mm). */
export const ROUND_MM = 10;

export interface Envelope {
  /** Buildable width across the frontage, mm. */
  widthMm: number;
  /** Buildable depth from the road side, mm. */
  depthMm: number;
}

export interface FitOptions {
  /** Flip the plan left-right (e.g. to put the stair on the other side). */
  mirror?: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const m = (mm: number) => (mm / 1000).toFixed(2);

/**
 * Bay sizes that add up exactly to `target` (or to the min/max sum when out of range).
 * Returns null when the target is below the sum of minimums.
 */
export function distribute(bays: Bay[], target: number): { sizes: number[]; total: number } | null {
  const lo = sum(bays.map((b) => b.min));
  const hi = sum(bays.map((b) => b.max));
  const pref = sum(bays.map((b) => b.pref));
  if (target < lo) return null;
  const goal = Math.min(target, hi);
  let raw: number[];
  if (goal <= pref) {
    const t = pref === lo ? 0 : (pref - goal) / (pref - lo);
    raw = bays.map((b) => b.pref - (b.pref - b.min) * t);
  } else {
    const t = hi === pref ? 0 : (goal - pref) / (hi - pref);
    raw = bays.map((b) => b.pref + (b.max - b.pref) * t);
  }
  // Round to the build step, then hand the rounding remainder to the bays with the most slack.
  const sizes = raw.map((r, i) => clamp(Math.round(r / ROUND_MM) * ROUND_MM, bays[i]));
  const goalRounded = Math.round(goal / ROUND_MM) * ROUND_MM;
  let diff = goalRounded - sum(sizes);
  const order = bays.map((_, i) => i);
  while (diff !== 0) {
    const step = diff > 0 ? ROUND_MM : -ROUND_MM;
    order.sort((a, b) => slack(bays[b], sizes[b], step) - slack(bays[a], sizes[a], step));
    const i = order[0];
    if (slack(bays[i], sizes[i], step) <= 0) break; // every bay is at its limit
    sizes[i] += step;
    diff -= step;
  }
  return { sizes, total: sum(sizes) };
}

function clamp(v: number, b: Bay): number {
  return Math.max(b.min, Math.min(b.max, v));
}

function slack(b: Bay, size: number, step: number): number {
  return step > 0 ? b.max - size : size - b.min;
}

function lines(sizes: number[]): number[] {
  const out = [0];
  for (const s of sizes) out.push(out[out.length - 1] + s);
  return out;
}

/** Problems in the plan definition itself (not in a particular fit). */
export function checkDefinition(plan: PlanDefinition): string[] {
  const errs: string[] = [];
  const nx = plan.baysX.length;
  const ny = plan.baysY.length;
  for (const [axis, bays] of [["x", plan.baysX], ["y", plan.baysY]] as const) {
    bays.forEach((b, i) => {
      if (!(b.min > 0 && b.min <= b.pref && b.pref <= b.max)) errs.push(`bay ${axis}${i}: needs 0 < min <= pref <= max`);
      if ([b.min, b.pref, b.max].some((v) => v % ROUND_MM !== 0)) errs.push(`bay ${axis}${i}: sizes must be multiples of ${ROUND_MM} mm`);
    });
  }
  // A cantilevered front row (balcony): the first structural y line is the line behind it.
  for (const [axis, idx, n] of [["x", plan.structuralX, nx], ["y", plan.structuralY, ny]] as const) {
    const needStart = axis === "y" && plan.cantileverFront ? 1 : 0;
    if (!idx.includes(needStart) || !idx.includes(n)) errs.push(`structural ${axis} lines must include ${needStart} and ${n}`);
    if (idx.some((i) => i < 0 || i > n || !Number.isInteger(i))) errs.push(`structural ${axis} line out of range`);
  }
  const owner: (string | null)[][] = Array.from({ length: nx }, () => Array(ny).fill(null));
  const ids = new Set<string>();
  for (const room of plan.rooms) {
    if (ids.has(room.id)) errs.push(`duplicate room id ${room.id}`);
    ids.add(room.id);
    if (room.cells.length === 0) errs.push(`room ${room.id} has no cells`);
    for (const [x0, y0, x1, y1] of room.cells) {
      if (x0 > x1 || y0 > y1 || x0 < 0 || y0 < 0 || x1 >= nx || y1 >= ny) {
        errs.push(`room ${room.id}: cell block [${x0},${y0},${x1},${y1}] is outside the ${nx}x${ny} grid`);
        continue;
      }
      for (let x = x0; x <= x1; x++)
        for (let y = y0; y <= y1; y++) {
          if (owner[x][y]) errs.push(`cell ${x},${y} belongs to both ${owner[x][y]} and ${room.id}`);
          owner[x][y] = room.id;
        }
    }
  }
  for (let x = 0; x < nx; x++)
    for (let y = 0; y < ny; y++) if (!owner[x][y]) errs.push(`cell ${x},${y} is not part of any room`);
  for (const d of plan.doors) for (const id of d.between) if (!ids.has(id)) errs.push(`door refers to unknown room ${id}`);
  return errs;
}

function mirrorCells(cells: CellRect[], nx: number): CellRect[] {
  return cells.map(([x0, y0, x1, y1]) => [nx - 1 - x1, y0, nx - 1 - x0, y1] as const);
}

/** Place `plan` on `env`. Pure: the same inputs always give the same result. */
export function fitPlan(plan: PlanDefinition, env: Envelope, opts: FitOptions = {}): FitResult {
  const defErrors = checkDefinition(plan);
  if (defErrors.length) {
    return {
      ok: false,
      reasons: [{ code: "invalid_plan", message: { en: `Plan ${plan.id} is defined incorrectly: ${defErrors[0]}`, bn: `প্ল্যান ${plan.id} সঠিকভাবে সংজ্ঞায়িত নয়: ${defErrors[0]}` } }],
    };
  }
  const nx = plan.baysX.length;
  const baysX = opts.mirror ? [...plan.baysX].reverse() : plan.baysX;
  const fx = distribute(baysX, env.widthMm);
  const fy = distribute(plan.baysY, env.depthMm);
  const reasons: FitRejection[] = [];
  if (!fx) {
    const need = sum(baysX.map((b) => b.min));
    reasons.push({
      code: "too_narrow",
      requiredMm: need,
      availableMm: env.widthMm,
      message: {
        en: `Needs at least ${m(need)} m of buildable width; this plot has ${m(env.widthMm)} m.`,
        bn: `কমপক্ষে ${m(need)} মিটার নির্মাণযোগ্য প্রস্থ দরকার; এই প্লটে আছে ${m(env.widthMm)} মিটার।`,
      },
    });
  }
  if (!fy) {
    const need = sum(plan.baysY.map((b) => b.min));
    reasons.push({
      code: "too_shallow",
      requiredMm: need,
      availableMm: env.depthMm,
      message: {
        en: `Needs at least ${m(need)} m of buildable depth; this plot has ${m(env.depthMm)} m.`,
        bn: `কমপক্ষে ${m(need)} মিটার নির্মাণযোগ্য গভীরতা দরকার; এই প্লটে আছে ${m(env.depthMm)} মিটার।`,
      },
    });
  }
  if (!fx || !fy) return { ok: false, reasons };

  const notes: Text[] = [];
  if (fx.total < env.widthMm - ROUND_MM)
    notes.push({
      en: `The building is ${m(fx.total)} m wide; the remaining ${m(env.widthMm - fx.total)} m of width stays open.`,
      bn: `ভবনের প্রস্থ ${m(fx.total)} মিটার; বাকি ${m(env.widthMm - fx.total)} মিটার খোলা থাকবে।`,
    });
  if (fy.total < env.depthMm - ROUND_MM)
    notes.push({
      en: `The building is ${m(fy.total)} m deep; the remaining ${m(env.depthMm - fy.total)} m of depth stays open.`,
      bn: `ভবনের গভীরতা ${m(fy.total)} মিটার; বাকি ${m(env.depthMm - fy.total)} মিটার খোলা থাকবে।`,
    });

  const xLines = lines(fx.sizes);
  const yLines = lines(fy.sizes);
  const structuralX = opts.mirror ? plan.structuralX.map((i) => nx - i).sort((a, b) => a - b) : [...plan.structuralX].sort((a, b) => a - b);
  const rooms = plan.rooms.map((def) => {
    const cells = opts.mirror ? mirrorCells(def.cells, nx) : def.cells;
    const rects = cells.map(([x0, y0, x1, y1]) => ({ x0: xLines[x0], y0: yLines[y0], x1: xLines[x1 + 1], y1: yLines[y1 + 1] }));
    return {
      def: { ...def, cells },
      rects,
      grossAreaMm2: rects.reduce((a, r) => a + (r.x1 - r.x0) * (r.y1 - r.y0), 0),
    };
  });
  const fitted: FittedPlan = {
    plan,
    mirrored: !!opts.mirror,
    xLines,
    yLines,
    widthMm: fx.total,
    depthMm: fy.total,
    rooms,
    baysX,
    structuralX,
    structuralY: [...plan.structuralY].sort((a, b) => a - b),
  };
  return { ok: true, fitted, notes };
}

/** The envelope range a plan can fill without leaving its bay limits. */
export function fitRange(plan: PlanDefinition) {
  return {
    widthMm: { min: sum(plan.baysX.map((b) => b.min)), pref: sum(plan.baysX.map((b) => b.pref)), max: sum(plan.baysX.map((b) => b.max)) },
    depthMm: { min: sum(plan.baysY.map((b) => b.min)), pref: sum(plan.baysY.map((b) => b.pref)), max: sum(plan.baysY.map((b) => b.max)) },
  };
}
