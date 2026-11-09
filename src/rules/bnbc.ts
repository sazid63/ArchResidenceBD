/** Loads the BNBC 2020 rule pack (spec/rules/bnbc-2020.yaml, status candidate). Only the structural-load parts are typed here. */

import { load } from "js-yaml";
import packText from "../../spec/rules/bnbc-2020.yaml?raw";
import type { Citation } from "./pack";

export interface LiveLoadRow {
  id: string;
  use: string;
  uniformKnM2: number | string;
  concentratedKn?: number;
  cite: string;
}

export interface BnbcPack {
  id: string;
  status: string;
  citations: Record<string, Citation>;
  liveLoads: { cite: string; rows: LiveLoadRow[] };
  loadCombinations: { cite: string; strength: Array<{ n: number; expr: string }>; serviceability: Array<{ id: string; expr: string }> };
  seismic?: unknown;
}

let cached: BnbcPack | null = null;

export function bnbcPack(): BnbcPack {
  return (cached ??= load(packText) as BnbcPack);
}

/** Table 6.2.3 uniform live load (kN/m2) for a row id; throws when the row is missing or not numeric. */
export function liveLoadKnM2(id: string): number {
  const row = bnbcPack().liveLoads.rows.find((r) => r.id === id);
  if (!row || typeof row.uniformKnM2 !== "number") throw new Error(`BNBC live-load row "${id}" has no numeric value`);
  return row.uniformKnM2;
}
