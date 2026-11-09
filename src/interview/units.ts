/**
 * Land and length units for the interview parser (M6-1), ported from the v0 core `units.py`.
 * Storage is canonical metric (m, m2); these convert at the input boundary.
 *
 * katha = 720 sqft (Dhaka), shotok = decimal = 435.6 sqft, bigha = 20 katha, gonda = 1/20 katha = 36 sqft.
 * Kani is not included: it is region-dependent and has no pinned national value.
 */

import { SQM_PER_SQFT } from "../model/units";

export const FT_M = 0.3048;
export const INCH_M = 0.0254;

const KATHA = 720 * SQM_PER_SQFT;

export const AREA_TO_M2: Record<string, number> = {
  sqm: 1,
  m2: 1,
  sqft: SQM_PER_SQFT,
  katha: KATHA,
  shotok: 435.6 * SQM_PER_SQFT,
  decimal: 435.6 * SQM_PER_SQFT,
  bigha: KATHA * 20,
  gonda: KATHA / 20,
};

export const LENGTH_TO_M: Record<string, number> = {
  m: 1,
  meter: 1,
  metre: 1,
  ft: FT_M,
  feet: FT_M,
  foot: FT_M,
  inch: INCH_M,
  mm: 0.001,
};

/** Display words per unit code: [English, Bangla]. */
export const UNIT_WORDS: Record<string, [string, string]> = {
  m2: ["sqm", "বর্গমিটার"],
  sqm: ["sqm", "বর্গমিটার"],
  sqft: ["sqft", "বর্গফুট"],
  katha: ["katha", "কাঠা"],
  shotok: ["shotok", "শতক"],
  decimal: ["shotok", "শতক"],
  bigha: ["bigha", "বিঘা"],
  gonda: ["gonda", "গন্ডা"],
  m: ["m", "মিটার"],
  meter: ["m", "মিটার"],
  metre: ["m", "মিটার"],
  ft: ["ft", "ফুট"],
  feet: ["ft", "ফুট"],
  foot: ["ft", "ফুট"],
  inch: ["inch", "ইঞ্চি"],
  mm: ["mm", "মিলিমিটার"],
  kPa: ["kPa", "কিলোপ্যাসকেল"],
  BDT: ["BDT", "টাকা"],
};

export class UnitError extends Error {}

/** Round half up to `places` decimals (the parser's canonical precision). */
export function quantize(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
}

export function areaToM2(value: number, unit: string): number {
  const f = AREA_TO_M2[unit.trim().toLowerCase()];
  if (f === undefined) throw new UnitError(`unknown area unit "${unit}"`);
  return value * f;
}

export function lengthToM(value: number, unit: string): number {
  const f = LENGTH_TO_M[unit.trim().toLowerCase()];
  if (f === undefined) throw new UnitError(`unknown length unit "${unit}"`);
  return value * f;
}

/** A number without exponent or needless trailing zeros. */
export function formatNumber(value: number, maxDecimals = 6): string {
  const s = quantize(value, maxDecimals).toFixed(maxDecimals);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const bnDigits = (text: string) => text.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
