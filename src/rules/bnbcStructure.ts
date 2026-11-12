/**
 * Loads spec/rules/bnbc-2020-structure.yaml (BNBC 2020 Part 6 values transcribed for src/structure, status candidate)
 * and answers the lookups the structure code needs: coefficient tables with interpolation in the span ratio m.
 */

import { load } from "js-yaml";
import packText from "../../spec/rules/bnbc-2020-structure.yaml?raw";

type Row = { m: number; v: Array<number | null> };
type Table = { cite: string; rows: Row[] };

export interface StructurePack {
  id: string;
  status: string;
  citations: Record<string, { gazettePage: string; pdfPage: string | number; note: string }>;
  unitWeights: { brick: number; concreteStoneUnreinforced: number; reinforcementAddKnM3PerPercent: number };
  constructionWeights: {
    concreteSlabStone: { per100mmKnM2: number };
    brickMasonryBurntClayPer100mm: number;
    cementPlasterPer10mm: number;
    claytiling13mm: number;
    bituminousFeltGravel5ply: number;
    ceilingCementPlaster13mm: number;
  };
  liveLoadReduction: {
    appliesWhenKllAtAtLeastM2: number;
    minFraction: { oneFloor: number; twoOrMoreFloors: number };
    noReductionAboveKnM2: number;
    kll: { interiorColumns: number; exteriorColumnsNoCantilever: number; interiorBeams: number; edgeBeamsNoCantilever: number; other: number };
  };
  minThickness: { table_6_6_1: { solidOneWaySlab: { divisors: number[] } } };
  approxCoefficients: { momentDivisors: Record<string, number> };
  coefficients: Record<"negA" | "negB" | "deadA" | "deadB" | "liveA" | "liveB" | "shareA" | "shareB", Table>;
  twoWayCases: Array<{ case: number; shortContinuous: number; longContinuous: number }>;
}

let cached: StructurePack | null = null;

export function structurePack(): StructurePack {
  return (cached ??= load(packText) as StructurePack);
}

/** Case number 1..9 from how many of the two short edges and the two long edges are continuous (Sec 6.5.8.3 icons). */
export function twoWayCase(shortEdgesContinuous: number, longEdgesContinuous: number): number {
  const hit = structurePack().twoWayCases.find((c) => c.shortContinuous === shortEdgesContinuous && c.longContinuous === longEdgesContinuous);
  if (!hit) throw new Error(`no two-way case for ${shortEdgesContinuous} short and ${longEdgesContinuous} long continuous edges`);
  return hit.case;
}

export type CoefficientKey = keyof StructurePack["coefficients"];

/**
 * Coefficient for `caseNo` at span ratio `m` (0.5 <= m <= 1), linearly interpolated between the printed rows.
 * Returns null for a blank cell (no negative moment in that direction).
 */
export function coefficient(key: CoefficientKey, caseNo: number, m: number): number | null {
  const rows = structurePack().coefficients[key].rows; // m descending 1.00 .. 0.50
  const mm = Math.min(1, Math.max(0.5, m));
  let hi = rows[0];
  let lo = rows[rows.length - 1];
  for (let i = 0; i + 1 < rows.length; i++) {
    if (mm <= rows[i].m + 1e-12 && mm >= rows[i + 1].m - 1e-12) {
      hi = rows[i];
      lo = rows[i + 1];
      break;
    }
  }
  const a = hi.v[caseNo - 1];
  const b = lo.v[caseNo - 1];
  if (a === null || b === null) return a === null && b === null ? null : (a ?? b);
  if (hi.m === lo.m) return a;
  const t = (mm - lo.m) / (hi.m - lo.m);
  return b + (a - b) * t;
}

// ---------------------------------------------------------------- seismic, column and footing sections

export type SiteClass = "SA" | "SB" | "SC" | "SD" | "SE";
export type OccupancyGroup = "I_II" | "III" | "IV";

export interface SeismicSystem {
  id: string;
  label: string;
  r: number;
  omega: number;
  cd: number;
  /** Height limits in m for design categories B, C, D: null = no limit, "NP" = not permitted. */
  height: Array<number | null | "NP">;
}

interface SeismicSection {
  spectrum: { beta: number };
  siteClasses: Record<SiteClass, { s: number; tb: number; tc: number; td: number }>;
  importance: Record<OccupancyGroup, number>;
  designCategory: { I_II_III: Record<SiteClass, string[]>; IV: Record<SiteClass, string[]> };
  systems: { rows: SeismicSystem[] };
  period: { concreteMomentFrame: { ct: number; m: number }; otherSystems: { ct: number; m: number } };
  weight: { liveUpTo3KnM2: number; liveAbove3KnM2: number };
  verticalDistribution: { kAtOrBelow0_5s: number; kAtOrAbove2_5s: number };
  drift: {
    limits: { allOther: Record<OccupancyGroup, number>; upTo4StoreysAccommodating: Record<OccupancyGroup, number> };
    pDelta: { exemptBelowTheta: number };
  };
  bearingIncrease: { fraction: number };
}

export function seismicPack(): SeismicSection {
  return (structurePack() as unknown as { seismic: SeismicSection }).seismic;
}

export interface ColumnSection {
  phi: { compressionControlledTied: number; tensionControlled: number };
  pnMaxTied: { factor: number };
  steel: { minRatio: number; maxRatio: number; preferredMaxRatio: number };
  slenderness: { neglectUnbracedBelow: number };
  stiffness: { columnIg: number; beamIg: number };
}

export function columnPack(): ColumnSection {
  return (structurePack() as unknown as { columns: ColumnSection }).columns;
}

export interface FootingSection {
  alphaS: { interior: number; edge: number; corner: number };
  coverAgainstEarth: number;
}

export function footingPack(): FootingSection {
  return (structurePack() as unknown as { footings: FootingSection }).footings;
}

export interface ReinforcementSection {
  stockBarsMm: number[];
  hooks: {
    standard180: { extensionDb: number; extensionMinMm: number };
    standard90: { extensionDb: number };
    stirrup: { upTo16: { extensionDb: number }; closedTie135: { extensionDb: number; extensionMinMm: number } };
  };
  bendDiameter: { from10to25: number; from25to40: number; stirrupAndTieUpTo16: number };
  development: {
    divisorGoodSmall: number;
    divisorGoodLarge: number;
    divisorOtherLarge: number;
    minMm: number;
    psiT: { topBarsOver300mmConcrete: number; other: number };
    psiE: { uncoated: number };
    lambda: number;
  };
  compression: { coefficient: number; minCoefficient: number; minMm: number };
  hookDevelopment: { coefficient: number; minDb: number; minMm: number; factorSideCover65: number; factorTies3db: number; sideCoverMm: number; extensionCoverMm: number; tieSpacingDb: number };
  lap: {
    tension: { classA: number; classB: number; minMm: number };
    compression: { coefficientFy420OrLess: number; minMm: number; lowStrengthFactor: { fcBelowMPa: number; multiplier: number } };
  };
  maxSpacing: { oneWaySlab: { timesThickness: number; maxMm: number }; twoWaySlab: { timesThickness: number; maxMm: number }; shrinkageSteel: { timesThickness: number; maxMm: number } };
}

export function reinforcementPack(): ReinforcementSection {
  return (structurePack() as unknown as { reinforcement: ReinforcementSection }).reinforcement;
}
