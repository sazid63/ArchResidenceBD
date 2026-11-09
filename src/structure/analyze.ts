/**
 * BuildingModel -> slabs and beams of every level. Pure and deterministic. Slab panels are the cells between
 * adjacent structural grid lines; each beam line is the chain of spans along one structural line. Level k means the
 * slab above storey k (the last level is the roof). Identical floors are computed once and shared.
 * Columns, footings and seismic follow in M4-2, so this module also exposes the per-support data they need.
 */

import type { BuildingModel } from "../model/building";
import type { FloorGeometry } from "../plans/geometry";
import { ASSUMPTIONS, type Assumption } from "./materials";
import { liveLoadForKind, partitionAllowanceKnM2, roofLiveKnM2 } from "./loads";
import { UNIT_WEIGHTS } from "./materials";
import { designSlab, type Continuity, type SlabResult } from "./slab";
import { sizeBeamLine, type BeamLineResult, type BeamSpanInput } from "./beam";

export interface PanelResult {
  /** Panel index along x and y between structural lines. */
  px: number;
  py: number;
  /** Plan-frame corners, mm. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  result: SlabResult;
}

export interface BeamLinePlaced {
  /** "v" runs along y at x = at; "h" runs along x at y = at. */
  orientation: "v" | "h";
  at: number;
  /** Span boundaries along the line, mm (length = spans + 1). */
  stations: number[];
  result: BeamLineResult;
}

export interface LevelResult {
  /** Slab above storey `index`; the last level is the roof. */
  index: number;
  kind: "floor" | "roof";
  levelMm: number;
  slabThicknessMm: number;
  panels: PanelResult[];
  beamLines: BeamLinePlaced[];
  util: number;
}

export interface MemberFailure {
  level: number;
  member: "slab" | "beam";
  id: string;
  util: number;
  governs: string;
}

export interface StructureResult {
  levels: LevelResult[];
  failures: MemberFailure[];
  /** Worst demand/capacity ratio anywhere (never clamped). */
  util: number;
  ok: boolean;
  assumptions: Assumption[];
}

interface Panel {
  px: number;
  py: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kinds: string[];
}

const TOL = 1;

/** Equivalent uniform line loads (bending, shear) one panel puts on a beam of length `beamMm`, per kN/m2 of panel load. */
export function panelToBeam(beamMm: number, panelXMm: number, panelYMm: number): { bend: number; shear: number } {
  const s = Math.min(panelXMm, panelYMm) / 1000;
  const l = Math.max(panelXMm, panelYMm) / 1000;
  const oneWay = l / s > 2;
  const alongShort = Math.abs(beamMm - s * 1000) < TOL;
  if (oneWay) return alongShort ? { bend: 0, shear: 0 } : { bend: s / 2, shear: s / 2 };
  const m = s / l;
  if (alongShort) return { bend: s / 3, shear: s / 4 };
  return { bend: (s / 3) * ((3 - m * m) / 2), shear: (s / 2) * (1 - m / 2) };
}

function panelsOf(geo: FloorGeometry, loadsGeo: FloorGeometry): Panel[] {
  const f = geo.fitted;
  const out: Panel[] = [];
  for (let px = 0; px + 1 < f.structuralX.length; px++)
    for (let py = 0; py + 1 < f.structuralY.length; py++) {
      const kinds = new Set<string>();
      for (let gx = f.structuralX[px]; gx < f.structuralX[px + 1]; gx++)
        for (let gy = f.structuralY[py]; gy < f.structuralY[py + 1]; gy++) {
          const o = loadsGeo.owner[gx]?.[gy] ?? -1;
          if (o >= 0) kinds.add(loadsGeo.fitted.rooms[o].def.kind);
        }
      if (!kinds.size) continue;
      out.push({ px, py, x0: f.xLines[f.structuralX[px]], x1: f.xLines[f.structuralX[px + 1]], y0: f.yLines[f.structuralY[py]], y1: f.yLines[f.structuralY[py + 1]], kinds: [...kinds] });
    }
  return out;
}

