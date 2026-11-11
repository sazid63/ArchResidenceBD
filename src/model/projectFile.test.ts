import { describe, expect, it } from "vitest";
import { createNewProject } from "../engine/projectState";
import type { V2Project } from "./legacyV2";
import { migrateV2 } from "./migrate";
import { exportProjects, importProjectFile, mergeImported, projectFileName, MAX_FILE_BYTES } from "./projectFile";

const NOW = "2026-11-12T10:00:00.000Z";
const spec = (name: string) => migrateV2(createNewProject({ name, stories: 4, plotSize: 3.5, plotUnit: "katha", unitsPerFloor: 2 }) as unknown as V2Project, NOW);

describe(".archres project file", () => {
  it("round trips projects exactly", () => {
    const a = spec("Mirpur plot");
    const b = spec("Uttara plot");
    const text = exportProjects([a, b], "3.0.0", NOW);
    const file = JSON.parse(text);
    expect(file).toMatchObject({ format: "archres", schemaVersion: 3, appVersion: "3.0.0", exportedAt: NOW });
    const r = importProjectFile(text, NOW);
    expect(r).toMatchObject({ ok: true, skipped: 0 });
    if (r.ok) expect(r.projects).toEqual([a, b]);
  });

  it("rejects damaged, foreign and oversized files with a message in both languages", () => {
    for (const [text, code] of [
      ["{not json", "not_json"],
      ["[]", "not_archres"],
      [JSON.stringify({ format: "something-else", projects: [] }), "not_archres"],
      [JSON.stringify({ format: "archres", schemaVersion: 3, projects: [] }), "empty"],
      ["x".repeat(MAX_FILE_BYTES + 1), "too_big"],
    ] as const) {
      const r = importProjectFile(text, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.code).toBe(code);
        expect(r.error.en.length).toBeGreaterThan(10);
        expect(r.error.bn.length).toBeGreaterThan(5);
      }
    }
  });

  it("refuses a file from a newer format and does not guess", () => {
    const r = importProjectFile(JSON.stringify({ format: "archres", schemaVersion: 4, projects: [{}] }), NOW);
    expect(r).toMatchObject({ ok: false, error: { code: "newer_version" } });
  });

  it("opens a v2 project record (migrated) and a bare v3 project", () => {
    const v2 = createNewProject({ name: "Old", stories: 4, plotSize: 3, plotUnit: "katha", unitsPerFloor: 2 });
    const asV2 = importProjectFile(JSON.stringify(v2), NOW);
    expect(asV2).toMatchObject({ ok: true });
    const s = spec("New");
    const bare = importProjectFile(JSON.stringify(s), NOW);
    expect(bare).toMatchObject({ ok: true });
  });

  it("skips unreadable projects but keeps the good ones", () => {
    const good = spec("Good");
    const text = JSON.stringify({ format: "archres", schemaVersion: 3, projects: [good, { nonsense: true }] });
    const r = importProjectFile(text, NOW);
    expect(r).toMatchObject({ ok: true, skipped: 1 });
    if (r.ok) expect(r.projects).toHaveLength(1);
  });

  it("an import never overwrites: a clashing id becomes a copy with a new id and a marked name", () => {
    const a = spec("Plot A");
    const clash = { ...spec("Plot A edited"), project: { ...spec("x").project, id: a.project.id, name: "Plot A edited" } };
    const fresh = spec("Plot B");
    let n = 0;
    const { merged, added } = mergeImported([a], [clash, fresh], () => `new-${++n}`);
    expect(merged).toHaveLength(3);
    expect(added[0].project.id).toBe("new-1");
    expect(added[0].project.name).toBe("Plot A edited (imported)");
    expect(added[1].project.id).toBe(fresh.project.id);
    expect(merged.find((p) => p.project.id === a.project.id)).toBe(a); // the saved one is untouched
  });

  it("makes a safe Windows file name", () => {
    expect(projectFileName("Mirpur 5 katha")).toBe("Mirpur-5-katha.archres");
    expect(projectFileName('a/b\\c:d*e?"f<g>h|i')).toBe("a-b-c-d-e-f-g-h-i.archres");
    expect(projectFileName("   ")).toBe("project.archres");
    expect(projectFileName("মিরপুর প্লট")).toBe("মিরপুর-প্লট.archres");
  });
});

describe("the shipped sample", () => {
  it("samples/sample-4-storey.archres opens", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../../samples/sample-4-storey.archres", import.meta.url), "utf8");
    const r = importProjectFile(text, NOW);
    expect(r).toMatchObject({ ok: true, skipped: 0 });
    if (r.ok) expect(r.projects[0].project.name).toBe("Sample block (4 storeys)");
  });
});
