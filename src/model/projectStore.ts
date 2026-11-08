/**
 * Versioned project storage (v3).
 *
 * - v3 projects live under their own keys; v2 keys are only ever read, never written or deleted,
 *   so going back to a 2.5.x build still finds the old projects.
 * - Before overwriting the v3 list, the previous value is copied to `<key>.bak`.
 * - Storage is passed in (localStorage in the app, an in-memory map in tests).
 */

import { toProjectSpec } from "./migrate";
import { PROJECT_SCHEMA_VERSION, type ProjectSpec } from "./projectSpec";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_KEYS = {
  projects: "archres_v3_projects",
  activeId: "archres_v3_active_project_id",
  v2Projects: "archres_v2_all_projects",
  v2Active: "archres_v2_active_project",
} as const;

interface StoredProjects {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  projects: ProjectSpec[];
}

export interface LoadResult {
  projects: ProjectSpec[];
  /** Where the list came from. */
  source: "v3" | "v2" | "empty";
  /** Entries that couldn't be read (damaged or from a newer version). */
  skipped: number;
}

function readJson(store: KeyValueStore, key: string): unknown {
  const raw = store.getItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return null; // present but damaged
  }
}

/** When the stored item was last changed by the user (before any migration touched it). */
function lastChanged(item: unknown): string {
  const t = item && typeof item === "object" ? (item as { updatedAt?: unknown }).updatedAt : undefined;
  return typeof t === "string" ? t : "";
}

function convertAll(items: unknown[], now: string): { projects: ProjectSpec[]; skipped: number } {
  const byId = new Map<string, { spec: ProjectSpec; changed: string }>();
  let skipped = 0;
  for (const item of items) {
    try {
      const spec = toProjectSpec(item, now);
      const changed = lastChanged(item);
      const seen = byId.get(spec.project.id);
      // The same project can appear twice (v2 kept the active one under its own key): keep the newer.
      if (!seen || seen.changed < changed) byId.set(spec.project.id, { spec, changed });
    } catch {
      skipped += 1;
    }
  }
  return { projects: [...byId.values()].map((e) => e.spec), skipped };
}

export function loadProjects(store: KeyValueStore, now: string = new Date().toISOString()): LoadResult {
  const v3 = readJson(store, STORAGE_KEYS.projects);
  if (v3 !== undefined) {
    const list = v3 && typeof v3 === "object" && Array.isArray((v3 as StoredProjects).projects) ? (v3 as StoredProjects).projects : null;
    if (list === null) return { projects: [], source: "v3", skipped: 1 };
    return { ...convertAll(list, now), source: "v3" };
  }

  const v2List = readJson(store, STORAGE_KEYS.v2Projects);
  const v2Active = readJson(store, STORAGE_KEYS.v2Active);
  const items = [...(Array.isArray(v2List) ? v2List : []), ...(v2Active ? [v2Active] : [])];
  if (items.length === 0) return { projects: [], source: "empty", skipped: 0 };
  return { ...convertAll(items, now), source: "v2" };
}

export function saveProjects(store: KeyValueStore, projects: ProjectSpec[]): void {
  const previous = store.getItem(STORAGE_KEYS.projects);
  if (previous !== null) store.setItem(`${STORAGE_KEYS.projects}.bak`, previous);
  const payload: StoredProjects = { schemaVersion: PROJECT_SCHEMA_VERSION, projects };
  store.setItem(STORAGE_KEYS.projects, JSON.stringify(payload));
}

/** Insert or replace one project, bumping its revision and timestamp. Returns the saved copy. */
export function upsertProject(store: KeyValueStore, spec: ProjectSpec, now: string = new Date().toISOString()): ProjectSpec {
  const { projects } = loadProjects(store, now);
  const saved: ProjectSpec = { ...spec, revision: spec.revision + 1, updatedAt: now };
  const index = projects.findIndex((p) => p.project.id === spec.project.id);
  if (index >= 0) projects[index] = saved;
  else projects.unshift(saved);
  saveProjects(store, projects);
  return saved;
}

export function getActiveProjectId(store: KeyValueStore): string | null {
  return store.getItem(STORAGE_KEYS.activeId);
}

export function setActiveProjectId(store: KeyValueStore, id: string): void {
  store.setItem(STORAGE_KEYS.activeId, id);
}
