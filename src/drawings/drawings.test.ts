import { describe, expect, it } from "vitest";
import type { BuildingProject } from "../engine/projectState";
import { buildingForProject } from "../model/projectMesh";
import { fitRange } from "../plans/fit";
import { PLAN_LIBRARY } from "../plans/library";
import { analyzeStructure } from "../structure/analyze";
import { buildPermitPackage, buildSheets, packageToZip, reportToMarkdown } from "./permit";
import { bounds, SceneBuilder, sceneToDxf, sceneToSvg } from "./scene";
import { elevationScene, elevationU, planScene, sectionCutY, sectionScene, siteScene, withTitleBlock } from "./sheets";
import { crc32, makeZip } from "./zip";

function project(storeys = 4): BuildingProject {
  const plan = PLAN_LIBRARY.find((p) => p.id === "p1-4b")!;
  const r = fitRange(plan);
  return {
    id: "p1", name: "Test <House> & Co", address: "", stories: storeys, plotSize: 0, plotUnit: "sqm", plotSqm: 0, unitsPerFloor: plan.unitsPerFloor,
    createdAt: "", updatedAt: "", phases: [], designStarted: false,
    plot: { frontageM: (r.widthMm.pref + 3600) / 1000, depthM: (r.depthMm.pref + 5000) / 1000, roadWidthM: 9, roadSide: "south" },
    planId: plan.id,
  } as BuildingProject;
}
function modelFor(p: BuildingProject) {
  const b = buildingForProject(p);
  if (!b || !b.ok) throw new Error("fit");
  return b.model;
}

describe("scene writers", () => {
  const sb = new SceneBuilder();
  sb.line("WALLS", 0, 0, 1000, 0);
  sb.rect("CUT", 0, 0, 1000, 500);
  sb.text("TEXT", 500, 250, 100, "A <b> & \"c\"", "middle");
  sb.text("TEXT", 0, 600, 100, "বাংলা");
  const scene = sb.scene("t", "Test");

  it("SVG escapes text and puts higher y higher on the page", () => {
    const svg = sceneToSvg(scene);
    expect(svg).toContain("A &lt;b&gt; &amp; &quot;c&quot;");
    const line = /<line x1="0" y1="([\d.]+)"/.exec(svg)!;
    const text = /<text x="0" y="([\d.]+)"/.exec(svg)!;
    expect(Number(text[1])).toBeLessThan(Number(line[1])); // y = 600 is above y = 0
  });

  it("DXF is well formed R12: code/value pairs, layers declared, entity counts match, EOF last", () => {
    const dxf = sceneToDxf(scene);
    const lines = dxf.trimEnd().split("\n");
    expect(lines.length % 2).toBe(0);
    for (let i = 0; i < lines.length; i += 2) expect(Number.isInteger(Number(lines[i]))).toBe(true);
    expect(lines.slice(-2)).toEqual(["0", "EOF"]);
    const count = (kind: string) => lines.filter((l, i) => i % 2 === 1 && l === kind && lines[i - 1] === "0").length;
    expect(count("LINE")).toBe(1);
    expect(count("POLYLINE")).toBe(1);
    expect(count("VERTEX")).toBe(4);
    expect(count("SEQEND")).toBe(1);
    expect(count("TEXT")).toBe(2);
    const tableStart = lines.indexOf("LAYER");
    for (const name of ["WALLS", "CUT", "TEXT"]) expect(lines.slice(tableStart)).toContain(name);
    expect(dxf).not.toMatch(/[^\x00-\x7f]/); // R12 text is ASCII: Bengali becomes ?
  });
});

describe("zip", () => {
  it("CRC-32 of the ASCII digits 1 to 9 is 0xCBF43926", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round trip: end record, central directory, local headers and stored data", () => {
    const enc = new TextEncoder();
    const z = makeZip([{ name: "a/b.txt", data: enc.encode("hello") }, { name: "c.txt", data: enc.encode("বাংলা") }], "2026-11-09");
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    const eocd = z.length - 22;
    expect(v.getUint32(eocd, true)).toBe(0x06054b50);
    expect(v.getUint16(eocd + 10, true)).toBe(2);
    let p = v.getUint32(eocd + 16, true);
    const out: Record<string, string> = {};
    for (let i = 0; i < 2; i++) {
      expect(v.getUint32(p, true)).toBe(0x02014b50);
      const size = v.getUint32(p + 24, true);
      const nameLen = v.getUint16(p + 28, true);
      const off = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(z.slice(p + 46, p + 46 + nameLen));
      expect(v.getUint32(off, true)).toBe(0x04034b50);
      const dataStart = off + 30 + v.getUint16(off + 26, true);
      const data = z.slice(dataStart, dataStart + size);
      expect(v.getUint32(off + 14, true)).toBe(crc32(data));
      out[name] = new TextDecoder().decode(data);
      p += 46 + nameLen;
    }
    expect(out).toEqual({ "a/b.txt": "hello", "c.txt": "বাংলা" });
  });
});

