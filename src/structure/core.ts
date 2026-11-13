/**
 * Core shear wall (plan P2-2): the lift shaft as a hollow reinforced-concrete box that resists lateral load together with the frame
 * (dual system, BNBC 2020 Part 6 Table 6.2.19 D.3 "special reinforced concrete shear walls": R 7, Omega0 2.5, Cd 5.5, no height limit).
 * Note 2 of the table: both systems resist the total design force in proportion to their lateral stiffness, and the moment frames must
 * resist at least 25 % of the prescribed force (heading of group D).
 *
 * Screening model, not final design. Assumptions (also listed in CORE_ASSUMPTIONS): the lift shaft is the only wall (stair walls are
 * brick), 200 mm walls as in `LIFT_ASSUMPTIONS`, one door opening per shaft in one web, cracked stiffness 0.35 Ig (the beam value of
 * Sec 6.3.10.4.1 is used for the wall), flexural steel placed in the two flange walls with a lever arm of 0.8 of the shaft length,
 * boundary elements are checked (Sec 8.3.6.6 stress screen and the Eq 6.8.10 displacement route, see checkCore); the coupling beams over the doors are designed separately; the core footing or raft is NOT designed.
 */

import type { BuildingModel } from "../model/building";
import { liftCore, LIFT_ASSUMPTIONS } from "../model/lift";
import { barArea } from "./barSelect";
import { ecMPa, MATERIALS } from "./materials";

export interface CoreSection {
  /** Outer size of the box along x and y, mm (centre-line cell plus one wall thickness). */
  lxMm: number;
  lyMm: number;
  tMm: number;
  shafts: number;
  /** Wall height from the pit floor to the machine-room slab, mm. */
  heightMm: number;
  doorWidthMm: number;
  /** Centre of the cell in plan, mm. */
  cxMm: number;
  cyMm: number;
  /** Extra shear walls outside the lift box (the stair wall, see `stairWallMm`). Each resists lateral load along `dir`. */
  extraWalls?: ExtraWall[];
}

/** A plain wall that resists lateral load along `dir`: length along that direction, thickness, and its lever arm from the core centroid. */
export interface ExtraWall {
  /** The load direction the wall resists. */
  dir: "x" | "y";
  /** "web" (default): its length runs along the load and it takes shear. "flange": its length runs across the load, far from the core centre, and it carries the moment as axial force (no shear). */
  kind?: "web" | "flange";
  lengthMm: number;
  tMm: number;
  /** Centre of the wall to the core centre, measured along the load direction, mm. */
  leverMm: number;
  /** Centreline of the wall in plan (axis-aligned), mm, for drawing. */
  span?: { x0: number; y0: number; x1: number; y1: number };
}

/** Inertia about the core centre for lateral load along the wall's direction, mm4: a web adds its own t L^3 / 12 and A d^2; a flange only A d^2. */
export function extraInertia(w: ExtraWall): number {
  const a = w.tMm * w.lengthMm;
  return (w.kind === "flange" ? 0 : (w.tMm * w.lengthMm ** 3) / 12) + a * w.leverMm ** 2;
}

/** Shear area for the direction: a web's area along the load; a flange takes no shear. */
export function extraAcv(w: ExtraWall): number {
  return w.kind === "flange" ? 0 : w.lengthMm * w.tMm;
}

/**
 * Stair shear wall (assumption, screening): the stair room's long edges and short edges nearest the lift core carry one wall each, with
 * the lift shaft's wall thickness. Each wall takes the lateral load in its own plane. Their stiffness is added about the core centroid
 * (parallel-axis form), which ignores the small shift of the combined neutral axis and torsion.
 */
/**
 * Weak-direction walls (assumption, screening): one flange wall per direction, on the footprint edge farthest from the core centre, running
 * the full depth (for x) or width (for y). Such a wall is a plan change (an end wall of the building) and is not drawn yet.
 */
export function weakWallsMm(model: BuildingModel, cx: number, cy: number): ExtraWall[] {
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  const x0 = model.origin.x;
  const y0 = model.origin.y;
  const dx = Math.max(Math.abs(x0 - cx), Math.abs(x0 + model.widthMm - cx));
  const dy = Math.max(Math.abs(y0 - cy), Math.abs(y0 + model.depthMm - cy));
  const xFar = Math.abs(x0 - cx) >= Math.abs(x0 + model.widthMm - cx) ? x0 : x0 + model.widthMm;
  const yFar = Math.abs(y0 - cy) >= Math.abs(y0 + model.depthMm - cy) ? y0 : y0 + model.depthMm;
  return [
    { dir: "x", kind: "flange", lengthMm: model.depthMm, tMm: t, leverMm: dx, span: { x0: xFar, y0, x1: xFar, y1: y0 + model.depthMm } },
    { dir: "y", kind: "flange", lengthMm: model.widthMm, tMm: t, leverMm: dy, span: { x0, y0: yFar, x1: x0 + model.widthMm, y1: yFar } },
  ];
}

