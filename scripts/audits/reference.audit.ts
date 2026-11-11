/**
 * Reference and regression audit (P3-1). `npm run audit:reference`
 *
 * 1. Hand-calculated references: every spec/reference/*.json except TEMPLATE.json and snapshot.json is a building with hand
 *    numbers (see TEMPLATE.json). The app is run on the same input and each value that is not null is compared inside its tolerance.
 * 2. Regression snapshot: a fixed set of buildings is run and the key figures are compared with spec/reference/snapshot.json
 *    (committed). A change of more than 2 % fails, so an engine change cannot move a number unseen. After an intended change run
 *    UPDATE_SNAPSHOT=1 npm run audit:reference and commit the new file with the reason.
 * 3. Self-consistency: figures recomputed independently from the member sizes must agree with the schedule (steel per m3 in a
 *    plausible band, concrete equal to the pour steps, formwork equal to the BOQ lines).
 *
 * The report is written to scripts/audits/audit-out/reference.md.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveBuilding, type BuildingInput } from "../../src/model/building";
import { analyzeStructure } from "../../src/structure/analyze";
import { buildBbs, concreteSteps } from "../../src/structure/bbs";
import { buildBoq } from "../../src/quantities/takeoff";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const refDir = join(root, "spec", "reference");
const outDir = join(root, "scripts", "audits", "audit-out");

interface Figures {
  slabThicknessMm: number;
  deepestBeamMm: number;
  groundColumnMm: number;
  largestFootingSideMm: number;
  concreteM3: number;
  steelKg: number;
  steelKgPerM2Floor: number;
  formworkM2: number;
}

function figures(input: BuildingInput): Figures {
  const b = deriveBuilding(input);
  if (!b.ok) throw new Error(`does not fit: ${b.reasons[0].message.en}`);
  const res = analyzeStructure(b.model);
  const bbs = buildBbs(res, b.model);
  const floorM2 = b.model.footprintAreaM2 * b.model.storeys.length;
  const fw = bbs.totals.formworkM2;
  return {
    slabThicknessMm: res.levels[0].slabThicknessMm,
    deepestBeamMm: Math.max(...res.levels.flatMap((l) => l.beamLines.map((x) => x.result.section.hMm))),
    groundColumnMm: Math.max(...res.frame.columns.map((c) => Math.max(c.storeys[0].section.bx, c.storeys[0].section.by))),
    largestFootingSideMm: Math.max(...res.foundation.footings.map((f) => Math.max(f.x1 - f.x0, f.y1 - f.y0))),
    concreteM3: Math.round(bbs.totals.concreteM3 * 10) / 10,
    steelKg: Math.round(bbs.totals.weightKg),
    steelKgPerM2Floor: Math.round((bbs.totals.weightKg / floorM2) * 10) / 10,
    formworkM2: Math.round((fw.footing + fw.column + fw.beam + fw.slab + fw.core) * 10) / 10,
  };
}

/** The regression set: narrow, mid and wide plots, 2 to 7 storeys (the supported range), a balcony variant included. */
const SNAPSHOT_CASES: Array<{ id: string; input: BuildingInput }> = [
  { id: "narrow-4st", input: { plotWidthMm: 10000, plotDepthMm: 20000, storeys: 4, planId: "pn-2b" } },
  { id: "narrow-6st-balcony", input: { plotWidthMm: 11000, plotDepthMm: 27000, storeys: 6, planId: "pn-2f+v" } },
  { id: "mid-2st", input: { plotWidthMm: 14000, plotDepthMm: 26000, storeys: 2, planId: "p2-2b-fb" } },
  { id: "mid-4st", input: { plotWidthMm: 14000, plotDepthMm: 26000, storeys: 4, planId: "p2-2b-fb" } },
  { id: "mid-7st", input: { plotWidthMm: 16000, plotDepthMm: 28000, storeys: 7, planId: "p2-2b-fb" } },
  { id: "wide-5st", input: { plotWidthMm: 24000, plotDepthMm: 32000, storeys: 5, planId: "p3-2b" } },
];

