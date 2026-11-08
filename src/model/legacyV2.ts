/**
 * The v2 saved-project shape (app versions up to 2.5.x), frozen here so old saves can still be
 * read after `src/engine/projectState.ts` is replaced. Do not change it to follow the live code.
 */

export interface V2Phase {
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

export interface V2Project {
  id: string;
  name: string;
  address: string;
  stories: number;
  plotSize: number;
  plotUnit: "katha" | "decimal" | "sqft" | "sqm";
  plotSqm: number;
  unitsPerFloor: number;
  createdAt: string;
  updatedAt: string;
  phases: V2Phase[];
  designStarted: boolean;
  activePhaseId?: string;
  floorplanId?: string;
  typicalPresetId?: string;
  floorplanAssignments?: Record<string, string>;
  customization?: Record<string, unknown>;
  /** Added in 2.6 (M2-4): the plot's shape and the v3 plan chosen for it. Absent in older saves. */
  plot?: {
    frontageM: number;
    depthM: number;
    roadWidthM: number;
    roadSide: "north" | "south" | "east" | "west";
    cornerPlot?: boolean;
  };
  planId?: string;
  mirror?: boolean;
}

/** Loose check: enough of the v2 shape is present to migrate it. */
export function isV2Project(x: unknown): x is V2Project {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    !("schemaVersion" in o) &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    Array.isArray(o.phases) &&
    ("stories" in o || "plotSqm" in o)
  );
}