export function stairWallMm(model: BuildingModel, cx: number, cy: number): ExtraWall[] {
  const st = model.roof.stairCover;
  if (!st) return [];
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  // a wall along x (resists x load) sits on a stair edge parallel to x; its lever is its centre's x offset from the core centre
  // each web sits on the stair edge nearest the core
  const yEdge = Math.abs(st.y0 - cy) <= Math.abs(st.y1 - cy) ? st.y0 : st.y1;
  const xEdge = Math.abs(st.x0 - cx) <= Math.abs(st.x1 - cx) ? st.x0 : st.x1;
  return [
    { dir: "x", lengthMm: st.x1 - st.x0, tMm: t, leverMm: (st.x0 + st.x1) / 2 - cx, span: { x0: st.x0, y0: yEdge, x1: st.x1, y1: yEdge } },
    { dir: "y", lengthMm: st.y1 - st.y0, tMm: t, leverMm: (st.y0 + st.y1) / 2 - cy, span: { x0: xEdge, y0: st.y0, x1: xEdge, y1: st.y1 } },
  ];
}

/** The core the plan gives, or null when there is no lift cell. `stairWall` adds the stair shear walls (screening assumption). */
export function coreSection(model: BuildingModel, opts: { stairWall?: boolean; weakWall?: boolean } = {}): CoreSection | null {
  const lc = liftCore(model);
  if (!lc) return null;
  const c = lc.spec.cell;
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  const cxMm = (c.x0 + c.x1) / 2;
  const cyMm = (c.y0 + c.y1) / 2;
  return {
    lxMm: c.x1 - c.x0 + t,
    lyMm: c.y1 - c.y0 + t,
    tMm: t,
    shafts: lc.spec.liftsProvided,
    heightMm: lc.heightMm,
    doorWidthMm: LIFT_ASSUMPTIONS.doorMm[0],
    cxMm,
    cyMm,
    ...(opts.stairWall || opts.weakWall ? { extraWalls: [...(opts.stairWall ? stairWallMm(model, cxMm, cyMm) : []), ...(opts.weakWall ? weakWallsMm(model, cxMm, cyMm) : [])] } : {}),
  };
}

export interface WallProps {
  /** Gross inertia about the axis perpendicular to the load direction, mm4 (hollow box), and its cracked value. */
  igMm4: number;
  ieMm4: number;
  /** Length of the box along the load direction (web length) and across it (flange length), mm. */
  lwMm: number;
  flangeMm: number;
  /** Shear area of the webs parallel to the load, mm2, with the door openings taken out of one web. */
  acvMm2: number;
  /** Gross concrete area of all walls, mm2. */
  agMm2: number;
}

export const CORE_CRACKED = 0.35;

/** Section properties for lateral load along `dir`. */
export function wallProps(core: CoreSection, dir: "x" | "y"): WallProps {
  const lw = dir === "x" ? core.lxMm : core.lyMm;
  const fl = dir === "x" ? core.lyMm : core.lxMm;
  const t = core.tMm;
  let ig = (fl * lw ** 3 - (fl - 2 * t) * (lw - 2 * t) ** 3) / 12;
  // each shaft has one door in a web wall; if that wall is a flange for this direction the webs stay whole
  const openings = dir === "x" ? core.shafts * core.doorWidthMm : 0;
  let acv = Math.max(2 * lw - openings, lw) * t;
  const extras = core.extraWalls ?? [];
  // extra walls: own in-plane inertia L^3 t / 12 plus the parallel-axis term A d^2, and shear area when they run along the load
  for (const w of extras) {
    if (w.dir !== dir) continue;
    ig += extraInertia(w);
    acv += extraAcv(w);
  }
  // weight: every wall of the core counts once, whichever direction is asked for
  const extraAg = extras.reduce((s, w) => s + w.lengthMm * w.tMm, 0);
  const ag = (2 * (lw + fl) - 4 * t + Math.max(0, core.shafts - 1) * Math.min(lw, fl)) * t + extraAg;
  return { igMm4: ig, ieMm4: CORE_CRACKED * ig, lwMm: lw, flangeMm: fl, acvMm2: acv, agMm2: ag };
}

export interface DualInput {
  /** Lateral force at each level 1..n, kN, storey height mm, frame storey stiffness kN/mm. */
  forcesKn: number[];
  hMm: number;
  frameKnPerMm: number[];
  wall: WallProps;
  ecMPa: number;
}

