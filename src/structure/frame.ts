/**
 * Frame analysis on top of the slab and beam results: column load takedown from the beam reactions, live-load
 * reduction (Sec 2.3.13, K_LL 4), lateral stiffness by the D-method with cracked sections (0.70 Ig columns, 0.35 Ig
 * beams, Sec 6.3.10.4.1), equivalent static seismic forces (Sec 2.5.7), column design with moment magnification,
 * and pad footings. Everything is iterated until the column sections stop growing. Screening, not final design.
 *
 * Assumptions beyond the gazette are listed in materials.ts ASSUMPTIONS and in the pack gaps: gravity column moments by
 * one cycle of moment distribution on the fixed-end moments, inflection at mid-height (0.65 h at the base),
 * 30 % of the orthogonal seismic moment, soil bearing as a site input.
 */

import type { BuildingModel } from "../model/building";
import { columnPack, structurePack, type OccupancyGroup, type SiteClass } from "../rules/bnbcStructure";
import type { LevelResult, MemberFailure } from "./analyze";
import type { BeamSpanResult } from "./beam";
import { analyseSpans } from "./continuousBeam";
import { COLUMN_STOCK, checkColumn, D_PRIME_MM, interaction, lightestSteel, RHO_STEPS, type CaseResult, type ColSection, type ColumnCase, type Interaction } from "./column";
import { beamMn, columnMnAt, PROBABLE_FY_FACTOR, strongColumnCheck } from "./capacity";
import { ldCompression } from "./anchorage";
import { pickBeamBars, pickColumnBars } from "./barSelect";
import { designFooting, type ColumnPosition, type FootingResult } from "./footing";
import { factoredLoad, liveReductionFactor } from "./loads";
import { DESIGN, ecMPa, MATERIALS, UNIT_WEIGHTS } from "./materials";
import { tBeamInertia } from "./tbeam";
import { windBaseShearKn } from "./wind";
import { analyseSeismic, DHAKA_Z, liveWeightFraction, systemById, type SeismicResult } from "./seismic";
import { checkCore, coreSection, designCouplingBeam, dualLateral, wallProps, type CoreCheck, type CoreSection, type CouplingBeam, type DualResult } from "./core";

export interface FrameOptions {
  siteClass?: SiteClass;
  group?: OccupancyGroup;
  systemId?: string;
  /** Allowable soil bearing pressure, kPa. */
  allowableBearingKpa?: number;
  z?: number;
}

export const FRAME_DEFAULTS = { siteClass: "SD" as SiteClass, group: "I_II" as OccupancyGroup, systemId: "special-rc-mrf", allowableBearingKpa: 150, z: DHAKA_Z };

export interface ColumnStoreyResult {
  storey: number;
  section: ColSection;
  rho: number;
  astMm2: number;
  /** Service loads at the base of the column, kN: dead (with column weights above), reduced live, roof live. */
  deadKn: number;
  liveKn: number;
  roofLiveKn: number;
  liveFactor: number;
  tributaryM2: number;
  /** Largest gravity factored axial load, kN, and the seismic compression and tension cases. */
  puKn: number;
  luMm: number;
  cases: CaseResult[];
  util: number;
  governs: string;
}

export interface ColumnResult {
  id: string;
  ix: number;
  iy: number;
  xMm: number;
  yMm: number;
  position: ColumnPosition;
  storeys: ColumnStoreyResult[];
  footing: FootingResult;
  util: number;
}

export interface FrameResult {
  columns: ColumnResult[];
  seismicX: SeismicResult;
  seismicY: SeismicResult;
  options: Required<FrameOptions>;
  failures: MemberFailure[];
  util: number;
  /** True when the sizing loop stopped because sections stopped changing (false: iteration cap reached). */
  converged: boolean;
  iterations: number;
  /** The lift-core shear wall of a dual system, with its base shear and moment checks; null for a frame-only system. */
  core: CoreResult | null;
  /** Eq 6.8.5 checks at the joints where Sec 8.3.5.2 applies and beams frame in that direction. */
  strongColumn: StrongColumnJoint[];
  /** Joint shear checks (Sec 8.3.7.3) at each beam joint and direction. */
  jointShear: JointShearCheck[];
  /** Plan extents used for the wind load, mm. */
  windPlanMm: { x: number; y: number };
  /** Torsion per storey and loading direction: edge-to-average drift ratio with the accidental eccentricity, and the amplification Ax. */
  torsion: TorsionResult[];
}

export interface TorsionResult {
  storey: number;
  axis: "x" | "y";
  /** Maximum to average drift ratio including the 5 % accidental eccentricity (above 1.2 is torsional irregularity, above 1.4 extreme). */
  ratio: number;
  ax: number;
  irregular: boolean;
  extreme: boolean;
}

export interface JointShearCheck {
  level: number;
  columnId: string;
  dir: "x" | "y";
  /** Confinement factor gamma (1.7, 1.2 or 1.0, times sqrt(fc') in MPa). */
  gamma: number;
  vuKn: number;
  phiVnKn: number;
  util: number;
  ok: boolean;
}

export interface StrongColumnJoint {
  /** Beam level (joint at the top of storey `level`). */
  level: number;
  columnId: string;
  /** Direction of the beams framing in: x beams need column moments about the y axis, and the reverse for y. */
  dir: "x" | "y";
  /** Sum of nominal column moments (kN.m) and sum of nominal beam moments (kN.m) at the joint. */
  sumMncKnM: number;
  sumMnbKnM: number;
  /** Sum Mnc / sum Mnb; the check passes at 1.2 or more. */
  ratio: number;
  ok: boolean;
}

