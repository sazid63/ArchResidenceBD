import { describe, expect, it } from "vitest";
import { createNewProject, type BuildingProject } from "../engine/projectState";
import { buildingForProject, buildingInputFor, meshForProject } from "./projectMesh";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";

const plot = { frontageM: 12.2, depthM: 19.8, roadWidthM: 6, roadSide: "south" as const };

function project(over: Partial<BuildingProject> = {}): BuildingProject {
  return { ...createNewProject({ name: "T", stories: 4, plotSize: 3.6, plotUnit: "katha", unitsPerFloor: 1, plot, planId: "p1-4b" }), ...over };
}

describe("projectMesh", () => {
  it("returns null for a save without plot shape or plan", () => {
    const old = project({ plot: undefined, planId: undefined });
    expect(buildingInputFor(old)).toBeNull();
    expect(buildingForProject(old)).toBeNull();
    expect(meshForProject(old, "final")).toBeNull();
  });

  it("builds the model from the plot and plan, with whole-mm sizes", () => {
    const input = buildingInputFor(project())!;
    expect(input).toMatchObject({ plotWidthMm: 12200, plotDepthMm: 19800, storeys: 4, planId: "p1-4b", mirror: false });
    expect(buildingForProject(project())?.ok).toBe(true);
  });

  it("filters to a phase like the old generator and keeps the full building for 'final'", () => {
    const p = project();
    const all = meshForProject(p, "final")!;
    const ground = meshForProject(p, "phase-ground-floor")!;
    expect(ground.objects.length).toBeGreaterThan(0);
    expect(ground.objects.length).toBeLessThan(all.objects.length);
    expect(ground.objects.every((o) => o.phase === "ground_floor")).toBe(true);
    expect(meshForProject(p, "phase-floor-2")!.objects.every((o) => o.phase === "floor_2")).toBe(true);
  });

  it("gives an empty mesh, not a guess, when the plan no longer fits the plot", () => {
    const tiny = project({ plot: { ...plot, frontageM: 6, depthM: 8 } });
    expect(buildingForProject(tiny)?.ok).toBe(false);
    expect(meshForProject(tiny, "final")!.objects).toEqual([]);
  });

  it("gives a project with plot and plan a model-built mesh with footings", () => {
    const mesh = meshForProject(project(), "final")!;
    expect(mesh.objects.length).toBeGreaterThan(0);
    expect(mesh.objects.some((o) => o.kind === "footing")).toBe(true);
  });

  it("gives a save with no plot shape an empty mesh, never a guessed building", () => {
    const old = project({ plot: undefined, planId: undefined });
    expect(meshForProject(old, "final")?.objects ?? []).toEqual([]);
  });

  it("states the structural concrete as the BOQ figure (the bar schedule's total), not the sum of the 3D solids", () => {
    const p = project();
    const built = buildingForProject(p)!;
    if (!built.ok) throw new Error("the sample plan should fit");
    const model = built.model;
    const res = analyzeStructure(model);
    const mesh = meshForProject(p, "final")!;
    expect(mesh.structuralConcreteM3).toBeCloseTo(buildBbs(res, model).totals.concreteM3, 6);
  });
});