export interface DualResult {
  /** Interstorey drift, mm, and the effective storey stiffness V / drift, kN/mm. */
  driftMm: number[];
  effectiveKnPerMm: number[];
  storeyShearKn: number[];
  frameShearKn: number[];
  wallShearKn: number[];
  /** Wall bending moment at the base of each storey, kN.m. */
  wallMomentKnM: number[];
}

/** Gaussian elimination with partial pivoting on a small dense system. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

/**
 * Wall (Timoshenko cantilever, fixed at the base, EI and shear area GA with G = Ec / 2.4) and frame (shear springs per storey) joined by
 * rigid diaphragms at every level. Degrees of freedom: sway u and rotation theta at levels 1..n.
 */
export function dualLateral(inp: DualInput): DualResult {
  const n = inp.forcesKn.length;
  const h = inp.hMm;
  const ei = (inp.ecMPa * inp.wall.ieMm4) / 1000; // kN.mm2
  const ga = (inp.ecMPa / 2.4) * inp.wall.acvMm2 / 1000; // kN
  const phi = (12 * ei) / (ga * h * h);
  const c = ei / ((1 + phi) * h ** 3);
  const ke = [
    [12 * c, 6 * h * c, -12 * c, 6 * h * c],
    [6 * h * c, (4 + phi) * h * h * c, -6 * h * c, (2 - phi) * h * h * c],
    [-12 * c, -6 * h * c, 12 * c, -6 * h * c],
    [6 * h * c, (2 - phi) * h * h * c, -6 * h * c, (4 + phi) * h * h * c],
  ];
  const nd = 2 * n; // dof of node j (1..n): u = 2 (j - 1), theta = 2 (j - 1) + 1; node 0 is fixed
  const k: number[][] = Array.from({ length: nd }, () => new Array<number>(nd).fill(0));
  const dof = (node: number, which: 0 | 1) => (node === 0 ? -1 : 2 * (node - 1) + which);
  for (let e = 0; e < n; e++) {
    const map = [dof(e, 0), dof(e, 1), dof(e + 1, 0), dof(e + 1, 1)];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (map[i] >= 0 && map[j] >= 0) k[map[i]][map[j]] += ke[i][j];
    const kf = inp.frameKnPerMm[e];
    const a = dof(e, 0);
    const b = dof(e + 1, 0);
    if (a >= 0) { k[a][a] += kf; k[a][b] -= kf; k[b][a] -= kf; }
    k[b][b] += kf;
  }
  const load = new Array<number>(nd).fill(0);
  inp.forcesKn.forEach((f, j) => { load[dof(j + 1, 0)] = f; });
  const d = solve(k, load);
  const u = (node: number) => (node === 0 ? 0 : d[dof(node, 0)]);
  const th = (node: number) => (node === 0 ? 0 : d[dof(node, 1)]);
  const driftMm: number[] = [];
  const effective: number[] = [];
  const storeyShear: number[] = [];
  const frameShear: number[] = [];
  const wallShear: number[] = [];
  const wallMoment: number[] = [];
  for (let e = 0; e < n; e++) {
    const dv = u(e + 1) - u(e);
    const v = inp.forcesKn.slice(e).reduce((a, b) => a + b, 0);
    driftMm.push(dv);
    storeyShear.push(v);
    effective.push(dv > 0 ? v / dv : inp.frameKnPerMm[e]);
    frameShear.push(inp.frameKnPerMm[e] * dv);
    const de = [u(e), th(e), u(e + 1), th(e + 1)];
    const f = ke.map((row) => row.reduce((s, kij, j) => s + kij * de[j], 0));
    wallShear.push(-f[0]); // f is the force of the node on the element: the wall shear is its negative
    wallMoment.push(Math.abs(f[1]) / 1000);
  }
  return { driftMm, effectiveKnPerMm: effective, storeyShearKn: storeyShear, frameShearKn: frameShear, wallShearKn: wallShear, wallMomentKnM: wallMoment };
}

// ---- wall design at the base -----------------------------------------------------------------------------------------

/**
 * Boundary element at each corner of the core (Sec 8.3.6.6; the length rule is the common stress form of ACI 318 18.10.6.3):
 * it extends from the corner over the part of the wall where the flexural stress exceeds 0.15 fc', at least 300 mm, along both
 * walls that meet at the corner, over the full wall height. Transverse steel: a closed tie with a cross tie at every bar line, spacing
 * at most the least of one third of the wall thickness, 6 bar diameters and 150 mm (not below 50 mm), and the area of eqs 6.8.7 and
 * 6.8.8 (Sec 8.3.5.4) across the thickness (bc = element length less cover) with a 25 mm cover. `fits` is false when the element is
 * longer than half the wall or the ties cannot be met.
 */
