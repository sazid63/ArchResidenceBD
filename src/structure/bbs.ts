/**
 * Reinforcement and the bar bending schedule (BBS) from the M4 member results. Every bar is a stock diameter
 * (8, 10, 12, 16, 20, 22, 25, 28, 32 mm); development, hook, bend and lap lengths come from Sec 8.1.2 and 8.2
 * (anchorage.ts functions over the pack). Each pick records the steel required against the steel provided, so a
 * member that cannot be detailed shows up in `issues` instead of being rounded away.
 *
 * Detailing is screening level: bottom bars run support to support without curtailment, extra top bars stop
 * 0.25 L + max(d, 12 db) from the support (the inflection point is assumed at 0.25 L), crossties and corner bars are
 * not scheduled, and bar lengths use cut lengths with bend deductions (shape codes follow BS 8666 convention).
 * Units: mm, mm2, kg.
 */

import type { BuildingModel } from "../model/building";
import { bendDeduction, bendDiameter, hookTail, ldCompression, ldHook, ldTension, lapCompression, lapTension, tieHookTail } from "./anchorage";
import type { BeamLinePlaced, PanelResult, StructureResult } from "./analyze";
import { barArea, pickBeamBars, pickColumnBars, pickMatBars, unitWeightKgM, type BarPick } from "./barSelect";
import { DESIGN } from "./materials";
import { slabMinAs } from "./section";

export type ShapeCode = "00" | "11" | "21" | "51";
export type BbsFamily = "beam" | "column" | "slab" | "footing";

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
}

