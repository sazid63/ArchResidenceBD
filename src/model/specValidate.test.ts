import { describe, expect, it } from "vitest";
import { createNewProject } from "../engine/projectState";
import type { V2Project } from "./legacyV2";
import { migrateV2, toProjectSpec } from "./migrate";
import { importProjectFile } from "./projectFile";
import { loadProjects, STORAGE_KEYS } from "./projectStore";
import { specProblems } from "./specValidate";

const NOW = "2026-11-12T10:00:00.000Z";
const good = () => migrateV2(createNewProject({ name: "P", stories: 4, plotSize: 3.5, plotUnit: "katha", unitsPerFloor: 2 }) as unknown as V2Project, NOW);
type Spec = ReturnType<typeof good>;
const withPatch = (f: (s: Spec) => void): Spec => {
  const s = JSON.parse(JSON.stringify(good())) as Spec;
  f(s);
  return s;
};

describe("value checks on a project from outside", () => {
  it("a normal project has no problems", () => expect(specProblems(good())).toEqual([]));

  it("rejects negative, absurd and non-numeric values", () => {
    const cases: Array<[string, (s: Spec) => void]> = [
      ["site.plot.areaSqm", (s) => void (s.site.plot.areaSqm = -1)],
      ["site.plot.areaSqm", (s) => void (s.site.plot.areaSqm = 1e308)],
      ["site.plot.frontageM", (s) => void (s.site.plot.frontageM = 1e9)],
      ["building.storeys.count", (s) => void (s.building.storeys.count = 2.5)],
      ["building.storeys.count", (s) => void (s.building.storeys.count = -3)],
      ["site.soil.sbcKpa", (s) => void (s.site.soil.sbcKpa = 1e12)],
      ["project.id", (s) => void (s.project.id = "")],
      ["project.name", (s) => void ((s.project as { name: unknown }).name = 5)],
      ["revision", (s) => void (s.revision = -1)],
      ["site.plot.areaSqm", (s) => void ((s.site.plot as { areaSqm: unknown }).areaSqm = null)],
    ];
    for (const [field, patch] of cases) expect(specProblems(withPatch(patch)), field).toContain(field);
  });

  it("toProjectSpec, file import and the store refuse them (the project is skipped, never half-loaded)", () => {
    const bad = withPatch((s) => void (s.site.plot.areaSqm = -5));
    expect(() => toProjectSpec(bad, NOW)).toThrow(/not valid/);
    const text = JSON.stringify({ format: "archres", schemaVersion: 3, projects: [good(), bad] });
    expect(importProjectFile(text, NOW)).toMatchObject({ ok: true, skipped: 1 });
    const data = new Map<string, string>();
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
    data.set(STORAGE_KEYS.projects, JSON.stringify({ schemaVersion: 3, projects: [good(), bad] }));
    expect(loadProjects(store, NOW)).toMatchObject({ skipped: 1 });
  });

  it("fuzz: random mutations of a valid file never throw, and everything accepted passes the checks", () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const junk: unknown[] = [null, -1, 0, 1e308, "x", "", [], {}, true, "__proto__", 2 ** 53];
    const text = JSON.stringify({ format: "archres", schemaVersion: 3, projects: [good()] });
    for (let i = 0; i < 300; i++) {
      const doc = JSON.parse(text) as unknown;
      const walk = (o: unknown, depth = 0): void => {
        if (!o || typeof o !== "object" || depth > 6) return;
        const rec = o as Record<string, unknown>;
        for (const k of Object.keys(rec)) {
          const r = rnd();
          if (r < 0.03) rec[k] = junk[Math.floor(rnd() * junk.length)];
          else if (r < 0.04) delete rec[k];
          else walk(rec[k], depth + 1);
        }
      };
      walk(doc);
      let result: ReturnType<typeof importProjectFile> | undefined;
      expect(() => {
        result = importProjectFile(JSON.stringify(doc), NOW);
      }).not.toThrow();
      if (result?.ok) for (const p of result.projects) expect(specProblems(p)).toEqual([]);
    }
  });
});
