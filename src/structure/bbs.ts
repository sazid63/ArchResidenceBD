/**
 * Reinforcement and the bar bending schedule (BBS) from the M4 member results. Every bar is a stock diameter
 * (8, 10, 12, 16, 20, 22, 25, 28, 32 mm) and no schedule row is longer than the 12 m stock length; development, hook,
 * bend and lap lengths come from Sec 8.1.2 and 8.2 (anchorage.ts functions over the pack). Each pick records the
 * moment, the lever arm of the bars as placed (two layers lower it) and the steel provided, so the capacity of the
 * detailed member can be checked independently; a member that cannot be detailed shows up in `issues`.
 *
 * Detailing is screening level: bottom bars run support to support without curtailment, extra top bars stop
 * 0.25 L + max(d, 12 db) from the support (the inflection point is assumed at 0.25 L), crossties and corner bars are
 * not scheduled, slab bars assume 250 mm beams, and bar lengths use cut lengths with bend deductions (shape codes
 * follow BS 8666 convention). Units: mm, mm2, kN.m, kg.
 */

import type { BuildingModel } from "../model/building";
import { slabOpeningAreaM2 } from "../model/openings";
import { bendDeduction, bendDiameter, hookTail, lapCompression, lapTension, ldCompression, ldHook, ldTension, tieHookTail } from "./anchorage";
import type { TorsionResult } from "./torsion";
import type { BeamLinePlaced, PanelResult, StructureResult } from "./analyze";
import { barArea, pickBeamBars, pickColumnBars, pickMatBars, unitWeightKgM, type BarPick, type SlabBarPick } from "./barSelect";
import { planStair, DEFAULT_STAIR } from "../cad/stairBuilder";
import { PAD_TOP_BELOW_FINISH_MM, PLINTH_BEAM_DEPTH_MM, PLINTH_BEAM_WIDTH_MM } from "./foundation";
import { DESIGN } from "./materials";
import { LIFT_ASSUMPTIONS, liftCore } from "../model/lift";
import { beamMinAs, flexure, slabMinAs } from "./section";

export type ShapeCode = "00" | "11" | "21" | "51";
export type BbsFamily = "beam" | "column" | "slab" | "footing" | "core";

/** The longest bar a supplier delivers; rows are cut to fit (BD stock bars are 40 ft = 12.2 m). */
export const STOCK_LENGTH_MM = 12000;

export interface Bilingual {
  en: string;
  bn: string;
}

export interface BbsRow {
  mark: string;
  family: BbsFamily;
  description: Bilingual;
  diaMm: number;
  shape: ShapeCode;
  /** Outside dimensions A, B, C of the shape, mm (one entry for a straight bar). */
  dimsMm: number[];
  cutLengthMm: number;
  barsPerMember: number;
  members: number;
  /** Levels (slab above storey) or storeys the row appears in. */
  levels: number[];
  totalBars: number;
  totalLengthM: number;
  weightKg: number;
}

export interface PickCheck {
  family: BbsFamily;
  ref: string;
  requiredMm2: number;
  providedMm2: number;
  fits: boolean;
  level: number;
  /** For flexural picks: the factored moment, the width the steel acts over and the lever arm of the bars as placed. */
  muKnM?: number;
  widthMm?: number;
  dMm?: number;
}

export interface BbsIssue {
  ref: string;
  /** Why it happened, so the screen can group the repeats: a hook longer than its column, no stock bar that fits, or a footing too shallow for the starter bars. */
  cause: "hook" | "no_bars" | "embed";
  en: string;
  bn: string;
  /** fail: the steel cannot be fitted or anchored; warn: a reduction factor or a bigger member would cure it. */
  severity: "fail" | "warn";
  /** Levels or storeys where it occurs. */
  levels: number[];
}

export interface BbsResult {
  rows: BbsRow[];
  picks: PickCheck[];
  issues: BbsIssue[];
  totals: {
    byDia: Array<{ diaMm: number; lengthM: number; weightKg: number }>;
    byFamily: Array<{ family: BbsFamily; weightKg: number }>;
    weightKg: number;
    concreteM3: number;
    kgPerM3: number;
    /** Form contact areas by member family, m2 (simplified, see formworkM2). */
    formworkM2: { footing: number; column: number; beam: number; slab: number; core: number };
  };
}

const bi = (en: string, bn: string): Bilingual => ({ en, bn });
const COVER = DESIGN.coverBeamMm;
const SLAB_COVER = DESIGN.coverSlabMm;
const BEAM_W_FOR_SLAB = 250;
const HANGER_DIA = 12;

interface Spec {
  family: BbsFamily;
  description: Bilingual;
  dia: number;
  shape: ShapeCode;
  dims: number[];
  cut: number;
  bars: number;
  level: number;
}

class Builder {
  private map = new Map<string, Omit<BbsRow, "mark">>();
  picks: PickCheck[] = [];
  issues: BbsIssue[] = [];

  issue(i: Omit<BbsIssue, "levels">, level: number): void {
    const hit = this.issues.find((x) => x.en === i.en);
    if (hit) {
      if (!hit.levels.includes(level)) hit.levels.push(level);
    } else this.issues.push({ ...i, levels: [level] });
  }

  add(s: Spec): void {
    if (s.bars <= 0) return;
    const cut = Math.round(s.cut);
    const key = [s.family, s.description.en, s.dia, s.shape, s.dims.map(Math.round).join("x"), cut, s.bars].join("|");
    const hit = this.map.get(key);
    if (hit) {
      hit.members += 1;
      if (!hit.levels.includes(s.level)) hit.levels.push(s.level);
    } else
      this.map.set(key, { family: s.family, description: s.description, diaMm: s.dia, shape: s.shape, dimsMm: s.dims.map(Math.round), cutLengthMm: cut, barsPerMember: s.bars, members: 1, levels: [s.level], totalBars: 0, totalLengthM: 0, weightKg: 0 });
  }

  pick(c: PickCheck): void {
    this.picks.push(c);
    if (!c.fits) this.issue({ ref: c.ref, cause: "no_bars", severity: "fail", en: `${c.ref}: no stock bars fit the ${Number.isFinite(c.requiredMm2) ? c.requiredMm2.toFixed(0) : "required"} mm2 required; enlarge the member.`, bn: `${c.ref}: প্রয়োজনীয় রড বসে না; সদস্য বড় করুন।` }, c.level);
  }

  rows(): BbsRow[] {
    const letter: Record<BbsFamily, string> = { beam: "B", column: "C", slab: "S", footing: "F", core: "L" };
    const seq: Record<BbsFamily, number> = { beam: 0, column: 0, slab: 0, footing: 0, core: 0 };
    const order: BbsFamily[] = ["footing", "column", "beam", "slab", "core"];
    const all = [...this.map.values()].sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family) || Math.min(...a.levels) - Math.min(...b.levels));
    return all.map((r) => {
      seq[r.family] += 1;
      const totalBars = r.barsPerMember * r.members;
      const totalLengthM = (totalBars * r.cutLengthMm) / 1000;
      return { ...r, mark: `${letter[r.family]}${String(seq[r.family]).padStart(2, "0")}`, levels: [...r.levels].sort((x, y) => x - y), totalBars, totalLengthM, weightKg: totalLengthM * unitWeightKgM(r.diaMm) };
    });
  }
}

