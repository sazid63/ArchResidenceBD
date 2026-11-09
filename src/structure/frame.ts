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
import { analyseSpans } from "./continuousBeam";
import { COLUMN_STOCK, checkColumn, lightestSteel, RHO_STEPS, type CaseResult, type ColSection, type ColumnCase } from "./column";
import { ldCompression } from "./anchorage";
import { pickColumnBars } from "./barSelect";
import { designFooting, type ColumnPosition, type FootingResult } from "./footing";
import { factoredLoad, liveReductionFactor } from "./loads";
import { ecMPa, MATERIALS, UNIT_WEIGHTS } from "./materials";
import { tBeamInertia } from "./tbeam";
import { analyseSeismic, DHAKA_Z, liveWeightFraction, type SeismicResult } from "./seismic";

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
}

const MAX_ITERATIONS = 30;
const emptyJoint = (): Joint => ({ dead: 0, liveTable: 0, livePart: 0, area: 0, kbX: 0, kbY: 0, munbX: 0, munbY: 0, hX: 0, hY: 0 });
const key = (x: number, y: number) => `${x},${y}`;
const areaOf = (s: ColSection) => s.bx * s.by;

/** Smallest stock section that is stiffer than `sec` in every direction that needs it (I = b h3 / 12 about the bending plane). */
function stiffer(sec: ColSection, needX: boolean, needY: boolean): ColSection {
  const ix = (s: ColSection) => (s.by * s.bx ** 3) / 12;
  const iy = (s: ColSection) => (s.bx * s.by ** 3) / 12;
  return COLUMN_STOCK.find((s) => (!needX || ix(s) > ix(sec)) && (!needY || iy(s) > iy(sec))) ?? sec;
}

export function analyzeFrame(model: BuildingModel, levels: LevelResult[], opts: FrameOptions = {}): FrameResult {
  const o = { ...FRAME_DEFAULTS, ...opts } as Required<FrameOptions>;
  const n = model.storeys.length;
  const hMm = model.input.floorToFloorMm;
  const hM = hMm / 1000;
  const ec = ecMPa(MATERIALS.fcMPa);
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
        if (horizontal) { jt.kbX += kb; jt.munbX = Math.max(jt.munbX, munb); jt.hX = Math.max(jt.hX, sec.hMm); }
        else { jt.kbY += kb; jt.munbY = Math.max(jt.munbY, munb); jt.hY = Math.max(jt.hY, sec.hMm); }
      }
    }
    return m;
  });
  const jointOf = (k: number, ck: string): Joint => joints[k].get(ck) ?? emptyJoint();

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
    const base = { z: o.z, siteClass: o.siteClass, group: o.group, systemId: o.systemId, storeys: n, storeyHeightMm: hMm, levelWeightsKn: levelW };
    const seisX = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dx.storey });
    const seisY = analyseSeismic({ ...base, storeyStiffnessKnPerMm: dy.storey });
    return { take, live, kc, kSway, dx, dy, seisX, seisY };
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
    const shear = (seis: SeismicResult, d: { storey: number[]; dcol: number[][] }) => {
      const share = d.dcol[i][ci] / d.storey[i];
      const vc = seis.storeys[i].shearKn * share;
      return vc * hM * (i === 0 ? 0.65 : 0.5);
    };
    const msX = shear(ctx.seisX, ctx.dx);
    const msY = shear(ctx.seisY, ctx.dy);
    const lever = (axis: "x" | "y", seis: SeismicResult) => {
      const coords = cols.map((q) => (axis === "x" ? q.x : q.y));
      const mean = coords.reduce((a, b) => a + b, 0) / coords.length;
      const sumSq = coords.reduce((a, b) => a + (b - mean) ** 2, 0) || 1;
      return (Math.abs((axis === "x" ? c.x : c.y) - mean) / sumSq) * seis.overturningKnM[i];
    };
    const dnX = lever("x", ctx.seisX);
    const dnY = lever("y", ctx.seisY);
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
        for (const s of COLUMN_STOCK) {
          if (areaOf(s) < start || inertiaX(s) < floorIx[i][ci] || inertiaY(s) < floorIy[i][ci]) continue;
          const { cases } = casesFor(i, ci, s);
          const r = lightestSteel(s, cases);
          if (r) { chosen = s; rho = r.rho; break; }
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
      // starter bars of the ground column must be developed in the pad: ldc + 75 mm cover + two 16 mm mat layers
      minDepthMm: ldCompression(pickColumnBars(g.astMm2, sections[0][ci].bx, sections[0][ci].by).dia) + 75 + 32,
    });
    if (footing.util > 1) failures.push({ level: -1, member: "footing", id: `${c.id}/footing`, util: footing.util, governs: footing.governs });
    return { id: c.id, ix: c.ix, iy: c.iy, xMm: c.x, yMm: c.y, position: c.position, storeys, footing, util: Math.max(footing.util, ...storeys.map((s) => s.util)) };
  });
  for (const [dir, seis] of [["x", ctx.seisX], ["y", ctx.seisY]] as const)
    for (const s of seis.storeys) {
      if (s.util > 1) failures.push({ level: s.storey, member: "seismic", id: `drift-${dir}/S${s.storey}`, util: s.util, governs: "drift" });
      if (s.thetaUtil > 1) failures.push({ level: s.storey, member: "seismic", id: `stability-${dir}/S${s.storey}`, util: s.thetaUtil, governs: "stability" });
    }
  if (!ctx.seisX.permitted) failures.push({ level: -1, member: "seismic", id: "seismic-system", util: Infinity, governs: "system not permitted" });
  failures.sort((a, b) => b.util - a.util);
  const util = Math.max(0, ...columns.map((c) => c.util), ctx.seisX.util, ctx.seisY.util);
  return { columns, seismicX: ctx.seisX, seismicY: ctx.seisY, options: o, failures, util, converged, iterations };
}