export interface BoundaryElement {
  lengthMm: number;
  barDiaMm: number;
  /** Longitudinal bars at each corner (both legs together). */
  barsPerCorner: number;
  tieDiaMm: number;
  tieSpacingMm: number;
  /** Cross ties per leg level (legs parallel to the wall length), per tie position. */
  crossTiesPerLeg: number;
  fits: boolean;
  reason?: string;
}

export const BOUNDARY_COVER_MM = 25;

export function designBoundaryElement(core: Pick<CoreSection, "tMm">, lwMm: number, stressMpa: number, asEndMm2: number, fc: number, heightMm: number): BoundaryElement | null {
  const limit = 0.15 * fc;
  if (stressMpa <= limit) return null;
  const x0 = (lwMm / 2) * (1 - limit / stressMpa);
  const lengthMm = Math.max(Math.ceil(x0 / 50) * 50, 300);
  // bars at most 300 mm apart along the element (every bar is tied: hx <= 350 mm, Sec 8.3.5.4 (c)), two faces, two legs per corner;
  // the smallest bar (16 mm up) whose layout carries the flexural steel, so the layout is not over-provided
  const nAlong = Math.max(2, Math.ceil(lengthMm / 300) + 1);
  const layoutBars = 4 * nAlong - 2;
  const barDiaMm = [16, 20, 25, 28, 32].find((d) => layoutBars * barArea(d) >= asEndMm2) ?? 32;
  const barsPerCorner = Math.max(layoutBars, Math.ceil(asEndMm2 / barArea(barDiaMm)));
  const cover = BOUNDARY_COVER_MM;
  const spacing = Math.max(50, Math.floor(Math.min(core.tMm / 3, 6 * barDiaMm, 150) / 25) * 25);
  const bc = lengthMm - 2 * cover;
  const ratio = (lengthMm * core.tMm) / ((lengthMm - 2 * cover) * (core.tMm - 2 * cover)) - 1;
  const fyt = MATERIALS.fytMPa;
  const asReq = Math.max(0.3 * spacing * bc * ratio * (fc / fyt), 0.09 * spacing * bc * (fc / fyt));
  const legs = nAlong; // a hoop leg or cross tie across the thickness at every bar line
  const tieDiaMm = [10, 12].find((d) => legs * barArea(d) >= asReq) ?? 12;
  const tiesOk = legs * barArea(tieDiaMm) >= asReq;
  const tooLong = lengthMm > lwMm / 2;
  const fits = tiesOk && !tooLong;
  return {
    lengthMm,
    barDiaMm,
    barsPerCorner,
    tieDiaMm,
    tieSpacingMm: spacing,
    crossTiesPerLeg: Math.max(legs - 2, 0),
    fits,
    reason: tooLong ? "the boundary element would be longer than half the wall; thicken the core wall" : tiesOk ? undefined : "Ash cannot be met with 12 mm ties at this spacing",
  };
}

/**
 * Coupling beam (lintel) over a lift door (Sec 8.3.6.7 and the ACI 318 18.10.7 form): span = door width, depth = storey height less
 * the door height. Diagonal reinforcement when ln/h < 4 and Vu > 0.33 sqrt(fc) Acw; then Vn = 2 Avd fy sin(alpha) with phi 0.75,
 * at most 0.83 sqrt(fc) Acw. The shear demand is an assumption: the door web carries half the wall shear and the lintels of the
 * shafts share it equally (not from a coupled-wall analysis). A lintel cannot carry more than its shear limit, so the design shear
 * is the demand capped at that limit (`limited`); the rest goes to the piers beside the door, which are checked in the web shear
 * with the door taken out of the web. `fits` is false when the diagonals cannot be placed in the wall thickness (two bars across,
 * 25 mm gap) with at most 8 bars.
 */
export interface CouplingBeam {
  lnMm: number;
  hMm: number;
  tMm: number;
  /** Design shear, kN: the demand capped at the lintel's limit. */
  vuKn: number;
  demandKn: number;
  limited: boolean;
  diagonal: boolean;
  avdMm2: number;
  barDiaMm: number;
  barsPerGroup: number;
  /** phi x 0.83 sqrt(fc) Acw, kN, and Vu over it. */
  phiVnMaxKn: number;
  util: number;
  fits: boolean;
  reason?: string;
}