describe("sheets from the model", () => {
  const p = project(4);
  const m = modelFor(p);

  it("elevation viewer mapping: standing outside each face, to the right is +x (front), -x (rear), +y (right), -y (left)", () => {
    expect(elevationU("front", 10000, 16000, 2000, 5)).toBe(2000);
    expect(elevationU("rear", 10000, 16000, 2000, 5)).toBe(8000);
    expect(elevationU("left", 10000, 16000, 3, 4000)).toBe(12000);
    expect(elevationU("right", 10000, 16000, 3, 4000)).toBe(4000);
  });

  it("plan: one wall polygon per wall segment, one window outline per window, one marker per column, sized from the structure", () => {
    const res = analyzeStructure(m);
    const geo = m.storeys[1].geometry;
    const sc = planScene(m, 1);
    expect(sc.entities.filter((e) => e.kind === "poly" && e.layer === "WALLS").length).toBe(geo.walls.length);
    expect(sc.entities.filter((e) => e.kind === "poly" && e.layer === "WINDOWS").length).toBe(geo.windows.length);
    expect(sc.entities.filter((e) => e.kind === "poly" && e.layer === "COLUMNS").length).toBe(geo.columns.length);
    const sized = buildSheets(m, res, "P", "2026-11-09").find((s) => s.id === "plan-1")!.scene;
    const col = sized.entities.find((e) => e.kind === "poly" && e.layer === "COLUMNS")!;
    if (col.kind !== "poly") throw new Error("poly");
    expect(col.pts[1][0] - col.pts[0][0]).toBeGreaterThanOrEqual(250);
  });

  it("site plan holds the plot, the setback line and the building footprint", () => {
    const polys = siteScene(m).entities.filter((e) => e.kind === "poly");
    expect(polys.map((e) => e.layer)).toEqual(["SITE", "SETBACK", "OUTLINE"]);
    const fp = polys[2];
    if (fp.kind !== "poly") throw new Error("poly");
    expect(fp.pts[2][0] - fp.pts[0][0]).toBe(m.widthMm);
    expect(fp.pts[2][1] - fp.pts[0][1]).toBe(m.depthMm);
  });

  it("section: a slab at every storey top and the roof, levels labelled, cut through the stair cover", () => {
    const sc = sectionScene(m, 150);
    const slabs = sc.entities.filter((e) => e.kind === "poly" && e.layer === "CUT" && e.pts.length === 4 && e.pts[1][0] - e.pts[0][0] === m.widthMm);
    expect(slabs.length).toBe(m.storeys.length + 1);
    const labels = sc.entities.filter((e) => e.kind === "text" && /^[+-]\d+\.\d{2}$/.test(e.text)).map((e) => (e.kind === "text" ? e.text : ""));
    expect(labels).toContain("+0.00");
    expect(labels).toContain(`+${(m.roof.levelMm / 1000).toFixed(2)}`);
    const c = m.roof.stairCover!;
    expect(sectionCutY(m)).toBe(Math.round((c.y0 + c.y1) / 2));
  });

  it("elevations: the four faces together show every window of the building", () => {
    const total = m.storeys.reduce((s, st) => s + st.geometry.windows.length, 0);
    let shown = 0;
    for (const side of ["front", "rear", "left", "right"] as const) {
      shown += elevationScene(m, side).entities.filter((e) => e.kind === "poly" && e.layer === "WINDOWS").length;
    }
    expect(shown).toBe(total);
  });

  it("window rectangles on an elevation sit at sill 900 and height 1200 on a storey level, inside the face", () => {
    for (const e of elevationScene(m, "front").entities) {
      if (e.kind !== "poly" || e.layer !== "WINDOWS") continue;
      const [x0, z0] = e.pts[0];
      const [x1, z1] = e.pts[2];
      expect(x0).toBeGreaterThanOrEqual(0);
      expect(x1).toBeLessThanOrEqual(m.widthMm);
      expect(z1 - z0).toBe(1200);
      expect((z0 - 900) % m.input.floorToFloorMm).toBe(0);
    }
  });

  it("title block goes below the drawing with project, sheet number, date and the not-for-construction note", () => {
    const sc = planScene(m, 0);
    const before = bounds(sc.entities);
    const t = withTitleBlock(sc, { project: "Proj", sheetNo: "A-101", title: "Ground", date: "2026-11-09", scale: "1 unit = 1 mm" });
    const added = t.entities.slice(sc.entities.length);
    const text = added.map((e) => (e.kind === "text" ? e.text : "")).join(" ");
    expect(text).toMatch(/Proj/);
    expect(text).toMatch(/A-101/);
    expect(text).toMatch(/2026-11-09/);
    expect(text).toMatch(/not for construction/i);
    expect(bounds(added).maxY).toBeLessThan(before.minY);
  });
});