/** Cut length of a bar with straight outside dimensions and `bends` of given deflection angles. */
function cutLength(dims: number[], dia: number, bends: Array<{ deg: number; bendDia: number }>): number {
  return dims.reduce((a, b) => a + b, 0) - bends.reduce((a, b) => a + bendDeduction(dia, b.bendDia, b.deg), 0);
}

/** Lever arm of beam bars of `dia` in `layers` layers: one layer sits at cover + link + dia/2; the centroid of two layers is half a bar-plus-spacing step lower. */
function beamD(hMm: number, dia: number, layers: number): number {
  return hMm - COVER - DESIGN.stirrupMm - dia / 2 - (layers === 2 ? (dia + Math.max(25, dia)) / 2 : 0);
}

/** Beam bars whose hook fits the column at an exterior end when any stock bar can; otherwise the unrestricted pick (a warning follows). */
function pickWithHook(asReq: number, width: number, colAvail: number[], opts: Parameters<typeof pickBeamBars>[2] = {}): BarPick {
  const all = opts.dias ?? [12, 16, 20, 22, 25, 28, 32];
  const room = Math.min(...colAvail);
  const hookable = all.filter((d) => ldHook(d) <= room);
  if (hookable.length) {
    const p = pickBeamBars(asReq, width, { ...opts, dias: hookable });
    if (p.fits) return p;
  }
  return pickBeamBars(asReq, width, opts);
}

/** Slab or footing mat bars: the first stock diameter whose spacing works, with the lever arm of that very bar. */
function pickMat(mu: number, widthMm: number, hMm: number, coverMm: number, secondLayer: boolean, maxSpacingMm: number, dias: number[]): { pick: SlabBarPick; reqMm2: number; d: number } {
  let last: { pick: SlabBarPick; reqMm2: number; d: number } | null = null;
  for (const dia of dias) {
    const d = hMm - coverMm - dia / 2 - (secondLayer ? dia : 0);
    const req = flexure(mu, widthMm, d, slabMinAs(widthMm, hMm)).asReqMm2; // steel over `widthMm`
    const pick = pickMatBars((req / widthMm) * 1000, maxSpacingMm, [dia]);
    last = { pick, reqMm2: req, d };
    if (pick.fits) return last;
  }
  return last as { pick: SlabBarPick; reqMm2: number; d: number };
}

function detailBeams(res: StructureResult, colAt: (k: number, x: number, y: number) => { bx: number; by: number } | null, b: Builder): void {
  for (const lv of res.levels) {
    const k = lv.index;
    for (const line of lv.beamLines) {
      // Edge beam under a balcony strip: the torsion of cantilever.ts adds closed stirrups and side bars.
      const tors = lv.cantilevers.filter((c) => c.torsion?.needsDesign && line.orientation === "h" && Math.abs(c.y1 - line.at) <= 1);
      beamLine(line, k, colAt, b, tors.map((c) => ({ x0: c.x0, x1: c.x1, t: c.torsion! })));
    }
  }
}