export function designCouplingBeam(core: CoreSection, storeyHeightMm: number, demandKn: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa): CouplingBeam | null {
  if (core.shafts <= 0) return null;
  const lnMm = core.doorWidthMm;
  const hMm = Math.max(storeyHeightMm - LIFT_ASSUMPTIONS.doorMm[1], 300);
  const acw = core.tMm * hMm;
  const sqrtFc = Math.sqrt(fc);
  const phiVnMaxKn = (CORE_PHI_SHEAR * 0.83 * sqrtFc * acw) / 1000;
  const vuKn = Math.min(demandKn, phiVnMaxKn);
  const util = vuKn / phiVnMaxKn;
  const diagonal = lnMm / hMm < 4 && vuKn > (0.33 * sqrtFc * acw) / 1000;
  const base = { lnMm, hMm, tMm: core.tMm, vuKn, demandKn, limited: demandKn > phiVnMaxKn, diagonal, phiVnMaxKn, util };
  if (!diagonal) return { ...base, avdMm2: 0, barDiaMm: 0, barsPerGroup: 0, fits: true };
  const alpha = Math.atan((hMm - 2 * 60) / lnMm);
  const avdMm2 = (vuKn * 1000) / (CORE_PHI_SHEAR * 2 * fy * Math.sin(alpha));
  const across = Math.floor((core.tMm - 2 * (25 + 10) - 25) / 1) ; // room left after cover, tie and one 25 mm gap
  const candidate = [12, 16, 20, 22, 25, 28, 32].find((d) => 2 * d <= across && Math.max(4, Math.ceil(avdMm2 / barArea(d))) <= 8);
  if (!candidate) return { ...base, avdMm2, barDiaMm: 0, barsPerGroup: 0, fits: false, reason: "the diagonal bars do not fit in the wall thickness" };
  return { ...base, avdMm2, barDiaMm: candidate, barsPerGroup: Math.max(4, Math.ceil(avdMm2 / barArea(candidate))), fits: true };
}

export interface CoreCheck {
  dir: "x" | "y";
  vuKn: number;
  muKnM: number;
  /** Shear: phi Vn with the required horizontal ratio, the crushing limit phi 0.83 Acv sqrt(fc), and the ratios. */
  rhoHorizontal: number;
  phiVnKn: number;
  phiVnMaxKn: number;
  shearUtil: number;
  /** Flexure: boundary vertical steel needed in each flange wall, mm2, and the most a flange wall holds (4 % of its area). */
  boundarySteelMm2: number;
  boundarySteelMaxMm2: number;
  flexureUtil: number;
  /** Vertical and horizontal distributed ratios (Sec 8.3.6.2: at least 0.0025 each way). */
  rhoVertical: number;
  twoCurtains: boolean;
  /**
   * Boundary element screen (Sec 8.3.6.6, stress form as in ACI 318 18.10.6.2): edge stress from the base moment on the flange
   * area, against 0.2 fc'. Gravity axial load on the core is not added (conservative). Above the limit the flange is a
   * boundary element and needs closed ties over its length (detailed by the designer; not yet in the bar schedule).
   */
  boundaryStressMpa: number;
  /** Displacement route (Eq 6.8.10): neutral-axis depth at nominal moment, mm, its limit, and whether it triggers (null without demand). */
  neutralAxisMm: number;
  dispLimitMm: number | null;
  dispRequired: boolean | null;
  /** Required when the edge stress is above 0.2 fc or the displacement route triggers. */
  boundaryElementRequired: boolean;
  /** The boundary element detail when the stress is above 0.15 fc' (null otherwise); required above 0.2 fc'. */
  boundary: BoundaryElement | null;
  util: number;
  governs: string;
}

export const CORE_PHI_SHEAR = 0.75;
export const CORE_PHI_FLEXURE = 0.9;
const RHO_MIN = 0.0025;
const MAX_STEEL_RATIO = 0.04;

/** Stress block factor beta1 for fc up to 28 MPa (ACI 318-14 Table 22.2.2.4.3, the form BNBC Part 6 follows). */
export const BETA1 = 0.85;
/** Displacement-route constants of Eq 6.8.10 (ACI 318-14 Eq 18.10.6.2 form, web-sourced fallback): c >= lw / (600 (1.5 du/hw)), du/hw >= 0.007. */
export const BE_DISP_DIVISOR = 600;
export const BE_DISP_FACTOR = 1.5;
export const BE_DISP_MIN_RATIO = 0.007;

/**
 * Neutral-axis depth c (mm) at the nominal moment that the design flange steel gives, with the axial compression P (kN, positive
 * in compression) carried on the core. Compression comes from the flange walls (thickness t, length fl) and the webs beyond t.
 * Tension is the flange steel `asTensionMm2` at the far flange. Rectangular stress block with beta1 0.85.
 */