export interface BbsIssue {
  ref: string;
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
    if (!c.fits) this.issue({ ref: c.ref, severity: "fail", en: `${c.ref}: no stock bars fit the ${Number.isFinite(c.requiredMm2) ? c.requiredMm2.toFixed(0) : "required"} mm2 required; enlarge the member.`, bn: `${c.ref}: প্রয়োজনীয় রড বসে না; সদস্য বড় করুন।` }, c.level);
  }

  rows(): BbsRow[] {
    const letter: Record<BbsFamily, string> = { beam: "B", column: "C", slab: "S", footing: "F" };
    const seq: Record<BbsFamily, number> = { beam: 0, column: 0, slab: 0, footing: 0 };
    const order: BbsFamily[] = ["footing", "column", "beam", "slab"];
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

function detailBeams(res: StructureResult, colAt: (k: number, x: number, y: number) => { bx: number; by: number } | null, b: Builder): void {
  for (const lv of res.levels) {
    const k = lv.index;
    for (const line of lv.beamLines) beamLine(line, k, colAt, b);
  }
}

function beamLine(line: BeamLinePlaced, k: number, colAt: (k: number, x: number, y: number) => { bx: number; by: number } | null, bld: Builder): void {
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

  // bottom bars, one group per span
  spans.forEach((sp, i) => {
    const cl = depthAt(i);
    const cr = depthAt(i + 1);
    const ln = sp.lengthMm - cl / 2 - cr / 2;
    const ends = [exterior(i) ? cl - COVER : Infinity, exterior(i + 1) ? cr - COVER : Infinity];
    const p = pickWithHook(sp.pos.asReqMm2, sec.bMm, ends, { minN: 2 });
    bld.pick({ family: "beam", ref: `B ${ref} span ${i + 1} bottom`, requiredMm2: sp.pos.asReqMm2, providedMm2: p.areaMm2, fits: p.fits, level: k });
    const ld = ldTension(p.dia);
    const embed = (j: number, col: number) => (exterior(j) ? col - COVER : Math.min(ld, col - COVER));
    const hooks = [exterior(i), exterior(i + 1)].filter(Boolean).length;
    const leg = hookTail(p.dia, "90");
    const straight = ln + embed(i, cl) + embed(i + 1, cr);
    const bend = { deg: 90, bendDia: bendDiameter(p.dia) };
    for (const [j, col] of [[i, cl], [i + 1, cr]] as const)
      if (exterior(j) && ldHook(p.dia) > col - COVER) bld.issue({ ref: `B ${ref}`, severity: "warn", en: `B ${ref}: the hook of the ${p.dia} mm bottom bar needs ${ldHook(p.dia).toFixed(0)} mm of column but only ${(col - COVER).toFixed(0)} mm is available.`, bn: `B ${ref}: ${p.dia} মিমি নিচের রডের হুকের জন্য ${ldHook(p.dia).toFixed(0)} মিমি কলাম লাগে, আছে ${(col - COVER).toFixed(0)} মিমি।` }, k);
    const shape: ShapeCode = hooks === 0 ? "00" : hooks === 1 ? "11" : "21";
    const dims = hooks === 0 ? [straight] : hooks === 1 ? [straight, leg] : [leg, straight, leg];
    bld.add({ family: "beam", description: bi(`Beam ${ref}, bottom bars, span ${i + 1}`, `বিম ${ref}, নিচের রড, স্প্যান ${i + 1}`), dia: p.dia, shape, dims, cut: cutLength(dims, p.dia, Array(hooks).fill(bend)), bars: p.n, level: k });
  });

  // two continuous top hanger bars, lapped when the line is longer than a 12 m stock bar
  {
    const first = depthAt(0);
    const last = depthAt(n);
    const total = line.stations[n] - line.stations[0] - first / 2 - last / 2 + (first - COVER) + (last - COVER);
    const laps = Math.max(Math.ceil(total / 12000) - 1, 0);
    const leg = hookTail(HANGER_DIA, "90");
    const bend = { deg: 90, bendDia: bendDiameter(HANGER_DIA) };
    const straight = total + laps * lapTension(HANGER_DIA, "B", { topBar: true });
    const dims = [leg, straight, leg];
    bld.add({ family: "beam", description: bi(`Beam ${ref}, top continuous bars`, `বিম ${ref}, উপরের অবিচ্ছিন্ন রড`), dia: HANGER_DIA, shape: "21", dims, cut: cutLength(dims, HANGER_DIA, [bend, bend]), bars: 2, level: k });
  }

  // extra top bars over each support
  const hangerArea = 2 * barArea(HANGER_DIA);
  for (let j = 0; j <= n; j++) {
    const need = j === 0 ? spans[0].negLeft.asReqMm2 : j === n ? spans[n - 1].negRight.asReqMm2 : Math.max(spans[j - 1].negRight.asReqMm2, spans[j].negLeft.asReqMm2);
    const extra = need - hangerArea;
    if (!(extra > 0) && Number.isFinite(need)) {
      bld.pick({ family: "beam", ref: `B ${ref} support ${j + 1} top`, requiredMm2: need, providedMm2: hangerArea, fits: true, level: k });
      continue;
    }
    const p = pickWithHook(extra, sec.bMm, [exterior(j) ? depthAt(j) - COVER : Infinity], { minN: 1, occupied: 2 });
    bld.pick({ family: "beam", ref: `B ${ref} support ${j + 1} top`, requiredMm2: need, providedMm2: hangerArea + p.areaMm2, fits: p.fits, level: k });
    const cutOff = (span: number) => 0.25 * span + Math.max(d, 12 * p.dia);
    const col = depthAt(j);
    if (exterior(j)) {
      const inner = spans[j === 0 ? 0 : n - 1].lengthMm;
      const leg = hookTail(p.dia, "90");
      if (ldHook(p.dia) > col - COVER) bld.issue({ ref: `B ${ref}`, severity: "warn", en: `B ${ref}: the hook of the ${p.dia} mm top bar needs ${ldHook(p.dia).toFixed(0)} mm of column but only ${(col - COVER).toFixed(0)} mm is available.`, bn: `B ${ref}: ${p.dia} মিমি উপরের রডের হুকের জন্য ${ldHook(p.dia).toFixed(0)} মিমি কলাম লাগে, আছে ${(col - COVER).toFixed(0)} মিমি।` }, k);
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
    const count = Math.ceil(Math.max(ln - 100, 0) / sp.stirrupSpacingMm) + 1;
    bld.add({ family: "beam", description: bi(`Beam ${ref}, stirrups at ${sp.stirrupSpacingMm} mm, span ${i + 1}`, `বিম ${ref}, স্টিরাপ ${sp.stirrupSpacingMm} মিমি, স্প্যান ${i + 1}`), dia: ds, shape: "51", dims, cut, bars: count, level: k });
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
      const dirs: Array<{ name: Bilingual; asReq: number; span: number; across: number; max: number }> = [
        { name: bi("short direction", "ছোট দিক"), asReq: r.short.pos.asReqMm2, span: shortDim, across: longDim, max: maxFor(oneWay) },
      ];
      if (r.long) dirs.push({ name: bi("long direction", "লম্বা দিক"), asReq: r.long.pos.asReqMm2, span: longDim, across: shortDim, max: maxFor(false) });
      else dirs.push({ name: bi("long direction, distribution", "লম্বা দিক, বণ্টন"), asReq: slabMinAs(1000, h), span: longDim, across: shortDim, max: Math.min(5 * h, 450) });
      for (const dir of dirs) {
        const pick = pickMatBars(dir.asReq, dir.max);
        b.pick({ family: "slab", ref: `${id} bottom ${dir.name.en}`, requiredMm2: dir.asReq, providedMm2: pick.areaPerM, fits: pick.fits, level: k });
        const length = dir.span - bw + 300; // 150 mm into the support at each end (Sec 6.5.8.6.3)
        const count = Math.floor((dir.across - bw) / pick.spacingMm) + 1;
        b.add({ family: "slab", description: bi(`Slab bottom bars, ${dir.name.en}, ${pick.dia} mm at ${pick.spacingMm}`, `স্ল্যাবের নিচের রড, ${dir.name.bn}, ${pick.dia} মিমি @ ${pick.spacingMm}`), dia: pick.dia, shape: "00", dims: [length], cut: length, bars: count, level: k });
      }
    }

    // top bars over each beam edge: one group per edge, the larger of the two panels' requirement
    interface Edge { orientation: "v" | "h"; from: number; to: number; adj: Array<{ req: number; ln: number; max: number }> }
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
        // bars run across the edge: along x for a vertical edge. Short direction of the panel is x when it is no deeper than wide.
        const alongX = s.o === "v";
        const isShort = alongX === xShort(p);
        const dir = isShort ? r.short : r.long;
        const req = dir ? dir.neg.asReqMm2 : 0;
        if (!(req > 0)) continue;
        const dim = alongX ? p.x1 - p.x0 : p.y1 - p.y0;
        const key = `${s.o}|${s.pos}|${s.from}|${s.to}`;
        const e = edges.get(key) ?? { orientation: s.o, from: s.from, to: s.to, adj: [] };
        e.adj.push({ req, ln: dim - bw, max: maxFor(oneWay) });
        edges.set(key, e);
      }
    }
    for (const [key, e] of edges) {
      const req = Math.max(...e.adj.map((a) => a.req));
      const pick = pickMatBars(req, Math.min(...e.adj.map((a) => a.max)));
      b.pick({ family: "slab", ref: `slab edge ${key} top`, requiredMm2: req, providedMm2: pick.areaPerM, fits: pick.fits, level: k });
      const count = Math.floor((e.to - e.from - bw) / pick.spacingMm) + 1;
      if (e.adj.length >= 2) {
        const len = 0.3 * e.adj[0].ln + 0.3 * e.adj[1].ln + bw;
        b.add({ family: "slab", description: bi(`Slab top bars over a beam, ${pick.dia} mm at ${pick.spacingMm}`, `বিমের উপর স্ল্যাবের উপরের রড, ${pick.dia} মিমি @ ${pick.spacingMm}`), dia: pick.dia, shape: "00", dims: [len], cut: len, bars: count, level: k });
      } else {
        const leg = h - 2 * SLAB_COVER;
        const dims = [0.3 * e.adj[0].ln + bw - SLAB_COVER, leg];
        b.add({ family: "slab", description: bi(`Slab top bars at a discontinuous edge, ${pick.dia} mm at ${pick.spacingMm}`, `অবিচ্ছিন্ন নয় এমন কিনারায় স্ল্যাবের উপরের রড, ${pick.dia} মিমি @ ${pick.spacingMm}`), dia: pick.dia, shape: "11", dims, cut: cutLength(dims, pick.dia, [{ deg: 90, bendDia: bendDiameter(pick.dia) }]), bars: count, level: k });
      }
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
        const embed = col.footing.depthMm - 75 - 2 * 16;
        if (embed < ldCompression(p.dia)) b.issue({ ref: `${col.id} footing`, severity: "fail", en: `${col.id}: the footing is ${col.footing.depthMm} mm deep; the ${p.dia} mm starter bars need ${ldCompression(p.dia).toFixed(0)} mm of embedment.`, bn: `${col.id}: ফুটিং ${col.footing.depthMm} মিমি গভীর; ${p.dia} মিমি স্টার্টার রডের জন্য ${ldCompression(p.dia).toFixed(0)} মিমি এমবেডমেন্ট লাগে।` }, 0);
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

function detailFootings(res: StructureResult, b: Builder): void {
  for (const col of res.frame.columns) {
    const f = col.footing;
    const st = col.storeys[0];
    const asPerM = (f.flexure.asReqMm2 / f.sideMm) * 1000;
    const pick = pickMatBars(asPerM, 300, [12, 16, 20, 25]);
    b.pick({ family: "footing", ref: `footing ${col.id}`, requiredMm2: asPerM, providedMm2: pick.areaPerM, fits: pick.fits, level: 0 });
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

function concreteM3(res: StructureResult, model: BuildingModel): number {
  let m3 = 0;
  for (const lv of res.levels) {
    for (const p of lv.panels) m3 += ((p.x1 - p.x0) * (p.y1 - p.y0) * lv.slabThicknessMm) / 1e9;
    for (const line of lv.beamLines) for (const sp of line.result.spans) m3 += (line.result.section.bMm * Math.max(line.result.section.hMm - lv.slabThicknessMm, 0) * sp.lengthMm) / 1e9;
  }
  for (const col of res.frame.columns) {
    for (const st of col.storeys) m3 += (st.section.bx * st.section.by * model.input.floorToFloorMm) / 1e9;
    m3 += (col.footing.sideMm ** 2 * col.footing.depthMm) / 1e9;
  }
  return m3;
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
    },
  };
}
