import { describe, expect, it } from "vitest";
import { deriveBuilding } from "../model/building";
import { analyzeStructure } from "../structure/analyze";
import { buildSheets } from "./permit";
import { sceneToDxf, sceneToSvg, type TextEnt } from "./scene";
import { structuralScenes } from "./structSheets";

const build = (storeys: number) => {
  const b = deriveBuilding({ plotWidthMm: 20000, plotDepthMm: 30000, storeys, planId: "p2-2b-fb" });
  if (!b.ok) throw new Error("fit");
  return { model: b.model, res: analyzeStructure(b.model) };
};
const texts = (scene: { entities: Array<{ kind?: string }> }) => (scene.entities as unknown as Array<Partial<TextEnt> & { type?: string }>).filter((e) => typeof e.text === "string").map((e) => e.text as string);

describe("structural drawing sheets", () => {
  const { model, res } = build(4);
  const scenes = structuralScenes(model, res);

  it("notes, column layout, footing plan and one beam layout per level", () => {
    expect(scenes.map((s) => s.id)).toEqual(["struct-notes", "struct-columns", "struct-footings", ...res.levels.map((_, k) => `struct-beams-${k}`)]);
  });

  it("the notes state the materials, cover, seismic and wind basis and that it is a screening set", () => {
    const t = texts(scenes[0]).join("\n");
    expect(t).toContain("fc' 25 MPa");
    expect(t).toContain("Grade 420");
    expect(t).toContain("Z 0.2");
    expect(t).toMatch(/screening set/);
    expect(t).toMatch(/Sec 8\.3\.5\.4/);
  });

  it("the column sheet draws every column and its schedule lists every column id", () => {
    const t = texts(scenes[1]).join("\n");
    for (const c of res.frame.columns) expect(t).toContain(c.id);
    expect(t).toContain("COLUMN SCHEDULE");
    expect(t).toMatch(/dia \d+ @ \d+\/\d+/);
  });

  it("the footing sheet lists every footing id and the tie beams", () => {
    const t = texts(scenes[2]).join("\n");
    for (const f of res.foundation.footings) expect(t).toContain(f.id);
    expect(t).toContain("FOOTING SCHEDULE");
    expect(t).toContain("Tie beams");
  });

  it("a beam layout draws one line per span of every beam line and labels sizes", () => {
    const k = 1;
    const sc = scenes[3 + k];
    const spans = res.levels[k].beamLines.reduce((a, b) => a + b.result.spans.length, 0);
    const beamLines = (sc.entities as unknown as Array<{ layer?: string }>).filter((e) => e.layer === "CUT").length;
    expect(beamLines).toBe(spans);
    expect(texts(sc).join("\n")).toMatch(/\d+x\d+/);
    expect(texts(sc).join("\n")).toContain(`slab ${res.levels[k].slabThicknessMm} mm`);
  });

  it("the sheets are numbered S-001, S-101, S-102 and S-2nn, and render to SVG and DXF", () => {
    const sheets = buildSheets(model, res, "Test", "2026-11-13").filter((s) => s.id.startsWith("struct-"));
    expect(sheets.map((s) => s.sheetNo)).toEqual(["S-001", "S-101", "S-102", ...res.levels.map((_, k) => `S-2${String(k + 1).padStart(2, "0")}`)]);
    for (const s of sheets) {
      expect(sceneToSvg(s.scene).startsWith("<svg")).toBe(true);
      expect(sceneToDxf(s.scene).trimEnd().endsWith("EOF")).toBe(true);
    }
  });

  it("the same input gives the same sheets", () => {
    const again = structuralScenes(model, res);
    expect(JSON.stringify(again)).toBe(JSON.stringify(scenes));
  });
});
