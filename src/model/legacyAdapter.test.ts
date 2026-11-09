import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activateSavedProject, clearAllProjects, deleteSavedProject, getActiveProject, getSavedProjects, saveActiveProject, type BuildingProject } from "../engine/projectState";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { applyLegacy, planIdOf, specToLegacy } from "./legacyAdapter";
import { migrateV2 } from "./migrate";
import { loadProjects, STORAGE_KEYS, upsertProject } from "./projectStore";
import type { ProjectSpec } from "./projectSpec";

const NOW = "2026-11-09T10:00:00.000Z";
const plan = PLAN_LIBRARY[0];
const r = fitRange(plan);

function v2(over: Record<string, unknown> = {}): BuildingProject {
  return {
    id: "p-1", name: "Green Villa", address: "Road 5, Dhanmondi", stories: 5, plotSize: 5, plotUnit: "katha", plotSqm: 334.45, unitsPerFloor: plan.unitsPerFloor,
    createdAt: NOW, updatedAt: NOW, designStarted: true, activePhaseId: "phase-site",
    phases: [{ id: "phase-site", nameEn: "Site", nameBn: "সাইট", kind: "site", status: "completed", data: { x: 1 }, messages: [] }],
    customization: { concreteGrade: 30, steelGrade: 500, accessibility: { lift: true } },
    plot: { frontageM: (r.widthMm.pref + 3600) / 1000, depthM: (r.depthMm.pref + 5000) / 1000, roadWidthM: 9, roadSide: "east", cornerPlot: true },
    planId: plan.id, mirror: true,
    deviations: [{ ruleId: "rajuk@2008#far", note: "approved", at: NOW }],
    ...over,
  } as unknown as BuildingProject;
}

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  keys() { return [...this.m.keys()]; }
}

describe("specToLegacy / applyLegacy", () => {
  const spec = migrateV2(v2() as never, NOW);

  it("a migrated v2 project reads back the same through the adapter", () => {
    const back = specToLegacy(spec);
    const src = v2();
    expect(back).toMatchObject({
      id: "p-1", name: "Green Villa", address: "Road 5, Dhanmondi", stories: 5, plotSize: 5, plotUnit: "katha", plotSqm: 334.45, unitsPerFloor: src.unitsPerFloor,
      designStarted: true, activePhaseId: "phase-site", planId: plan.id, mirror: true,
    });
    expect(back.plot).toEqual(src.plot); // frontage, depth, road width, road side and corner flag all survive
    expect(back.phases).toEqual(src.phases);
    expect(back.customization).toMatchObject({ concreteGrade: 30, steelGrade: 500, accessibility: { lift: true } });
    expect(back.deviations).toEqual(src.deviations);
  });

  it("the plan is the v3 plan chosen for this unit count, and only a real library plan", () => {
    expect(planIdOf(spec)).toBe(plan.id);
    const legacyTemplate = { ...spec, design: { ...spec.design, planByUnits: { [String(spec.building.unitsPerFloor)]: "tpl-old-3" } } };
    expect(planIdOf(legacyTemplate as ProjectSpec)).toBeUndefined();
  });

  it("applying a screen's edits changes only what the screen owns and keeps v3-only data", () => {
    const rich: ProjectSpec = { ...spec, provenance: { ...spec.provenance, "/site/plot/areaSqm": { source: "user", detail: "interview", at: NOW, confidence: "high" } }, assumptions: [...spec.assumptions, { id: "a1", statement: "kept", basis: "user_stated", verifyOnSite: false }], pendingInputs: ["/site/plot/frontageM", "/site/soil/sbcKpa"] };
    const edited = { ...specToLegacy(rich), stories: 7, mirror: false, name: "Renamed", plotSqm: 400 };
    const out = applyLegacy(rich, edited);
    expect(out.building.storeys.count).toBe(7);
    expect(out.design.mirror).toBeUndefined();
    expect(out.project.name).toBe("Renamed");
    expect(out.site.plot.areaSqm).toBe(400);
    // v3-only data survives
    expect(out.provenance["/site/plot/areaSqm"]).toMatchObject({ source: "user", detail: "interview" });
    expect(out.assumptions.some((a) => a.id === "a1")).toBe(true);
    // the plot shape is now set, so its pending input goes; an unrelated pending input stays
    expect(out.pendingInputs).toEqual(["/site/soil/sbcKpa"]);
    // the input spec is untouched
    expect(rich.building.storeys.count).toBe(5);
    expect(rich.project.name).toBe("Green Villa");
  });

  it("a plot size typed by the user is kept while it still describes the stored area, and recomputed when not", () => {
    expect(specToLegacy(spec)).toMatchObject({ plotSize: 5, plotUnit: "katha" });
    const resized = applyLegacy(spec, { ...specToLegacy(spec), plotSqm: 669 }); // user changed the area elsewhere
    const back = specToLegacy({ ...resized, legacy: { v2: { ...resized.legacy!.v2, plotSize: 5, plotUnit: "katha" } } });
    expect(back.plotSqm).toBe(669);
    expect(back.plotSize).toBeCloseTo(10, 1); // 669 m2 is 10 katha, not the stale 5
  });

  it("customization grades live in the spec's design choices", () => {
    const out = applyLegacy(spec, { ...specToLegacy(spec), customization: { concreteGrade: 35, steelGrade: 415 } as never });
    expect(out.design).toMatchObject({ concreteGradeMpa: 35, steelGradeMpa: 415 });
  });
});