function beamLine(line: BeamLinePlaced, k: number, colAt: (k: number, x: number, y: number) => { bx: number; by: number } | null, bld: Builder, torsion: Array<{ x0: number; x1: number; t: TorsionResult }> = []): void {
  const sec = line.result.section;
  const d = line.result.dMm;
  const spans = line.result.spans;
  const n = spans.length;
  const ref = `${line.orientation === "h" ? "y" : "x"} ${(line.at / 1000).toFixed(2)} m`;
  const depthAt = (j: number): number => {
    const x = line.orientation === "h" ? line.stations[j] : line.at;
    const y = line.orientation === "h" ? line.at : line.stations[j];
    const c = colAt(k, x, y);
    return c ? (line.orientation === "h" ? c.bx : c.by) : 300;
  };
  const exterior = (j: number) => j === 0 || j === n;
  const needAt = (mu: number, dia: number, layers: number) => flexure(mu, sec.bMm, beamD(sec.hMm, dia, layers), beamMinAs(sec.bMm, beamD(sec.hMm, dia, layers))).asReqMm2;

  // bottom bars, one group per span
  spans.forEach((sp, i) => {
    const cl = depthAt(i);
    const cr = depthAt(i + 1);
    const ln = sp.lengthMm - cl / 2 - cr / 2;
    const ends = [exterior(i) ? cl - COVER : Infinity, exterior(i + 1) ? cr - COVER : Infinity];
    const p = pickWithHook(sp.pos.asReqMm2, sec.bMm, ends, { minN: 2, asReqFor: (layers, dia) => needAt(sp.mPosKnM, dia, layers) });
    bld.pick({ family: "beam", ref: `B ${ref} span ${i + 1} bottom`, requiredMm2: needAt(sp.mPosKnM, p.dia, p.layers), providedMm2: p.areaMm2, fits: p.fits, level: k, muKnM: sp.mPosKnM, widthMm: sec.bMm, dMm: beamD(sec.hMm, p.dia, p.layers) });
    const ld = ldTension(p.dia);
    const embed = (j: number, col: number) => (exterior(j) ? col - COVER : Math.min(ld, col - COVER));
    const hooks = [exterior(i), exterior(i + 1)].filter(Boolean).length;
    const leg = hookTail(p.dia, "90");
    const straight = ln + embed(i, cl) + embed(i + 1, cr);
    const bend = { deg: 90, bendDia: bendDiameter(p.dia) };
    for (const [j, col] of [[i, cl], [i + 1, cr]] as const)
      if (exterior(j) && ldHook(p.dia) > col - COVER) bld.issue({ ref: `B ${ref}`, cause: "hook", severity: "warn", en: `B ${ref}: the hook of the ${p.dia} mm bottom bar needs ${ldHook(p.dia).toFixed(0)} mm of column but only ${(col - COVER).toFixed(0)} mm is available.`, bn: `B ${ref}: ${p.dia} মিমি নিচের রডের হুকের জন্য ${ldHook(p.dia).toFixed(0)} মিমি কলাম লাগে, আছে ${(col - COVER).toFixed(0)} মিমি।` }, k);
    const shape: ShapeCode = hooks === 0 ? "00" : hooks === 1 ? "11" : "21";
    const dims = hooks === 0 ? [straight] : hooks === 1 ? [straight, leg] : [leg, straight, leg];
    bld.add({ family: "beam", description: bi(`Beam ${ref}, bottom bars, span ${i + 1}`, `বিম ${ref}, নিচের রড, স্প্যান ${i + 1}`), dia: p.dia, shape, dims, cut: cutLength(dims, p.dia, Array(hooks).fill(bend)), bars: p.n, level: k });
  });

  // two continuous top hanger bars, split into pieces of at most the stock length with Class B laps between them
  {
    const first = depthAt(0);
    const last = depthAt(n);
    const total = line.stations[n] - line.stations[0] - first / 2 - last / 2 + (first - COVER) + (last - COVER);
    const lap = lapTension(HANGER_DIA, "B", { topBar: true });
    const leg = hookTail(HANGER_DIA, "90");
    const bend = { deg: 90, bendDia: bendDiameter(HANGER_DIA) };
    let pieces = 1;
    // one piece carries a hook at both ends (two legs); with several pieces each end piece carries one
    while ((pieces === 1 ? total + 2 * leg : (total + (pieces - 1) * lap) / pieces + leg) > STOCK_LENGTH_MM) pieces += 1;
    const seg = (total + (pieces - 1) * lap) / pieces;
    const hanger = bi(`Beam ${ref}, top continuous bars`, `বিম ${ref}, উপরের অবিচ্ছিন্ন রড`);
    if (pieces === 1) {
      const dims = [leg, total, leg];
      bld.add({ family: "beam", description: hanger, dia: HANGER_DIA, shape: "21", dims, cut: cutLength(dims, HANGER_DIA, [bend, bend]), bars: 2, level: k });
    } else {
      const endDims = [seg, leg];
      bld.add({ family: "beam", description: bi(`${hanger.en} (end pieces, ${pieces} pieces lapped)`, `${hanger.bn} (প্রান্ত খণ্ড, ${pieces} খণ্ড ল্যাপ)`), dia: HANGER_DIA, shape: "11", dims: endDims, cut: cutLength(endDims, HANGER_DIA, [bend]), bars: 4, level: k });
      if (pieces > 2) bld.add({ family: "beam", description: bi(`${hanger.en} (middle pieces)`, `${hanger.bn} (মাঝের খণ্ড)`), dia: HANGER_DIA, shape: "00", dims: [seg], cut: seg, bars: 2 * (pieces - 2), level: k });
    }
  }

  // extra top bars over each support
  const hangerArea = 2 * barArea(HANGER_DIA);
  for (let j = 0; j <= n; j++) {
    const mu = j === 0 ? spans[0].mNegLeftKnM : j === n ? spans[n - 1].mNegRightKnM : Math.max(spans[j - 1].mNegRightKnM, spans[j].mNegLeftKnM);
    const refTop = `B ${ref} support ${j + 1} top`;
    const needHanger = needAt(mu, HANGER_DIA, 1);
    if (Number.isFinite(needHanger) && needHanger <= hangerArea) {
      bld.pick({ family: "beam", ref: refTop, requiredMm2: needHanger, providedMm2: hangerArea, fits: true, level: k, muKnM: mu, widthMm: sec.bMm, dMm: beamD(sec.hMm, HANGER_DIA, 1) });
      continue;
    }
    const col = depthAt(j);
    const p = pickWithHook(needHanger - hangerArea, sec.bMm, [exterior(j) ? col - COVER : Infinity], { minN: 1, occupied: 2, asReqFor: (layers, dia) => needAt(mu, dia, layers) - hangerArea });
    bld.pick({ family: "beam", ref: refTop, requiredMm2: needAt(mu, p.dia, p.layers), providedMm2: hangerArea + p.areaMm2, fits: p.fits, level: k, muKnM: mu, widthMm: sec.bMm, dMm: beamD(sec.hMm, p.dia, p.layers) });
    const cutOff = (span: number) => 0.25 * span + Math.max(d, 12 * p.dia);
    if (exterior(j)) {
      const inner = spans[j === 0 ? 0 : n - 1].lengthMm;
      const leg = hookTail(p.dia, "90");
      if (ldHook(p.dia) > col - COVER) bld.issue({ ref: `B ${ref}`, cause: "hook", severity: "warn", en: `B ${ref}: the hook of the ${p.dia} mm top bar needs ${ldHook(p.dia).toFixed(0)} mm of column but only ${(col - COVER).toFixed(0)} mm is available.`, bn: `B ${ref}: ${p.dia} মিমি উপরের রডের হুকের জন্য ${ldHook(p.dia).toFixed(0)} মিমি কলাম লাগে, আছে ${(col - COVER).toFixed(0)} মিমি।` }, k);
      const dims = [cutOff(inner) + col - COVER, leg];
      bld.add({ family: "beam", description: bi(`Beam ${ref}, extra top bars at end support`, `বিম ${ref}, প্রান্ত অবলম্বনে বাড়তি উপরের রড`), dia: p.dia, shape: "11", dims, cut: cutLength(dims, p.dia, [{ deg: 90, bendDia: bendDiameter(p.dia) }]), bars: p.n, level: k });
    } else {
      const dims = [cutOff(spans[j - 1].lengthMm) + cutOff(spans[j].lengthMm)];
      bld.add({ family: "beam", description: bi(`Beam ${ref}, extra top bars over support ${j + 1}`, `বিম ${ref}, অবলম্বন ${j + 1}-এর উপর বাড়তি রড`), dia: p.dia, shape: "00", dims, cut: dims[0], bars: p.n, level: k });
    }
  }

  // closed stirrups, 10 mm with 135 degree hooks, spaced from the shear design
  spans.forEach((sp, i) => {
    const ds = DESIGN.stirrupMm;
    const a = sec.hMm - 2 * COVER;
    const bb = sec.bMm - 2 * COVER;
    const tail = tieHookTail(ds);
    const bd = bendDiameter(ds, true);
    const dims = [a, bb, tail];
    const cut = 2 * a + 2 * bb + 2 * tail - 3 * bendDeduction(ds, bd, 90) - 2 * bendDeduction(ds, bd, 135);
    const ln = sp.lengthMm - depthAt(i) / 2 - depthAt(i + 1) / 2;
    // Torsion under a balcony strip: Av/s + 2 At/s must fit the 2-leg stirrup, spacing at most min(ph/8, 300) mm.
    const tors = torsion.filter((q) => Math.min(q.x1, line.stations[i + 1]) - Math.max(q.x0, line.stations[i]) > 0).map((q) => q.t);
    let spacing = sp.stirrupSpacingMm;
    if (tors.length) {
      const at = Math.max(...tors.map((t) => t.atPerMm));
      const cap = Math.floor(Math.min(...tors.map((t) => t.maxStirrupSpacingMm)) / 25) * 25;
      spacing = Math.min(spacing, cap, Math.floor((2 * Math.PI * (ds / 2) ** 2) / (sp.shear.avPerMm + 2 * at) / 25) * 25);
      if (spacing < 50) bld.issue({ ref: `B ${ref}`, cause: "no_bars", severity: "fail", en: `B ${ref}: torsion plus shear needs 10 mm stirrups closer than 50 mm; make the edge beam larger.`, bn: `B ${ref}: টরশন ও শিয়ারের জন্য ১০ মিমি স্টিরাপ ৫০ মিমির কম ব্যবধানে লাগে; প্রান্ত-বিম বড় করুন।` }, k);
      spacing = Math.max(spacing, 50);
      // Side bars for torsion, Al = (At/s) ph, at least four, spread round the stirrup; they run the span and lap into the columns.
      const al = Math.max(...tors.map((t) => t.alMm2));
      const dia = al / barArea(12) > 8 ? 16 : 12;
      const nBars = Math.max(4, Math.ceil(al / barArea(dia)));
      const len = ln + 2 * ldTension(dia);
      bld.add({ family: "beam", description: bi(`Beam ${ref}, torsion bars, span ${i + 1}`, `বিম ${ref}, টরশন রড, স্প্যান ${i + 1}`), dia, shape: "00", dims: [len], cut: len, bars: nBars, level: k });
    }
    const count = Math.ceil(Math.max(ln - 100, 0) / spacing) + 1;
    bld.add({ family: "beam", description: bi(`Beam ${ref}, stirrups at ${spacing} mm, span ${i + 1}`, `বিম ${ref}, স্টিরাপ ${spacing} মিমি, স্প্যান ${i + 1}`), dia: ds, shape: "51", dims, cut, bars: count, level: k });
  });
}

