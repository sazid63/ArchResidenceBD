import { describe, expect, it } from "vitest";
import type { BuildingProject } from "../engine/projectState";
import { buildingForProject } from "../model/projectMesh";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { buildSheets } from "./permit";
import { sceneToDxf, sceneToSvg } from "./scene";

const NAME = `<img src=x onerror=alert(1)> & "Co" 'x'`;

function model() {
  const plan = PLAN_LIBRARY.find((p) => p.id === "p1-4b")!;
  const r = fitRange(plan);
  const p = {
    id: "p1", name: NAME, address: "", stories: 4, plotSize: 0, plotUnit: "sqm", plotSqm: 0, unitsPerFloor: plan.unitsPerFloor,
    createdAt: "", updatedAt: "", phases: [], designStarted: false,
    plot: { frontageM: (r.widthMm.pref + 3600) / 1000, depthM: (r.depthMm.pref + 5000) / 1000, roadWidthM: 9, roadSide: "south" },
    planId: plan.id,
  } as BuildingProject;
  const b = buildingForProject(p);
  if (!b || !b.ok) throw new Error("fit");
  return b.model;
}

describe("determinism and hostile text", () => {
  it("same input gives byte-identical sheets, SVG, DXF and bar schedule", () => {
    const run = () => {
      const m = model();
      const res = analyzeStructure(m);
      const sheets = buildSheets(m, res, NAME, "2026-11-12", "en");
      return JSON.stringify({ svg: sheets.map((s) => sceneToSvg(s.scene)), dxf: sheets.map((s) => sceneToDxf(s.scene)), bbs: buildBbs(res, m) });
    };
    expect(run()).toBe(run());
  });

  it("a hostile project name never reaches the SVG as markup", () => {
    const m = model();
    const sheets = buildSheets(m, analyzeStructure(m), NAME, "2026-11-12", "en");
    for (const s of sheets) {
      const svg = sceneToSvg(s.scene);
      expect(svg).not.toContain("<img");
      expect(svg).not.toContain("<script");
    }
  });
});
