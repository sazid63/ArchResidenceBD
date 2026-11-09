/**
 * Structural sweep (npm run audit:structural, part of CI): runs the whole src/structure analysis over every plan in
 * the library at several heights and two site classes, and checks model-wide invariants that no single unit test sees:
 *
 *   - the sizing loop converges and the result is deterministic;
 *   - the load path is closed: column base dead loads = every beam span's dead load + column weights;
 *   - base shear = Sa x W; the seismic weight is plausible per m2 of floor (8 to 20 kN/m2);
 *   - total base column load, base shear and footing size never fall as storeys are added;
 *   - nothing is clamped: any member over its limit is listed as a failure with a ratio over 1;
 *   - a building with no listed failure has every member ratio at or below 1;
 *   - the bar schedule uses stock diameters only, provides at least the steel required by every member that fits,
 *     adds up, stays between 50 and 200 kg of steel per m3 of concrete, has no row longer than the 12 m stock bar,
 *     and every flexural member, with the lever arm of its bars as placed, carries its design moment.
 *
 * The outcome per case (pass or the worst ratio) is written to scripts/audits/audit-out/structural-sweep.md; outcomes
 * are reported, not asserted, because tall frames legitimately fail drift without shear walls.
 *
 * Run with vitest (the rule packs load through Vite): see vitest.audit.config.ts.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeStructure } from "../../src/structure/analyze";
import { isStockBar } from "../../src/structure/barSelect";
import { buildBbs, STOCK_LENGTH_MM } from "../../src/structure/bbs";
import { UNIT_WEIGHTS } from "../../src/structure/materials";
import { DEFAULT_SETBACKS_MM, deriveBuilding } from "../../src/model/building";
import { fitRange } from "../../src/plans/fit";
import { PLAN_LIBRARY } from "../../src/plans/library";
import type { SiteClass } from "../../src/rules/bnbcStructure";

const S = DEFAULT_SETBACKS_MM;
const STOREYS = [3, 5, 7, 9, 12];
const SITES: SiteClass[] = ["SC", "SD"];

function build(planId: string, storeys: number) {
  const plan = PLAN_LIBRARY.find((p) => p.id === planId)!;
  const r = fitRange(plan);
  const out = deriveBuilding({ planId, storeys, setbacksMm: S, plotWidthMm: r.widthMm.pref + S.left + S.right, plotDepthMm: r.depthMm.pref + S.front + S.rear });
  if (!out.ok) throw new Error(`${planId} x${storeys} does not fit its preferred plot`);
  return out.model;
}

interface Row {
  plan: string;
  storeys: number;
  site: SiteClass;
  outcome: string;
  worst: number;
  period: number;
  baseShear: number;
  weightPerM2: number;
  maxColumn: string;
  footing: string;
  iterations: number;
  steelKg: number;
  kgPerM3: number;
}

const rows: Row[] = [];

describe("structural sweep", () => {
  for (const plan of PLAN_LIBRARY)
    for (const site of SITES)
      describe(`${plan.id} on site ${site}`, () => {
        const history: Array<{ n: number; load: number; shear: number; side: number }> = [];

        for (const n of STOREYS) {
          it(`${n} storeys: invariants hold`, () => {
            const m = build(plan.id, n);
            const res = analyzeStructure(m, { siteClass: site });
            const fr = res.frame;

            // 1. converged, deterministic
            expect(fr.iterations).toBeLessThanOrEqual(30);
            expect(JSON.stringify(analyzeStructure(m, { siteClass: site }))).toBe(JSON.stringify(res));

            // 2. load path closed
            let beams = 0;
            for (const lv of res.levels) for (const line of lv.beamLines) for (const sp of line.result.spans) beams += (sp.dKnM * sp.lengthMm) / 1000;
            let colW = 0;
            for (const c of fr.columns) for (const st of c.storeys) colW += (UNIT_WEIGHTS.frameConcrete * st.section.bx * st.section.by * m.input.floorToFloorMm) / 1e9;
            const base = fr.columns.reduce((a, c) => a + c.storeys[0].deadKn, 0);
            expect(Math.abs(base - (beams + colW)) / base).toBeLessThan(1e-9);

            // 3. seismic: V = Sa W, plausible weight per m2 of floor
            const sx = fr.seismicX;
            expect(Math.abs(sx.baseShearKn - sx.sa * sx.weightKn)).toBeLessThan(1e-6);
            const perM2 = sx.weightKn / (n * m.footprintAreaM2);
            expect(perM2).toBeGreaterThan(8);
            expect(perM2).toBeLessThan(20);

            // 4. nothing clamped, and consistent failure listing
            for (const f of res.failures) expect(f.util).toBeGreaterThan(1);
            const allUtils = [...res.levels.flatMap((l) => [...l.panels.map((p) => p.result.util), ...l.beamLines.map((b) => b.result.util)]), ...fr.columns.flatMap((c) => [c.footing.util, ...c.storeys.map((s) => s.util)])];
            if (res.failures.length === 0) for (const u of allUtils) expect(u).toBeLessThanOrEqual(1 + 1e-9);
            expect(res.ok).toBe(res.failures.length === 0);

            // 5. bar bending schedule
            const bbs = buildBbs(res, m);
            for (const r of bbs.rows) expect(isStockBar(r.diaMm)).toBe(true);
            for (const pk of bbs.picks) if (pk.fits) expect(pk.providedMm2).toBeGreaterThanOrEqual(pk.requiredMm2 - 1e-6);
            expect(bbs.totals.weightKg).toBeCloseTo(bbs.rows.reduce((a, r) => a + r.weightKg, 0), 6);
            expect(bbs.totals.kgPerM3).toBeGreaterThan(50);
            expect(bbs.totals.kgPerM3).toBeLessThan(200);
            if (res.ok) expect(bbs.issues.filter((i) => i.severity === "fail")).toHaveLength(0);
            // independent capacity of each flexural member as detailed: phi Mn = 0.9 As fy (d - a/2), a = As fy / (0.85 fc b)
            for (const pk of bbs.picks.filter((q) => q.muKnM !== undefined && q.fits)) {
              const a = (pk.providedMm2 * 420) / (0.85 * 20 * pk.widthMm!);
              expect((0.9 * pk.providedMm2 * 420 * (pk.dMm! - a / 2)) / 1e6, pk.ref).toBeGreaterThanOrEqual(pk.muKnM! - 1e-6);
            }
            for (const r of bbs.rows) expect(r.cutLengthMm, r.description.en).toBeLessThanOrEqual(STOCK_LENGTH_MM);

            const c0 = fr.columns.reduce((a, c) => (c.storeys[0].section.bx * c.storeys[0].section.by > a.storeys[0].section.bx * a.storeys[0].section.by ? c : a));
            history.push({ n, load: fr.columns.reduce((a, c) => a + c.storeys[0].deadKn + c.storeys[0].liveKn, 0), shear: sx.baseShearKn, side: Math.max(...fr.columns.map((c) => c.footing.sideMm)) });
            rows.push({
              plan: plan.id,
              storeys: n,
              site,
              outcome: res.ok ? "pass" : `fail x${res.failures.length}`,
              worst: res.util,
              period: sx.periodS,
              baseShear: sx.baseShearKn,
              weightPerM2: perM2,
              maxColumn: `${c0.storeys[0].section.bx}x${c0.storeys[0].section.by}`,
              footing: `${Math.max(...fr.columns.map((c) => c.footing.sideMm))}`,
              iterations: fr.iterations,
              steelKg: bbs.totals.weightKg,
              kgPerM3: bbs.totals.kgPerM3,
            });
          });
        }

        it("more storeys never lower the total base column load, base shear or footing size", () => {
          expect(history.length).toBe(STOREYS.length);
          for (let i = 1; i < history.length; i++) {
            expect(history[i].load).toBeGreaterThan(history[i - 1].load * 0.999);
            expect(history[i].shear).toBeGreaterThan(history[i - 1].shear);
            expect(history[i].side).toBeGreaterThanOrEqual(history[i - 1].side);
          }
        });
      });

  it("writes the sweep report", () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), "audit-out");
    mkdirSync(dir, { recursive: true });
    const head = "| plan | storeys | site | outcome | worst | T (s) | V (kN) | W kN/m2 | largest column | largest footing (mm) | iterations | steel (kg) | kg/m3 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n";
    const body = rows
      .map((r) => `| ${r.plan} | ${r.storeys} | ${r.site} | ${r.outcome} | ${Math.round(r.worst * 100)}% | ${r.period.toFixed(2)} | ${r.baseShear.toFixed(0)} | ${r.weightPerM2.toFixed(1)} | ${r.maxColumn} | ${r.footing} | ${r.iterations} | ${r.steelKg.toFixed(0)} | ${r.kgPerM3.toFixed(0)} |`)
      .join("\n");
    const pass = rows.filter((r) => r.outcome === "pass").length;
    writeFileSync(join(dir, "structural-sweep.md"), `# Structural sweep\n\n${pass} of ${rows.length} cases pass every member check (the rest are reported, not asserted: tall frames need shear walls).\n\n${head}${body}\n`);
    expect(rows.length).toBe(PLAN_LIBRARY.length * SITES.length * STOREYS.length);
  });
});