function detailSlabs(res: StructureResult, b: Builder): void {
  for (const lv of res.levels) {
    const k = lv.index;
    const h = lv.slabThicknessMm;
    const bw = BEAM_W_FOR_SLAB;
    const maxFor = (oneWay: boolean) => Math.min((oneWay ? 3 : 2) * h, 450);
    const xShort = (p: PanelResult) => p.x1 - p.x0 <= p.y1 - p.y0;
    for (const p of lv.panels) {
      const r = p.result;
      const wx = p.x1 - p.x0;
      const wy = p.y1 - p.y0;
      const shortDim = Math.min(wx, wy);
      const longDim = Math.max(wx, wy);
      const oneWay = r.type === "one-way";
      const id = `S${p.px + 1}-${p.py + 1}`;
      const dirs: Array<{ name: Bilingual; mu: number; outer: boolean; span: number; across: number; max: number }> = [
        { name: bi("short direction", "ছোট দিক"), mu: r.short.posKnM, outer: true, span: shortDim, across: longDim, max: maxFor(oneWay) },
      ];
      if (r.long) dirs.push({ name: bi("long direction", "লম্বা দিক"), mu: r.long.posKnM, outer: false, span: longDim, across: shortDim, max: maxFor(false) });
      else dirs.push({ name: bi("long direction, distribution", "লম্বা দিক, বণ্টন"), mu: 0, outer: false, span: longDim, across: shortDim, max: Math.min(5 * h, 450) });
      for (const dir of dirs) {
        const m = pickMat(dir.mu, 1000, h, SLAB_COVER, !dir.outer, dir.max, [8, 10, 12, 16]);
        b.pick({ family: "slab", ref: `${id} bottom ${dir.name.en}`, requiredMm2: m.reqMm2, providedMm2: m.pick.areaPerM, fits: m.pick.fits, level: k, muKnM: dir.mu, widthMm: 1000, dMm: m.d });
        const length = dir.span - bw + 300; // 150 mm into the support at each end (Sec 6.5.8.6.3)
        const count = Math.floor((dir.across - bw) / m.pick.spacingMm) + 1;
        b.add({ family: "slab", description: bi(`Slab bottom bars, ${dir.name.en}, ${m.pick.dia} mm at ${m.pick.spacingMm}`, `স্ল্যাবের নিচের রড, ${dir.name.bn}, ${m.pick.dia} মিমি @ ${m.pick.spacingMm}`), dia: m.pick.dia, shape: "00", dims: [length], cut: length, bars: count, level: k });
      }
    }

    // top bars over each beam edge: one group per edge, the larger of the two panels' moments
    interface Edge { from: number; to: number; adj: Array<{ mu: number; long: boolean; ln: number; max: number }> }
    const edges = new Map<string, Edge>();
    for (const p of lv.panels) {
      const r = p.result;
      const oneWay = r.type === "one-way";
      const sides: Array<{ o: "v" | "h"; pos: number; from: number; to: number }> = [
        { o: "v", pos: p.x0, from: p.y0, to: p.y1 },
        { o: "v", pos: p.x1, from: p.y0, to: p.y1 },
        { o: "h", pos: p.y0, from: p.x0, to: p.x1 },
        { o: "h", pos: p.y1, from: p.x0, to: p.x1 },
      ];
      for (const s of sides) {
        // bars run across the edge: along x for a vertical edge. The short direction of the panel is x when it is no deeper than wide.
        const alongX = s.o === "v";
        const isShort = alongX === xShort(p);
        const dir = isShort ? r.short : r.long;
        if (!dir || !(dir.neg.asReqMm2 > 0)) continue;
        const dim = alongX ? p.x1 - p.x0 : p.y1 - p.y0;
        const key = `${s.o}|${s.pos}|${s.from}|${s.to}`;
        const e = edges.get(key) ?? { from: s.from, to: s.to, adj: [] };
        e.adj.push({ mu: dir.negKnM, long: !isShort, ln: dim - bw, max: maxFor(oneWay) });
        edges.set(key, e);
      }
    }
    for (const [key, e] of edges) {
      const mu = Math.max(...e.adj.map((a) => a.mu));
      const m = pickMat(mu, 1000, h, SLAB_COVER, e.adj.some((a) => a.long), Math.min(...e.adj.map((a) => a.max)), [8, 10, 12, 16]);
      b.pick({ family: "slab", ref: `slab edge ${key} top`, requiredMm2: m.reqMm2, providedMm2: m.pick.areaPerM, fits: m.pick.fits, level: k, muKnM: mu, widthMm: 1000, dMm: m.d });
      const count = Math.floor((e.to - e.from - bw) / m.pick.spacingMm) + 1;
      if (e.adj.length >= 2) {
        const len = 0.3 * e.adj[0].ln + 0.3 * e.adj[1].ln + bw;
        b.add({ family: "slab", description: bi(`Slab top bars over a beam, ${m.pick.dia} mm at ${m.pick.spacingMm}`, `বিমের উপর স্ল্যাবের উপরের রড, ${m.pick.dia} মিমি @ ${m.pick.spacingMm}`), dia: m.pick.dia, shape: "00", dims: [len], cut: len, bars: count, level: k });
      } else {
        const leg = h - 2 * SLAB_COVER;
        const dims = [0.3 * e.adj[0].ln + bw - SLAB_COVER, leg];
        b.add({ family: "slab", description: bi(`Slab top bars at a discontinuous edge, ${m.pick.dia} mm at ${m.pick.spacingMm}`, `অবিচ্ছিন্ন নয় এমন কিনারায় স্ল্যাবের উপরের রড, ${m.pick.dia} মিমি @ ${m.pick.spacingMm}`), dia: m.pick.dia, shape: "11", dims, cut: cutLength(dims, m.pick.dia, [{ deg: 90, bendDia: bendDiameter(m.pick.dia) }]), bars: count, level: k });
      }
    }
  }
}

