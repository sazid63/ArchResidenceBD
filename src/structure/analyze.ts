/**
 * BuildingModel -> slabs and beams of every level. Pure and deterministic. Slab panels are the cells between
 * adjacent structural grid lines; each beam line is the chain of spans along one structural line. Level k means the
 * slab above storey k (the last level is the roof). Identical floors are computed once and shared.
 * Slab thickness depends on beam stiffness (BNBC Eq 6.6.5/6.6.6) and beam size on slab load, so each level iterates
 * until neither changes. Columns, footings and seismic follow in M4-2; they will read the beam-line spans and slab
 * loads from here.
 */

import type { BuildingModel } from "../model/building";
import type { FloorGeometry } from "../plans/geometry";
import type { RoomKind } from "../plans/types";
import { ASSUMPTIONS, MATERIALS, UNIT_WEIGHTS, type Assumption } from "./materials";
import { liveLoadForKind, partitionAllowanceKnM2, roofLiveKnM2 } from "./loads";
import { designSlab, type Continuity, type SlabInput, type SlabResult } from "./slab";
import { alphaF, tBeamInertia } from "./tbeam";
import { CORE_ASSUMPTIONS } from "./core";
import { analyzeFrame, type FrameOptions, type FrameResult } from "./frame";
import { planFoundation, type FoundationResult } from "./foundation";
import { analyseWind, type WindResult } from "./wind";
import { roofLoads } from "../model/roofEquipment";
import { slabWallKn } from "./slabWalls";
import { edgeBeamTorsion, type TorsionResult } from "./torsion";
import { cantileverMinThicknessMm, cantileverStrips, designCantilever, type CantileverResult, type CantileverStrip } from "./cantilever";
import { sizeBeamLine, type BeamLineResult, type BeamSection, type BeamSpanInput } from "./beam";

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

/** A cantilever balcony strip with its design (see cantilever.ts). */
export interface CantileverPlaced extends CantileverStrip {
  result: CantileverResult;
  /** Torsion of the edge beam the strip hangs off, at the column end (null if no beam line was found). */
  torsion: TorsionResult | null;
}

export interface LevelResult {
  /** Slab above storey `index`; the last level is the roof. */
  index: number;
  kind: "floor" | "roof";
  levelMm: number;
  slabThicknessMm: number;
  panels: PanelResult[];
  beamLines: BeamLinePlaced[];
  /** Balcony strips that cantilever from the first structural line (none when the plan has no such balcony). */
  cantilevers: CantileverPlaced[];
  util: number;
}

export interface MemberFailure {
  level: number;
  member: "slab" | "beam" | "column" | "footing" | "seismic" | "core";
  id: string;
  util: number;
  governs: string;
}

/**
 * The tallest building the structure engine designs (C3). Up to 7 storeys the special RC moment frame alone is used; at 8 storeys the dual
 * system (frame plus the lift-core shear wall, plan P2-2) is the default and passes on every scenario plan in
 * engineering-scenarios.audit.ts. From 9 storeys some plans fail drift in the middle storeys because a 150 mm lift core with 2 to 3 m sides
 * is too flexible; the stair core, boundary elements and a core raft are not modelled, so the screens say "not designed" above 8
 * instead of showing ratios.
 */
export const SUPPORTED_MAX_STOREYS = 8;

/** Overturning factor of safety used in the screen (common practice). */
export const OVERTURNING_FS = 1.5;

/** True when the structure engine designs a building of this many storeys. */
export const structureSupported = (storeys: number): boolean => storeys <= SUPPORTED_MAX_STOREYS;

export interface StructureResult {
  levels: LevelResult[];
  frame: FrameResult;
  failures: MemberFailure[];
  /** Worst demand/capacity ratio anywhere (never clamped). */
  util: number;
  ok: boolean;
  /** False above SUPPORTED_MAX_STOREYS: the numbers are indicative and the screens must not present them as a design. */
  supported: boolean;
  assumptions: Assumption[];
  /** The footings as they can be built: isolated pads, merged where pads would overlap. */
  foundation: FoundationResult;
  /** Wind on the lateral system (Sec 2.4), with its drift and its base shear against the seismic base shear. */
  wind: WindResult;
  /** Vertical irregularities (common screening limits, ASCE 7 Table 12.3-2 style): soft storey and mass. Information, not failures. */
  irregularities: Array<{ id: string; kind: "soft storey" | "mass"; storey: number; ratio: number }>;
}

interface Panel {
  px: number;
  py: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kinds: RoomKind[];
}