function computeLevel(model: BuildingModel, k: number): Omit<LevelResult, "index" | "levelMm"> {
  const n = model.storeys.length;
  const roof = k === n - 1;
  const geo = model.storeys[k].geometry;
  const loadsGeo = roof ? geo : model.storeys[k + 1].geometry;
  const f = geo.fitted;
  const panels = panelsOf(geo, loadsGeo);
  const has = (px: number, py: number) => panels.some((p) => p.px === px && p.py === py);

  const live = (p: Panel) => (roof ? 0 : Math.max(...p.kinds.map((kd) => liveLoadForKind(kd as never))) + partitionAllowanceKnM2());
  const slabIn = (p: Panel, thicknessMm?: number) => {
    const wx = p.x1 - p.x0;
    const wy = p.y1 - p.y0;
    const xCont = ((has(p.px - 1, p.py) ? 1 : 0) + (has(p.px + 1, p.py) ? 1 : 0)) as Continuity;
    const yCont = ((has(p.px, p.py - 1) ? 1 : 0) + (has(p.px, p.py + 1) ? 1 : 0)) as Continuity;
    const xShort = wx <= wy;
    return {
      shortM: Math.min(wx, wy) / 1000,
      longM: Math.max(wx, wy) / 1000,
      contShort: xShort ? xCont : yCont,
      contLong: xShort ? yCont : xCont,
      deadExtraKnM2: roof ? UNIT_WEIGHTS.roofFinishKnM2 : UNIT_WEIGHTS.floorFinishKnM2,
      liveKnM2: live(p),
      roofLiveKnM2: roof ? roofLiveKnM2() : 0,
      thicknessMm,
    };
  };
  const first = panels.map((p) => designSlab(slabIn(p)));
  const slabMm = Math.max(125, ...first.map((r) => r.thicknessMm));
  const slabs = panels.map((p) => ({ p, r: designSlab(slabIn(p, slabMm)) }));
  const panelResults: PanelResult[] = slabs.map(({ p, r }) => ({ px: p.px, py: p.py, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, result: r }));

  // Walls that sit on this level's beams: the storey above (floors) or the parapet (roof).
  const wallGeo = roof ? geo : loadsGeo;
  const walls = wallGeo.walls.filter((w) => (roof ? w.exterior : true));
  const wallHeightMm = roof ? model.roof.parapetMm : model.storeys[k + 1].heightMm;

  const beamLines: BeamLinePlaced[] = [];
  const sx = f.structuralX;
  const sy = f.structuralY;
  const lineFor = (orientation: "v" | "h", lineIdx: number): BeamLinePlaced | null => {
    const vertical = orientation === "v";
    const grid = vertical ? sx : sy;
    const along = vertical ? sy : sx;
    const at = vertical ? f.xLines[grid[lineIdx]] : f.yLines[grid[lineIdx]];
    const alongLines = vertical ? f.yLines : f.xLines;
    const spans: BeamSpanInput[] = [];
    const stations: number[] = [alongLines[along[0]]];
    for (let q = 0; q + 1 < along.length; q++) {
      const from = alongLines[along[q]];
      const to = alongLines[along[q + 1]];
      const len = to - from;
      // The two panels beside this span: index lineIdx-1 and lineIdx across the line, q along it.
      const side = (across: number) => {
        const px = vertical ? across : q;
        const py = vertical ? q : across;
        return slabs.find(({ p }) => p.px === px && p.py === py);
      };
      let dBend = 0;
      let dShear = 0;
      let lBend = 0;
      let lShear = 0;
      for (const sd of [side(lineIdx - 1), side(lineIdx)]) {
        if (!sd) continue;
        const dx = sd.p.x1 - sd.p.x0;
        const dy = sd.p.y1 - sd.p.y0;
        const c = panelToBeam(len, dx, dy);
        dBend += c.bend * sd.r.dKnM2;
        dShear += c.shear * sd.r.dKnM2;
        lBend += c.bend * sd.r.lKnM2;
        lShear += c.shear * sd.r.lKnM2;
      }
      // Walls collinear with this span.
      let wallLen = 0;
      let wallMass = 0;
      for (const w of walls) {
        if (w.orientation !== orientation || Math.abs(w.at - at) > TOL) continue;
        const ov = Math.min(w.to, to) - Math.max(w.from, from);
        if (ov > 0) {
          wallLen += ov;
          wallMass += ov * w.thicknessMm;
        }
      }
      spans.push({
        lengthMm: len,
        slabDeadBend: dBend,
        slabDeadShear: dShear,
        slabLiveBend: lBend,
        slabLiveShear: lShear,
        wallThicknessMm: wallLen > 0 ? wallMass / wallLen : null,
        wallShare: Math.min(wallLen / len, 1),
      });
      stations.push(to);
    }
    if (!spans.length || spans.every((s) => s.slabDeadBend === 0 && s.slabDeadShear === 0 && !s.wallThicknessMm)) return null;
    return { orientation, at, stations, result: sizeBeamLine({ spans, wallHeightMm, slabThicknessMm: slabMm }) };
  };
  for (let i = 0; i < sx.length; i++) {
    const b = lineFor("v", i);
    if (b) beamLines.push(b);
  }
  for (let i = 0; i < sy.length; i++) {
    const b = lineFor("h", i);
    if (b) beamLines.push(b);
  }
  const util = Math.max(0, ...panelResults.map((p) => p.result.util), ...beamLines.map((b) => b.result.util));
  return { kind: roof ? "roof" : "floor", slabThicknessMm: slabMm, panels: panelResults, beamLines, util };
}

export function analyzeStructure(model: BuildingModel): StructureResult {
  const n = model.storeys.length;
  const cache = new Map<string, Omit<LevelResult, "index" | "levelMm">>();
  const levels: LevelResult[] = [];
  for (let k = 0; k < n; k++) {
    const kind = k === n - 1 ? "roof" : "floor";
    let base = cache.get(kind);
    if (!base) {
      base = computeLevel(model, k);
      cache.set(kind, base);
    }
    levels.push({ ...base, index: k, levelMm: (k + 1) * model.input.floorToFloorMm });
  }
  const failures: MemberFailure[] = [];
  for (const lv of levels) {
    for (const p of lv.panels) if (p.result.util > 1) failures.push({ level: lv.index, member: "slab", id: `S${p.px + 1}-${p.py + 1}`, util: p.result.util, governs: p.result.governs });
    for (const b of lv.beamLines)
      if (b.result.util > 1) {
        const worst = b.result.spans.reduce((a, c) => (c.util > a.util ? c : a));
        failures.push({ level: lv.index, member: "beam", id: `B-${b.orientation}${b.at}`, util: b.result.util, governs: worst.governs });
      }
  }
  failures.sort((a, b) => b.util - a.util);
  const util = Math.max(0, ...levels.map((l) => l.util));
  return { levels, failures, util, ok: failures.length === 0, assumptions: ASSUMPTIONS };
}
