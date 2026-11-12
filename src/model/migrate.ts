/**
 * Turning any saved project into the current ProjectSpec.
 *
 * Rules:
 * - Never invent a value the user didn't give. Unknowns go into `pendingInputs` (to ask) or
 *   `assumptions` (stated openly), never silently into the spec.
 * - Never drop data. Fields v3 doesn't model yet are kept under `legacy`.
 * - Refuse data from a newer app version rather than guessing at it.
 */

import type { DisplayUnits, ProvenanceEntry } from "../spec.gen";
import { isV2Project, type V2Project } from "./legacyV2";
import {
  PROJECT_SCHEMA_VERSION,
  isProjectSpec,
  type ConcreteGradeMpa,
  type PhaseRecord,
  type ProjectSpec,
  type SteelGradeMpa,
} from "./projectSpec";
import { getPlan } from "../plans/library";
import { landAreaToSqm, normaliseLandUnit } from "./units";
import { specProblems } from "./specValidate";

export class ProjectFormatError extends Error {
  constructor(
    message: string,
    readonly reason: "unrecognised" | "newer_version" | "invalid_values",
  ) {
    super(message);
    this.name = "ProjectFormatError";
  }
}

const AREA_DISPLAY: Record<V2Project["plotUnit"], DisplayUnits["area"]> = {
  katha: "katha",
  decimal: "shotok",
  sqft: "sqft",
  sqm: "sqm",
};

const CONCRETE_GRADES: ConcreteGradeMpa[] = [20, 25, 30, 35, 40];
const STEEL_GRADES: SteelGradeMpa[] = [250, 415, 500];

function positiveNumber(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined;
}

function wholeAtLeastOne(x: unknown): number | undefined {
  const n = positiveNumber(x);
  return n === undefined ? undefined : Math.max(1, Math.round(n));
}

const ROAD_SIDES = ["north", "south", "east", "west"] as const;