export interface CoreResult {
  section: CoreSection;
  x: CoreCheck;
  y: CoreCheck;
  dualX: DualResult;
  dualY: DualResult;
  /** Share of the base shear carried by the walls, per direction (0..1). */
  wallShareX: number;
  wallShareY: number;
  /** The lintel over each lift door (loading along x, where the door webs act); design shear assumed from the wall shear. */
  coupling: CouplingBeam | null;
}

interface Joint {
  dead: number;
  liveTable: number;
  livePart: number;
  area: number;
  kbX: number;
  kbY: number;
  munbX: number;
  munbY: number;
  hX: number;
  hY: number;
  /** Sum of nominal beam top-steel moments at the joint, kN.m, per direction (eq 6.8.5 beam side). */
  mnbX: number;
  mnbY: number;
  /** Beam ends framing into the joint in each direction, for the joint shear check (Sec 8.3.7.3). */
  endsX: JointEnd[];
  endsY: JointEnd[];
}

interface JointEnd {
  /** Beam width, mm. */
  w: number;
  /** Top bar area at this end and bottom bar area of the same beam, mm2. */
  asTop: number;
  asBot: number;
}

const MAX_ITERATIONS = 30;
/** Dual systems: the moment frames resist at least this share of the prescribed force (Table 6.2.19, group D heading). */
export const FRAME_MIN_SHARE = 0.25;
/** Buildings taller than this many storeys default to the dual system (special RC moment frames with special RC shear walls, Table 6.2.19 D.3). */
export const DUAL_ABOVE_STOREYS = 7;
const emptyJoint = (): Joint => ({ dead: 0, liveTable: 0, livePart: 0, area: 0, kbX: 0, kbY: 0, munbX: 0, munbY: 0, hX: 0, hY: 0, mnbX: 0, mnbY: 0, endsX: [], endsY: [] });
const key = (x: number, y: number) => `${x},${y}`;
const areaOf = (s: ColSection) => s.bx * s.by;

/** Smallest stock section that is stiffer than `sec` in every direction that needs it (I = b h3 / 12 about the bending plane). */
function stiffer(sec: ColSection, needX: boolean, needY: boolean): ColSection {
  const ix = (s: ColSection) => (s.by * s.bx ** 3) / 12;
  const iy = (s: ColSection) => (s.bx * s.by ** 3) / 12;
  return COLUMN_STOCK.find((s) => (!needX || ix(s) > ix(sec)) && (!needY || iy(s) > iy(sec))) ?? sec;
}

