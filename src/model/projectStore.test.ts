import { describe, expect, it } from "vitest";
import { createNewProject } from "../engine/projectState";
import { migrateV2 } from "./migrate";
import type { V2Project } from "./legacyV2";
import { STORAGE_KEYS, loadProjects, saveProjects, upsertProject, type KeyValueStore } from "./projectStore";

const NOW = "2026-11-08T12:00:00.000Z";

function memoryStore(initial: Record<string, string> = {}): KeyValueStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function v2(name: string, updatedAt: string): V2Project {
  const p = createNewProject({ name, stories: 4, plotSize: 3.5, plotUnit: "katha", unitsPerFloor: 2 }) as unknown as V2Project;
  return { ...p, updatedAt };
}

describe("loadProjects", () => {
  it("is empty when nothing is stored", () => {
    expect(loadProjects(memoryStore(), NOW)).toEqual({ projects: [], source: "empty", skipped: 0 });
  });

  it("migrates v2 saves on read without touching the v2 keys", () => {
    const a = v2("A", "2026-11-01T00:00:00Z");
    const b = v2("B", "2026-11-02T00:00:00Z");
    const store = memoryStore({
      [STORAGE_KEYS.v2Projects]: JSON.stringify([a, b]),
      [STORAGE_KEYS.v2Active]: JSON.stringify(b),
    });
    const before = new Map(store.data);
    const result = loadProjects(store, NOW);
    expect(result.source).toBe("v2");
    expect(result.projects.map((p) => p.project.name).sort()).toEqual(["A", "B"]);
    expect(store.data).toEqual(before);
  });

  it("keeps the newer copy when v2 stored the same project twice", () => {
    const old = v2("Old name", "2026-11-01T00:00:00Z");
    const newer = { ...old, name: "New name", updatedAt: "2026-11-05T00:00:00Z" };
    const store = memoryStore({
      [STORAGE_KEYS.v2Projects]: JSON.stringify([old]),
      [STORAGE_KEYS.v2Active]: JSON.stringify(newer),
    });
    const { projects } = loadProjects(store, NOW);
    expect(projects).toHaveLength(1);
    expect(projects[0].project.name).toBe("New name");
  });

  it("skips damaged entries and counts them", () => {
    const store = memoryStore({ [STORAGE_KEYS.v2Projects]: JSON.stringify([v2("A", "x"), { junk: true }]) });
    const result = loadProjects(store, NOW);
    expect(result.projects).toHaveLength(1);
    expect(result.skipped).toBe(1);
  });

  it("prefers v3 data once it exists", () => {
    const store = memoryStore({ [STORAGE_KEYS.v2Projects]: JSON.stringify([v2("Old", "x")]) });
    saveProjects(store, [migrateV2(v2("New", "y"), NOW)]);
    const result = loadProjects(store, NOW);
    expect(result.source).toBe("v3");
    expect(result.projects.map((p) => p.project.name)).toEqual(["New"]);
  });

  it("reports a damaged v3 list instead of treating it as empty", () => {
    const store = memoryStore({ [STORAGE_KEYS.projects]: "{not json" });
    expect(loadProjects(store, NOW)).toEqual({ projects: [], source: "v3", skipped: 1, damaged: true });
  });
});

describe("saving", () => {
  it("backs up the previous list before overwriting it", () => {
    const store = memoryStore();
    saveProjects(store, [migrateV2(v2("First", "x"), NOW)]);
    const first = store.getItem(STORAGE_KEYS.projects);
    saveProjects(store, []);
    expect(store.getItem(`${STORAGE_KEYS.projects}.bak`)).toBe(first);
  });

  it("bumps the revision and timestamp on every upsert", () => {
    const store = memoryStore();
    const spec = migrateV2(v2("House", "x"), NOW);
    const once = upsertProject(store, spec, "2026-11-09T00:00:00.000Z");
    const twice = upsertProject(store, once, "2026-11-10T00:00:00.000Z");
    expect([spec.revision, once.revision, twice.revision]).toEqual([1, 2, 3]);
    expect(twice.updatedAt).toBe("2026-11-10T00:00:00.000Z");
    expect(loadProjects(store, NOW).projects).toHaveLength(1);
  });
});

describe("storage hardening", () => {
  const spec = (name: string) => migrateV2(v2(name, "2026-11-01T00:00:00Z"), NOW);

  it("a damaged v3 list is kept under its own key before the next save overwrites it", async () => {
    const { DAMAGED_KEY } = await import("./projectStore");
    const store = memoryStore({ [STORAGE_KEYS.projects]: "{not json" });
    const r = loadProjects(store, NOW);
    expect(r).toMatchObject({ projects: [], skipped: 1, damaged: true });
    saveProjects(store, [spec("A")]);
    expect(store.data.get(DAMAGED_KEY)).toBe("{not json");
    // a second save does not replace the kept copy
    saveProjects(store, [spec("A"), spec("B")]);
    expect(store.data.get(DAMAGED_KEY)).toBe("{not json");
  });

  it("a full storage that cannot hold the backup does not block the real save", () => {
    const base = memoryStore();
    saveProjects(base, [spec("A")]);
    const store: KeyValueStore = {
      getItem: (k) => base.getItem(k),
      removeItem: (k) => base.removeItem(k),
      setItem: (k, v) => {
        if (k.endsWith(".bak")) throw new DOMException("quota", "QuotaExceededError");
        base.setItem(k, v);
      },
    };
    saveProjects(store, [spec("A"), spec("B")]);
    expect(loadProjects(base, NOW).projects).toHaveLength(2);
  });

  it("a write that fails on the main key throws (the caller reports it)", () => {
    const store: KeyValueStore = { getItem: () => null, removeItem: () => undefined, setItem: () => { throw new DOMException("quota", "QuotaExceededError"); } };
    expect(() => saveProjects(store, [spec("A")])).toThrow();
  });

  it("saving a stale revision is refused instead of overwriting another tab's newer save", async () => {
    const { StorageConflictError } = await import("./projectStore");
    const store = memoryStore();
    const a = upsertProject(store, spec("A"), NOW); // revision 1
    const tab1 = upsertProject(store, a, NOW); // another tab saves: revision 2
    expect(tab1.revision).toBeGreaterThan(a.revision);
    expect(() => upsertProject(store, a, NOW)).toThrow(StorageConflictError); // this tab still holds revision 1
    expect(loadProjects(store, NOW).projects[0].revision).toBe(tab1.revision);
  });
});
