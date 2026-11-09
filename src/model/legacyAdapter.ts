/**
 * Adapter between the v3 `ProjectSpec` (the only thing stored) and the project shape the screens
 * still read (`BuildingProject`, M6-2). The screens keep their code; the data lives in the v3 store.
 *
 *  - `specToLegacy` builds the screens' view from a spec.
 *  - `applyLegacy` writes a screen's edits back into the spec, touching only the fields the legacy
 *    shape has, so v3-only data (provenance, assumptions, pending inputs, interview answers) survives.
 *
 * Fields v3 does not model yet (customization bundle, v2 deviations, preset ids...) ride in
 * `spec.legacy.v2`, as `migrateV2` stores them.
 */

import type { BuildingProject } from "../engine/projectState";
import { getPlan } from "../plans/library";
import type { ConcreteGradeMpa, ProjectSpec, SteelGradeMpa } from "./projectSpec";
import { landAreaToSqm, normaliseLandUnit, sqmToLandArea, type LandUnit } from "./units";

const CONCRETE: ConcreteGradeMpa[] = [20, 25, 30, 35, 40];
const STEEL: SteelGradeMpa[] = [250, 415, 500];

const LEGACY_UNIT: Record<LandUnit, BuildingProject["plotUnit"]> = { katha: "katha", shotok: "decimal", sqft: "sqft", sqm: "sqm", bigha: "katha" };
const AREA_DISPLAY: Record<BuildingProject["plotUnit"], "katha" | "shotok" | "sqft" | "sqm"> = { katha: "katha", decimal: "shotok", sqft: "sqft", sqm: "sqm" };

const bag = (spec: ProjectSpec): Record<string, unknown> => (spec.legacy?.v2 ?? {}) as Record<string, unknown>;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** The plan the screens should show: the v3 plan chosen for this unit count, if it is a real library plan. */
export function planIdOf(spec: ProjectSpec): string | undefined {
  const id = spec.design.planByUnits[String(spec.building.unitsPerFloor ?? 1)];
  return id && getPlan(id) ? id : undefined;
}

export function specToLegacy(spec: ProjectSpec): BuildingProject {
  const base = bag(spec);
  const plot = spec.site.plot;
  const areaSqm = plot.areaSqm;
  // The size and unit the user typed, kept while they still describe the stored area.
  let plotSize = typeof base.plotSize === "number" ? base.plotSize : 0;
  let plotUnit = (base.plotUnit as BuildingProject["plotUnit"] | undefined) ?? "katha";
  const unit = normaliseLandUnit(plotUnit);
  if (!(plotSize > 0 && unit && Math.abs(landAreaToSqm(plotSize, unit) - areaSqm) < Math.max(0.05 * areaSqm, 1))) {
    const display = spec.project.displayUnits.area as string;
    const dUnit = normaliseLandUnit(display) ?? "katha";
    plotUnit = LEGACY_UNIT[dUnit];
    plotSize = round2(sqmToLandArea(areaSqm, dUnit));
  }
  const hasShape = plot.frontageM !== undefined && plot.depthM !== undefined && plot.roadWidthM !== undefined;
  const planId = planIdOf(spec);
  const customization = { ...((base.customization as Record<string, unknown> | undefined) ?? {}) };
  customization.concreteGrade = spec.design.concreteGradeMpa;
  customization.steelGrade = spec.design.steelGradeMpa;

  const out: BuildingProject = {
    id: spec.project.id,
    name: spec.project.name,
    address: spec.site.address.addressLine ?? (typeof base.address === "string" ? base.address : "Dhaka, Bangladesh"),
    stories: spec.building.storeys.count,
    plotSize,
    plotUnit,
    plotSqm: areaSqm,
    unitsPerFloor: spec.building.unitsPerFloor ?? 1,
    createdAt: spec.createdAt,
    updatedAt: spec.updatedAt,
    phases: spec.phases as BuildingProject["phases"],
    designStarted: typeof base.designStarted === "boolean" ? base.designStarted : spec.phases.length > 0,
    ...(spec.activePhaseId ? { activePhaseId: spec.activePhaseId } : {}),
    customization: customization as unknown as BuildingProject["customization"],
    ...(hasShape
      ? { plot: { frontageM: plot.frontageM as number, depthM: plot.depthM as number, roadWidthM: plot.roadWidthM as number, roadSide: plot.roadSide ?? "south", ...(plot.cornerPlot ? { cornerPlot: true } : {}) } }
      : {}),
    ...(planId ? { planId } : {}),
    ...(spec.design.mirror ? { mirror: true } : {}),
    ...(Array.isArray(base.deviations) ? { deviations: base.deviations as BuildingProject["deviations"] } : {}),
  };
  return out;
}

const without = (pending: string[], pointers: string[]) => pending.filter((p) => !pointers.includes(p));

/** Write a screen's edits into the spec. Returns a new spec; the input is not changed. */
export function applyLegacy(spec: ProjectSpec, p: BuildingProject): ProjectSpec {
  const out: ProjectSpec = structuredClone(spec);
  out.project.name = p.name || out.project.name;
  if (p.address && p.address !== "Dhaka, Bangladesh") out.site.address.addressLine = p.address;
  else delete out.site.address.addressLine;

  const stories = Math.max(1, Math.round(p.stories || 1));
  out.building.storeys.count = stories;
  out.building.unitsPerFloor = Math.max(1, Math.round(p.unitsPerFloor || 1));

  if (p.plotSqm > 0) out.site.plot.areaSqm = p.plotSqm;
  out.project.displayUnits.area = AREA_DISPLAY[p.plotUnit] ?? out.project.displayUnits.area;
  if (p.plot) {
    out.site.plot.frontageM = p.plot.frontageM;
    out.site.plot.depthM = p.plot.depthM;
    out.site.plot.roadWidthM = p.plot.roadWidthM;
    out.site.plot.roadSide = p.plot.roadSide;
    if (p.plot.cornerPlot) out.site.plot.cornerPlot = true;
    else delete out.site.plot.cornerPlot;
  } else {
    delete out.site.plot.frontageM;
    delete out.site.plot.depthM;
    delete out.site.plot.roadWidthM;
  }

  const key = String(out.building.unitsPerFloor);
  if (p.planId) out.design.planByUnits[key] = p.planId;
  else if (out.design.planByUnits[key] && getPlan(out.design.planByUnits[key])) delete out.design.planByUnits[key];
  if (p.mirror) out.design.mirror = true;
  else delete out.design.mirror;

  const cust = (p.customization ?? {}) as unknown as Record<string, unknown>;
  const concrete = CONCRETE.find((g) => g === cust.concreteGrade);
  const steel = STEEL.find((g) => g === cust.steelGrade);
  if (concrete) out.design.concreteGradeMpa = concrete;
  if (steel) out.design.steelGradeMpa = steel;

  out.phases = structuredClone(p.phases) as ProjectSpec["phases"];
  if (p.activePhaseId) out.activePhaseId = p.activePhaseId;
  else delete out.activePhaseId;

  const { phases: _phases, ...rest } = p;
  void _phases;
  out.legacy = { v2: { ...bag(out), ...structuredClone(rest as unknown as Record<string, unknown>) } };

  const satisfied: string[] = [];
  if (out.site.plot.areaSqm > 0) satisfied.push("/site/plot/areaSqm");
  if (p.plot) satisfied.push("/site/plot/frontageM", "/site/plot/depthM", "/site/plot/roadWidthM");
  satisfied.push("/building/storeys/count", "/building/unitsPerFloor");
  out.pendingInputs = without(out.pendingInputs, satisfied);
  return out;
}
