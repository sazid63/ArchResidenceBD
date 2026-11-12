/**
 * Transverse reinforcement of special-moment-frame columns, BNBC 2020 Part 6 Sec 8.3.5.4 (gazette pp. 3678-3679):
 * eq 6.8.7 and 6.8.8 for the total hoop area Ash, the zone length lo and the hoop spacing so inside it, and
 * min(6 db, 150) outside it (clause (f)). Cross ties are required for every interior bar (clause (a)(iii)).
 *
 * Assumptions, stated on the screens through the design notes:
 * - Eq 6.8.7 and 6.8.8 use the larger core dimension for both directions (the text read does not say which
 *   dimension belongs to which leg set; the larger one is conservative).
 * - Spacings are rounded down to 25 mm (conservative; the clause (b) limits are applied before rounding).
 * - Clause (a)(iv) (the core already carries the earthquake load) is not used: the check is always applied.
 */
import { barArea } from "./barSelect";
import { DESIGN, MATERIALS } from "./materials";

export interface ConfinementInput {
  bxMm: number;
  byMm: number;
  /** Storey clear height lu, mm. */
  luMm: number;
  /** Smallest longitudinal bar in the column, mm (clause (b)(ii)). */
  longDiaMm: number;
  /** Bars on each face running along x, corners included. */
  barsPerXFace: number;
  /** Bars on each face running along y, corners included. */
  barsPerYFace: number;
  fcMPa?: number;
  fytMPa?: number;
  coverMm?: number;
}

export interface ConfinementResult {
  ok: boolean;
  tieDiaMm: number;
  /** Length lo from each joint face (clause (d)), mm. */
  loMm: number;
  /** Spacing so inside lo, mm (0 when the check fails). */
  endSpacingMm: number;
  /** Spacing outside lo, min(6 db, 150) rounded down to 25 mm, mm. */
  midSpacingMm: number;
  /** Largest centre-to-centre spacing between laterally supported bars, mm. */
  hxMm: number;
  /** Cross ties with legs parallel to x, per level. */
  crossTiesX: number;
  /** Cross ties with legs parallel to y, per level. */
  crossTiesY: number;
  /** Legs crossing the section parallel to x (closed hoop 2 plus cross ties), per level. */
  legsX: number;
  legsY: number;
  /** Ash required by eq 6.8.7 / 6.8.8 at the spacing used, mm2. */
  asReqMm2: number;
  /** Ash provided in the weaker direction, mm2. */
  asProvMm2: number;
  reason?: string;
}

const TIE_STOCK = [10, 12];
const floor25 = (x: number): number => Math.floor(x / 25) * 25;

export function confinementDesign(input: ConfinementInput): ConfinementResult {
  const fc = input.fcMPa ?? MATERIALS.fcMPa;
  const fyt = input.fytMPa ?? MATERIALS.fytMPa;
  const cover = input.coverMm ?? DESIGN.coverBeamMm;
  const { bxMm: bx, byMm: by, longDiaMm: db } = input;
  const nx = input.barsPerXFace;
  const ny = input.barsPerYFace;

  const loMm = Math.max(bx, by, Math.ceil(input.luMm / 6), 450);
  const crossTiesX = Math.max(ny - 2, 0);
  const crossTiesY = Math.max(nx - 2, 0);
  const legsX = 2 + crossTiesX;
  const legsY = 2 + crossTiesY;
  const midSpacingMm = floor25(Math.min(6 * db, 150));

  const bcMax = Math.max(bx, by) - 2 * cover;
  const ratio = (bx * by) / ((bx - 2 * cover) * (by - 2 * cover)) - 1;
  const asReq = (s: number): number =>
    Math.max(0.3 * s * bcMax * ratio * (fc / fyt), 0.09 * s * bcMax * (fc / fyt));

  // Per tie size: the largest spacing allowed by clause (b), with the hx of that tie size.
  const limit = TIE_STOCK.map((dt) => {
    const hxX = (bx - 2 * cover - 2 * dt) / Math.max(nx - 1, 1);
    const hxY = (by - 2 * cover - 2 * dt) / Math.max(ny - 1, 1);
    const hxMm = Math.max(hxX, hxY);
    const soCap = Math.min(100 + (350 - hxMm) / 3, 150);
    const sMax = floor25(Math.min(Math.floor(Math.min(bx, by) / 4), 6 * db, soCap));
    return { dt, hxMm, sMax };
  });
  const sTop = Math.max(...limit.map((l) => l.sMax));

  // Largest spacing first; at equal spacing the smaller tie wins.
  for (let s = sTop; s >= 50; s -= 25) {
    for (const l of limit) {
      if (s > l.sMax) continue;
      const area = barArea(l.dt);
      const need = asReq(s);
      const prov = Math.min(legsX, legsY) * area;
      if (prov + 1e-9 >= need) {
        return { ok: true, tieDiaMm: l.dt, loMm, endSpacingMm: s, midSpacingMm, hxMm: round(l.hxMm), crossTiesX, crossTiesY, legsX, legsY, asReqMm2: round(need), asProvMm2: round(prov) };
      }
    }
  }
  const worst = limit[limit.length - 1];
  return {
    ok: false,
    tieDiaMm: worst.dt,
    loMm,
    endSpacingMm: 0,
    midSpacingMm,
    hxMm: round(worst.hxMm),
    crossTiesX,
    crossTiesY,
    legsX,
    legsY,
    asReqMm2: round(asReq(50)),
    asProvMm2: round(Math.min(legsX, legsY) * barArea(worst.dt)),
    reason: "Ash cannot be met at 50 mm with the largest stock tie; enlarge the column or add bars",
  };
}

const round = (x: number): number => Math.round(x * 10) / 10;

/**
 * Bars on each face of a rectangular layout of n bars with corners counted once on each face: n = 2 (nx + ny) - 4.
 * The split follows the side lengths, with at least two bars on each face.
 */
export function barsPerFace(n: number, bxMm: number, byMm: number): { barsPerXFace: number; barsPerYFace: number } {
  const half = Math.round(n / 2) + 2;
  const nx = Math.min(Math.max(Math.round((half * bxMm) / (bxMm + byMm)), 2), half - 2);
  return { barsPerXFace: nx, barsPerYFace: half - nx };
}
