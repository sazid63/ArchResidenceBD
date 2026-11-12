import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The design engine must give the same answer for the same input: no random numbers or clock reads in it.
// Clock defaults at the edge (`now = new Date()` parameters in the model and rules layers) are the only allowed use.
const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
const hits = (dirs: string[], re: RegExp) =>
  dirs.flatMap((d) => files(join(root, d)).flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).map((l, i) => (re.test(l) ? `${f}:${i + 1}: ${l.trim()}` : "")).filter(Boolean)));

describe("engine determinism guard", () => {
  it("no randomness anywhere in the engine", () => {
    expect(hits(["structure", "plans", "drawings", "quantities", "design", "interview", "rules", "model"], /Math\.random|crypto\.getRandomValues|crypto\.randomUUID/)).toEqual([]);
  });

  it("no clock reads in the structure, plan, drawing, quantity and design code", () => {
    expect(hits(["structure", "plans", "drawings", "quantities", "design", "interview"], /Date\.now|new Date\(|performance\.now/)).toEqual([]);
  });

  it("clock reads in model and rules are only default parameters", () => {
    const found = hits(["model", "rules"], /Date\.now|new Date\(/).filter((l) => !/(now|Date)[^=]*=\s*new Date\(\)/.test(l) && !/at: new Date\(\)\.toISOString\(\)/.test(l));
    expect(found).toEqual([]);
  });
});
