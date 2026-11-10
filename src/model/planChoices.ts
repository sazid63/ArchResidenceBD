/**
 * Which library plans fit a plot, and how to describe the plot (BUILD_PLAN.md §5.3, ticket M2-4).
 * Pure: the setup screen and the tests both call this.
 */

import { fitPlan, type Envelope } from "../plans/fit";
import { PLAN_LIBRARY, verandahVariants } from "../plans/library";
import type { FitRejection, FitResult, PlanDefinition } from "../plans/types";
import { rajukSetbacks } from "../rules/setbacks";
import { check } from "../rules/check";
import { deriveBuilding, type Setbacks, PLOT_SIDE_LIMITS_MM } from "./building";
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

/** The buildable rectangle: the plot less the RAJUK 2008 setbacks (ground-up to 10 storeys; taller buildings need more). */
export function envelopeFor(frontageM: number, depthM: number, setbacks?: Setbacks, storeys = 1): Envelope {
  // Same integer-mm area the building model uses, so both pick the same setback row at a band edge.
  const sb = setbacks ?? rajukSetbacks((mToMm(frontageM) * mToMm(depthM)) / 1e6, storeys).setbacksMm;
  return {
    widthMm: mToMm(frontageM) - sb.left - sb.right,
    depthMm: mToMm(depthM) - sb.front - sb.rear,
  };
}

/** The RAJUK ground-coverage result for a plan that fits: a plan can fit inside the setbacks and still cover too much of the plot. */
export interface CoverageResult {
  status: "pass" | "fail" | "not_checked";
  actualPercent?: number;
  maxPercent?: number;
}

export interface PlanChoice {
  plan: PlanDefinition;
  fit: FitResult;
  /** Only for a plan that fits, and only when the road width is known (the coverage table needs it). */
  coverage: CoverageResult | null;
}

export interface ChoiceOptions {
  /** Only plans with this many dwellings per floor. */
  unitsPerFloor?: number;
  mirror?: boolean;
  setbacks?: Setbacks;
  /** Storeys including ground; above 10 the larger RAJUK setbacks apply. Default 1. */
  storeys?: number;
  /** Width of the access road in metres; with it the picker can say which plans break the ground-coverage limit. */
  roadWidthM?: number;
}

function coverageOf(frontageM: number, depthM: number, plan: PlanDefinition, opts: ChoiceOptions): CoverageResult | null {
  if (opts.roadWidthM === undefined) return null;
  const built = deriveBuilding({ plotWidthMm: mToMm(frontageM), plotDepthMm: mToMm(depthM), storeys: opts.storeys ?? 1, planId: plan.id, mirror: opts.mirror, ...(opts.setbacks ? { setbacksMm: opts.setbacks } : {}) });
  if (!built.ok) return null;
  const mgc = check(built.model, { roadWidthM: opts.roadWidthM, skipParking: true }).find((r) => r.ruleId === "rajuk.mgc");
  if (!mgc || mgc.status === "not_checked" || typeof mgc.actual?.value !== "number" || typeof mgc.expected?.value !== "number") return { status: "not_checked" };
  return { status: mgc.status === "pass" ? "pass" : "fail", actualPercent: mgc.actual.value, maxPercent: mgc.expected.value };
}

/** Every library plan (optionally one unit count) with the result of fitting it to the plot. Plans that fit and keep to the coverage limit first, then plans that fit but exceed it, then the rest. */
export function planChoices(frontageM: number, depthM: number, opts: ChoiceOptions = {}): PlanChoice[] {
  const sideOk = (m: number) => Number.isFinite(m) && mToMm(m) >= PLOT_SIDE_LIMITS_MM.min && mToMm(m) <= PLOT_SIDE_LIMITS_MM.max;
  if (!sideOk(frontageM) || !sideOk(depthM)) {
    // An impossible plot fits nothing; say so instead of failing inside the setback lookup.
    const why = { code: "invalid_plan" as const, message: { en: "Plot sides must be between 3 m and 300 m.", bn: "প্লটের পাশ ৩ মিটার থেকে ৩০০ মিটারের মধ্যে হতে হবে।" } };
    return [...PLAN_LIBRARY, ...verandahVariants()].filter((p) => opts.unitsPerFloor === undefined || p.unitsPerFloor === opts.unitsPerFloor).map((plan) => ({ plan, fit: { ok: false as const, reasons: [why] }, coverage: null }));
  }
  const env = envelopeFor(frontageM, depthM, opts.setbacks, opts.storeys);
  // Every plan, then the same plans with a front verandah where the front row belongs to one flat (B2).
  const list = [...PLAN_LIBRARY, ...verandahVariants()].filter((p) => opts.unitsPerFloor === undefined || p.unitsPerFloor === opts.unitsPerFloor);
  const choices: PlanChoice[] = list.map((plan) => {
    const fit = fitPlan(plan, env, { mirror: opts.mirror });
    return { plan, fit, coverage: fit.ok ? coverageOf(frontageM, depthM, plan, opts) : null };
  });
  const rank = (c: PlanChoice) => (!c.fit.ok ? 2 : c.coverage?.status === "fail" ? 1 : 0);
  return choices.sort((a, b) => rank(a) - rank(b));
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
