/**
 * Anchorage, hooks, bends and splices of reinforcement, BNBC 2020 Part 6 Sec 8.1.2 and 8.2 (pack:
 * spec/rules/bnbc-2020-structure.yaml, section `reinforcement`). Lengths in mm, bar diameters in mm, fc and fy in MPa.
 */

import { reinforcementPack } from "../rules/bnbcStructure";
import { MATERIALS } from "./materials";

const R = () => reinforcementPack();

/** Straight development length in tension, Sec 8.2.3.2 (first row: clear spacing and cover at least db, minimum stirrups), not below 300 mm. */
export function ldTension(db: number, opts: { topBar?: boolean; fc?: number; fy?: number } = {}): number {
  const { fc = MATERIALS.fcMPa, fy = MATERIALS.fyMPa, topBar = false } = opts;
  const d = R().development;
  const psiT = topBar ? d.psiT.topBarsOver300mmConcrete : d.psiT.other;
  const div = db <= 19 ? d.divisorGoodSmall : d.divisorGoodLarge;
  const ld = ((fy * psiT * d.psiE.uncoated) / (div * d.lambda * Math.sqrt(fc))) * db;
  return Math.max(ld, d.minMm);
}

/** The same without the 300 mm minimum, the basis for lap splices (Sec 8.2.13.1). */
export function ldTensionBasic(db: number, opts: { topBar?: boolean; fc?: number; fy?: number } = {}): number {
  const { fc = MATERIALS.fcMPa, fy = MATERIALS.fyMPa, topBar = false } = opts;
  const d = R().development;
  const psiT = topBar ? d.psiT.topBarsOver300mmConcrete : d.psiT.other;
  const div = db <= 19 ? d.divisorGoodSmall : d.divisorGoodLarge;
  return ((fy * psiT * d.psiE.uncoated) / (div * d.lambda * Math.sqrt(fc))) * db;
}

/** Development length in compression, Sec 8.2.4.2: larger of 0.24 fy db / (lambda sqrt fc) and 0.043 fy db, at least 200 mm. */
export function ldCompression(db: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const c = R().compression;
  return Math.max(Math.max((c.coefficient * fy * db) / (R().development.lambda * Math.sqrt(fc)), c.minCoefficient * fy * db), c.minMm);
}

/** Development length of a standard hook in tension, Sec 8.2.6.2: 0.24 psi_e fy db / (lambda sqrt fc), at least 8 db and 150 mm. */
export function ldHook(db: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const h = R().hookDevelopment;
  const ldh = (h.coefficient * R().development.psiE.uncoated * fy * db) / (R().development.lambda * Math.sqrt(fc));
  return Math.max(ldh, h.minDb * db, h.minMm);
}

/** Tension lap splice, Sec 8.2.13.1: Class A 1.0 ld or Class B 1.3 ld (ld without the 300 mm minimum), not below 300 mm. */
export function lapTension(db: number, cls: "A" | "B" = "B", opts: { topBar?: boolean; fc?: number; fy?: number } = {}): number {
  const t = R().lap.tension;
  return Math.max((cls === "A" ? t.classA : t.classB) * ldTensionBasic(db, opts), t.minMm);
}

/** Compression lap splice, Sec 8.2.14.1: 0.071 fy db (fy up to 420), at least 300 mm, one third longer when fc is below 21 MPa. */
export function lapCompression(db: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): number {
  const c = R().lap.compression;
  const base = fy <= 420 ? c.coefficientFy420OrLess * fy * db : (0.13 * fy - 24) * db;
  const withLow = fc < c.lowStrengthFactor.fcBelowMPa ? base * c.lowStrengthFactor.multiplier : base;
  return Math.max(withLow, c.minMm);
}

/** Minimum inside diameter of a bend, Table 6.8.1 (stirrups and ties of 16 mm and smaller: 4 db). */
export function bendDiameter(db: number, stirrup = false): number {
  const b = R().bendDiameter;
  if (stirrup && db <= 16) return b.stirrupAndTieUpTo16 * db;
  return (db <= 25 ? b.from10to25 : b.from25to40) * db;
}

/** Straight tail of a standard hook: 90 degrees 12 db, 180 degrees 4 db (not below 65 mm), Sec 8.1.2.1. */
export function hookTail(db: number, kind: "90" | "180"): number {
  const h = R().hooks;
  return kind === "90" ? h.standard90.extensionDb * db : Math.max(h.standard180.extensionDb * db, h.standard180.extensionMinMm);
}

/** Tail of a closed stirrup or tie hook, 135 degrees: 6 db, not below 75 mm (Sec 8.1.2.1 c iv and d). */
export function tieHookTail(db: number): number {
  const t = R().hooks.stirrup.closedTie135;
  return Math.max(t.extensionDb * db, t.extensionMinMm);
}

/**
 * Length that the sum of outside straight dimensions overstates for one bend of `deflectionDeg` degrees with inside
 * bend diameter `bendDiaMm`: 2 (r + db) tan(theta/2) - theta (r + db/2), r the inside radius.
 */
export function bendDeduction(db: number, bendDiaMm: number, deflectionDeg: number): number {
  const r = bendDiaMm / 2;
  const th = (deflectionDeg * Math.PI) / 180;
  return 2 * (r + db) * Math.tan(th / 2) - th * (r + db / 2);
}
