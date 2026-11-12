/**
 * Golden files: for ten canonical buildings, the SHA-256 of every output an engineer would hand over (the structural
 * result, bar schedule CSV, BOQ CSV, every drawing sheet as SVG and DXF) is pinned in spec/reference/golden.json.
 * Any change in any number or line of any of them fails here, so an engine change cannot alter an output unseen.
 *
 * After an INTENDED change: `UPDATE_GOLDEN=1 npx vitest run src/validation/golden.test.ts`, read `git diff
 * spec/reference/golden.json` to see which outputs moved, and commit it with the reason.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeDesign } from "../design/compute";
import { buildSheets } from "../drawings/permit";
import { sceneToDxf, sceneToSvg } from "../drawings/scene";
import { deriveBuilding, type BuildingInput } from "../model/building";
import { boqToCsv } from "../quantities/takeoff";
import { bbsToCsv } from "../structure/bbsCsv";

const GOLDEN = join(__dirname, "..", "..", "spec", "reference", "golden.json");
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

const CASES: Array<{ id: string; input: BuildingInput }> = [
  { id: "narrow-2st", input: { plotWidthMm: 10000, plotDepthMm: 20000, storeys: 2, planId: "pn-2b" } },
  { id: "narrow-4st", input: { plotWidthMm: 10000, plotDepthMm: 20000, storeys: 4, planId: "pn-2b" } },
  { id: "narrow-6st-balcony", input: { plotWidthMm: 11000, plotDepthMm: 27000, storeys: 6, planId: "pn-2f+v" } },
  { id: "mid-2st", input: { plotWidthMm: 14000, plotDepthMm: 26000, storeys: 2, planId: "p2-2b-fb" } },
  { id: "mid-4st", input: { plotWidthMm: 14000, plotDepthMm: 26000, storeys: 4, planId: "p2-2b-fb" } },
  { id: "mid-7st", input: { plotWidthMm: 16000, plotDepthMm: 28000, storeys: 7, planId: "p2-2b-fb" } },
  { id: "mid-8st-dual", input: { plotWidthMm: 16000, plotDepthMm: 28000, storeys: 8, planId: "p2-2b-fb" } },
  { id: "wide-3st", input: { plotWidthMm: 24000, plotDepthMm: 32000, storeys: 3, planId: "p3-2b" } },
  { id: "wide-5st", input: { plotWidthMm: 24000, plotDepthMm: 32000, storeys: 5, planId: "p3-2b" } },
  { id: "wide-5st-mirrored", input: { plotWidthMm: 24000, plotDepthMm: 32000, storeys: 5, planId: "p3-2b", mirror: true } },
];

function outputs(input: BuildingInput): Record<string, string> {
  const b = deriveBuilding(input);
  if (!b.ok) throw new Error(`does not fit: ${b.reasons[0].message.en}`);
  const d = computeDesign(b.model);
  const out: Record<string, string> = {
    structure: sha(JSON.stringify(d.structure)),
    bbsCsv: sha(bbsToCsv(d.bbs.rows)),
    boqCsv: sha(boqToCsv(d.boq)),
  };
  for (const s of buildSheets(b.model, d.structure, "Golden", "2026-01-01", "en")) {
    out[`svg:${s.id}`] = sha(sceneToSvg(s.scene));
    out[`dxf:${s.id}`] = sha(sceneToDxf(s.scene));
  }
  return out;
}

describe("golden outputs", () => {
  const stored: Record<string, Record<string, string>> = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, "utf8")) : {};
  const update = process.env.UPDATE_GOLDEN === "1";
  const fresh: Record<string, Record<string, string>> = {};

  for (const c of CASES) {
    it(`${c.id}: every output is byte-identical to the pinned one`, () => {
      const got = outputs(c.input);
      fresh[c.id] = got;
      if (update) return;
      expect(stored[c.id], `no golden entry for ${c.id}: run with UPDATE_GOLDEN=1`).toBeDefined();
      const changed = Object.keys({ ...stored[c.id], ...got }).filter((k) => stored[c.id][k] !== got[k]);
      expect(changed, `outputs that changed in ${c.id}`).toEqual([]);
    });
  }

  it.runIf(update)("writes the golden file", () => {
    writeFileSync(GOLDEN, JSON.stringify(Object.fromEntries(CASES.map((c) => [c.id, fresh[c.id]])), null, 2) + "\n");
  });
});
