import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "../structure/analyze";
import { buildSheets } from "./permit";
import type { Entity } from "./scene";

const build = () => {
  const b = deriveBuilding({ plotWidthMm: 14000, plotDepthMm: 26000, storeys: 4, planId: "p2-2b-fb" });
  if (!b.ok) throw new Error("fit");
  return { model: b.model, res: analyzeStructure(b.model) };
};
const texts = (es: Entity[]) => es.filter((e): e is Extract<Entity, { kind: "text" }> => e.kind === "text").map((e) => e.text);

describe("plan and section annotations (P1-4)", () => {
  it("floor plans have a bubble for every structural grid, lettered along x and numbered along y, with the spans between", () => {
    const { model, res } = build();
    const sheet = buildSheets(model, res, "T", "2026-11-12", "en").find((s) => s.id === "plan-1")!;
    const t = texts(sheet.scene.entities);
    const f = model.storeys[1].geometry.fitted;
    for (let i = 0; i < f.structuralX.length; i++) expect(t).toContain(String.fromCharCode(65 + i));
    for (let i = 0; i < f.structuralY.length; i++) expect(t).toContain(String(i + 1));
    const spans = f.structuralX.slice(1).map((ix, k) => String(f.xLines[ix] - f.xLines[f.structuralX[k]]));
    for (const s of spans) expect(t).toContain(s);
  });

  it("door and window tags are one per distinct size, and the schedules count every opening", () => {
    const { model, res } = build();
    const sheet = buildSheets(model, res, "T", "2026-11-12", "en").find((s) => s.id === "plan-1")!;
    const t = texts(sheet.scene.entities);
    expect(t).toContain("Door schedule");
    expect(t).toContain("Window schedule");
    const geo = model.storeys[1].geometry;
    const doorSizes = new Set(geo.doors.map((d) => d.to - d.from));
    const winSizes = new Set(geo.windows.map((w) => w.to - w.from));
    for (let i = 1; i <= doorSizes.size; i++) expect(t).toContain(`D${i}`);
    for (let i = 1; i <= winSizes.size; i++) expect(t).toContain(`W${i}`);
    expect(t).not.toContain(`D${doorSizes.size + 1}`);
    // quantities in the door schedule add up to the number of doors drawn
    const qtyRows = t.filter((x) => /^\d+ x 2100$/.test(x)).length;
    expect(qtyRows).toBe(doorSizes.size);
  });

  it("the stair has an UP arrow, in Bangla too", () => {
    const { model, res } = build();
    expect(texts(buildSheets(model, res, "T", "d", "en").find((s) => s.id === "plan-1")!.scene.entities)).toContain("UP");
    expect(texts(buildSheets(model, res, "T", "d", "bn").find((s) => s.id === "plan-1")!.scene.entities)).toContain("উপরে");
  });

  it("the section shows the slab thickness and the edge beam size from the structure result", () => {
    const { model, res } = build();
    const sheet = buildSheets(model, res, "T", "d", "en").find((s) => s.id === "section-a-a")!;
    const line = texts(sheet.scene.entities).find((x) => x.startsWith("slab "))!;
    const sec = res.levels[0].beamLines.map((b) => b.result.section).reduce((a, c) => (c.hMm > a.hMm ? c : a));
    expect(line).toBe(`slab ${res.levels[0].slabThicknessMm}, edge beam ${sec.bMm} x ${sec.hMm}`);
  });
});