export function neutralAxisDepthMm(core: CoreSection, asTensionMm2: number, fc: number, fy: number, axialKn: number, fl: number): number {
  const t = core.tMm;
  const force = asTensionMm2 * fy + Math.max(axialKn, 0) * 1000; // N
  const perMm = 0.85 * fc; // N/mm2
  const flangeOnly = fl * t * perMm;
  const a = force <= flangeOnly ? force / (perMm * fl) : t + (force / perMm - fl * t) / (2 * t);
  return a / BETA1;
}

export interface BoundaryDisplacement {
  /** Neutral-axis depth, mm, and the displacement-route limit lw / (600 (1.5 du/hw)), mm. */
  cMm: number;
  limitMm: number;
  ratio: number;
  required: boolean;
}

/** Eq 6.8.10 trigger for a wall continuous from base to top: special boundary elements where c >= limit. */
export function boundaryDisplacement(cMm: number, lwMm: number, roofDriftMm: number, buildingHeightMm: number): BoundaryDisplacement {
  const ratio = Math.max(roofDriftMm / buildingHeightMm, BE_DISP_MIN_RATIO);
  const limitMm = lwMm / (BE_DISP_DIVISOR * BE_DISP_FACTOR * ratio);
  return { cMm, limitMm, ratio, required: cMm >= limitMm };
}

/** Demand for the displacement route: design roof drift (Cd delta / I, mm), building height (mm) and core axial compression (kN). */
export interface CoreDemand {
  roofDriftMm: number;
  buildingHeightMm: number;
  axialKn: number;
}

/** Design of the core for one direction from the wall's base shear (kN) and moment (kN.m). Strength-level seismic forces. */
export function checkCore(core: CoreSection, dir: "x" | "y", vuKn: number, muKnM: number, heightMm: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa, demand?: CoreDemand): CoreCheck {
  const w = wallProps(core, dir);
  const sqrtFc = Math.sqrt(fc);
  // Eq 6.8.9: Vn = Acv (alpha_c lambda sqrt(fc) + rho_t fy), alpha_c 0.25 up to hw/lw 1.5 and 0.17 from 2.0 (linear between)
  const ratio = heightMm / w.lwMm;
  const alphaC = ratio <= 1.5 ? 0.25 : ratio >= 2 ? 0.17 : 0.25 - ((ratio - 1.5) / 0.5) * 0.08;
  const vu = Math.abs(vuKn) * 1000;
  const vcN = alphaC * sqrtFc * w.acvMm2;
  const rhoReq = (vu / CORE_PHI_SHEAR - vcN) / (w.acvMm2 * fy);
  const rhoT = Math.max(RHO_MIN, Math.ceil(rhoReq / 0.0005) * 0.0005); // practical steps of 0.05 %
  const vnN = vcN + rhoT * fy * w.acvMm2;
  const vnMax = 0.83 * sqrtFc * w.acvMm2; // Sec 8.3.6.4 (d): 0.83 Acv sqrt(fc) for one segment
  const shearUtil = vu / (CORE_PHI_SHEAR * Math.min(vnN, vnMax));
  // flexure: two flange walls, steel at the web ends, lever arm 0.8 lw, axial load ignored (small)
  const z = 0.8 * w.lwMm;
  const asTotal = (Math.abs(muKnM) * 1e6) / (CORE_PHI_FLEXURE * fy * z);
  const asPerFlange = asTotal / 2;
  const asMax = MAX_STEEL_RATIO * w.flangeMm * core.tMm;
  const flexureUtil = asPerFlange / asMax;
  const util = Math.max(shearUtil, flexureUtil);
  const twoCurtains = vu > 0.17 * sqrtFc * w.acvMm2;
  // edge stress of the flanged wall: I / (lw / 2) = flange area x lw (two flanges at lw/2), so sigma = M / (flange x t x lw)
  const boundaryStress = (Math.abs(muKnM) * 1e6) / (w.flangeMm * core.tMm * w.lwMm);
  // displacement route (Eq 6.8.10): the core is continuous base to top, so this is the governing trigger when it is computed
  const cMm = neutralAxisDepthMm(core, asPerFlange, fc, fy, demand?.axialKn ?? 0, w.flangeMm);
  const disp = demand ? boundaryDisplacement(cMm, w.lwMm, demand.roofDriftMm, demand.buildingHeightMm) : null;
  const stressRequired = boundaryStress > 0.2 * fc;
  const boundaryElementRequired = stressRequired || (disp?.required ?? false);
  // the detail is sized from the edge stress; a displacement-route trigger below 0.2 fc takes the 0.2 fc size
  const detailStress = disp?.required && !stressRequired ? 0.2 * fc : boundaryStress;
  return {
    neutralAxisMm: cMm,
    dispLimitMm: disp?.limitMm ?? null,
    dispRequired: disp?.required ?? null,
    dir,
    vuKn: Math.abs(vuKn),
    muKnM: Math.abs(muKnM),
    rhoHorizontal: rhoT,
    phiVnKn: (CORE_PHI_SHEAR * Math.min(vnN, vnMax)) / 1000,
    phiVnMaxKn: (CORE_PHI_SHEAR * vnMax) / 1000,
    shearUtil,
    boundarySteelMm2: asPerFlange,
    boundarySteelMaxMm2: asMax,
    flexureUtil,
    rhoVertical: RHO_MIN,
    twoCurtains,
    boundaryStressMpa: boundaryStress,
    boundaryElementRequired,
    boundary: designBoundaryElement(core, w.lwMm, detailStress, asPerFlange / 2, fc, heightMm),
    util,
    governs: flexureUtil >= shearUtil ? "flexure (boundary steel)" : "shear",
  };
}

