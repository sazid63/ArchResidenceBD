/**
 * Which library plans fit a plot, and how to describe the plot (BUILD_PLAN.md §5.3, ticket M2-4).
 * Pure: the setup screen and the tests both call this.
 */

import { fitPlan, type Envelope } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import type { FitRejection, FitResult, PlanDefinition } from "../plans/types";
import { DEFAULT_SETBACKS_MM, type Setbacks } from "./building";
import { sqmToLandArea } from "./units";

export const FEET_TO_M = 0.3048;

export interface PlotShape {
  frontageM: number;
  depthM: number;
  roadWidthM: number;
  roadSide: "north" | "south" | "east" | "west";
  cornerPlot: boolean;
}

/** Whole millimetres from metres (plot sizes are entered in m or ft, kept in integer mm in the model). */
export const mToMm = (m: number) => Math.round(m * 1000);

export interface PlotSummary {
  areaSqm: number;
  katha: number;
  sqft: number;
}

export function summarisePlot(frontageM: number, depthM: number): PlotSummary {
  const areaSqm = frontageM * depthM;
  return {
    areaSqm: Math.round(areaSqm * 100) / 100,
    katha: Math.round(sqmToLandArea(areaSqm, "katha") * 100) / 100,
    sqft: Math.round(areaSqm / (FEET_TO_M * FEET_TO_M)),
  };
}

/** The buildable rectangle: the plot less the setbacks (assumption values until M3-2 brings RAJUK's). */
export function envelopeFor(frontageM: number, depthM: number, setbacks: Setbacks = DEFAULT_SETBACKS_MM): Envelope {
  return {
    widthMm: mToMm(frontageM) - setbacks.left - setbacks.right,
    depthMm: mToMm(depthM) - setbacks.front - setbacks.rear,
  };
}

export interface PlanChoice {
  plan: PlanDefinition;
  fit: FitResult;
}

export interface ChoiceOptions {
  /** Only plans with this many dwellings per floor. */
  unitsPerFloor?: number;
  mirror?: boolean;
  setbacks?: Setbacks;
}

/** Every library plan (optionally one unit count) with the result of fitting it to the plot. Fitting plans first. */
export function planChoices(frontageM: number, depthM: number, opts: ChoiceOptions = {}): PlanChoice[] {
  const env = envelopeFor(frontageM, depthM, opts.setbacks);
  const list = PLAN_LIBRARY.filter((p) => opts.unitsPerFloor === undefined || p.unitsPerFloor === opts.unitsPerFloor);
  const choices = list.map((plan) => ({ plan, fit: fitPlan(plan, env, { mirror: opts.mirror }) }));
  return choices.sort((a, b) => Number(b.fit.ok) - Number(a.fit.ok));
}

/** Dwellings-per-floor counts the library has plans for, ascending. */
export function availableUnitCounts(): number[] {
  return [...new Set(PLAN_LIBRARY.map((p) => p.unitsPerFloor))].sort((a, b) => a - b);
}

/** One line saying why a plan was turned away, in the app language. */
export function rejectionText(reasons: FitRejection[], lang: "en" | "bn"): string {
  return reasons.map((r) => r.message[lang]).join(" ");
}

/** Problems with the plot numbers themselves, before any plan is tried. */
export function plotProblems(s: Partial<PlotShape>): string[] {
  const out: string[] = [];
  const pos = (x: number | undefined) => typeof x === "number" && Number.isFinite(x) && x > 0;
  if (!pos(s.frontageM)) out.push("frontage");
  if (!pos(s.depthM)) out.push("depth");
  if (!pos(s.roadWidthM)) out.push("roadWidth");
  return out;
}