export function analyzeFrame(model: BuildingModel, levels: LevelResult[], opts: FrameOptions = {}): FrameResult {
  const n = model.storeys.length;
  // above DUAL_ABOVE_STOREYS the default seismic system is the dual one (frame plus lift-core shear wall); the caller may still choose
  const o = { ...FRAME_DEFAULTS, systemId: n > DUAL_ABOVE_STOREYS ? "dual-special-rc-walls" : FRAME_DEFAULTS.systemId, ...opts } as Required<FrameOptions>;
  const hMm = model.input.floorToFloorMm;
  const hM = hMm / 1000;
  const ec = ecMPa(MATERIALS.fcMPa);
  const isDual = o.systemId.startsWith("dual");
  const core = isDual ? coreSection(model) : null;
  const f = model.storeys[0].geometry.fitted;
  const gamma = UNIT_WEIGHTS.frameConcrete;
  const kllCol = structurePack().liveLoadReduction.kll.interiorColumns;

  // ---- columns and joints ------------------------------------------------------------------------------------
  const cols = model.storeys[0].geometry.columns.map((c) => {
    const ix = f.structuralX.indexOf(c.gridX);
    const iy = f.structuralY.indexOf(c.gridY);
    const ends = (ix === 0 || ix === f.structuralX.length - 1 ? 1 : 0) + (iy === 0 || iy === f.structuralY.length - 1 ? 1 : 0);
    const position: ColumnPosition = ends === 2 ? "corner" : ends === 1 ? "edge" : "interior";
    return { id: `C${ix + 1}-${iy + 1}`, ix, iy, x: c.x, y: c.y, position, key: key(c.x, c.y) };
  });

  const joints: Array<Map<string, Joint>> = levels.map((lv) => {
    const m = new Map<string, Joint>();
    const at = (x: number, y: number) => {
      const k = key(x, y);
      let j = m.get(k);
      if (!j) m.set(k, (j = emptyJoint()));
      return j;
    };
    for (const p of lv.panels) for (const [x, y] of [[p.x0, p.y0], [p.x1, p.y0], [p.x0, p.y1], [p.x1, p.y1]]) at(x, y).area += ((p.x1 - p.x0) * (p.y1 - p.y0)) / 4e6;
    for (const line of lv.beamLines) {
      const sp = line.result.spans;
      const sec = line.result.section;
      // T-beam: the slab flange stiffens the beam; an edge line has a flange on one side only
      const lineEdge = line.orientation === "v" ? line.at === f.xLines[f.structuralX[0]] || line.at === f.xLines[f.structuralX[f.structuralX.length - 1]] : line.at === f.yLines[f.structuralY[0]] || line.at === f.yLines[f.structuralY[f.structuralY.length - 1]];
      const ib = tBeamInertia(sec.bMm, sec.hMm, lv.slabThicknessMm, lineEdge ? 1 : 2);
      const lens = sp.map((s) => s.lengthMm / 1000);
      const dead = analyseSpans(sp.map((s, i) => ({ lengthM: lens[i], w: s.dKnM })));
      const table = analyseSpans(sp.map((s, i) => ({ lengthM: lens[i], w: s.lTableKnM })));
      const part = analyseSpans(sp.map((s, i) => ({ lengthM: lens[i], w: s.lPartitionKnM })));
      const horizontal = line.orientation === "h";
      for (let j = 0; j < line.stations.length; j++) {
        const jt = horizontal ? at(line.stations[j], line.at) : at(line.at, line.stations[j]);
        const left = j > 0 ? j - 1 : -1;
        const right = j < sp.length ? j : -1;
        if (left >= 0) { jt.dead += dead[left].vRight; jt.liveTable += table[left].vRight; jt.livePart += part[left].vRight; }
        if (right >= 0) { jt.dead += dead[right].vLeft; jt.liveTable += table[right].vLeft; jt.livePart += part[right].vLeft; }
        // beam stiffness at the joint, cracked 0.35 Ig; fixed-end moments for the gravity unbalanced moment
        let kb = 0;
        for (const idx of [left, right]) if (idx >= 0) kb += (columnPack().stiffness.beamIg * ec * ib) / sp[idx].lengthMm;
        const fem = (idx: number, withLive: boolean) => {
          if (idx < 0) return 0;
          const w = 1.2 * sp[idx].dKnM + (withLive ? 1.6 * sp[idx].lKnM : 0);
          return (w * lens[idx] ** 2) / 12;
        };
        const munb =
          left >= 0 && right >= 0
            ? Math.max(Math.abs(fem(left, true) - fem(right, false)), Math.abs(fem(left, false) - fem(right, true)))
            : fem(left >= 0 ? left : right, true);
        // eq 6.8.5 beam side: nominal top-steel moments of the beam ends at this joint (fy, phi 1.0)
        const topMn = (side: { asReqMm2: number }) => beamMn(pickBeamBars(side.asReqMm2, sec.bMm).areaMm2, sec.bMm, line.result.dMm);
        const mnb = (left >= 0 ? topMn(sp[left].negRight) : 0) + (right >= 0 ? topMn(sp[right].negLeft) : 0);
        if (horizontal) jt.mnbX += mnb; else jt.mnbY += mnb;
        const ends = horizontal ? jt.endsX : jt.endsY;
        const endOf = (side: { asReqMm2: number }, span: BeamSpanResult) => ({ w: sec.bMm, asTop: pickBeamBars(side.asReqMm2, sec.bMm).areaMm2, asBot: span.pos.asReqMm2 });
        if (left >= 0) ends.push(endOf(sp[left].negRight, sp[left]));
        if (right >= 0) ends.push(endOf(sp[right].negLeft, sp[right]));
        if (horizontal) { jt.kbX += kb; jt.munbX = Math.max(jt.munbX, munb); jt.hX = Math.max(jt.hX, sec.hMm); }
        else { jt.kbY += kb; jt.munbY = Math.max(jt.munbY, munb); jt.hY = Math.max(jt.hY, sec.hMm); }
      }
    }
    return m;
  });
  const jointOf = (k: number, ck: string): Joint => joints[k].get(ck) ?? emptyJoint();

  // ---- eq 6.8.5 helpers (Sec 8.3.5.2) -------------------------------------------------------------------------------
  // Nominal column moment about the x and y axes at the factored axial case that gives the lowest strength (nominal P = Pu / phi,
  // tension cases at Pu). Bending about x uses the x dimension as depth.
  const itCache = new Map<string, Interaction>();
  const lowestMnc = (sec: ColSection, rho: number, cases: Array<{ puKn: number }>): { x: number; y: number } => {
    const phi = columnPack().phi.compressionControlledTied;
    const lowest = (depth: number, width: number) => {
      const key = `${depth}|${width}|${rho}`;
      let it = itCache.get(key);
      if (!it) { it = interaction(depth, width, rho, MATERIALS.fcMPa, MATERIALS.fyMPa, D_PRIME_MM); itCache.set(key, it); }
      return Math.min(...cases.map((c) => columnMnAt(it!, c.puKn > 0 ? c.puKn / phi : c.puKn)));
    };
    return { x: lowest(sec.bx, sec.by), y: lowest(sec.by, sec.bx) };
  };
  /**
   * Joint shear, Sec 8.3.7.3: Vn <= gamma sqrt(fc') Aj with gamma from the joint confinement (1.7 four faces, 1.2 three faces or two
   * opposite faces, 1.0 others). Vu is the probable beam end force: 1.25 fy in the top bars of one beam end plus the bottom bars of
   * the beam end on the opposite face (a single beam end gives its tension alone); column shear taken as zero (conservative).
   * Aj = bj hc with bj = min(bc, bb + hc) (assumption: common simplified form). The joint core takes the column below the joint
   * (storey k): sizing then grows that column until its joint passes, top down, without a feedback loop. A member covers a face
   * when it spans at least three-quarters of the column face. The check is against phi Vn with DESIGN.phiShear.
   */
  const jointShearAt = (k: number, jt: Joint, below: ColSection, colId: string): JointShearCheck[] => {
    const faceX = below.by; // face perpendicular to x beams
    const faceY = below.bx; // face perpendicular to y beams
    const covered = (ends: JointEnd[], face: number) => ends.filter((e) => e.w >= 0.75 * face).length;
    const fx = covered(jt.endsX, faceX);
    const fy = covered(jt.endsY, faceY);
    const total = fx + fy;
    const gamma = total >= 4 ? 1.7 : total === 3 || (total === 2 && (fx === 2 || fy === 2)) ? 1.2 : 1.0;
    const fyProbable = PROBABLE_FY_FACTOR * MATERIALS.fyMPa;
    const out: JointShearCheck[] = [];
    for (const dir of ["x", "y"] as const) {
      const ends = dir === "x" ? jt.endsX : jt.endsY;
      if (ends.length === 0) continue;
      let vuKn = 0;
      for (let a = 0; a < ends.length; a++)
        for (let b = 0; b < ends.length; b++) {
          if (a === b && ends.length > 1) continue;
          vuKn = Math.max(vuKn, (fyProbable * (ends[a].asTop + (ends.length > 1 ? ends[b].asBot : 0))) / 1000);
        }
      const hc = dir === "x" ? below.bx : below.by;
      const bc = dir === "x" ? faceX : faceY;
      const bb = Math.max(...ends.map((e) => e.w));
      const aj = Math.min(bc, bb + hc) * hc;
      const phiVnKn = (DESIGN.phiShear * gamma * Math.sqrt(MATERIALS.fcMPa) * aj) / 1000;
      const util = phiVnKn > 0 ? vuKn / phiVnKn : Infinity;
      out.push({ level: k, columnId: colId, dir, gamma, vuKn, phiVnKn, util, ok: util <= 1 });
    }
    return out;
  };
  /** Sizing gate: the joint at level i passes Sec 8.3.7.3 with the candidate column below it and the storey above as chosen. */
  const jointHoldsAt = (i: number, ci: number, s: ColSection): boolean => {
    const jt = joints[i].get(cols[ci].key);
    if (!jt) return true;
    return jointShearAt(i, jt, s, cols[ci].id).every((c) => c.ok);
  };
  /** Sec 8.3.5.2 applies to a joint where a framing column has Pu above 0.1 Ag fc'. */
  const eqAppliesAt = (sec: ColSection, pu: number): boolean => pu > (0.1 * sec.bx * sec.by * MATERIALS.fcMPa) / 1000;
  /**
   * Eq 6.8.5 at beam level i for a candidate column (section s, steel rho, cases) below it, against the storey above at its
   * current size. True when the joint passes or does not apply. Used while sizing so that columns grow to meet it.
   */
  const scwbHolds = (i: number, ci: number, s: ColSection, rho: number, cases: ColumnCase[], pu: number): boolean => {
    const jt = joints[i].get(cols[ci].key);
    if (!jt) return true;
    const framing = [{ sec: s, rho, cases, pu }];
    if (i + 1 < n) {
      const up = casesFor(i + 1, ci, sections[i + 1][ci]);
      framing.push({ sec: sections[i + 1][ci], rho: rhos[i + 1][ci], cases: up.cases, pu: up.pu });
    }
    if (!framing.some((f) => eqAppliesAt(f.sec, f.pu))) return true;
    for (const dir of ["x", "y"] as const) {
      const sumMnb = dir === "x" ? jt.mnbX : jt.mnbY;
      if (sumMnb <= 0) continue;
      const sumMnc = framing.reduce((a, f) => a + lowestMnc(f.sec, f.rho, f.cases)[dir], 0);
      if (!strongColumnCheck(sumMnc, sumMnb).ok) return false;
    }
    return true;
  };

  // ---- seismic level weights that do not depend on the columns ---------------------------------------------------
  const beamWeight = levels.map((lv, k) => {
    let dead = 0;
    let live = 0;
    for (const line of lv.beamLines)
      for (const s of line.result.spans) {
        dead += (s.dKnM + s.lPartitionKnM) * (s.lengthMm / 1000);
        live += k === n - 1 ? 0 : s.lTableKnM * (s.lengthMm / 1000);
      }
    return dead + live * liveWeightFraction(2);
  });

  // ---- sizing loop ---------------------------------------------------------------------------------------------
  const sections: ColSection[][] = Array.from({ length: n }, () => cols.map(() => ({ ...COLUMN_STOCK[1] })));
  const rhos: number[][] = Array.from({ length: n }, () => cols.map(() => RHO_STEPS[0]));
  // stiffness floors set by drift bumps, so the gravity sizing cannot flip a column back to a weaker orientation
  const floorIx: number[][] = Array.from({ length: n }, () => cols.map(() => 0));
  const floorIy: number[][] = Array.from({ length: n }, () => cols.map(() => 0));
  const inertiaX = (s: ColSection) => (s.by * s.bx ** 3) / 12;
  const inertiaY = (s: ColSection) => (s.bx * s.by ** 3) / 12;
  let converged = false;
  let iterations = 0;
  // plan extents for wind: the slab panels of the lowest floor (the building envelope the wind meets)
  const px = levels[0].panels.flatMap((p) => [p.x0, p.x1]);
  const py = levels[0].panels.flatMap((p) => [p.y0, p.y1]);
  const windPlanMm = { x: Math.max(...px) - Math.min(...px), y: Math.max(...py) - Math.min(...py) };
  // centre of mass taken at the plan centre (uniform floor weight); accidental eccentricity 5 % of the plan dimension (Sec 2.5.7 style)
  const massCentre = { x: (Math.max(...px) + Math.min(...px)) / 2, y: (Math.max(...py) + Math.min(...py)) / 2 };
  let ctx = context();

  function context() {
    // takedown per storey and column
    const take = cols.map((c, ci) => {
      let dead = 0, lt = 0, lp = 0, at = 0;
      let lr = 0;
      const out = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        const jt = jointOf(i, c.key);
        const sec = sections[i][ci];
        dead += jt.dead + (gamma * sec.bx * sec.by * hMm) / 1e9;
        if (i === n - 1) lr = jt.liveTable;
        else { lt += jt.liveTable; lp += jt.livePart; at += jt.area; }
        out[i] = { dead, lt, lp, at, lr };
      }
      return out as Array<{ dead: number; lt: number; lp: number; at: number; lr: number }>;
    });
    const live = (ci: number, i: number) => {
      const t = take[ci][i];
      const floors = n - 1 - i;
      const fct = floors > 0 ? liveReductionFactor(2, t.at, kllCol, floors) : 1;
      return { l: t.lt * fct + t.lp, factor: fct };
    };
    // column stiffness (EI / h, cracked) per axis
    const kc = (i: number, ci: number, axis: "x" | "y") => {
      const s = sections[i][ci];
      const ig = axis === "x" ? (s.by * s.bx ** 3) / 12 : (s.bx * s.by ** 3) / 12;
      return (columnPack().stiffness.columnIg * ec * ig) / hMm;
    };
    // storey stiffness by the D-method and sway effective-length factors
    const kSway = cols.map(() => Array.from({ length: n }, () => ({ x: 1, y: 1 })));
    const dMethod = (axis: "x" | "y") => {
      const out: number[] = [];
      const dcol: number[][] = [];
      for (let i = 0; i < n; i++) {
        const row: number[] = [];
        cols.forEach((c, ci) => {
          const kcol = kc(i, ci, axis);
          const top = jointOf(i, c.key);
          const bottom = i > 0 ? jointOf(i - 1, c.key) : null;
          const kbTop = axis === "x" ? top.kbX : top.kbY;
          const kbBot = bottom ? (axis === "x" ? bottom.kbX : bottom.kbY) : 0;
          // kb above are 0.35 Ec Ib / L; kcol is 0.70 Ec Ig / h
          let a: number;
          if (i === 0) {
            const kbar = kbTop / kcol;
            a = (0.5 + kbar) / (2 + kbar);
          } else {
            const kbar = (kbTop + kbBot) / (2 * kcol);
            a = Math.max(kbar / (2 + kbar), 0.02);
          }
          row.push((a * 12 * kcol) / (hMm * hMm) / 1000); // D = a 12 EI / h3 = a 12 (EI/h) / h2, N/mm -> kN/mm
          // effective length factor, Jackson-Moreland (ACI commentary approximation for sway frames)
          const psi = (kbJ: number, colsAtJoint: number) => (kbJ <= 0 ? 10 : Math.min(colsAtJoint / kbJ, 10));
          const psiTop = psi(kbTop, kcol + (i + 1 < n ? kc(i + 1, ci, axis) : 0));
          const psiBot = i === 0 ? 1 : psi(kbBot, kcol + kc(i - 1, ci, axis));
          const pm = (psiTop + psiBot) / 2;
          const k = pm < 2 ? ((20 - pm) / 20) * Math.sqrt(1 + pm) : 0.9 * Math.sqrt(1 + pm);
          kSway[ci][i][axis] = Math.max(k, 1);
        });
        dcol.push(row);
        out.push(row.reduce((a, b) => a + b, 0));
      }
      return { storey: out, dcol };
    };
    const dx = dMethod("x");
    const dy = dMethod("y");

    // seismic weights
    const levelW = levels.map((_, k) => {
      let w = beamWeight[k];
      cols.forEach((_c, ci) => {
        const below = (gamma * areaOf(sections[k][ci]) * hMm) / 1e9;
        const above = k + 1 < n ? (gamma * areaOf(sections[k + 1][ci]) * hMm) / 1e9 : 0;
        w += below / 2 + above / 2;
      });
      return w;
    });
    if (core) levelW.forEach((_w, k) => { levelW[k] += (wallProps(core, "x").agMm2 * hMm * 24) / 1e9; });
    const base = { z: o.z, siteClass: o.siteClass, group: o.group, systemId: o.systemId, storeys: n, storeyHeightMm: hMm, levelWeightsKn: levelW };
    // wind along x meets the face whose width is the plan extent along y (Sec 2.4); the lateral design takes the larger of wind and seismic
    const windX = windBaseShearKn(windPlanMm.y, hMm, n);
    const windY = windBaseShearKn(windPlanMm.x, hMm, n);
    let seisX = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dx.storey, minBaseShearKn: windX });
    let seisY = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dy.storey, minBaseShearKn: windY });
    // dual system: the lateral force is shared with the core wall by stiffness; the forces do not depend on stiffness, the drift does
    let dualX: DualResult | null = null;
    let dualY: DualResult | null = null;
    if (core && isDual) {
      dualX = dualLateral({ forcesKn: seisX.forcesKn, hMm, frameKnPerMm: dx.storey, wall: wallProps(core, "x"), ecMPa: ec });
      dualY = dualLateral({ forcesKn: seisY.forcesKn, hMm, frameKnPerMm: dy.storey, wall: wallProps(core, "y"), ecMPa: ec });
      seisX = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dualX.effectiveKnPerMm, minBaseShearKn: windX });
      seisY = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dualY.effectiveKnPerMm, minBaseShearKn: windY });
    }
    return { take, live, kc, kSway, dx, dy, seisX, seisY, dualX, dualY };
  }

  /**
   * Torsion of storey i for lateral load along `axis`, from the column stiffnesses of the D-method (rigid diaphragm): the centre of
   * rigidity, the torsional stiffness J, the calculated eccentricity to the plan centre and the accidental eccentricity of 5 % of the plan
   * dimension. The edge-to-average drift ratio is 1 + e ymax sumD / J; above 1.2 the accidental torsion is amplified by (ratio / 1.2)^2
   * up to 3 (common practice, ASCE 7 12.8.4.3 style). `factor(ci)` is the multiplier on the direct shear of column ci, never below 1.
   */
  function torsionAt(i: number, axis: "x" | "y") {
    const d = axis === "x" ? ctx.dx : ctx.dy;
    const o2 = axis === "x" ? ctx.dy : ctx.dx;
    const arm = (c: { x: number; y: number }) => (axis === "x" ? c.y : c.x);
    const other = (c: { x: number; y: number }) => (axis === "x" ? c.x : c.y);
    const sumD = d.dcol[i].reduce((a, b) => a + b, 0) || 1;
    const sumO = o2.dcol[i].reduce((a, b) => a + b, 0) || 1;
    const cr = cols.reduce((a, c, ci) => a + d.dcol[i][ci] * arm(c), 0) / sumD;
    const crO = cols.reduce((a, c, ci) => a + o2.dcol[i][ci] * other(c), 0) / sumO;
    const j = cols.reduce((a, c, ci) => a + d.dcol[i][ci] * (arm(c) - cr) ** 2 + o2.dcol[i][ci] * (other(c) - crO) ** 2, 0) || 1;
    const planL = axis === "x" ? windPlanMm.y : windPlanMm.x;
    const eCalc = Math.abs((axis === "x" ? massCentre.y : massCentre.x) - cr);
    const eAcc = 0.05 * planL;
    const yMax = Math.max(...cols.map((c) => Math.abs(arm(c) - cr)), 1);
    const ratio = 1 + ((eCalc + eAcc) * yMax * sumD) / j;
    const ax = ratio > 1.2 ? Math.min((ratio / 1.2) ** 2, 3) : 1;
    return {
      ratio,
      ax,
      eCalcMm: eCalc,
      eAccMm: eAcc,
      factor: (ci: number) => 1 + ((eCalc + ax * eAcc) * Math.abs(arm(cols[ci]) - cr) * sumD) / j,
    };
  }

  /** Load cases of column ci in storey i for section `sec`, using the current context. */
  function casesFor(i: number, ci: number, sec: ColSection): { cases: ColumnCase[]; lu: number; pu: number } {
    const c = cols[ci];
    const t = ctx.take[ci][i];
    const { l } = ctx.live(ci, i);
    const dead = t.dead;
    const pu = factoredLoad(dead, l, t.lr).value;
    const betaDns = Math.min((1.2 * dead) / pu, 1);
    const top = jointOf(i, c.key);
    const lu = Math.max(hMm - Math.max(top.hX, top.hY, 400), 1000);
    // gravity moments: one cycle of distribution on the unbalanced fixed-end moment
    const kcX = (columnPack().stiffness.columnIg * ec * (sec.by * sec.bx ** 3)) / 12 / hMm;
    const kcY = (columnPack().stiffness.columnIg * ec * (sec.bx * sec.by ** 3)) / 12 / hMm;
    const kcAboveX = i + 1 < n ? ctx.kc(i + 1, ci, "x") : 0;
    const kcAboveY = i + 1 < n ? ctx.kc(i + 1, ci, "y") : 0;
    const mgX = (top.munbX * kcX) / (kcX + kcAboveX + top.kbX || 1);
    const mgY = (top.munbY * kcY) / (kcY + kcAboveY + top.kbY || 1);
    const g: ColumnCase = { id: "1.2D+1.6L", puKn: pu, betaDns, luMm: lu, k: 1, x: { m2ns: mgX, m2s: 0, deltaS: 1 }, y: { m2ns: mgY, m2s: 0, deltaS: 1 } };
    // seismic: shear share, overturning axial, sway magnifier
    const frameFraction = (seis: SeismicResult, dual: DualResult | null) => (dual ? Math.max(dual.frameShearKn[i] / seis.storeys[i].shearKn, FRAME_MIN_SHARE) : 1);
    const shear = (seis: SeismicResult, d: { storey: number[]; dcol: number[][] }, dual: DualResult | null, axis: "x" | "y") => {
      const share = d.dcol[i][ci] / d.storey[i];
      const vc = seis.storeys[i].shearKn * share * frameFraction(seis, dual) * torsionAt(i, axis).factor(ci);
      return vc * hM * (i === 0 ? 0.65 : 0.5);
    };
    const msX = shear(ctx.seisX, ctx.dx, ctx.dualX, "x");
    const msY = shear(ctx.seisY, ctx.dy, ctx.dualY, "y");
    const lever = (axis: "x" | "y", seis: SeismicResult, dual: DualResult | null) => {
      const coords = cols.map((q) => (axis === "x" ? q.x : q.y));
      const mean = coords.reduce((a, b) => a + b, 0) / coords.length;
      const sumSq = coords.reduce((a, b) => a + (b - mean) ** 2, 0) || 1;
      return (Math.abs((axis === "x" ? c.x : c.y) - mean) / sumSq) * seis.overturningKnM[i] * frameFraction(seis, dual);
    };
    const dnX = lever("x", ctx.seisX, ctx.dualX);
    const dnY = lever("y", ctx.seisY, ctx.dualY);
    const sumPu = cols.reduce((a, _q, qi) => a + 1.2 * ctx.take[qi][i].dead + ctx.live(qi, i).l, 0);
    const delta = (axis: "x" | "y") => {
      let sumPc = 0;
      cols.forEach((_q, qi) => {
        const s = qi === ci ? sec : sections[i][qi];
        const ig = axis === "x" ? (s.by * s.bx ** 3) / 12 : (s.bx * s.by ** 3) / 12;
        const ei = 0.4 * ec * ig;
        const k = ctx.kSway[qi][i][axis];
        sumPc += (Math.PI ** 2 * ei) / (k * lu) ** 2 / 1000;
      });
      const den = 1 - sumPu / (0.75 * sumPc);
      return den <= 0 ? Infinity : Math.max(1 / den, 1);
    };
    const dsX = delta("x");
    const dsY = delta("y");
    const kx = ctx.kSway[ci][i].x;
    const ky = ctx.kSway[ci][i].y;
    const p5 = 1.2 * dead + l;
    const mk = (id: string, p: number, dir: "x" | "y"): ColumnCase => ({
      id,
      puKn: p,
      betaDns,
      luMm: lu,
      k: kx,
      kY: ky,
      x: { m2ns: mgX, m2s: dir === "x" ? msX : 0.3 * msX, deltaS: dsX },
      y: { m2ns: mgY, m2s: dir === "y" ? msY : 0.3 * msY, deltaS: dsY },
    });
    const cases = [
      g,
      mk("1.2D+E+L (x)", p5 + dnX, "x"),
      mk("1.2D+E+L (y)", p5 + dnY, "y"),
      mk("0.9D+E (x)", 0.9 * dead - dnX, "x"),
      mk("0.9D+E (y)", 0.9 * dead - dnY, "y"),
    ];
    return { cases, lu, pu };
  }

  for (iterations = 1; iterations <= MAX_ITERATIONS; iterations++) {
    ctx = context();
    let changed = false;
    // storeys that fail drift or stability get stiffer columns
    for (let i = 0; i < n; i++) {
      const needX = ctx.seisX.storeys[i].util > 1 || ctx.seisX.storeys[i].thetaUtil > 1;
      const needY = ctx.seisY.storeys[i].util > 1 || ctx.seisY.storeys[i].thetaUtil > 1;
      if (needX || needY)
        cols.forEach((_c, ci) => {
          const nx = stiffer(sections[i][ci], needX, needY);
          if (nx !== sections[i][ci]) {
            sections[i][ci] = { ...nx };
            if (needX) floorIx[i][ci] = inertiaX(nx);
            if (needY) floorIy[i][ci] = inertiaY(nx);
            changed = true;
          }
        });
    }
    for (let i = n - 1; i >= 0; i--)
      cols.forEach((_c, ci) => {
        const floor = i + 1 < n ? areaOf(sections[i + 1][ci]) : 0;
        const start = Math.max(areaOf(sections[i][ci]), floor);
        let chosen: ColSection | null = null;
        let rho = RHO_STEPS[0];
        // keep the current section ahead of any equal-area twin so that a swapped pair cannot flip back and forth
        const curSec = sections[i][ci];
        const isCur = (s: ColSection) => s.bx === curSec.bx && s.by === curSec.by;
        for (const s of [...COLUMN_STOCK.filter(isCur), ...COLUMN_STOCK.filter((s) => !isCur(s))]) {
          if (areaOf(s) < start || inertiaX(s) < floorIx[i][ci] || inertiaY(s) < floorIy[i][ci]) continue;
          const { cases, pu } = casesFor(i, ci, s);
          const r = lightestSteel(s, cases);
          if (r && scwbHolds(i, ci, s, r.rho, cases, pu) && jointHoldsAt(i, ci, s)) { chosen = s; rho = r.rho; break; }
        }
        if (!chosen) {
          // nothing passes within 4 %: take the largest section at up to 6 % steel, reporting its (failing) utilisation
          const s = COLUMN_STOCK[COLUMN_STOCK.length - 1];
          const { cases } = casesFor(i, ci, s);
          chosen = s;
          rho = lightestSteel(s, cases, columnPack().steel.maxRatio)?.rho ?? columnPack().steel.maxRatio;
        }
        const cur = sections[i][ci];
        if (chosen.bx !== cur.bx || chosen.by !== cur.by) { sections[i][ci] = { ...chosen }; changed = true; }
        rhos[i][ci] = rho;
      });
    if (!changed) { converged = true; break; }
  }
  iterations = Math.min(iterations, MAX_ITERATIONS);
  ctx = context();

  // ---- results -----------------------------------------------------------------------------------------------
  const failures: MemberFailure[] = [];
  const columns: ColumnResult[] = cols.map((c, ci) => {
    const storeys: ColumnStoreyResult[] = [];
    for (let i = 0; i < n; i++) {
      const sec = sections[i][ci];
      const { cases, lu, pu } = casesFor(i, ci, sec);
      const chk = checkColumn(sec, rhos[i][ci], cases);
      const t = ctx.take[ci][i];
      const lv = ctx.live(ci, i);
      storeys.push({ storey: i, section: sec, rho: rhos[i][ci], astMm2: chk.astMm2, deadKn: t.dead, liveKn: lv.l, roofLiveKn: t.lr, liveFactor: lv.factor, tributaryM2: t.at, puKn: pu, luMm: lu, cases: chk.cases, util: chk.util, governs: chk.governs });
      if (chk.util > 1) failures.push({ level: i, member: "column", id: `${c.id}/S${i}`, util: chk.util, governs: chk.governs });
    }
    const g = storeys[0];
    const sub = casesFor(0, ci, sections[0][ci]).cases;
    const dnMax = Math.max(sub[1].puKn - (1.2 * g.deadKn + g.liveKn), sub[2].puKn - (1.2 * g.deadKn + g.liveKn));
    const footing = designFooting({
      serviceKn: g.deadKn + g.liveKn + g.roofLiveKn,
      serviceSeismicKn: g.deadKn + g.liveKn + dnMax,
      puKn: Math.max(g.puKn, sub[1].puKn, sub[2].puKn),
      colBxMm: sections[0][ci].bx,
      colByMm: sections[0][ci].by,
      position: c.position,
      allowableKpa: o.allowableBearingKpa,
      // base moments: the largest magnified design moment about each axis over the storey-0 cases (gravity and seismic)
      momentXKnM: Math.max(0, ...g.cases.map((k) => Math.abs(k.x.mDesignKnM))),
      momentYKnM: Math.max(0, ...g.cases.map((k) => Math.abs(k.y.mDesignKnM))),
      // starter bars of the ground column must be developed in the pad: ldc + 75 mm cover + two 16 mm mat layers
      minDepthMm: ldCompression(pickColumnBars(g.astMm2, sections[0][ci].bx, sections[0][ci].by).dia) + 75 + 32,
    });
    if (footing.util > 1) failures.push({ level: -1, member: "footing", id: `${c.id}/footing`, util: footing.util, governs: footing.governs });
    return { id: c.id, ix: c.ix, iy: c.iy, xMm: c.x, yMm: c.y, position: c.position, storeys, footing, util: Math.max(footing.util, ...storeys.map((s) => s.util)) };
  });
  const torsion: TorsionResult[] = [];
  for (let i = 0; i < n; i++)
    for (const axis of ["x", "y"] as const) {
      const tt = torsionAt(i, axis);
      torsion.push({ storey: i, axis, ratio: tt.ratio, ax: tt.ax, irregular: tt.ratio > 1.2, extreme: tt.ratio > 1.4 });
    }
  // ---- eq 6.8.5 strong column / weak beam at each beam level (Sec 8.3.5.2) ---------------------------------------
  // Columns framing into a joint: the storey below and the storey above. Each column's nominal moment about the axis of
  // the beams is taken at the factored axial case that gives its lowest strength (nominal P = Pu / phi).
  const strongColumn: StrongColumnJoint[] = [];
  for (let k = 0; k < n && k < levels.length; k++)
    columns.forEach((c, ci) => {
      const jt = joints[k].get(cols[ci].key);
      if (!jt) return;
      const framing = k + 1 < n ? [c.storeys[k], c.storeys[k + 1]] : [c.storeys[k]];
      const applies = framing.some((s) => eqAppliesAt(s.section, s.puKn));
      if (!applies) return;
      for (const dir of ["x", "y"] as const) {
        const sumMnb = dir === "x" ? jt.mnbX : jt.mnbY;
        if (sumMnb <= 0) continue;
        const sumMnc = framing.reduce((a, s) => a + lowestMnc(s.section, s.rho, s.cases)[dir], 0);
        const chk = strongColumnCheck(sumMnc, sumMnb);
        strongColumn.push({ level: k, columnId: c.id, dir, sumMncKnM: sumMnc, sumMnbKnM: sumMnb, ratio: chk.ratio, ok: chk.ok });
        if (!chk.ok) failures.push({ level: k, member: "column", id: `${c.id}/joint-L${k}-${dir}`, util: sumMnc > 0 ? (1.2 * sumMnb) / sumMnc : Infinity, governs: "strong column / weak beam, eq 6.8.5" });
      }
    });

  // ---- joint shear, Sec 8.3.7.3 (see jointShearAt) ----------------------------------------------------------------
  const jointShear: JointShearCheck[] = [];
  for (let k = 0; k < n && k < levels.length; k++)
    columns.forEach((c, ci) => {
      const jt = joints[k].get(cols[ci].key);
      if (!jt) return;
      for (const chk of jointShearAt(k, jt, c.storeys[k].section, c.id)) {
        jointShear.push(chk);
        if (!chk.ok) failures.push({ level: k, member: "column", id: `${c.id}/joint-shear-L${k}-${chk.dir}`, util: chk.util, governs: "joint shear, Sec 8.3.7.3" });
      }
    });

  for (const [dir, seis] of [["x", ctx.seisX], ["y", ctx.seisY]] as const)
    for (const s of seis.storeys) {
      if (s.util > 1) failures.push({ level: s.storey, member: "seismic", id: `drift-${dir}/S${s.storey}`, util: s.util, governs: "drift" });
      if (s.thetaUtil > 1) failures.push({ level: s.storey, member: "seismic", id: `stability-${dir}/S${s.storey}`, util: s.thetaUtil, governs: "stability" });
    }
  let coreResult: CoreResult | null = null;
  if (isDual && !core) failures.push({ level: -1, member: "core", id: "core-wall", util: Infinity, governs: "dual system needs a lift core and the plan has none" });
  if (core && ctx.dualX && ctx.dualY) {
    const sx = ctx.seisX.storeys[0].shearKn;
    const sy = ctx.seisY.storeys[0].shearKn;
    const x = checkCore(core, "x", ctx.dualX.wallShearKn[0], ctx.dualX.wallMomentKnM[0], core.heightMm);
    const y = checkCore(core, "y", ctx.dualY.wallShearKn[0], ctx.dualY.wallMomentKnM[0], core.heightMm);
    // coupling beam shear: the door web carries half of the wall shear and the shaft lintels share it equally (assumption)
    const coupling = designCouplingBeam(core, hMm, Math.abs(ctx.dualX.wallShearKn[0]) / (2 * Math.max(core.shafts, 1)));
    coreResult = { section: core, x, y, dualX: ctx.dualX, dualY: ctx.dualY, wallShareX: Math.abs(ctx.dualX.wallShearKn[0]) / sx, wallShareY: Math.abs(ctx.dualY.wallShearKn[0]) / sy, coupling };
    if (coupling && !coupling.fits) failures.push({ level: 0, member: "core", id: "coupling-beam", util: Infinity, governs: `coupling beam over the lift door: ${coupling.reason}` });
    for (const c of [x, y]) if (c.util > 1) failures.push({ level: 0, member: "core", id: `core-${c.dir}`, util: c.util, governs: c.governs });
  }
  if (!ctx.seisX.permitted) failures.push({ level: -1, member: "seismic", id: "seismic-system", util: Infinity, governs: "system not permitted" });
  failures.sort((a, b) => b.util - a.util);
  const util = Math.max(0, ...columns.map((c) => c.util), ctx.seisX.util, ctx.seisY.util, coreResult?.x.util ?? 0, coreResult?.y.util ?? 0);
  return { columns, seismicX: ctx.seisX, seismicY: ctx.seisY, options: o, failures, util, converged, iterations, core: coreResult, strongColumn, jointShear, windPlanMm, torsion };
}