/** The plot shape from a 2.6+ save, or undefined when any number is missing or not positive. */
function readPlotShape(x: unknown) {
  if (!x || typeof x !== "object") return undefined;
  const o = x as Record<string, unknown>;
  const frontageM = positiveNumber(o.frontageM);
  const depthM = positiveNumber(o.depthM);
  const roadWidthM = positiveNumber(o.roadWidthM);
  if (frontageM === undefined || depthM === undefined || roadWidthM === undefined) return undefined;
  const roadSide = ROAD_SIDES.find((s) => s === o.roadSide);
  return { frontageM, depthM, roadWidthM, ...(roadSide ? { roadSide } : {}), ...(o.cornerPlot === true ? { cornerPlot: true } : {}) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** v2 (app 2.5.x and earlier) → v3. Pure: the same input and `now` always give the same output. */
export function migrateV2(p: V2Project, now: string = new Date().toISOString()): ProjectSpec {
  const imported: ProvenanceEntry = { source: "imported", detail: "migrated from a v2 save", at: now };
  const defaulted: ProvenanceEntry = { source: "default", detail: "v2 default applied during migration", at: now };
  const provenance: Record<string, ProvenanceEntry> = {};
  const pendingInputs: string[] = [];

  // Plot area: v2 stored square metres; recompute from size and unit only if that is missing.
  const unit = normaliseLandUnit(String(p.plotUnit ?? ""));
  const size = positiveNumber(p.plotSize);
  const areaSqm = positiveNumber(p.plotSqm) ?? (size !== undefined && unit ? landAreaToSqm(size, unit) : undefined);
  if (areaSqm === undefined) pendingInputs.push("/site/plot/areaSqm");
  else provenance["/site/plot/areaSqm"] = imported;

  // Saves from before 2.6 never asked for the plot's shape or road; the building can't be fitted without them.
  const shape = readPlotShape(p.plot);
  if (shape) {
    const entered: ProvenanceEntry = { source: "user", detail: "entered in project setup", at: now };
    for (const k of ["frontageM", "depthM", "roadWidthM"]) provenance[`/site/plot/${k}`] = entered;
    if (shape.roadSide) provenance["/site/plot/roadSide"] = entered;
  } else pendingInputs.push("/site/plot/frontageM", "/site/plot/depthM", "/site/plot/roadWidthM");

  const storeys = wholeAtLeastOne(p.stories);
  if (storeys === undefined) pendingInputs.push("/building/storeys/count");
  else provenance["/building/storeys/count"] = imported;

  const units = wholeAtLeastOne(p.unitsPerFloor);
  if (units === undefined) pendingInputs.push("/building/unitsPerFloor");
  else provenance["/building/unitsPerFloor"] = imported;

  const custom = (p.customization ?? {}) as Record<string, unknown>;
  const concrete = CONCRETE_GRADES.find((g) => g === custom.concreteGrade);
  const steel = STEEL_GRADES.find((g) => g === custom.steelGrade);
  provenance["/design/concreteGradeMpa"] = concrete ? imported : defaulted;
  provenance["/design/steelGradeMpa"] = steel ? imported : defaulted;

  const planByUnits: Record<string, string> = { ...(p.floorplanAssignments ?? {}) };
  if (p.floorplanId && units !== undefined && !planByUnits[String(units)]) planByUnits[String(units)] = p.floorplanId;
  // A v3 plan id, when it names a real library plan, wins over the legacy template for that unit count.
  const planId = typeof p.planId === "string" && getPlan(p.planId) ? p.planId : undefined;
  if (planId && units !== undefined) {
    planByUnits[String(units)] = planId;
    provenance[`/design/planByUnits/${units}`] = { source: "user", detail: "chosen in project setup", at: now };
  }

  const { phases, ...rest } = p;

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    revision: 1,
    createdAt: p.createdAt || now,
    updatedAt: now,
    project: {
      id: p.id,
      name: p.name || "Untitled project",
      language: "en",
      displayUnits: { length: "m", area: AREA_DISPLAY[p.plotUnit] ?? "katha", currency: "BDT" },
    },
    site: {
      address: { division: "Dhaka", district: "Dhaka", ...(p.address ? { addressLine: p.address } : {}) },
      plot: { areaSqm: areaSqm ?? 0, ...(shape ?? {}) },
      soil: { status: "not_provided" },
      jurisdiction: { authority: "rajuk", rulePack: "rajuk-2008" },
    },
    building: {
      occupancy: "residential",
      structureType: "rcc_frame",
      storeys: { count: storeys ?? 1 },
      unitsPerFloor: units ?? 1,
      // v2 always generated a "Ground Floor (Parking & Entry)" phase.
      groundFloorUsage: "parking",
    },
    design: {
      planByUnits,
      ...(p.mirror === true ? { mirror: true } : {}),
      concreteGradeMpa: concrete ?? 25,
      steelGradeMpa: steel ?? 415,
    },
    phases: clone(Array.isArray(phases) ? phases : []) as PhaseRecord[],
    ...(p.activePhaseId ? { activePhaseId: p.activePhaseId } : {}),
    assumptions: [
      ...(shape
        ? []
        : [
            {
              id: "v2-plot-shape",
              subject: "Plot shape",
              statement:
                "Plot frontage, depth and road width were not recorded before v3. They must be entered before the building can be fitted to the plot.",
              basis: "conservative_default" as const,
              verifyOnSite: true,
              relatedPath: "/site/plot/frontageM",
            },
          ]),
      {
        id: "v2-region",
        subject: "Location",
        statement: "Division and district were set to Dhaka because v3 covers the RAJUK area only.",
        basis: "conservative_default",
        verifyOnSite: false,
        relatedPath: "/site/address",
      },
    ],
    deviations: [],
    provenance,
    pendingInputs,
    legacy: { v2: clone(rest) as Record<string, unknown> },
  };
}

/** Any stored project (v2 or v3) → current ProjectSpec. Throws ProjectFormatError otherwise. */
export function toProjectSpec(raw: unknown, now?: string): ProjectSpec {
  const checked = (spec: ProjectSpec): ProjectSpec => {
    const bad = specProblems(spec);
    if (bad.length) throw new ProjectFormatError(`The project has values that are not valid (${bad.join(", ")}).`, "invalid_values");
    return spec;
  };
  if (isProjectSpec(raw)) return checked(raw);
  if (isV2Project(raw)) return checked(migrateV2(raw, now));
  const version = raw && typeof raw === "object" ? (raw as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof version === "number" && version > PROJECT_SCHEMA_VERSION) {
    throw new ProjectFormatError(
      `This project was saved by a newer version of ArchResidenceBD (format ${version}). Update the app to open it.`,
      "newer_version",
    );
  }
  throw new ProjectFormatError("This isn't an ArchResidenceBD project, or the file is damaged.", "unrecognised");
}