const TOL = 1;
/** Stair flights (150 mm waist and steps) weigh about this much more per m2 of plan than a flat slab of the same thickness. Assumption. */
export const STAIR_DEAD_KN_M2 = 3.0;

export { alphaF, tBeamInertia };

function panelsOf(geo: FloorGeometry, loadsGeo: FloorGeometry): Panel[] {
  const f = geo.fitted;
  const out: Panel[] = [];
  for (let px = 0; px + 1 < f.structuralX.length; px++)
    for (let py = 0; py + 1 < f.structuralY.length; py++) {
      const kinds = new Set<RoomKind>();
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

const lineKey = (orientation: "v" | "h", at: number) => `${orientation}${at}`;

function computeLevel(model: BuildingModel, k: number): Omit<LevelResult, "index" | "levelMm"> {
  const n = model.storeys.length;
  const roof = k === n - 1;
  const geo = model.storeys[k].geometry;
  const loadsGeo = roof ? geo : model.storeys[k + 1].geometry;
  const f = geo.fitted;
  const panels = panelsOf(geo, loadsGeo);
  const at = (px: number, py: number) => panels.find((p) => p.px === px && p.py === py);

  const liveBase = (p: Panel) => (roof ? 0 : Math.max(...p.kinds.map((kd) => liveLoadForKind(kd))));
  const wx = (p: Panel) => p.x1 - p.x0;
  const wy = (p: Panel) => p.y1 - p.y0;
  // la runs along x when the panel is no deeper than wide (squares too); its long edges are then the vertical ones.
  const xShort = (p: Panel) => wx(p) <= wy(p);
  const nbX = (p: Panel) => (at(p.px - 1, p.py) ? 1 : 0) + (at(p.px + 1, p.py) ? 1 : 0);
  const nbY = (p: Panel) => (at(p.px, p.py - 1) ? 1 : 0) + (at(p.px, p.py + 1) ? 1 : 0);

  /** The four edge beams of a panel: key, whether a neighbour lies across it, and the slab strip width across the beam. */
  const edges = (p: Panel) => {
    const e: Array<{ key: string; neighbour: boolean; strip: number }> = [];
    const side = (orientation: "v" | "h", pos: number, own: number, other: Panel | undefined) =>
      e.push({ key: lineKey(orientation, pos), neighbour: !!other, strip: own / 2 + (other ? (orientation === "v" ? wx(other) : wy(other)) / 2 : 0) });
    side("v", p.x0, wx(p), at(p.px - 1, p.py));
    side("v", p.x1, wx(p), at(p.px + 1, p.py));
    side("h", p.y0, wy(p), at(p.px, p.py - 1));
    side("h", p.y1, wy(p), at(p.px, p.py + 1));
    return e;
  };

  const sx = f.structuralX;
  const sy = f.structuralY;
  // Trial beams for the first pass: 250 wide, span / 12 deep (at least 350 mm), per line.
  const trial = new Map<string, BeamSection>();
  const trialFor = (orientation: "v" | "h", pos: number) => {
    const along = orientation === "v" ? f.yLines : f.xLines;
    const idx = orientation === "v" ? sy : sx;
    let longest = 0;
    for (let q = 0; q + 1 < idx.length; q++) longest = Math.max(longest, along[idx[q + 1]] - along[idx[q]]);
    trial.set(lineKey(orientation, pos), { bMm: 250, hMm: Math.max(350, Math.ceil(longest / 12 / 50) * 50) });
  };
  sx.forEach((g) => trialFor("v", f.xLines[g]));
  sy.forEach((g) => trialFor("h", f.yLines[g]));

  // Loads the plan does not show as slab: stair flights and steps on stair panels, and on the roof the stair cover, the lift
  // machine room and the water tank (model/roofEquipment.ts), spread over the roof panels they stand on in proportion to overlap.
  const overlapM2 = (p: Panel, r: { x0: number; y0: number; x1: number; y1: number }) =>
    (Math.max(0, Math.min(p.x1, r.x1) - Math.max(p.x0, r.x0)) * Math.max(0, Math.min(p.y1, r.y1) - Math.max(p.y0, r.y0))) / 1e6;
  const equipment = roof ? roofLoads(model) : [];
  // Walls that stand on the slab (not on a structural line) are spread over their panel; walls on a line load that beam instead.
  const structuralLines = new Set<string>([...f.structuralX.map((g) => lineKey("v", f.xLines[g])), ...f.structuralY.map((g) => lineKey("h", f.yLines[g]))]);
  const slabWalls = roof ? new Map<string, number>() : slabWallKn(model.storeys[k + 1].geometry.walls.filter((w) => !w.railing), structuralLines, panels, model.storeys[k + 1].heightMm - 125);
  const extraDead = (p: Panel): number => {
    let q = p.kinds.includes("stair") ? STAIR_DEAD_KN_M2 : 0;
    const panelAreaM2 = ((p.x1 - p.x0) * (p.y1 - p.y0)) / 1e6;
    if (panelAreaM2 > 0) q += (slabWalls.get(`${p.px},${p.py}`) ?? 0) / panelAreaM2;
    const panelM2 = ((p.x1 - p.x0) * (p.y1 - p.y0)) / 1e6;
    for (const e of equipment) {
      const coverM2 = ((e.rect.x1 - e.rect.x0) * (e.rect.y1 - e.rect.y0)) / 1e6;
      if (coverM2 > 0 && panelM2 > 0) q += (e.kn * overlapM2(p, e.rect)) / coverM2 / panelM2;
    }
    return q;
  };

  const slabIn = (p: Panel, sections: Map<string, BeamSection>, thicknessMm?: number): SlabInput => {
    const hf = thicknessMm ?? 150;
    const alphas = edges(p).map((ed) => ({
      a: alphaF(sections.get(ed.key) ?? { bMm: 250, hMm: 450 }, hf, ed.neighbour ? 2 : 1, ed.strip),
      neighbour: ed.neighbour,
    }));
    const alphaFm = alphas.reduce((a, c) => a + c.a, 0) / alphas.length;
    const weak = alphas.some((c) => !c.neighbour && c.a < 0.8);
    const xs = xShort(p);
    const cx = nbX(p) as Continuity;
    const cy = nbY(p) as Continuity;
    return {
      shortM: Math.min(wx(p), wy(p)) / 1000,
      longM: Math.max(wx(p), wy(p)) / 1000,
      // The strip across the short span ends on the long edges: left and right when la runs along x.
      contLongEdges: xs ? cx : cy,
      contShortEdges: xs ? cy : cx,
      deadExtraKnM2: (roof ? UNIT_WEIGHTS.roofFinishKnM2 : UNIT_WEIGHTS.floorFinishKnM2) + extraDead(p),
      liveBaseKnM2: liveBase(p),
      livePartitionKnM2: roof ? 0 : partitionAllowanceKnM2(),
      roofLiveKnM2: roof ? roofLiveKnM2() : 0,
      alphaFm,
      weakEdgeBeam: weak,
      thicknessMm,
    };
  };

  // Walls that sit on this level's beams: the storey above (floors) or the parapet (roof).
  const wallGeo = roof ? geo : loadsGeo;
  const walls = wallGeo.walls.filter((w) => !w.railing && (roof ? w.exterior : true)); // a balcony railing is not a masonry wall load (its ~1 kN/m is within the partition allowance)
  const wallHeightMm = roof ? model.roof.parapetMm : model.storeys[k + 1].heightMm;

  const strips = cantileverStrips(loadsGeo);
  const buildLines = (slabs: Array<{ p: Panel; r: SlabResult }>, slabMm: number, cants: CantileverPlaced[]): BeamLinePlaced[] => {
    const lines: BeamLinePlaced[] = [];
    const lineFor = (orientation: "v" | "h", lineIdx: number): BeamLinePlaced | null => {
      const vertical = orientation === "v";
      const grid = vertical ? sx : sy;
      const along = vertical ? sy : sx;
      const atPos = vertical ? f.xLines[grid[lineIdx]] : f.yLines[grid[lineIdx]];
      const alongLines = vertical ? f.yLines : f.xLines;
      const spans: BeamSpanInput[] = [];
      const stations: number[] = [alongLines[along[0]]];
      for (let q = 0; q + 1 < along.length; q++) {
        const from = alongLines[along[q]];
        const to = alongLines[along[q + 1]];
        const len = to - from;
        const side = (across: number) => {
          const px = vertical ? across : q;
          const py = vertical ? q : across;
          return slabs.find(({ p }) => p.px === px && p.py === py);
        };
        let dead = 0;
        let liveTable = 0;
        let livePart = 0;
        let area = 0;
        let base = 0;
        for (const sd of [side(lineIdx - 1), side(lineIdx)]) {
          if (!sd) continue;
          const { p, r } = sd;
          // Table 6.6.11: a long-edge beam carries w_a la / 2 per metre, a short-edge beam w_b lb / 2.
          const longOrientation: "v" | "h" = xShort(p) ? "v" : "h";
          const lineLoad = orientation === longOrientation ? (r.shareShort * r.short.spanM) / 2 : r.long ? (r.shareLong * r.long.spanM) / 2 : 0;
          dead += lineLoad * r.dKnM2;
          liveTable += lineLoad * (r.lBaseKnM2 + r.lRoofKnM2);
          livePart += lineLoad * r.lPartitionKnM2;
          area += lineLoad * (len / 1000);
          base = Math.max(base, r.lBaseKnM2);
        }
        // The cantilever strip hangs off this beam: its reaction is a line load along the strip's width.
        if (orientation === "h")
          for (const c of cants)
            if (Math.abs(c.y1 - atPos) <= TOL && Math.min(c.x1, to) - Math.max(c.x0, from) > 0) {
              dead += c.result.beamDeadKnM;
              liveTable += c.result.beamLiveKnM;
              area += ((c.y1 - c.y0) / 1000) * (len / 1000);
              base = Math.max(base, c.result.liveKnM2);
            }
        let wallLen = 0;
        let wallMass = 0;
        for (const w of walls) {
          if (w.orientation !== orientation || Math.abs(w.at - atPos) > TOL) continue;
          const ov = Math.min(w.to, to) - Math.max(w.from, from);
          if (ov > 0) {
            wallLen += ov;
            wallMass += ov * w.thicknessMm;
          }
        }
        spans.push({
          lengthMm: len,
          slabDead: dead,
          slabLiveTable: liveTable,
          slabLivePartition: livePart,
          liveBaseKnM2: base,
          tributaryAreaM2: area,
          wallThicknessMm: wallLen > 0 ? wallMass / wallLen : null,
          wallShare: Math.min(wallLen / len, 1),
        });
        stations.push(to);
      }
      if (!spans.length || spans.every((s) => s.slabDead === 0 && !s.wallThicknessMm)) return null;
      return { orientation, at: atPos, stations, result: sizeBeamLine({ spans, wallHeightMm, slabThicknessMm: slabMm, reduceLive: !roof }) };
    };
    for (let i = 0; i < sx.length; i++) {
      const b = lineFor("v", i);
      if (b) lines.push(b);
    }
    for (let i = 0; i < sy.length; i++) {
      const b = lineFor("h", i);
      if (b) lines.push(b);
    }
    return lines;
  };

  // Slab thickness depends on beam stiffness and beam size on slab load: iterate until neither changes.
  let sections = trial;
  let slabMm = 125;
  let slabs: Array<{ p: Panel; r: SlabResult }> = [];
  let beamLines: BeamLinePlaced[] = [];
  let cants: CantileverPlaced[] = [];
  for (let pass = 0; pass < 6; pass++) {
    const first = panels.map((p) => designSlab(slabIn(p, sections)));
    // A cantilever cannot be thinner than L/10; the floor is one slab, so the whole level takes that thickness.
    slabMm = Math.max(125, slabMm, ...first.map((r) => r.thicknessMm), ...strips.map((c) => cantileverMinThicknessMm(c.y1 - c.y0)));
    slabs = panels.map((p) => ({ p, r: designSlab(slabIn(p, sections, slabMm)) }));
    cants = strips.map((c) => ({ ...c, result: designCantilever({ lengthMm: c.y1 - c.y0, thicknessMm: slabMm, roof, parapetMm: model.roof.parapetMm }), torsion: null }));
    beamLines = buildLines(slabs, slabMm, cants);
    const next = new Map(beamLines.map((b) => [lineKey(b.orientation, b.at), b.result.section]));
    for (const [key, sec] of trial) if (!next.has(key)) next.set(key, sec);
    const same = [...next].every(([key, sec]) => sections.get(key)?.hMm === sec.hMm && sections.get(key)?.bMm === sec.bMm);
    sections = next;
    if (same) break;
  }
  // Equilibrium torsion of the edge beam under each cantilever strip (torsion.ts).
  cants = cants.map((c) => {
    const line = beamLines.find((b) => b.orientation === "h" && Math.abs(b.at - c.y1) <= TOL);
    if (!line) return c;
    const vu = Math.max(...line.result.spans.map((sp) => sp.vuKn));
    return { ...c, torsion: edgeBeamTorsion({ muKnMPerM: c.result.muKnMPerM, stripWidthMm: Math.min(c.x1 - c.x0, Math.max(...line.result.spans.map((sp) => sp.lengthMm))), vuKn: vu, bMm: line.result.section.bMm, hMm: line.result.section.hMm }) };
  });
  const panelResults: PanelResult[] = slabs.map(({ p, r }) => ({ px: p.px, py: p.py, x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, result: r }));
  const util = Math.max(0, ...panelResults.map((p) => p.result.util), ...beamLines.map((b) => b.result.util), ...cants.map((c) => Math.max(c.result.util, c.torsion?.util ?? 0)));
  return { kind: roof ? "roof" : "floor", slabThicknessMm: slabMm, panels: panelResults, beamLines, cantilevers: cants, util };
}

const SITE_CLASSES: readonly string[] = ["SA", "SB", "SC", "SD", "SE"];

// Keyed by the model object itself (a model is never edited after it is built; tests that edit one build another), then by the options.
const analysisCache = new WeakMap<BuildingModel, Map<string, StructureResult>>();

/** Drop remembered results (tests and audits). */
export function clearStructureCache(): void {
  /* a WeakMap has no clear: nothing to do, kept so callers need not know */
}

/**
 * The structure of a building. The analysis is deterministic in the model and the options, so a repeat call on the same model (another
 * screen, an export) returns the remembered result instead of running it again (70 to 250 ms per run). Callers must not change the result.
 */
export function analyzeStructure(model: BuildingModel, frameOptions: FrameOptions = {}): StructureResult {
  const key = JSON.stringify(frameOptions);
  let per = analysisCache.get(model);
  if (!per) analysisCache.set(model, (per = new Map()));
  const hit = per.get(key);
  if (hit) return hit;
  const result = analyzeStructureUncached(model, frameOptions);
  per.set(key, result);
  return result;
}

export function analyzeStructureUncached(model: BuildingModel, frameOptions: FrameOptions = {}): StructureResult {
  // Say what is wrong with an input instead of failing deep inside the seismic tables.
  if (frameOptions.siteClass !== undefined && !SITE_CLASSES.includes(frameOptions.siteClass))
    throw new RangeError(`Unknown site class "${frameOptions.siteClass}": use one of ${SITE_CLASSES.join(", ")} (class SF needs a site-specific study and is not supported).`);
  if (frameOptions.allowableBearingKpa !== undefined && !(Number.isFinite(frameOptions.allowableBearingKpa) && frameOptions.allowableBearingKpa >= 20 && frameOptions.allowableBearingKpa <= 1000))
    throw new RangeError(`Allowable bearing must be between 20 and 1000 kPa, got ${frameOptions.allowableBearingKpa}.`);
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
    for (const c of lv.cantilevers) if (c.result.util > 1) failures.push({ level: lv.index, member: "slab", id: `C-${c.id}`, util: c.result.util, governs: `cantilever ${c.result.governs}` });
    for (const c of lv.cantilevers) if (c.torsion && c.torsion.util > 1) failures.push({ level: lv.index, member: "beam", id: `B-h${Math.round(c.y1)}-torsion`, util: c.torsion.util, governs: "torsion" });
    for (const b of lv.beamLines)
      if (b.result.util > 1) {
        const worst = b.result.spans.reduce((a, c) => (c.util > a.util ? c : a));
        failures.push({ level: lv.index, member: "beam", id: `B-${b.orientation}${b.at}`, util: b.result.util, governs: worst.governs });
      }
  }
  const frame = analyzeFrame(model, levels, frameOptions);
  failures.push(...frame.failures);
  failures.sort((a, b) => b.util - a.util);
  const util = Math.max(0, ...levels.map((l) => l.util), frame.util);
  const foundation = planFoundation(frame.columns, n);
  // wind (Sec 2.4): storey stiffness from the seismic storey shears and elastic drifts; plan from the footing extents
  const stiff = (s: typeof frame.seismicX) => s.storeys.map((st) => (st.elasticMm > 0 ? st.shearKn / st.elasticMm : 0));
  const wind = analyseWind({
    storeys: n,
    storeyHeightMm: model.input.floorToFloorMm,
    planXMm: Math.max(...foundation.footings.map((f) => f.x1)) - Math.min(...foundation.footings.map((f) => f.x0)),
    planYMm: Math.max(...foundation.footings.map((f) => f.y1)) - Math.min(...foundation.footings.map((f) => f.y0)),
    stiffnessXKnPerMm: stiff(frame.seismicX),
    stiffnessYKnPerMm: stiff(frame.seismicY),
  });
  // boundary elements (Sec 8.3.6.6, stress screen): a core edge above 0.2 fc' needs boundary elements, not yet detailed here
  if (frame.core) for (const [dir, c] of [["x", frame.core.x], ["y", frame.core.y]] as const)
    if (c.boundaryElementRequired) failures.push({ level: 0, member: "core", id: `boundary-element-${dir}`, util: c.boundaryStressMpa / (0.2 * MATERIALS.fcMPa), governs: "core boundary element required (Sec 8.3.6.6), not yet detailed" });
  const irregularities: StructureResult["irregularities"] = [];
  for (const [dir, seis] of [["x", frame.seismicX], ["y", frame.seismicY]] as const) {
    const k = seis.storeys.map((s) => (s.elasticMm > 0 ? s.shearKn / s.elasticMm : 0));
    for (let i = 0; i + 1 < n; i++) {
      const above3 = k.slice(i + 1, i + 4);
      const avg = above3.reduce((a, b) => a + b, 0) / above3.length;
      if (k[i] < 0.7 * k[i + 1] || k[i] < 0.8 * avg) irregularities.push({ id: `soft-storey-${dir}/S${i}`, kind: "soft storey", storey: i, ratio: k[i + 1] > 0 ? k[i] / k[i + 1] : 0 });
    }
    const w = seis.levelWeightsKn;
    for (let i = 0; i < n; i++) {
      const neighbours = [w[i - 1], w[i + 1]].filter((x): x is number => x !== undefined && x > 0);
      const worst = neighbours.length ? Math.max(...neighbours.map((x) => w[i] / x)) : 0;
      if (worst > 1.5) irregularities.push({ id: `mass-${dir}/S${i}`, kind: "mass", storey: i, ratio: worst });
    }
  }
  for (const [dir, w, seis] of [["x", wind.x, frame.seismicX], ["y", wind.y, frame.seismicY]] as const) {
    w.driftUtil.forEach((u, i) => {
      if (u > 1) failures.push({ level: i, member: "seismic", id: `wind-drift-${dir}/S${i}`, util: u, governs: "wind drift h/500 (Sec 2.4 screen)" });
    });
    // the frame is designed for seismic forces only: where wind base shear is larger, the frame is not checked for wind
    if (w.baseShearKn > seis.baseShearKn) failures.push({ level: -1, member: "seismic", id: `wind-governs-${dir}`, util: w.baseShearKn / seis.baseShearKn, governs: "wind base shear exceeds seismic: frame not designed for wind" });
  }
  // overturning (screen): resisting moment 0.9 W x half the plan length over the seismic overturning moment at the base, FS 1.5
  const fx0 = Math.min(...foundation.footings.map((f) => f.x0));
  const fx1 = Math.max(...foundation.footings.map((f) => f.x1));
  const fy0 = Math.min(...foundation.footings.map((f) => f.y0));
  const fy1 = Math.max(...foundation.footings.map((f) => f.y1));
  for (const [dir, seis, span] of [["x", frame.seismicX, fx1 - fx0], ["y", frame.seismicY, fy1 - fy0]] as const) {
    const mot = Math.max(0, ...seis.overturningKnM);
    if (mot <= 0) continue;
    const resisting = (0.9 * seis.weightKn * (span / 1000)) / 2;
    const util = (OVERTURNING_FS * mot) / resisting;
    if (util > 1) failures.push({ level: -1, member: "footing", id: `overturning-${dir}`, util, governs: `overturning factor of safety ${OVERTURNING_FS} (Sec 2.5.7 screen)` });
  }
  for (const tie of foundation.ties)
    if (tie.util > 1) failures.push({ level: -1, member: "footing", id: `tie-${tie.a}-${tie.b}`, util: tie.util, governs: "tie beam tension (10 % of column load)" });
  for (const fo of foundation.footings)
    if (fo.mergedCheck && fo.mergedCheck.util > 1) failures.push({ level: 0, member: "footing", id: fo.id, util: fo.mergedCheck.util, governs: `merged footing ${fo.mergedCheck.governs}` });
  failures.sort((a, b) => b.util - a.util);
  return { levels, frame, failures, util: Math.max(util, ...foundation.footings.map((f) => f.mergedCheck?.util ?? 0)), ok: failures.length === 0, supported: structureSupported(n), assumptions: frame.core ? [...ASSUMPTIONS, ...CORE_ASSUMPTIONS] : ASSUMPTIONS, foundation, wind, irregularities };
}
