/**
 * Pure rule-table evaluators: exact ports of core/src/archres_core/compliance/tables.py
 * (branch v0-pipeline-complete). Semantics are pinned by the pack's own `testVectors`.
 *
 * - FAR: exact `roadWidthM` row and area band (areaSqmFrom < a <= areaSqmTo; missing from = 0,
 *   missing to = open). Prohibited rows match by area only; "NR" means no cap.
 * - Setback: same area band; height > heightApplicabilityM or storeys > heightApplicabilityStoreys
 *   switches to the `beyondHeight` values.
 * - Parking: max(minSpaces or 0, ceil(units * numerator / denominator)), integer arithmetic.
 *
 * Evaluators return plain objects, or null when no row applies. They never guess or interpolate.
 */

export interface BandRow {
  areaSqmFrom?: number;
  areaSqmTo?: number;
}

export interface FarRow extends BandRow {
  roadWidthM?: number;
  anyPlot?: boolean;
  prohibited?: boolean;
  far?: number | "NR";
  mgcPercent?: number;
  footnotes?: string[];
}

export interface FarTable {
  id: string;
  classId: string;
  cite: string;
  rows: FarRow[];
}

export interface SetbackRow extends BandRow {
  frontM: number;
  rearM: number;
  sideM: number;
}

export interface SetbackTable {
  id: string;
  cite: string;
  heightApplicabilityM: number;
  heightApplicabilityStoreys: number;
  rows: SetbackRow[];
  beyondHeight: { overHeightM: number; overStoreys: number; frontM: number; rearM: number; sideM: number; cite: string };
}

export interface ParkingRow {
  id: string;
  vehicle: string;
  spaces: { numerator: number; denominator: number; basis: string };
  minSpaces?: number;
  additive?: boolean;
  unitAreaMinExclusiveSqm?: number;
  unitAreaMaxSqm?: number;
  grossAreaMaxSqm?: number;
  grossAreaMinExclusiveSqm?: number;
}

export interface ParkingSchedule {
  id: string;
  cite: string;
  rows: ParkingRow[];
}

export type FarResult =
  | { prohibited: true; footnotes: string[] }
  | { prohibited?: false; far: number | "NR"; mgcPercent: number; footnotes: string[]; row: FarRow };

export interface SetbackResult {
  frontM: number;
  rearM: number;
  sideM: number;
  beyond?: true;
}

/** Area band test shared by FAR and setback tables: (from, to], open ends. */
export function inBand(areaSqm: number, row: BandRow): boolean {
  const low = row.areaSqmFrom ?? 0;
  const high = row.areaSqmTo;
  return high === undefined ? areaSqm > low : low < areaSqm && areaSqm <= high;
}

function farHit(row: FarRow): FarResult {
  return { far: row.far as number | "NR", mgcPercent: row.mgcPercent as number, footnotes: [...(row.footnotes ?? [])], row: { ...row } };
}

/** The applicable FAR row for an exact printed road width, or null when none applies. */
export function farRow(tables: FarTable[], classId: string | undefined, areaSqm: number, roadWidthM: number): FarResult | null {
  const table = tables.find((t) => t.classId === classId);
  if (!table) return null;
  const rows = table.rows;
  for (const row of rows) {
    if (row.prohibited && inBand(areaSqm, row)) return { prohibited: true, footnotes: [...(row.footnotes ?? [])] };
  }
  for (const row of rows) {
    if (row.anyPlot && row.roadWidthM === roadWidthM) return farHit(row);
  }
  for (const row of rows) {
    if (row.prohibited || row.anyPlot) continue;
    if (row.roadWidthM === roadWidthM && inBand(areaSqm, row)) return farHit(row);
  }
  return null;
}

/**
 * The row printed for this plot area, ignoring the road width column. Pack provision §51(14):
 * the area-based row may also be used. Not part of the Python port; used only as a fallback.
 */
export function farRowByArea(tables: FarTable[], classId: string | undefined, areaSqm: number): FarResult | null {
  const table = tables.find((t) => t.classId === classId);
  if (!table) return null;
  for (const row of table.rows) {
    if (row.prohibited && inBand(areaSqm, row)) return { prohibited: true, footnotes: [...(row.footnotes ?? [])] };
  }
  for (const row of table.rows) {
    if (row.prohibited || row.anyPlot) continue;
    if (inBand(areaSqm, row)) return farHit(row);
  }
  return null;
}

export function setbackRow(
  table: SetbackTable,
  areaSqm: number,
  opts: { heightM?: number; storeys?: number } = {},
): SetbackResult | null {
  if ((opts.heightM ?? 0) > table.heightApplicabilityM || (opts.storeys ?? 0) > table.heightApplicabilityStoreys) {
    const b = table.beyondHeight;
    return { frontM: b.frontM, rearM: b.rearM, sideM: b.sideM, beyond: true };
  }
  for (const row of table.rows) {
    if (inBand(areaSqm, row)) return { frontM: row.frontM, rearM: row.rearM, sideM: row.sideM };
  }
  return null;
}

export function parkingRow(schedule: ParkingSchedule, rowId: string): ParkingRow | null {
  return schedule.rows.find((r) => r.id === rowId) ?? null;
}

/** max(minSpaces or 0, ceil(units * numerator / denominator)), integer-exact. */
export function parkingSpaces(row: ParkingRow, units: number): number {
  const { numerator, denominator } = row.spaces;
  const required = units && numerator && denominator ? Math.ceil((Math.trunc(units) * numerator) / denominator) : 0;
  return Math.max(row.minSpaces ?? 0, required);
}

export interface TestVector {
  id: string;
  kind: "far" | "setback" | "parking";
  given: Record<string, unknown>;
  expect: Record<string, unknown>;
}

export interface EnginePack {
  farTables: FarTable[];
  setbackTable: SetbackTable;
  parkingSchedule: ParkingSchedule;
}

/** Evaluate one pack test vector through the evaluators. Returns null when no row applies. */
export function runVector(pack: EnginePack, v: TestVector): Record<string, unknown> | null {
  const g = v.given;
  if (v.kind === "far") {
    return farRow(pack.farTables, g.classId as string, g.areaSqm as number, g.roadWidthM as number) as Record<string, unknown> | null;
  }
  if (v.kind === "setback") {
    return setbackRow(pack.setbackTable, g.areaSqm as number, { heightM: g.heightM as number | undefined, storeys: g.storeys as number | undefined }) as Record<string, unknown> | null;
  }
  if (v.kind === "parking") {
    const row = parkingRow(pack.parkingSchedule, g.rowId as string);
    if (!row) return null;
    return { spaces: parkingSpaces(row, (g.units as number | undefined) ?? 1) };
  }
  throw new Error(`unknown test-vector kind: ${String((v as { kind: unknown }).kind)}`);
}