/**
 * Design of one extra shear wall at the base (screening, same rules as the core). A "web" lies in the plane of the load (its length runs
 * along the load): it takes shear by its area and its moment by its inertia share, with horizontal steel from Eq 6.8.9, end steel for the
 * moment (lever arm 0.8 lw, phi 0.9, half at each end), and a boundary element when the edge stress exceeds 0.2 fc' (Sec 8.3.6.6).
 * A "flange" lies across the load (its length runs across it): it takes no shear, carries the moment as axial force N = M / d at lever
 * d from the core centre, and gets end steel N / (phi fy) split over its two ends.
 */
export interface StairWallCheck {
  dir: "x" | "y";
  kind: "web" | "flange";
  lengthMm: number;
  tMm: number;
  /** Share of the direction's moment (by inertia) and of its shear (by area) carried by this wall (0..1). */
  shareI: number;
  shareV: number;
  vuKn: number;
  muKnM: number;
  rhoHorizontal: number;
  shearUtil: number;
  /** Vertical steel at each end of the wall, mm2, and the limit (MAX_STEEL_RATIO of the wall area). */
  asEndMm2: number;
  asEndMaxMm2: number;
  flexureUtil: number;
  boundaryStressMpa: number;
  boundaryElementRequired: boolean;
  boundary: BoundaryElement | null;
  /** Utilisation; 1 + the overrun when a required boundary element cannot be detailed. */
  util: number;
  governs: string;
}

export function checkStairWall(w: ExtraWall, shareI: number, vuKnIn: number, muKnMIn: number, heightMm: number, fc: number = MATERIALS.fcMPa, fy: number = MATERIALS.fyMPa, shareV: number = shareI): StairWallCheck {
  const lw = w.lengthMm;
  const t = w.tMm;
  const acv = lw * t;
  const sqrtFc = Math.sqrt(fc);
  const vu = Math.abs(vuKnIn) * 1000;
  const mu = Math.abs(muKnMIn);
  const flange = (w.kind ?? "web") === "flange";
  const d = Math.max(Math.abs(w.leverMm), 1);
  let rhoT = RHO_MIN;
  let shearUtil = 0;
  let asTotal: number;
  let stress: number;
  if (flange) {
    // axial force of the flange from the moment it carries; steel for it in tension at phi fy; edge stress = N / (lw t)
    const n = (mu * 1e6) / d;
    asTotal = n / (CORE_PHI_FLEXURE * fy);
    stress = n / acv;
  } else {
    // Eq 6.8.9 with the wall's own height-to-length ratio (same alpha_c rule as the core)
    const ratio = heightMm / lw;
    const alphaC = ratio <= 1.5 ? 0.25 : ratio >= 2 ? 0.17 : 0.25 - ((ratio - 1.5) / 0.5) * 0.08;
    const vcN = alphaC * sqrtFc * acv;
    const rhoReq = (vu / CORE_PHI_SHEAR - vcN) / (acv * fy);
    rhoT = Math.max(RHO_MIN, Math.ceil(rhoReq / 0.0005) * 0.0005);
    const vnN = vcN + rhoT * fy * acv;
    const vnMax = 0.83 * sqrtFc * acv;
    shearUtil = vu / (CORE_PHI_SHEAR * Math.min(vnN, vnMax));
    asTotal = (mu * 1e6) / (CORE_PHI_FLEXURE * fy * 0.8 * lw);
    // edge stress of a single wall: M (lw / 2) / I with I = t lw^3 / 12
    stress = (mu * 1e6) / ((t * lw * lw) / 6);
  }
  // end steel: half at each end; limit as for the core flanges
  const asEnd = asTotal / 2;
  const asMax = MAX_STEEL_RATIO * acv;
  const flexureUtil = asEnd / asMax;
  const required = stress > 0.2 * fc;
  const boundary = designBoundaryElement(w, lw, stress, asEnd, fc, heightMm);
  const boundaryFails = required && (!boundary || !boundary.fits);
  const boundaryUtil = boundaryFails ? stress / (0.2 * fc) : 0;
  const util = Math.max(shearUtil, flexureUtil, boundaryUtil);
  return {
    dir: w.dir, kind: flange ? "flange" : "web", lengthMm: lw, tMm: t, shareI, shareV, vuKn: Math.abs(vuKnIn), muKnM: mu, rhoHorizontal: rhoT, shearUtil,
    asEndMm2: asEnd, asEndMaxMm2: asMax, flexureUtil, boundaryStressMpa: stress, boundaryElementRequired: required, boundary, util,
    governs: boundaryUtil >= Math.max(shearUtil, flexureUtil) && boundaryUtil > 0 ? "boundary element cannot be detailed" : flexureUtil >= shearUtil ? (flange ? "flange axial (end steel)" : "flexure (end steel)") : "shear",
  };
}

