/**
 * Stock-bar selection: only the diameters in the pack (8, 10, 12, 16, 20, 22, 25, 28, 32 mm) are ever used.
 * Pure functions; areas in mm2, lengths in mm.
 */

import { reinforcementPack } from "../rules/bnbcStructure";
import { DESIGN } from "./materials";

export const STOCK_BARS: number[] = reinforcementPack().stockBarsMm;
export const isStockBar = (d: number): boolean => STOCK_BARS.includes(d);

export const barArea = (dia: number): number => (Math.PI * dia * dia) / 4;

/** kg per metre of bar: area x 7850 kg/m3 (Table 6.2.1 gives steel 77.0 kN/m3). */
export const unitWeightKgM = (dia: number): number => (barArea(dia) * 7850) / 1e6;

/** Clear spacing between parallel bars: at least the bar diameter and 25 mm (ACI 318 practice; Sec 8.1.6 not transcribed). */
export const minClearSpacing = (dia: number): number => Math.max(25, dia);

/** How many bars of `dia` fit in one layer of a member `widthMm` wide with the given cover and link diameter. */
export function layerCapacity(widthMm: number, dia: number, coverMm: number, linkMm: number): number {
  const s = minClearSpacing(dia);
  return Math.max(Math.floor((widthMm - 2 * (coverMm + linkMm) + s) / (dia + s)), 0);
}

export interface BarPick {
  dia: number;
  n: number;
  layers: number;
  areaMm2: number;
  /** False when no stock bar fits the required steel in the allowed layers (the largest bar is returned and the member must grow). */
  fits: boolean;
}

export interface BeamBarOptions {
  dias?: number[];
  minN?: number;
  /** Bars already in the layer (continuous hangers), counted against the capacity. */
  occupied?: number;
  maxLayers?: number;
  coverMm?: number;
  linkMm?: number;
}

/** Beam bars for `asReq` mm2: scanning from the smallest diameter, a bigger bar replaces the pick only when it saves 2 % of the steel; at most two layers. */
export function pickBeamBars(asReq: number, widthMm: number, o: BeamBarOptions = {}): BarPick {
  const dias = o.dias ?? [12, 16, 20, 22, 25, 28, 32];
  const minN = o.minN ?? 2;
  const occupied = o.occupied ?? 0;
  const layersMax = o.maxLayers ?? 2;
  const cover = o.coverMm ?? DESIGN.coverBeamMm;
  const link = o.linkMm ?? DESIGN.stirrupMm;
  let best: BarPick | null = null;
  for (const dia of dias) {
    if (!Number.isFinite(asReq)) break;
    const cap = layerCapacity(widthMm, dia, cover, link);
    const nMax = layersMax * cap - occupied;
    const n = Math.max(minN, Math.ceil(asReq / barArea(dia)));
    if (n > nMax || cap === 0) continue;
    const cand: BarPick = { dia, n, layers: n + occupied > cap ? 2 : 1, areaMm2: n * barArea(dia), fits: true };
    if (!best || cand.areaMm2 < best.areaMm2 * 0.98) best = cand; // smaller bars win unless a bigger bar saves at least 2 % steel
  }
  if (best) return best;
  const dia = dias[dias.length - 1];
  const cap = layerCapacity(widthMm, dia, cover, link);
  const n = Number.isFinite(asReq) ? Math.max(minN, Math.ceil(asReq / barArea(dia))) : Math.max(layersMax * cap - occupied, minN);
  return { dia, n, layers: layersMax, areaMm2: n * barArea(dia), fits: false };
}

/** Column bars: an even number of at least four bars of 16 mm or larger around the perimeter; smaller bars win unless a bigger bar saves 2 % of the steel. */
export function pickColumnBars(astMm2: number, bxMm: number, byMm: number, coverMm: number = DESIGN.coverBeamMm, tieMm = 10): BarPick {
  const dias = STOCK_BARS.filter((d) => d >= 16);
  let best: BarPick | null = null;
  for (const dia of dias) {
    const nx = Math.max(layerCapacity(bxMm, dia, coverMm, tieMm), 2);
    const ny = Math.max(layerCapacity(byMm, dia, coverMm, tieMm), 2);
    const nMax = 2 * (nx + ny) - 4;
    let n = Math.max(4, Math.ceil(astMm2 / barArea(dia)));
    if (n % 2) n += 1;
    if (n > nMax) continue;
    const cand: BarPick = { dia, n, layers: 1, areaMm2: n * barArea(dia), fits: true };
    if (!best || cand.areaMm2 < best.areaMm2 * 0.98) best = cand; // smaller bars win unless a bigger bar saves at least 2 % steel
  }
  if (best) return best;
  const dia = dias[dias.length - 1];
  let n = Math.max(4, Math.ceil(astMm2 / barArea(dia)));
  if (n % 2) n += 1;
  return { dia, n, layers: 1, areaMm2: n * barArea(dia), fits: false };
}

export interface SlabBarPick {
  dia: number;
  spacingMm: number;
  /** Steel per metre width provided, mm2/m. */
  areaPerM: number;
  fits: boolean;
}

/** Slab or footing mat bars at a spacing in whole 25 mm steps from 100 mm, not above `maxSpacingMm`. */
export function pickMatBars(asPerM: number, maxSpacingMm: number, dias: number[] = [8, 10, 12, 16]): SlabBarPick {
  for (const dia of dias) {
    if (!Number.isFinite(asPerM)) break;
    const need = Math.floor(((1000 * barArea(dia)) / Math.max(asPerM, 1e-9)) / 25) * 25;
    const spacing = Math.min(need, maxSpacingMm);
    if (spacing >= 100) return { dia, spacingMm: spacing, areaPerM: (1000 * barArea(dia)) / spacing, fits: true };
  }
  const dia = dias[dias.length - 1];
  return { dia, spacingMm: 100, areaPerM: (1000 * barArea(dia)) / 100, fits: false };
}