describe("permit package", () => {
  const p = project(4);
  const m = modelFor(p);
  const files = buildPermitPackage(p, m, "2026-11-09");
  const paths = files.map((f) => f.path);

  it("has drawings (SVG and DXF per sheet), BOQ, bar schedule, compliance report, assumptions and an index", () => {
    const sheets = 1 + m.storeys.length + 1 + 4;
    expect(paths.filter((x) => x.endsWith(".dxf")).length).toBe(sheets);
    expect(paths.filter((x) => x.endsWith(".svg")).length).toBe(sheets);
    for (const f of ["README.md", "boq/boq.csv", "structure/bar-schedule.csv", "compliance/report.md", "assumptions.md"]) expect(paths).toContain(f);
    expect(new Set(paths).size).toBe(paths.length);
    const readme = files.find((f) => f.path === "README.md")!.text;
    for (const x of paths.filter((q) => q !== "README.md")) expect(readme).toContain(x);
    expect(readme).toMatch(/signed by licensed professionals/);
  });

  it("every SVG is standalone and every DXF ends with EOF; names are escaped in SVG", () => {
    for (const f of files.filter((x) => x.path.endsWith(".svg"))) {
      expect(f.text.startsWith("<svg")).toBe(true);
      expect(f.text).not.toContain("Test <House>");
    }
    for (const f of files.filter((x) => x.path.endsWith(".dxf"))) expect(f.text.trimEnd().endsWith("EOF")).toBe(true);
    const site = files.find((f) => f.path.includes("site") && f.path.endsWith(".svg"))!.text;
    expect(site).toContain("Test &lt;House&gt; &amp; Co");
  });

  it("the BOQ file is the BOQ CSV, and assumptions name the rate card in English and Bengali", () => {
    expect(files.find((f) => f.path === "boq/boq.csv")!.text).toMatch(/^item,category,description/);
    const a = files.find((f) => f.path === "assumptions.md")!.text;
    expect(a).toContain("pwd-sor-2022-civil-works");
    expect(a).toContain("candidate");
    expect(a).toMatch(/\(BN\)/);
    expect(a).toMatch(/[ঀ-৿]/);
  });

  it("the compliance report has a summary line and a result per row", () => {
    const md = files.find((f) => f.path === "compliance/report.md")!.text;
    expect(md).toMatch(/^# Compliance report: Test <House> & Co/);
    expect(md).toMatch(/Total \d+: \d+ fail/);
    expect(md).toMatch(/\| (PASS|FAIL|WARN|NOT CHECKED) \|/);
    expect(reportToMarkdown({ state: "no_plan" }, "X", "d")).toMatch(/No plan/);
  });

  it("is deterministic and zips: same inputs give the same bytes, entry count matches", () => {
    const again = buildPermitPackage(p, m, "2026-11-09");
    expect(again.map((f) => f.text)).toEqual(files.map((f) => f.text));
    const z = packageToZip(files, "2026-11-09");
    expect(Array.from(z)).toEqual(Array.from(packageToZip(again, "2026-11-09")));
    const v = new DataView(z.buffer, z.byteOffset, z.byteLength);
    expect(v.getUint16(z.length - 22 + 10, true)).toBe(files.length);
  });
});
