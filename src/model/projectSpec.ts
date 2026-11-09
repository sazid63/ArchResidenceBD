/**
 * ProjectSpec v3: what the user decided about one project (BUILD_PLAN.md §4.1).
 *
 * This is the only thing that gets saved. Everything else (the building model, structure, code
 * checks, quantities) is derived from it, so it is never stored and can never go stale.
 *
 * It reuses the sub-types generated from spec/schemas/building-spec.schema.json (`src/spec.gen.ts`)
 * and adds the v3 parts that schema doesn't have yet: design choices, road side, pending inputs.
 * Canonical units are SI (m, m2, kPa, BDT); display units are presentation only.
 */

import type {
  Address,
  Assumption,
  Building,
  Deviation,
  Jurisdiction,
  Plot,
  Project,
  ProvenanceEntry,
  Soil,
} from "../spec.gen";

/** Bump when the stored shape changes, and add a migration step in `migrate.ts`. */
export const PROJECT_SCHEMA_VERSION = 3 as const;

export type RoadSide = "north" | "south" | "east" | "west";

export interface PlotV3 extends Plot {
  /** Which edge of the plot faces the access road. */
  roadSide?: RoadSide;
}

export interface SiteV3 {
  address: Address;
  plot: PlotV3;
  soil: Soil;
  jurisdiction: Jurisdiction;
}

export type ConcreteGradeMpa = 20 | 25 | 30 | 35 | 40;
export type SteelGradeMpa = 250 | 415 | 500;

export interface DesignChoices {
  /** Floor plan per dwellings-per-floor count (key: "1", "2", ...). Legacy v2 template ids until M2. */
  planByUnits: Record<string, string>;
  /** Per-storey plan overrides, keyed by storey index. */
  storeyPlans?: Record<string, string>;
  /** Mirror the plan left-right (e.g. when the road is on the other side). */
  mirror?: boolean;
  concreteGradeMpa: ConcreteGradeMpa;
  steelGradeMpa: SteelGradeMpa;
}

/** One phase of the guided interview. Same shape as v2 until the flow-book runner lands (M6). */
export interface PhaseRecord {
  id: string;
  nameEn: string;
  nameBn: string;
  kind: "site" | "foundation" | "ground_floor" | "floor" | "roof" | "utility";
  storeyIndex?: number;
  status: "not_started" | "in_progress" | "completed";
  data: Record<string, unknown>;
  messages: Array<{
    who: "ai" | "user";
    text: string;
    metrics?: Record<string, string | number>;
    timestamp?: string;
  }>;
}

/** Where one phase's guided interview stands, so it can resume: steps handled, essential ones left open, derived items pending. */
export interface InterviewProgress {
  done: string[];
  open: string[];
  pending: Array<{ key: string; pointer: string; kind: "derive" | "registry" | "area_default"; reason: string; assumption?: { en: string; bn: string } }>;
  log: Array<{ key: string; outcome: "answered" | "default" | "omitted" | "open" | "pending" | "not_applicable" | "condition_unanswered"; value?: unknown }>;
}

export interface ProjectSpec {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  /** Increases by one on every save. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  project: Project;
  site: SiteV3;
  building: Building;
  design: DesignChoices;
  phases: PhaseRecord[];
  activePhaseId?: string;
  /** Guided-interview progress by phase id (see src/interview/chat.ts). */
  interview?: Record<string, InterviewProgress>;
  pricing?: { rateCardId?: string; /** From the interview: the user has prices ("user") or wants them fetched ("fetched"). */ source?: "user" | "fetched" };
  assumptions: Assumption[];
  deviations: Deviation[];
  /** Where each value came from, keyed by JSON pointer (e.g. "/site/plot/areaSqm"). */
  provenance: Record<string, ProvenanceEntry>;
  /** JSON pointers the user still has to answer before the building can be derived. */
  pendingInputs: string[];
  /** Fields from older saves that v3 doesn't model yet, kept verbatim so nothing is lost. */
  legacy?: { v2?: Record<string, unknown> };
}

export function isProjectSpec(x: unknown): x is ProjectSpec {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<ProjectSpec>;
  return (
    o.schemaVersion === PROJECT_SCHEMA_VERSION &&
    typeof o.project?.id === "string" &&
    typeof o.site?.plot?.areaSqm === "number" &&
    typeof o.building?.storeys?.count === "number" &&
    Array.isArray(o.phases)
  );
}