/**
 * Balcony cantilever strips: top main bars across the support (hooked down at the tip, anchored past the beam by a top-bar
 * development length) and distribution bars along the strip. The adjacent slab's own top bars over that beam are scheduled
 * separately, so the steel over the support is counted twice there: conservative.
 */
function detailCantilevers(res: StructureResult, b: Builder): void {
  for (const lv of res.levels) {
    const k = lv.index;
    for (const c of lv.cantilevers) {
      const r = c.result;
      const h = r.thicknessMm;
      const width = c.x1 - c.x0;
      const m = pickMat(r.muKnMPerM, 1000, h, SLAB_COVER, false, Math.min(3 * h, 450), [10, 12, 16]);
      b.pick({ family: "slab", ref: `cantilever ${c.id} top`, requiredMm2: m.reqMm2, providedMm2: m.pick.areaPerM, fits: m.pick.fits, level: k, muKnM: r.muKnMPerM, widthMm: 1000, dMm: m.d });
      const ld = ldTension(m.pick.dia, { topBar: true });
      const leg = h - 2 * SLAB_COVER;
      const dims = [r.lengthMm - SLAB_COVER + BEAM_W_FOR_SLAB / 2 + ld, leg];
      const count = Math.floor((width - 2 * SLAB_COVER) / m.pick.spacingMm) + 1;
      b.add({ family: "slab", description: bi(`Balcony cantilever, top bars ${m.pick.dia} mm at ${m.pick.spacingMm}`, `বারান্দার ক্যান্টিলিভার, উপরের রড ${m.pick.dia} মিমি @ ${m.pick.spacingMm}`), dia: m.pick.dia, shape: "11", dims, cut: cutLength(dims, m.pick.dia, [{ deg: 90, bendDia: bendDiameter(m.pick.dia) }]), bars: count, level: k });
      const dist = pickMatBars(slabMinAs(1000, h), Math.min(5 * h, 450), [8, 10]);
      b.pick({ family: "slab", ref: `cantilever ${c.id} distribution`, requiredMm2: slabMinAs(1000, h), providedMm2: dist.areaPerM, fits: dist.fits, level: k, widthMm: 1000, dMm: h });
      const dl = width - 2 * SLAB_COVER;
      const dcount = Math.floor((r.lengthMm - SLAB_COVER) / dist.spacingMm) + 1;
      b.add({ family: "slab", description: bi(`Balcony cantilever, distribution bars ${dist.dia} mm at ${dist.spacingMm}`, `বারান্দার ক্যান্টিলিভার, বণ্টন রড ${dist.dia} মিমি @ ${dist.spacingMm}`), dia: dist.dia, shape: "00", dims: [dl], cut: dl, bars: dcount, level: k });
    }
  }
}

function detailColumns(res: StructureResult, model: BuildingModel, b: Builder): void {
  const hMm = model.input.floorToFloorMm;
  const n = model.storeys.length;
  for (const col of res.frame.columns) {
    for (const st of col.storeys) {
      const i = st.storey;
      const { bx, by } = st.section;
      const p: BarPick = pickColumnBars(st.astMm2, bx, by);
      const ref = `${col.id} storey ${i}`;
      b.pick({ family: "column", ref: `column ${ref}`, requiredMm2: st.astMm2, providedMm2: p.areaMm2, fits: p.fits, level: i });
      // splice with the bars of the storey above: the larger lap of the two diameters (Sec 8.2.14.2)
      const above = i + 1 < n ? col.storeys[i + 1] : null;
      const aboveDia = above ? pickColumnBars(above.astMm2, above.section.bx, above.section.by).dia : p.dia;
      const lap = lapCompression(Math.max(p.dia, aboveDia));
      const toe = hookTail(p.dia, "90");
      const bend = { deg: 90, bendDia: bendDiameter(p.dia) };
      let dims: number[];
      let shape: ShapeCode;
      let bends: typeof bend[] = [];
      if (i === 0) {
        const footDepth = res.foundation.footings.find((x) => x.columnIds.includes(col.id))?.depthMm ?? col.footing.depthMm;
        const embed = footDepth - 75 - 2 * 16;
        if (embed < ldCompression(p.dia)) b.issue({ ref: `${col.id} footing`, cause: "embed", severity: "fail", en: `${col.id}: the footing is ${footDepth} mm deep; the ${p.dia} mm starter bars need ${ldCompression(p.dia).toFixed(0)} mm of embedment.`, bn: `${col.id}: ফুটিং ${footDepth} মিমি গভীর; ${p.dia} মিমি স্টার্টার রডের জন্য ${ldCompression(p.dia).toFixed(0)} মিমি এমবেডমেন্ট লাগে।` }, 0);
        dims = [hMm + (n > 1 ? lap : 0) + embed, toe];
        shape = "11";
        bends = [bend];
      } else if (i === n - 1) {
        dims = [hMm - COVER, toe];
        shape = "11";
        bends = [bend];
      } else {
        dims = [hMm + lap];
        shape = "00";
      }
      b.add({ family: "column", description: bi(`Column ${col.id} storey ${i}, main bars ${bx} x ${by}`, `কলাম ${col.id} তলা ${i}, মূল রড ${bx} × ${by}`), dia: p.dia, shape, dims, cut: cutLength(dims, p.dia, bends), bars: p.n, level: i });

      // ties: 10 mm closed with 135 degree hooks; 100 mm over the end zones, wider in between
      const dt = DESIGN.stirrupMm;
      const lu = st.luMm;
      const lo = Math.max(Math.max(bx, by), lu / 6, 450);
      const mid = Math.min(16 * p.dia, 48 * dt, Math.min(bx, by));
      const nEnds = 2 * Math.ceil(lo / 100);
      const nMid = Math.max(Math.ceil((hMm - 2 * lo) / mid) - 1, 0);
      const a = by - 2 * COVER;
      const bb = bx - 2 * COVER;
      const tail = tieHookTail(dt);
      const bd = bendDiameter(dt, true);
      const tieDims = [a, bb, tail];
      const tieCut = 2 * a + 2 * bb + 2 * tail - 3 * bendDeduction(dt, bd, 90) - 2 * bendDeduction(dt, bd, 135);
      b.add({ family: "column", description: bi(`Column ${col.id} storey ${i}, ties ${bx} x ${by}`, `কলাম ${col.id} তলা ${i}, টাই ${bx} × ${by}`), dia: dt, shape: "51", dims: tieDims, cut: tieCut, bars: nEnds + nMid + 1, level: i });
    }
  }
}

