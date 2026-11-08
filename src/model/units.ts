/**
 * Land-area units used in Bangladesh, converted to square metres (the canonical unit).
 *
 * Definitions (exact, in square feet; 1 ft = 0.3048 m):
 * - katha  = 720 sq ft          (Dhaka standard)
 * - shotok = 435.6 sq ft        (decimal: 1/100 acre)
 * - bigha  = 20 katha = 14,400 sq ft (Dhaka standard; the bigha differs in some districts)
 */

export const SQM_PER_SQFT = 0.09290304;

export type LandUnit = "sqm" | "sqft" | "katha" | "shotok" | "bigha";

const SQFT_PER_UNIT: Record<Exclude<LandUnit, "sqm">, number> = {
  sqft: 1,
  katha: 720,
  shotok: 435.6,
  bigha: 14_400,
};

/** v2 saves call the shotok "decimal". */
export function normaliseLandUnit(unit: string): LandUnit | null {
  const u = unit.trim().toLowerCase();
  if (u === "decimal") return "shotok";
  if (u === "sqm" || u === "sqft" || u === "katha" || u === "shotok" || u === "bigha") return u;
  return null;
}

/** Square metres in one of `unit`. */
export function sqmPerUnit(unit: LandUnit): number {
  return unit === "sqm" ? 1 : SQFT_PER_UNIT[unit] * SQM_PER_SQFT;
}

export function landAreaToSqm(value: number, unit: LandUnit): number {
  return value * sqmPerUnit(unit);
}

export function sqmToLandArea(sqm: number, unit: LandUnit): number {
  return sqm / sqmPerUnit(unit);
}
