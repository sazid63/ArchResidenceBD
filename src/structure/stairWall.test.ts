import { describe, expect, it } from "vitest";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../model/building";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { analyzeStructure } from "./analyze";
import { buildBbs, concreteSteps } from "./bbs";
import { columnPlanScene } from "../drawings/structSheets";
import { checkStairWall, extraAcv, extraInertia, weakWallsMm } from "./core";
import type { FrameResult } from "./frame";

const maxCol = (fr: FrameResult) => Math.max(0, ...fr.columns.flatMap((c) => c.storeys.map((s) => Math.max(s.section.bx, s.section.by))));

function model12(planId: string) {
  const S = DEFAULT_SETBACKS_MM;
  const r = fitRange(PLAN_LIBRARY.find((p) => p.id === planId)!);
  const b = deriveBuilding({ planId, storeys: 12, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!b.ok) throw new Error("does not fit");
  return b.model;
}

describe("stair shear wall design (checkStairWall)", () => {
  // wall 4000 x 200, height 3000, fc 20.7, fy 500 (MATERIALS defaults are used when not given)
  const w = { dir: "x" as const, lengthMm: 4000, tMm: 200, leverMm: 0 };

  it("end steel: M / (phi fy 0.8 lw) split over two ends", () => {
    const c = checkStairWall(w, 1, 500, 2000, 3000, 20.7, 500);
    expect(c.asEndMm2).toBeCloseTo(((2000 * 1e6) / (0.9 * 500 * 0.8 * 4000)) / 2, 6);
    expect(c.asEndMaxMm2).toBeCloseTo(0.04 * 4000 * 200, 6);
    expect(c.flexureUtil).toBeCloseTo(c.asEndMm2 / c.asEndMaxMm2, 9);
  });

  it("boundary element: not needed at low edge stress; required and detailed above 0.2 fc'", () => {
    const low = checkStairWall(w, 1, 100, 500, 3000, 20.7, 500); // stress 6 M / (t lw^2) = 0.7 MPa
    expect(low.boundaryElementRequired).toBe(false);
    expect(low.boundary).toBeNull();
    const high = checkStairWall(w, 1, 100, 3000, 3000, 20.7, 500); // 4.2 MPa > 0.2 x 20.7 = 4.14
    expect(high.boundaryElementRequired).toBe(true);
    expect(high.boundary?.fits).toBe(true);
    expect(high.boundary?.lengthMm).toBeGreaterThanOrEqual(300);
  });

  it("shear: horizontal ratio at least 0.25 % and the utilisation uses the crushing cap", () => {
    const c = checkStairWall(w, 1, 1000, 0, 3000, 20.7, 500);
    expect(c.rhoHorizontal).toBeGreaterThanOrEqual(0.0025);
    expect(c.shearUtil).toBeGreaterThan(0);
  });
});

describe("stair shear walls in the structure", () => {
  it("p1-4b-wide at 12 storeys: the stair walls are used, carry the moment, and the columns drop below 1000 mm", () => {
    const m = model12("p1-4b-wide");
    const auto = analyzeStructure(m);
    const frameOnly = analyzeStructure(m, { stairWall: false });
    expect(auto.frame.options.stairWall).toBe(true);
    expect(maxCol(auto.frame)).toBeLessThan(maxCol(frameOnly.frame));
    expect(auto.failures.length).toBeLessThanOrEqual(frameOnly.failures.length);
    const shares = (auto.frame.core!.stairWalls ?? []).filter((s) => s.dir === "x").reduce((a, s) => a + s.shareI, 0);
    expect(shares).toBeGreaterThan(0);
    expect(shares).toBeLessThan(1);
  });

  it("the stair walls appear in the bar schedule and in the concrete takeoff", () => {
    const m = model12("p1-4b-wide");
    const res = analyzeStructure(m, { stairWall: true });
    const bbs = buildBbs(res, m);
    expect(bbs.rows.some((r) => r.description.en.includes("Stair shear wall"))).toBe(true);
    const steps = concreteSteps(res, m).filter((s) => s.id.startsWith("stair-wall-"));
    expect(steps.length).toBe((res.frame.core!.stairWalls ?? []).length);
    expect(steps.every((s) => s.m3 > 0)).toBe(true);
  });

  it("with the stair walls off, no stair-wall rows or concrete are added", () => {
    const m = model12("p1-4b-wide");
    const res = analyzeStructure(m, { stairWall: false });
    expect(res.frame.core!.stairWalls ?? []).toHaveLength(0);
    expect(buildBbs(res, m).rows.some((r) => r.description.en.includes("Stair shear wall"))).toBe(false);
  });

  it("an explicit stairWall choice is respected and the stair-wall assumption is listed", () => {
    const m = model12("p1-4b-wide");
    expect(analyzeStructure(m, { stairWall: true }).assumptions.some((a) => a.id === "stair-wall")).toBe(true);
    expect(analyzeStructure(m, { stairWall: false }).assumptions.some((a) => a.id === "stair-wall")).toBe(false);
  });
});

describe("weak-direction flange walls", () => {
  const fake = { origin: { x: 0, y: 0 }, widthMm: 10000, depthMm: 20000 } as never;

  it("placed on the footprint edge farthest from the core centre, running the full depth (x) or width (y)", () => {
    const walls = weakWallsMm(fake, 2000, 10000);
    expect(walls.find((w) => w.dir === "x")).toMatchObject({ dir: "x", kind: "flange", lengthMm: 20000, tMm: 200, leverMm: 8000 });
    expect(walls.find((w) => w.dir === "y")).toMatchObject({ dir: "y", kind: "flange", lengthMm: 10000, tMm: 200, leverMm: 10000 });
  });

  it("a flange adds only A d^2 to the inertia and no shear area", () => {
    const w = { dir: "x" as const, kind: "flange" as const, lengthMm: 20000, tMm: 200, leverMm: 8000 };
    expect(extraInertia(w)).toBeCloseTo(200 * 20000 * 8000 ** 2, 3);
    expect(extraAcv(w)).toBe(0);
  });

  it("a flange takes no shear and its end steel is the axial force N = M / d over phi fy, split over two ends", () => {
    const w = { dir: "x" as const, kind: "flange" as const, lengthMm: 20000, tMm: 200, leverMm: 8000 };
    const c = checkStairWall(w, 1, 900, 40000, 3000, 20.7, 500);
    expect(c.shearUtil).toBe(0);
    expect(c.kind).toBe("flange");
    expect(c.asEndMm2).toBeCloseTo((40000 * 1e6) / 8000 / (0.9 * 500) / 2, 6);
  });

  it("p2-2b-fb and p4-1b at 12 storeys: the columns drop from 1000 mm to 600 mm or less, with no failure", () => {
    for (const planId of ["p2-2b-fb", "p4-1b"]) {
      const m = model12(planId);
      const frameOnly = analyzeStructure(m, { stairWall: false });
      const auto = analyzeStructure(m);
      expect(maxCol(frameOnly.frame)).toBe(1000);
      expect(maxCol(auto.frame)).toBeLessThanOrEqual(600);
      expect(auto.ok).toBe(true);
      expect((auto.frame.core!.stairWalls ?? []).some((w) => w.kind === "flange")).toBe(true);
      expect(auto.assumptions.some((a) => a.id === "weak-wall")).toBe(true);
    }
  });
});

describe("shear walls on the structural sheets", () => {
  it("p2-2b-fb at 12 storeys: the lift shaft ring and every extra wall are drawn on WALLS, with a wall schedule", () => {
    const m = model12("p2-2b-fb");
    const res = analyzeStructure(m);
    const scene = columnPlanScene(m, res, "en");
    const walls = scene.entities.filter((e) => e.layer === "WALLS");
    const extra = res.frame.core!.section.extraWalls ?? [];
    expect(extra.length).toBeGreaterThan(0);
    expect(walls.length).toBe(2 + extra.length);
    const texts = scene.entities.filter((e) => e.kind === "text").map((e) => (e as { text: string }).text);
    expect(texts.some((t) => t.startsWith("WALL SCHEDULE"))).toBe(true);
    expect(texts.some((t) => t.includes("end wall"))).toBe(true);
  });

  it("with no extra walls only the lift shaft is drawn and no wall schedule is added", () => {
    const m = model12("p2-2b-fb");
    const res = analyzeStructure(m, { stairWall: false });
    const scene = columnPlanScene(m, res, "en");
    expect(scene.entities.filter((e) => e.layer === "WALLS").length).toBe(2);
    expect(scene.entities.some((e) => e.kind === "text" && (e as { text: string }).text.startsWith("WALL SCHEDULE"))).toBe(false);
  });
});
