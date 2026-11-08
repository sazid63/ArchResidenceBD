import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the v2 data-loss bugs: starting the app with no open project used to call
 * clearAllProjects() (through the demo factory), wiping every saved project.
 */

function installMemoryStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
  });
  return data;
}

async function freshState() {
  vi.resetModules();
  return import("../src/engine/projectState");
}

describe("project startup", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("creating the demo project keeps the projects already saved", async () => {
    const s = await freshState();
    const a = s.createNewProject({ name: "A", stories: 3, plotSize: 3, plotUnit: "katha", unitsPerFloor: 2 });
    s.saveActiveProject(a);
    s.create4StoryBuildingProject();
    expect(s.getSavedProjects().map((p) => p.name)).toContain("A");
  });

  it("reopens the most recent saved project when none is open", async () => {
    const s = await freshState();
    const a = s.createNewProject({ name: "Older", stories: 3, plotSize: 3, plotUnit: "katha", unitsPerFloor: 2 });
    s.saveActiveProject(a);
    const b = s.createNewProject({ name: "Newer", stories: 3, plotSize: 3, plotUnit: "katha", unitsPerFloor: 2 });
    s.saveActiveProject({ ...b, updatedAt: "" });
    // Simulate "no open project" (e.g. the open one was deleted elsewhere).
    localStorage.removeItem("archres_v2_active_project");
    const opened = s.activateSavedProject();
    expect(opened).not.toBeNull();
    expect(s.getActiveProject()?.id).toBe(opened?.id);
    expect(s.getSavedProjects()).toHaveLength(2);
  });

  it("deleting one project leaves the others", async () => {
    const s = await freshState();
    const a = s.createNewProject({ name: "Keep", stories: 2, plotSize: 3, plotUnit: "katha", unitsPerFloor: 1 });
    s.saveActiveProject(a);
    const b = s.createNewProject({ name: "Remove", stories: 2, plotSize: 3, plotUnit: "katha", unitsPerFloor: 1 });
    s.saveActiveProject(b);
    s.deleteSavedProject(b.id);
    expect(s.getSavedProjects().map((p) => p.name)).toEqual(["Keep"]);
  });

  it("activateSavedProject returns null on an empty install", async () => {
    const s = await freshState();
    expect(s.activateSavedProject()).toBeNull();
  });
});