describe("reference buildings (hand calculations)", () => {
  const files = existsSync(refDir) ? readdirSync(refDir).filter((f) => f.endsWith(".json") && f !== "TEMPLATE.json" && f !== "snapshot.json") : [];
  it("compares each filled-in reference inside its tolerance", () => {
    const lines = ["# Reference audit", "", `Date: ${new Date().toISOString().slice(0, 10)}`, ""];
    if (files.length === 0) lines.push("No hand-calculated references yet (spec/reference/TEMPLATE.json explains how to add one).", "");
    for (const f of files) {
      const ref = JSON.parse(readFileSync(join(refDir, f), "utf8")) as { name: string; input: BuildingInput; expected: Record<string, number | null>; tolerancePercent?: Record<string, number> };
      const got = figures(ref.input) as unknown as Record<string, number>;
      lines.push(`## ${ref.name}`, "", "| Figure | Expected | App | Difference | Tolerance |", "|---|---|---|---|---|");
      for (const [k, want] of Object.entries(ref.expected)) {
        if (want === null || want === undefined) continue;
        const tol = ref.tolerancePercent?.[k] ?? ref.tolerancePercent?.default ?? 15;
        const diff = ((got[k] - want) / want) * 100;
        lines.push(`| ${k} | ${want} | ${got[k]} | ${diff.toFixed(1)} % | ${tol} % |`);
        expect(Math.abs(diff), `${ref.name}: ${k} app ${got[k]} vs hand ${want}`).toBeLessThanOrEqual(tol);
      }
      lines.push("");
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "reference.md"), lines.join("\n"));
  });
});

describe("regression snapshot", () => {
  const snapFile = join(refDir, "snapshot.json");
  it("key figures stay within 2 % of the committed snapshot", () => {
    const current = Object.fromEntries(SNAPSHOT_CASES.map((c) => [c.id, figures(c.input)]));
    if (process.env.UPDATE_SNAPSHOT === "1" || !existsSync(snapFile)) {
      writeFileSync(snapFile, JSON.stringify(current, null, 2) + "\n");
      return;
    }
    const snap = JSON.parse(readFileSync(snapFile, "utf8")) as Record<string, Record<string, number>>;
    for (const c of SNAPSHOT_CASES) {
      for (const [k, v] of Object.entries(current[c.id] as unknown as Record<string, number>)) {
        const was = snap[c.id]?.[k];
        expect(was, `${c.id}.${k} missing from snapshot (run UPDATE_SNAPSHOT=1)`).toBeDefined();
        expect(Math.abs((v - was) / was) * 100, `${c.id}.${k}: now ${v}, snapshot ${was}`).toBeLessThanOrEqual(2);
      }
    }
  });
});

describe("self-consistency", () => {
  for (const c of SNAPSHOT_CASES) {
    it(`${c.id}: steel density, concrete equals the pours, formwork equals the BOQ`, () => {
      const b = deriveBuilding(c.input);
      if (!b.ok) throw new Error("fit");
      const res = analyzeStructure(b.model);
      const bbs = buildBbs(res, b.model);
      expect(bbs.totals.kgPerM3, "steel kg per m3 of concrete").toBeGreaterThan(60);
      expect(bbs.totals.kgPerM3).toBeLessThan(160);
      expect(concreteSteps(res, b.model).reduce((a, s) => a + s.m3, 0)).toBeCloseTo(bbs.totals.concreteM3, 6);
      const boq = buildBoq(b.model, bbs);
      const fw = bbs.totals.formworkM2;
      const boqFw = ["formwork-footing", "formwork-column", "formwork-beam", "formwork-slab", "formwork-core"].reduce((a, id) => a + (boq.lines.find((l) => l.id === id)?.quantity ?? 0), 0);
      expect(boqFw).toBeCloseTo(fw.footing + fw.column + fw.beam + fw.slab + fw.core, 6);
    });
  }
});