/**
 * Bars of a merged footing (combined or raft): a bottom mat each way sized per metre from the heaviest member pad it replaces
 * (moment per metre of width), and a top mat of minimum steel each way. Bars longer than the stock length are lapped.
 * Screening level: bending between the columns is not designed (see foundation.ts).
 */
function detailMergedFooting(res: StructureResult, fo: StructureResult["foundation"]["footings"][number], b: Builder): void {
  const members = res.frame.columns.filter((c) => fo.columnIds.includes(c.id));
  const perM = Math.max(...members.map((c) => c.footing.muKnM / (c.footing.sideMm / 1000))); // kN.m per metre of width
  const w = fo.x1 - fo.x0;
  const l = fo.y1 - fo.y0;
  const name = fo.kind === "raft" ? "Raft" : "Combined footing";
  const nameBn = fo.kind === "raft" ? "র‍্যাফট" : "যৌথ ফুটিং";
  const bottom = pickMat(perM, 1000, fo.depthMm, 75, true, 300, [12, 16, 20, 25]);
  const top = pickMat(0, 1000, fo.depthMm, 75, false, 300, [12, 16, 20]);
  b.pick({ family: "footing", ref: `${fo.id} (${members.map((c) => c.id).join(", ")})`, requiredMm2: bottom.reqMm2, providedMm2: bottom.pick.areaPerM, fits: bottom.pick.fits, level: 0, muKnM: perM, widthMm: 1000, dMm: bottom.d });
  const mats: Array<[string, string, string, string, number, number, number]> = [
    ["bottom bars along x", "নিচের রড x দিকে", "bottom", "x", w, l, bottom.pick.dia],
    ["bottom bars along y", "নিচের রড y দিকে", "bottom", "y", l, w, bottom.pick.dia],
    ["top bars along x", "উপরের রড x দিকে", "top", "x", w, l, top.pick.dia],
    ["top bars along y", "উপরের রড y দিকে", "top", "y", l, w, top.pick.dia],
  ];
  for (const [en, bnLabel, layer, , run, across, dia] of mats) {
    const spacing = layer === "bottom" ? bottom.pick.spacingMm : top.pick.spacingMm;
    const total = run - 150;
    const lap = lapTension(dia);
    let pieces = 1;
    while ((pieces === 1 ? total : (total + (pieces - 1) * lap) / pieces) > STOCK_LENGTH_MM) pieces += 1;
    const len = pieces === 1 ? total : Math.round((total + (pieces - 1) * lap) / pieces);
    const count = (Math.floor((across - 150) / spacing) + 1) * pieces;
    b.add({ family: "footing", description: bi(`${name} ${fo.id}, ${w} x ${l} x ${fo.depthMm}: ${en}, ${dia} mm at ${spacing}${pieces > 1 ? `, lapped in ${pieces} pieces` : ""}`, `${nameBn} ${fo.id}, ${w} × ${l} × ${fo.depthMm}: ${bnLabel}, ${dia} মিমি @ ${spacing}`), dia, shape: "00", dims: [len], cut: len, bars: count, level: 0 });
  }
}

function detailFootings(res: StructureResult, b: Builder): void {
  for (const fo of res.foundation.footings) if (fo.kind !== "isolated") detailMergedFooting(res, fo, b);
  const merged = new Set(res.foundation.footings.filter((f) => f.kind !== "isolated").flatMap((f) => f.columnIds));
  for (const col of res.frame.columns) {
    if (merged.has(col.id)) continue;
    const f = col.footing;
    const st = col.storeys[0];
    // two mats cross in the bottom of the pad: the upper one sits one bar higher, so its lever arm is the smaller
    const m = pickMat(f.muKnM, f.sideMm, f.depthMm, 75, true, 300, [12, 16, 20, 25]);
    const pick = m.pick;
    b.pick({ family: "footing", ref: `footing ${col.id}`, requiredMm2: m.reqMm2, providedMm2: (pick.areaPerM * f.sideMm) / 1000, fits: pick.fits, level: 0, muKnM: f.muKnM, widthMm: f.sideMm, dMm: m.d });
    const count = Math.floor((f.sideMm - 150) / pick.spacingMm) + 1;
    const cant = (f.sideMm - Math.max(st.section.bx, st.section.by)) / 2 - 75;
    const straight = f.sideMm - 150;
    const hooked = ldTension(pick.dia) > cant;
    const leg = Math.min(hookTail(pick.dia, "90"), f.depthMm - 150);
    const bend = { deg: 90, bendDia: bendDiameter(pick.dia) };
    const dims = hooked ? [leg, straight, leg] : [straight];
    b.add({ family: "footing", description: bi(`Footing ${col.id}, ${f.sideMm} x ${f.sideMm} x ${f.depthMm}: bottom bars each way, ${pick.dia} mm at ${pick.spacingMm}`, `ফুটিং ${col.id}, ${f.sideMm} × ${f.sideMm} × ${f.depthMm}: উভয় দিকে নিচের রড, ${pick.dia} মিমি @ ${pick.spacingMm}`), dia: pick.dia, shape: hooked ? "21" : "00", dims, cut: cutLength(dims, pick.dia, hooked ? [bend, bend] : []), bars: 2 * count, level: 0 });
  }
}

/** Area of the holes (stair flights, lift and light shafts) in the slab above storey `level`; the roof slab uses the typical floor. */
function holesAboveM2(model: BuildingModel, level: number): number {
  const n = model.storeys.length;
  return slabOpeningAreaM2(model.storeys[level + 1 < n ? level + 1 : Math.min(1, n - 1)].geometry, model);
}

/** Stair flights and landing of one storey: waist slab 150 mm, the steps on top, and the landing. Concrete in m3 and the flight geometry. */
function stairGeometry(model: BuildingModel) {
  const hasStair = model.storeys[0].geometry.fitted.rooms.some((r) => r.def.kind === "stair");
  if (!hasStair) return null;
  const lay = planStair(model.input.floorToFloorMm);
  const w = DEFAULT_STAIR.flightWidthMm / 1000;
  const tread = DEFAULT_STAIR.treadMm / 1000;
  const run = (lay.risersPerFlight - 1) * tread;
  const rise = (lay.risersPerFlight * lay.riserMm) / 1000;
  const incl = Math.hypot(run, rise);
  const flightM3 = 0.15 * incl * w + lay.risersPerFlight * 0.5 * (lay.riserMm / 1000) * tread * w;
  const landingM3 = (DEFAULT_STAIR.landingMm / 1000) * (lay.widthMm / 1000) * 0.15;
  return { lay, incl, perStoreyM3: 2 * flightM3 + landingM3, soffitM2: 2 * incl * w + (DEFAULT_STAIR.landingMm / 1000) * (lay.widthMm / 1000) };
}