/** Added to the assumptions when a column would reach 1000 mm and the stair shear walls are added to the core (stairWallMm). */
export const STAIR_WALL_ASSUMPTION = {
  id: "stair-wall",
  en: "Stair shear walls (assumption, screening): the stair room's two edges carry walls of the shaft wall thickness, added to the core's stiffness and shear area. They are checked in the frame and core stiffness only: their reinforcement, boundary elements and quantities are NOT in the bar schedule or the bill of quantities yet.",
  bn: "সিঁড়ির শিয়ার ওয়াল (অনুমান, প্রাথমিক): সিঁড়ির ঘরের দুই কিনারায় শ্যাফট দেয়ালের পুরুত্বের দেয়াল কোরের দৃঢ়তা ও কার্তন ক্ষেত্রে যোগ করা হয়েছে। এগুলো শুধু ফ্রেম ও কোরের দৃঢ়তায় পরীক্ষিত; রড তালিকা ও পরিমাণ তালিকায় এখনো নেই।",
};

/** Added when the weak-direction flange walls are used (weakWallsMm). */
export const WEAK_WALL_ASSUMPTION = {
  id: "weak-wall",
  en: "Weak-direction walls (assumption, screening): one reinforced concrete wall per direction on the footprint edge farthest from the lift core, running the full depth (x) or width (y). They take the moment by their distance from the core and no shear. This is an end wall the plan does not show yet: the architect must accept it, and it is not drawn in the structural sheets.",
  bn: "দুর্বল দিকের দেয়াল (অনুমান, প্রাথমিক): প্রতি দিকে একটি আরসিসি দেয়াল, লিফট কোর থেকে সবচেয়ে দূরের প্লটের কিনারায়, পুরো গভীরতা (x) বা প্রস্থ (y) বরাবর। এটি এখনো নকশায় দেখানো হয়নি; স্থপতির সম্মতি লাগবে।",
}; 

export const CORE_ASSUMPTIONS = [
  {
    id: "core-wall",
    en: "Core: the lift shaft is the only shear wall (200 mm reinforced concrete box, one door in one web per shaft, cracked 0.35 Ig). Frame and core share the lateral force by stiffness (Table 6.2.19 note 2, R 7, Cd 5.5) and the frame is designed for at least 25 % of it. Boundary elements are checked (Sec 8.3.6.6 stress screen and Eq 6.8.10); coupling beams over the doors are designed separately; the core footing or raft and the pile or soil check under the core are not designed.",
    bn: "কোর: লিফট শ্যাফটই একমাত্র শিয়ার ওয়াল (২০০ মিমি আরসিসি বাক্স, প্রতি শ্যাফটে এক ওয়েবে একটি দরজা, ফাটা 0.35 Ig)। ফ্রেম ও কোর দৃঢ়তা অনুপাতে পার্শ্বভার ভাগ করে (সারণি ৬.২.১৯ নোট ২, R 7, Cd 5.5) এবং ফ্রেম অন্তত ২৫ % ধরে নকশা হয়। বাউন্ডারি এলিমেন্ট (ধারা ৮.৩.৬.৬) চাপ পরীক্ষা ও সমীকরণ ৬.৮.১০ দিয়ে যাচাই করা হয়; দরজার ওপরের কাপলিং বিম আলাদাভাবে নকশা করা হয়; কোরের ফুটিং/র‍্যাফট ও মাটি বা পাইল পরীক্ষা নকশা করা হয়নি।",
  },
] as const;
