/**
 * Concrete pour sequence from the designed building (replaces the old mesh-based planner).
 *
 * The steps and volumes are `concreteSteps` (foundation, the columns of each storey, the beams, slab and stair of each level,
 * the lift shaft walls), so the volumes add up to the BOQ concrete. The pour rate and the waiting days are ASSUMPTIONS (typical
 * site practice, not a BNBC figure): confirm with the contractor.
 */

import type { ConcreteStep } from "./bbs";

export const POUR_ASSUMPTIONS = {
  /** Concrete placed per working day by one crew with a mixer and hoist, m3. */
  m3PerDay: 25,
  /** Wait after the foundation before the columns start, days. */
  foundationCureDays: 7,
  /** Wait after the columns of a storey before its slab, days. */
  columnToSlabDays: 1,
  /** Wait after a slab before the next storey's columns, days. */
  slabCureDays: 7,
} as const;

export interface PourRow {
  id: string;
  kind: ConcreteStep["kind"];
  index?: number;
  m3: number;
  /** Working days to place this pour. */
  workDays: number;
  /** Day the pour starts and ends (day 1 is the first), and the waiting days before the next pour. */
  startDay: number;
  endDay: number;
  waitDays: number;
}

export interface PourPlan {
  rows: PourRow[];
  totalM3: number;
  totalDays: number;
}

/** Order the pours, size each by the pour rate, and add the waiting days; the lift shaft walls are poured with the floors, after the last slab. */
export function planPours(steps: ConcreteStep[]): PourPlan {
  const A = POUR_ASSUMPTIONS;
  const rows: PourRow[] = [];
  let day = 1;
  steps.forEach((s, i) => {
    const workDays = Math.max(1, Math.ceil(s.m3 / A.m3PerDay));
    const next = steps[i + 1];
    const wait = s.kind === "foundation" ? A.foundationCureDays : s.kind === "columns" ? A.columnToSlabDays : s.kind === "slab" && next ? A.slabCureDays : 0;
    rows.push({ id: s.id, kind: s.kind, index: s.index, m3: s.m3, workDays, startDay: day, endDay: day + workDays - 1, waitDays: wait });
    day += workDays + wait;
  });
  const last = rows[rows.length - 1];
  return { rows, totalM3: rows.reduce((a, r) => a + r.m3, 0), totalDays: last ? last.endDay : 0 };
}
