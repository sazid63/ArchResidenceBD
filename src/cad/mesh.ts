/**
 * The mesh the workspace draws (W2.8).
 *
 * The payload is what the CAD engine measured: the same document the design macro builds,
 * tessellated. The app draws it; it never re-computes it. Every object carries its measured
 * volume and bounding box, so the tree can show the numbers the design shows.
 */

import floorDesignUrl from "../data/cad/generated/floor-two-storey-residential.design.json?url";
import foundationDesignUrl from "../data/cad/generated/foundation-two-storey-residential.design.json?url";
import meshUrl from "../data/cad/generated/two-storey-residential.mesh.json?url";

import floorDesignData from "../data/cad/generated/floor-two-storey-residential.design.json";
import foundationDesignData from "../data/cad/generated/foundation-two-storey-residential.design.json";
import meshData from "../data/cad/generated/two-storey-residential.mesh.json";

export interface MeshObject {
  id: string;
  label: string;
  kind: string;
  phase: string;
  volumeMm3: number;
  bboxMinMm: number[];
  bboxMaxMm: number[];
  positions: number[];
  normals: number[];
  indices: number[];
}

export interface MeshDocument {
  schemaVersion: string;
  units: string;
  objects: MeshObject[];
}

/** The value the design carries: a number with its provenance. */
export interface DesignValue {
  value: number;
  unit: string;
  provenance: string;
  source: string;
  reason: string;
}

export interface DesignAssumption {
  pointer: string;
  value: number;
  unit: string;
  reason: string;
}

export interface DesignDocument {
  projectId?: string;
  values?: Record<string, DesignValue>;
  assumptions?: DesignAssumption[];
  declaredAbsent?: string[];
  [key: string]: unknown;
}

/**
 * Where the workspace's artefacts come from.
 *
 * The desktop bridge serves them from the bundled engine; in the prototype they are the very
 * files the engine wrote (`data/cad/generated/`), imported by URL so the dev server hands the
 * app the engine's own geometry — not a mock of it.
 */
export const MESH_URL = meshUrl;
export const FOUNDATION_DESIGN_URL = foundationDesignUrl;
export const FLOOR_DESIGN_URL = floorDesignUrl;

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return fallback;
    }
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function loadMesh(url: string = MESH_URL): Promise<MeshDocument> {
  return getJson<MeshDocument>(url, meshData as unknown as MeshDocument);
}

export function loadDesign(url: string): Promise<DesignDocument> {
  const fallback =
    url === FOUNDATION_DESIGN_URL
      ? (foundationDesignData as unknown as DesignDocument)
      : (floorDesignData as unknown as DesignDocument);
  return getJson<DesignDocument>(url, fallback);
}

/** The volume in m³ (the engine measures in mm³; the app shows m³ like the BOQ). */
export function volumeM3(object: MeshObject): number {
  return object.volumeMm3 / 1_000_000_000;
}

/** The object's size, in mm, as the tree shows it. */
export function sizeMm(object: MeshObject): [number, number, number] {
  return [
    object.bboxMaxMm[0] - object.bboxMinMm[0],
    object.bboxMaxMm[1] - object.bboxMinMm[1],
    object.bboxMaxMm[2] - object.bboxMinMm[2],
  ];
}