/** Stair steel per storey: main bars 12 mm at 150 along the flight, distribution bars 10 mm at 200, landing mat 10 mm at 150 each way. */
function detailStairs(model: BuildingModel, b: Builder): void {
  const g = stairGeometry(model);
  if (!g) return;
  const w = DEFAULT_STAIR.flightWidthMm;
  const mainLen = Math.round(g.incl * 1000) + 800; // along the flight, with anchorage into the landing and the floor
  const nMain = 2 * (Math.floor(w / 150) + 1);
  for (let i = 0; i < model.storeys.length; i++) {
    b.add({ family: "slab", description: bi(`Stair flights, main bars 12 mm at 150`, `সিঁড়ির ফ্লাইট, প্রধান রড ১২ মিমি @ ১৫০`), dia: 12, shape: "00", dims: [mainLen], cut: mainLen, bars: nMain, level: i });
    const nDist = 2 * (Math.floor((g.incl * 1000) / 200) + 1);
    b.add({ family: "slab", description: bi("Stair flights, distribution bars 10 mm at 200", "সিঁড়ির ফ্লাইট, বণ্টন রড ১০ মিমি @ ২০০"), dia: 10, shape: "00", dims: [w - 100], cut: w - 100, bars: nDist, level: i });
    const landW = g.lay.widthMm;
    const landL = DEFAULT_STAIR.landingMm;
    b.add({ family: "slab", description: bi("Stair landing, bars 10 mm at 150 across", "সিঁড়ির ল্যান্ডিং, আড়াআড়ি রড ১০ মিমি @ ১৫০"), dia: 10, shape: "00", dims: [landW - 100], cut: landW - 100, bars: Math.floor(landL / 150) + 1, level: i });
    b.add({ family: "slab", description: bi("Stair landing, bars 10 mm at 150 along", "সিঁড়ির ল্যান্ডিং, লম্বালম্বি রড ১০ মিমি @ ১৫০"), dia: 10, shape: "00", dims: [landL - 100], cut: landL - 100, bars: Math.floor(landW / 150) + 1, level: i });
  }
}

/**
 * Plinth (tie) beams on every structural line at the foundation: 250 x 450, four 16 mm bars and 8 mm stirrups at 150, a nominal tie
 * between the footings (they carry no designed load). Their concrete is in concreteM3.
 */
function detailPlinthBeams(model: BuildingModel, b: Builder): void {
  const typical = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  const COV = 40;
  const dt = 8;
  const a = PLINTH_BEAM_DEPTH_MM - 2 * COV;
  const bb = PLINTH_BEAM_WIDTH_MM - 2 * COV;
  const tail = tieHookTail(dt);
  const bd = bendDiameter(dt, true);
  const tieCut = 2 * a + 2 * bb + 2 * tail - 3 * bendDeduction(dt, bd, 90) - 2 * bendDeduction(dt, bd, 135);
  let stirrups = 0;
  let bars = 0;
  const lens: number[] = [];
  for (const bm of typical.beams) {
    const len = bm.spanMm;
    stirrups += Math.floor(len / 150) + 1;
    bars += 4;
    lens.push(len);
  }
  if (!lens.length) return;
  const avg = Math.round(lens.reduce((x, y) => x + y, 0) / lens.length);
  b.add({ family: "beam", description: bi("Plinth beams, 4 bars 16 mm (average span)", "প্লিন্থ বিম, ৪টি রড ১৬ মিমি (গড় স্প্যান)"), dia: 16, shape: "00", dims: [avg + 300], cut: avg + 300, bars, level: -1 });
  b.add({ family: "beam", description: bi("Plinth beams, stirrups 8 mm at 150", "প্লিন্থ বিম, স্টিরাপ ৮ মিমি @ ১৫০"), dia: dt, shape: "51", dims: [a, bb, tail], cut: tieCut, bars: stirrups, level: -1 });
}

/** Lift shaft: 150 mm RC walls with 10 mm bars at 200 mm each way on both faces (0.52 percent, above the 0.25 percent assumed minimum), and the pit slab with 12 mm at 150 each way. */
function detailLiftCore(model: BuildingModel, b: Builder): void {
  const core = liftCore(model);
  if (!core) return;
  const dia = 10;
  const sp = 200;
  const lap = lapTension(dia, "B", {});
  const pieces = Math.max(1, Math.ceil(core.heightMm / (STOCK_LENGTH_MM - lap)));
  const pieceLen = Math.round((core.heightMm + (pieces - 1) * lap) / pieces);
  b.add({ family: "core", description: bi("Lift shaft wall, vertical 10 mm at 200, both faces", "লিফট শাফটের দেয়াল, খাড়া ১০ মিমি @ ২০০, দুই পাশে"), dia, shape: "00", dims: [pieceLen], cut: pieceLen, bars: 2 * Math.ceil(core.perimeterMm / sp) * pieces, level: -1 });
  // the ring is cut into lapped pieces when it is longer than the stock bar
  const ring = core.perimeterMm - 2 * COVER;
  const ringPieces = Math.max(1, Math.ceil((ring + lap) / (STOCK_LENGTH_MM - lap)));
  const ringLen = Math.round((ring + ringPieces * lap) / ringPieces);
  b.add({ family: "core", description: bi("Lift shaft wall, horizontal 10 mm at 200, both faces", "লিফট শাফটের দেয়াল, আনুভূমিক ১০ মিমি @ ২০০, দুই পাশে"), dia, shape: "00", dims: [ringLen], cut: ringLen, bars: 2 * Math.ceil(core.heightMm / sp) * ringPieces, level: -1 });
  const cell = core.spec.cell;
  const sx = cell.x1 - cell.x0 + LIFT_ASSUMPTIONS.shaftWallMm;
  const sy = cell.y1 - cell.y0 + LIFT_ASSUMPTIONS.shaftWallMm;
  b.add({ family: "core", description: bi("Lift pit slab, bottom 12 mm at 150, along x", "লিফট পিট স্ল্যাব, নিচে ১২ মিমি @ ১৫০, x বরাবর"), dia: 12, shape: "00", dims: [sx - 2 * COVER], cut: sx - 2 * COVER, bars: Math.ceil(sy / 150) + 1, level: -1 });
  b.add({ family: "core", description: bi("Lift pit slab, bottom 12 mm at 150, along y", "লিফট পিট স্ল্যাব, নিচে ১২ মিমি @ ১৫০, y বরাবর"), dia: 12, shape: "00", dims: [sy - 2 * COVER], cut: sy - 2 * COVER, bars: Math.ceil(sx / 150) + 1, level: -1 });
}

/** One concrete pour of the building: the foundation, the columns of one storey, the beams, slab and stair of one level, or the lift shaft walls. */
export interface ConcreteStep {
  id: string;
  kind: "foundation" | "columns" | "slab" | "core";
  /** Storey (columns) or level (slab above that storey; the last is the roof). */
  index?: number;
  m3: number;
}

