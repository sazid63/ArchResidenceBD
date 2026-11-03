/**
 * Screening-level section sizing (v2.4.3).
 *
 * Picks the smallest column and beam section that passes the repo's own structural checks
 * (structuralEngine: M25/Fe415, column utilisation <= 0.80, beam moment utilisation <= 0.85,
 * deflection <= L/360) for the building the generator actually draws: a fixed 4 x 3 column grid
 * under the real footprint. The previous sweep divided load by up to 20 columns for large plots
 * while the model has 12, so its "validated" sizes under-estimated column load.
 *
 * ASSUMPTIONS carried over from scripts/audits/structural-sweep.ts and NOT verified against BNBC
 * load tables: 24 kN/m2 factored floor load per storey (DL + LL), 70 % of the footprint loaded
 * per storey is NOT applied here (the full footprint is, a conservative choice), a 14 m wall
 * line load on the beam, and first-order moments of 12 % / 8 % of the axial load. This is a
 * screening aid for the 3D model and BOQ, not a structural design: a licensed engineer must design.
 */

import { analyzeBeam, analyzeColumn, CONCRETE_GRADES, STEEL_GRADES, type RectSection } from "./structuralEngine";

const CONCRETE = CONCRETE_GRADES[25];
const STEEL = STEEL_GRADES[415];

export interface SectionRecommendation {
  colsX: number;
  colsY: number;
  maxSpanM: number;
  colSizeMm: number;
  beamDepthMm: number;
  beamWidthMm: number;
  colUtilization: number;
  beamUtilization: number;
  /** false when even the largest candidate fails; the largest candidate is returned. */
  adequate: boolean;
  loadPerColumnKn: number;
}

const COL_CANDIDATES: Array<{ size: number; dia: number; bars: number }> = [
  { size: 250, dia: 12, bars: 8 },
  { size: 300, dia: 16, bars: 10 },
  { size: 350, dia: 20, bars: 12 },
  { size: 400, dia: 20, bars: 12 },
  { size: 450, dia: 25, bars: 12 },
  { size: 500, dia: 25, bars: 12 },
];
/** Beam depth is capped: a 3.0 m storey leaves ~2.3 m of wall under a 600 mm beam (door 2.1 m + 150 mm lintel). */
const MAX_BEAM_DEPTH = 600;
const BEAM_DEPTHS: Array<{ depth: number; dia: number; bars: number }> = [
  { depth: 450, dia: 16, bars: 6 },
  { depth: 500, dia: 16, bars: 6 },
  { depth: 550, dia: 16, bars: 6 },
  { depth: 600, dia: 20, bars: 6 },
];
const BEAM_WIDTHS = [250, 300, 350];

/** Same footprint rule as generateBuildingMesh (setbacks 1.0 / 1.5 / 2.0 m, ~0.9 : 1.1 plot). */
export function footprintMm(plotSqm: number): { width: number; length: number } {
  const side = Math.sqrt(plotSqm);
  return {
    width: Math.max(7000, Math.round(side * 0.9 * 1000) - 2000),
    length: Math.max(8000, Math.round(side * 1.1 * 1000) - 3500),
  };
}

const cache = new Map<string, SectionRecommendation>();

function gridCandidates(): Array<{ cx: number; cy: number }> {
  const g: Array<{ cx: number; cy: number }> = [];
  for (let cx = 4; cx <= 7; cx++) for (let cy = 3; cy <= 7; cy++) g.push({ cx, cy });
  return g.sort((a, b) => a.cx * a.cy - b.cx * b.cy || Math.abs(a.cx - a.cy) - Math.abs(b.cx - b.cy));
}

export function recommendSections(stories: number, plotSqm: number): SectionRecommendation {
  const key = `${stories}|${Math.round(plotSqm)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const fp = footprintMm(plotSqm);
  const floorAreaM2 = (fp.width / 1000) * (fp.length / 1000);
  const combos = BEAM_DEPTHS.flatMap((d) => BEAM_WIDTHS.map((w) => ({ ...d, width: w }))).sort((x, y) => x.width * x.depth - y.width * y.depth);

  let best: SectionRecommendation | null = null;
  for (const g of gridCandidates()) {
    const spanM = Math.max(fp.width / (g.cx - 1), fp.length / (g.cy - 1)) / 1000;
    const loadPerColumn = (floorAreaM2 * 24 * stories) / (g.cx * g.cy);

    const runBeam = (c: (typeof combos)[number]) =>
      analyzeBeam(
        { width: c.width, depth: c.depth, cover: 40, mainBarDia: c.dia, numMainBars: c.bars, linkDia: 8 } as RectSection,
        spanM,
        { selfWeight: (c.width / 1000) * (c.depth / 1000) * 24, superimposedDead: 2.0, liveLoad: 2.5, wallLoad: 1.2 * 3.0 * 14 },
        CONCRETE, STEEL,
      );
    const beam = combos.find((c) => { const r = runBeam(c); return r.utilizationMoment <= 0.85 && r.maxDeflection <= r.allowableDeflection; });

    const colRun = (c: (typeof COL_CANDIDATES)[number]) =>
      analyzeColumn(
        { width: c.size, depth: c.size, cover: 40, mainBarDia: c.dia, numMainBars: c.bars, linkDia: 8 } as RectSection,
        { axialLoad: loadPerColumn, momentMajor: loadPerColumn * 0.12, momentMinor: loadPerColumn * 0.08, unbracedLength: 3.0 },
        CONCRETE, STEEL,
      );
    const col = COL_CANDIDATES.find((c) => colRun(c).utilization <= 0.8);

    const colUsed = col ?? COL_CANDIDATES[COL_CANDIDATES.length - 1];
    const beamUsed = beam ?? combos[combos.length - 1];
    const rec: SectionRecommendation = {
      colsX: g.cx, colsY: g.cy, maxSpanM: spanM,
      colSizeMm: colUsed.size,
      beamDepthMm: beamUsed.depth,
      beamWidthMm: beamUsed.width,
      colUtilization: colRun(colUsed).utilization,
      beamUtilization: runBeam(beamUsed).utilizationMoment,
      adequate: !!col && !!beam,
      loadPerColumnKn: loadPerColumn,
    };
    best = rec;
    if (rec.adequate) break;
  }
  cache.set(key, best!);
  return best!;
}
