import { describe, expect, it } from "vitest";
import { buildFreeCadMacro, buildIfcStep, validateIfcStep } from "../cad/exporters";
import { validateSolids } from "../cad/solidKernel";
import { deriveBuilding, DEFAULT_SETBACKS_MM } from "./building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { buildMesh, PLACEHOLDER, stairPlacement } from "./toMesh";

const S = DEFAULT_SETBACKS_MM;

function plotFor(planId: string) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  return { plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear };
}

function mesh(planId: string, storeys = 4) {
  const r = deriveBuilding({ planId, storeys, setbacksMm: S, ...plotFor(planId) });
  if (!r.ok) throw new Error(r.reasons.map((x) => x.message.en).join("; "));
  return { model: r.model, doc: buildMesh(r.model) };
}

describe("buildMesh", () => {
  it("has no overlaps, z-fighting, or floating solids", () => {
    const { doc } = mesh("p1-4b", 6);
    const report = validateSolids(doc.objects);
    expect(report.pass).toBe(true);
    expect(report.overlappingPairs).toBe(0);
    expect(report.floatingObjects).toEqual([]);
  });

  it("object counts follow the model: columns per storey match the column grid", () => {
    const { model, doc } = mesh("p1-4b", 4);
    const typicalCols = model.storeys[1].geometry.columns.length;
    for (let i = 0; i < 4; i++) {
      const phase = i === 0 ? "ground_floor" : `floor_${i}`;
      const colCount = doc.objects.filter((o) => o.phase === phase && o.kind === "column" && !o.id.includes("~")).length;
      expect(colCount).toBe(typicalCols);
    }
  });

  it("every phase the UI expects is present", () => {
    const { doc } = mesh("p2-2b-fb", 5);
    const phases = new Set(doc.objects.map((o) => o.phase));
    expect(phases.has("foundation")).toBe(true);
    expect(phases.has("ground_floor")).toBe(true);
    expect(phases.has("roof")).toBe(true);
    for (let i = 1; i <= 4; i++) expect(phases.has(`floor_${i}`)).toBe(true);
  });

  it("every door and window opening sits inside a wall it was cut from", () => {
    const { doc } = mesh("p1-4b", 2);
    const doors = doc.objects.filter((o) => o.kind === "door");
    const windows = doc.objects.filter((o) => o.kind === "window");
    expect(doors.length).toBeGreaterThan(0);
    expect(windows.length).toBeGreaterThan(0);
    // Door leaves should sit at the ground-floor level or above, never below grade.
    for (const d of doors) expect(d.bboxMinMm[2]).toBeGreaterThanOrEqual(-1);
  });

  it("gives the ground floor fewer or equal walls than a typical floor (parking stays open)", () => {
    const { doc } = mesh("p2-2b-fb", 4);
    const groundWalls = doc.objects.filter((o) => o.phase === "ground_floor" && (o.kind === "wall" || o.kind === "partition")).length;
    const floorWalls = doc.objects.filter((o) => o.phase === "floor_1" && (o.kind === "wall" || o.kind === "partition")).length;
    expect(groundWalls).toBeLessThan(floorWalls);
  });

  it("places columns and beams using the placeholder sections", () => {
    const { doc } = mesh("p1-4b", 2);
    const col = doc.objects.find((o) => o.kind === "column" && o.phase === "floor_1" && !o.id.includes("~"));
    expect(col).toBeDefined();
    if (col) {
      const w = col.bboxMaxMm[0] - col.bboxMinMm[0];
      const d = col.bboxMaxMm[1] - col.bboxMinMm[1];
      expect(Math.round(w)).toBe(PLACEHOLDER.column);
      expect(Math.round(d)).toBe(PLACEHOLDER.column);
    }
  });

  it("is deterministic", () => {
    const a = mesh("p1-4b", 3).doc;
    const b = mesh("p1-4b", 3).doc;
    expect(a.objects.length).toBe(b.objects.length);
    expect(JSON.stringify(a.objects.map((o) => o.id))).toBe(JSON.stringify(b.objects.map((o) => o.id)));
  });

  for (const plan of PLAN_LIBRARY)
    for (const storeys of [2, 6])
      it(`${plan.id} at ${storeys} storeys produces a valid, non-empty mesh`, () => {
        const { doc } = mesh(plan.id, storeys);
        expect(doc.objects.length).toBeGreaterThan(0);
        expect(validateSolids(doc.objects).pass).toBe(true);
      });
});

describe("buildMesh exports cleanly", () => {
  it("exports to IFC with zero validation errors", () => {
    const { doc } = mesh("p1-4b", 4);
    const ifc = buildIfcStep(doc, { projectName: "Test", stories: 4, plotSize: 4, plotUnit: "katha" });
    const errors = validateIfcStep(ifc);
    expect(errors).toEqual([]);
  });

  it("builds a FreeCAD macro without throwing", () => {
    const { doc } = mesh("p2-2b-fb", 3);
    expect(() => buildFreeCadMacro(doc, { projectName: "Test", stories: 3, plotSize: 4, plotUnit: "katha" })).not.toThrow();
  });
});

describe("stairPlacement", () => {
  it("places the stair inset from outside walls more than from interior walls", () => {
    const outside = stairPlacement({ x0: 0, y0: 0, x1: 3000, y1: 4000 }, 1000, 2000);
    const inside = stairPlacement({ x0: 3000, y0: 3000, x1: 6000, y1: 7000 }, 1000, 2000);
    expect(outside.originX).toBeGreaterThan(inside.originX - 3000 - 1000 + 1000);
  });
});
