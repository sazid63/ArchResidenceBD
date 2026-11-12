/**
 * Core shear wall (plan P2-2): the lift shaft as a hollow reinforced-concrete box that resists lateral load together with the frame
 * (dual system, BNBC 2020 Part 6 Table 6.2.19 D.3 "special reinforced concrete shear walls": R 7, Omega0 2.5, Cd 5.5, no height limit).
 * Note 2 of the table: both systems resist the total design force in proportion to their lateral stiffness, and the moment frames must
 * resist at least 25 % of the prescribed force (heading of group D).
 *
 * Screening model, not final design. Assumptions (also listed in CORE_ASSUMPTIONS): the lift shaft is the only wall (stair walls are
 * brick), 150 mm walls as in `LIFT_ASSUMPTIONS`, one door opening per shaft in one web, cracked stiffness 0.35 Ig (the beam value of
 * Sec 6.3.10.4.1 is used for the wall), flexural steel placed in the two flange walls with a lever arm of 0.8 of the shaft length,
 * boundary elements (Sec 8.3.6.6), the coupling beams over the doors, and the core footing or raft are NOT designed.
 */

import type { BuildingModel } from "../model/building";
import { liftCore, LIFT_ASSUMPTIONS } from "../model/lift";
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
}

/** The core the plan gives, or null when there is no lift cell. */
export function coreSection(model: BuildingModel): CoreSection | null {
  const lc = liftCore(model);
  if (!lc) return null;
  const c = lc.spec.cell;
  const t = LIFT_ASSUMPTIONS.shaftWallMm;
  return {
    lxMm: c.x1 - c.x0 + t,
    lyMm: c.y1 - c.y0 + t,
    tMm: t,
    shafts: lc.spec.liftsProvided,
    heightMm: lc.heightMm,
    doorWidthMm: LIFT_ASSUMPTIONS.doorMm[0],
    cxMm: (c.x0 + c.x1) / 2,
    cyMm: (c.y0 + c.y1) / 2,
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
  const ig = (fl * lw ** 3 - (fl - 2 * t) * (lw - 2 * t) ** 3) / 12;
  // each shaft has one door in a web wall; if that wall is a flange for this direction the webs stay whole
  const openings = dir === "x" ? core.shafts * core.doorWidthMm : 0;
  const acv = Math.max(2 * lw - openings, lw) * t;
  const ag = (2 * (lw + fl) - 4 * t + Math.max(0, core.shafts - 1) * Math.min(lw, fl)) * t;
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
  util: number;
  governs: string;
}

export const CORE_PHI_SHEAR = 0.75;
export const CORE_PHI_FLEXURE = 0.9;
const RHO_MIN = 0.0025;
const MAX_STEEL_RATIO = 0.04;

/** Design of the core for one direction from the wall's base shear (kN) and moment (kN.m). Strength-level seismic forces. */
export function checkCore(core: CoreSection, dir: "x" | "y", vuKn: number, muKnM: number, heightMm: number, fc = MATERIALS.fcMPa, fy = MATERIALS.fyMPa): CoreCheck {
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
  return {
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
    util,
    governs: flexureUtil >= shearUtil ? "flexure (boundary steel)" : "shear",
  };
}

export const CORE_ASSUMPTIONS = [
  {
    id: "core-wall",
    en: "Core: the lift shaft is the only shear wall (150 mm reinforced concrete box, one door in one web per shaft, cracked 0.35 Ig). Frame and core share the lateral force by stiffness (Table 6.2.19 note 2, R 7, Cd 5.5) and the frame is designed for at least 25 % of it. Boundary elements (Sec 8.3.6.6), coupling beams over the doors, the core footing or raft and the pile or soil check under the core are not designed.",
    bn: "কোর: লিফট শ্যাফটই একমাত্র শিয়ার ওয়াল (১৫০ মিমি আরসিসি বাক্স, প্রতি শ্যাফটে এক ওয়েবে একটি দরজা, ফাটা 0.35 Ig)। ফ্রেম ও কোর দৃঢ়তা অনুপাতে পার্শ্বভার ভাগ করে (সারণি ৬.২.১৯ নোট ২, R 7, Cd 5.5) এবং ফ্রেম অন্তত ২৫ % ধরে নকশা হয়। বাউন্ডারি এলিমেন্ট (ধারা ৮.৩.৬.৬), দরজার ওপরের কাপলিং বিম, কোরের ফুটিং/র‍্যাফট ও মাটি বা পাইল পরীক্ষা নকশা করা হয়নি।",
  },
] as const;