/** Concrete volumes in pouring order; their sum is the building total (concreteM3). */
export function concreteSteps(res: StructureResult, model: BuildingModel): ConcreteStep[] {
  const steps: ConcreteStep[] = [];
  // Foundation: footings as built (merged footings once), column stubs to the ground-floor finish, plinth beams and the lift pit slab.
  let foundation = 0;
  for (const fo of res.foundation.footings) foundation += ((fo.x1 - fo.x0) * (fo.y1 - fo.y0) * fo.depthMm) / 1e9;
  for (const col of res.frame.columns) foundation += (col.storeys[0].section.bx * col.storeys[0].section.by * PAD_TOP_BELOW_FINISH_MM) / 1e9;
  const typicalGeo = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  for (const bm of typicalGeo.beams) foundation += (PLINTH_BEAM_WIDTH_MM * PLINTH_BEAM_DEPTH_MM * bm.spanMm) / 1e9;
  const lc = liftCore(model);
  if (lc) foundation += lc.pitSlabM3;
  steps.push({ id: "foundation", kind: "foundation", m3: foundation });
  const sg = stairGeometry(model);
  for (const lv of res.levels) {
    let cols = 0;
    for (const col of res.frame.columns) {
      const st = col.storeys[lv.index];
      if (st) cols += (st.section.bx * st.section.by * model.input.floorToFloorMm) / 1e9;
    }
    steps.push({ id: `columns-${lv.index}`, kind: "columns", index: lv.index, m3: cols });
    let slab = 0;
    for (const p of lv.panels) slab += ((p.x1 - p.x0) * (p.y1 - p.y0) * lv.slabThicknessMm) / 1e9;
    for (const c of lv.cantilevers) slab += ((c.x1 - c.x0) * (c.y1 - c.y0) * c.result.thicknessMm) / 1e9; // the balcony strips are slab too
    slab -= (holesAboveM2(model, lv.index) * lv.slabThicknessMm) / 1000; // the slab is cut where the stair, lift and shafts pass
    for (const line of lv.beamLines) for (const sp of line.result.spans) slab += (line.result.section.bMm * Math.max(line.result.section.hMm - lv.slabThicknessMm, 0) * sp.lengthMm) / 1e9;
    if (sg) slab += sg.perStoreyM3;
    steps.push({ id: `slab-${lv.index}`, kind: "slab", index: lv.index, m3: slab });
  }
  if (lc) steps.push({ id: "core", kind: "core", m3: lc.wallM3 });
  return steps;
}

function concreteM3(res: StructureResult, model: BuildingModel): number {
  return concreteSteps(res, model).reduce((a, s) => a + s.m3, 0);
}

/**
 * Form contact area by member family, m2: slab soffit, beam bottom and both sides below the slab, all four faces of each column
 * storey, the four sides of each footing (its base sits on blinding, not on a form). Simplified: nothing is deducted where
 * members meet, slab edges and stair flights are not counted, and the columns use the typical storey height.
 */
function formworkM2(res: StructureResult, model: BuildingModel): { footing: number; column: number; beam: number; slab: number; core: number } {
  const f = { footing: 0, column: 0, beam: 0, slab: 0, core: 0 };
  for (const lv of res.levels) {
    for (const p of lv.panels) f.slab += ((p.x1 - p.x0) * (p.y1 - p.y0)) / 1e6;
    for (const c of lv.cantilevers) f.slab += ((c.x1 - c.x0) * (c.y1 - c.y0)) / 1e6;
    f.slab -= holesAboveM2(model, lv.index);
    for (const line of lv.beamLines)
      for (const sp of line.result.spans) f.beam += ((line.result.section.bMm + 2 * Math.max(line.result.section.hMm - lv.slabThicknessMm, 0)) * sp.lengthMm) / 1e6;
  }
  for (const col of res.frame.columns) {
    for (const st of col.storeys) f.column += (2 * (st.section.bx + st.section.by) * model.input.floorToFloorMm) / 1e6;
  }
  for (const fo of res.foundation.footings) f.footing += (2 * (fo.x1 - fo.x0 + (fo.y1 - fo.y0)) * fo.depthMm) / 1e6;
  // column stubs below the ground floor, plinth beam sides (the bottom is on the ground) and the stair soffits and landings
  for (const col of res.frame.columns) f.column += (2 * (col.storeys[0].section.bx + col.storeys[0].section.by) * PAD_TOP_BELOW_FINISH_MM) / 1e6;
  const typicalGeo = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  for (const bm of typicalGeo.beams) f.beam += (2 * PLINTH_BEAM_DEPTH_MM * bm.spanMm) / 1e6;
  const sg = stairGeometry(model);
  if (sg) f.slab += sg.soffitM2 * model.storeys.length;
  const lc = liftCore(model);
  if (lc) f.core += (2 * lc.perimeterMm * lc.heightMm) / 1e6; // both faces of the shaft walls (priced at the column form rate)
  return f;
}

/** The bar bending schedule of the whole building from its structural result. */
export function buildBbs(res: StructureResult, model: BuildingModel): BbsResult {
  const colMap = new Map(res.frame.columns.map((c) => [`${c.xMm},${c.yMm}`, c]));
  const colAt = (k: number, x: number, y: number) => {
    const c = colMap.get(`${x},${y}`);
    return c ? c.storeys[Math.min(k, c.storeys.length - 1)].section : null;
  };
  const b = new Builder();
  detailFootings(res, b);
  detailColumns(res, model, b);
  detailBeams(res, colAt, b);
  detailSlabs(res, b);
  detailCantilevers(res, b);
  detailStairs(model, b);
  detailPlinthBeams(model, b);
  detailLiftCore(model, b);
  const rows = b.rows();
  const byDia = new Map<number, { lengthM: number; weightKg: number }>();
  const byFam = new Map<BbsFamily, number>();
  let weight = 0;
  for (const r of rows) {
    const e = byDia.get(r.diaMm) ?? { lengthM: 0, weightKg: 0 };
    e.lengthM += r.totalLengthM;
    e.weightKg += r.weightKg;
    byDia.set(r.diaMm, e);
    byFam.set(r.family, (byFam.get(r.family) ?? 0) + r.weightKg);
    weight += r.weightKg;
  }
  const concrete = concreteM3(res, model);
  return {
    rows,
    picks: b.picks,
    issues: b.issues,
    totals: {
      byDia: [...byDia].map(([diaMm, v]) => ({ diaMm, ...v })).sort((a, c) => a.diaMm - c.diaMm),
      byFamily: [...byFam].map(([family, weightKg]) => ({ family, weightKg })),
      weightKg: weight,
      concreteM3: concrete,
      kgPerM3: concrete > 0 ? weight / concrete : 0,
      formworkM2: formworkM2(res, model),
    },
  };
}