describe("the project functions on the v3 store", () => {
  let store: FakeStorage;
  beforeEach(() => {
    store = new FakeStorage();
    vi.stubGlobal("localStorage", store);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("a browser holding v2 saves is migrated on first load; the v2 keys are left as a backup", () => {
    const a = v2({ id: "a", name: "A", updatedAt: "2026-01-01T00:00:00Z" });
    const b = v2({ id: "b", name: "B", updatedAt: "2026-02-01T00:00:00Z" });
    store.setItem(STORAGE_KEYS.v2Projects, JSON.stringify([a, b]));
    store.setItem(STORAGE_KEYS.v2Active, JSON.stringify(a));
    expect(getActiveProject()?.id).toBe("a"); // the v2 active project stays active
    expect(store.getItem(STORAGE_KEYS.projects)).not.toBeNull();
    expect(loadProjects(store).source).toBe("v3");
    expect(getSavedProjects().map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(JSON.parse(store.getItem(STORAGE_KEYS.v2Projects) as string)).toHaveLength(2); // untouched
  });

  it("save then read round-trips, and saving never writes the v2 keys", () => {
    saveActiveProject(v2({ id: "n", name: "New" }));
    expect(store.keys().some((k) => k.startsWith("archres_v2"))).toBe(false);
    const back = getActiveProject()!;
    expect(back).toMatchObject({ id: "n", name: "New", stories: 5, planId: plan.id });
    saveActiveProject({ ...back, stories: 8 });
    expect(getActiveProject()?.stories).toBe(8);
    expect(getSavedProjects()).toHaveLength(1);
  });

  it("a screen's save keeps what the interview wrote into the spec", () => {
    saveActiveProject(v2({ id: "n" }));
    const spec = loadProjects(store).projects[0];
    upsertProject(store, { ...spec, provenance: { ...spec.provenance, "/site/soil/sbcKpa": { source: "user", detail: "interview: soil-sbc", at: NOW, confidence: "high" } }, site: { ...spec.site, soil: { status: "user_report", sbcKpa: 120 } } });
    saveActiveProject({ ...getActiveProject()!, name: "Edited on a screen" });
    const after = loadProjects(store).projects[0];
    expect(after.project.name).toBe("Edited on a screen");
    expect(after.site.soil).toMatchObject({ status: "user_report", sbcKpa: 120 });
    expect(after.provenance["/site/soil/sbcKpa"].detail).toBe("interview: soil-sbc");
    expect(after.revision).toBeGreaterThan(spec.revision);
  });

  it("activate, delete and clear", () => {
    saveActiveProject(v2({ id: "a", name: "A" }));
    saveActiveProject(v2({ id: "b", name: "B" }));
    expect(getActiveProject()?.id).toBe("b");
    expect(activateSavedProject("a")?.id).toBe("a");
    expect(getActiveProject()?.id).toBe("a");
    deleteSavedProject("a");
    expect(getActiveProject()).toBeNull();
    expect(getSavedProjects().map((p) => p.id)).toEqual(["b"]);
    expect(activateSavedProject()?.id).toBe("b"); // most recent when no id
    clearAllProjects();
    expect(getSavedProjects()).toEqual([]);
    expect(activateSavedProject("zzz")).toBeNull();
  });

  it("blocked storage never throws", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } });
    expect(() => getActiveProject()).not.toThrow();
  });
});
