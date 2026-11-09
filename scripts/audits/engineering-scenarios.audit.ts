/**
 * Engineering scenario audit: builds many buildings (plot x storeys x flats x every plan that fits) and records the numbers a
 * civil engineer checks: fit, RAJUK results, member sizes, footing sizes, steel and concrete per m2, BOQ per sft and 3D sanity.
 * Reported, not asserted: it feeds docs/audit/production-readiness-2026-11.md. Run: npm run audit:structural
 */
import { createRequire } from "node:module";
import { it } from "vitest";
import { deriveBuilding } from "../../src/model/building";
import { planChoices } from "../../src/model/planChoices";
import { analyzeStructure } from "../../src/structure/analyze";
import { buildBbs } from "../../src/structure/bbs";
import { buildBoq } from "../../src/quantities/takeoff";
import { check } from "../../src/rules/check";
import { buildMesh } from "../../src/model/toMesh";
import { volumesOverlap } from "../../src/cad/solidKernel";

const require = createRequire(import.meta.url);

const SCEN: Array<{ w: number; d: number; storeys: number; units: number; road: number }> = [
  { w: 14, d: 24, storeys: 4, units: 1, road: 6 },
  { w: 14, d: 24, storeys: 6, units: 1, road: 9 },
  { w: 18, d: 28, storeys: 4, units: 2, road: 9 },
  { w: 18, d: 28, storeys: 6, units: 2, road: 9 },
  { w: 18, d: 28, storeys: 8, units: 2, road: 12 },
  { w: 24, d: 32, storeys: 6, units: 3, road: 12 },
  { w: 24, d: 32, storeys: 8, units: 4, road: 12 },
  { w: 30, d: 40, storeys: 10, units: 4, road: 12 },
  { w: 22, d: 36, storeys: 12, units: 2, road: 12 },
  { w: 18, d: 28, storeys: 14, units: 2, road: 12 },
  { w: 16, d: 24, storeys: 1, units: 1, road: 6 },
  { w: 16, d: 24, storeys: 2, units: 2, road: 6 },
];

it("audit", () => {
  const out: any[] = [];
  for (const s of SCEN) {
    const choices = planChoices(s.w, s.d, { unitsPerFloor: s.units, storeys: s.storeys, roadWidthM: s.road });
    for (const c of choices) {
      const row: any = { scen: s, plan: c.plan.id, fits: c.fit.ok };
      if (!c.fit.ok) {
        row.reason = c.fit.reasons.map((r) => r.message.en).join("; ");
        out.push(row);
        continue;
      }
      const t0 = Date.now();
      const b = deriveBuilding({ plotWidthMm: s.w * 1000, plotDepthMm: s.d * 1000, storeys: s.storeys, planId: c.plan.id });
      if (!b.ok) { row.derive = b.reasons.map((r) => r.message.en); out.push(row); continue; }
      const m = b.model;
      row.footprintM2 = Math.round(m.footprintAreaM2 * 10) / 10;
      row.plotM2 = Math.round(m.plotAreaM2);
      row.bldgMm = [m.widthMm, m.depthMm];
      row.floorToFloor = m.input.floorToFloorMm;
      row.issues = m.storeys.flatMap((st) => st.issues.map((i) => `${st.index}:${i.code}:${i.message}`));
      row.rules = check(m, { roadWidthM: s.road }).map((r) => `${r.ruleId}=${r.status}${r.actual ? ` ${JSON.stringify(r.actual.value)}/${JSON.stringify(r.expected?.value)}` : ""}`);
      const res = analyzeStructure(m);
      row.struct = {
        ok: res.ok, util: Math.round(res.util * 100) / 100,
        failures: res.failures.slice(0, 6).map((f) => `L${f.level} ${f.member} ${f.id} ${Math.round(f.util * 100) / 100} ${f.governs}`),
        nFail: res.failures.length,
        slabMm: res.levels.map((l) => l.slabThicknessMm),
        cols: res.frame.columns.length,
        col0: res.frame.columns.map((c) => `${c.storeys[0].section.bx}x${c.storeys[0].section.by}`).filter((v, i, a) => a.indexOf(v) === i),
        colTop: res.frame.columns.map((c) => { const st = c.storeys[c.storeys.length - 1]; return `${st.section.bx}x${st.section.by}`; }).filter((v, i, a) => a.indexOf(v) === i),
        footMax: Math.max(...res.frame.columns.map((c) => c.footing.sideMm)),
        footMin: Math.min(...res.frame.columns.map((c) => c.footing.sideMm)),
        footDepthMax: Math.max(...res.frame.columns.map((c) => c.footing.depthMm)),
        beams: [...new Set(res.levels.flatMap((l) => l.beamLines.map((b) => `${b.result.section.bMm}x${b.result.section.hMm}`)))],
        converged: res.frame.converged, iters: res.frame.iterations,
        seis: { x: (res.frame as any).seismicX?.util, y: (res.frame as any).seismicY?.util },
      };
      const bbs = buildBbs(res, m);
      const gfa = m.footprintAreaM2 * s.storeys;
      row.qty = {
        gfaM2: Math.round(gfa), concreteM3: Math.round(bbs.totals.concreteM3), steelKg: Math.round(bbs.totals.weightKg),
        concPerM2: Math.round((bbs.totals.concreteM3 / gfa) * 1000) / 1000,
        steelKgPerM2: Math.round(bbs.totals.weightKg / gfa * 10) / 10,
        steelKgPerSft: Math.round(bbs.totals.weightKg / (gfa * 10.7639) * 100) / 100,
        kgPerM3: Math.round(bbs.totals.kgPerM3),
        bbsIssues: bbs.issues.length,
        bbsIssueKinds: [...new Set(bbs.issues.map((i: any) => i.code ?? i.kind ?? "?"))],
      };
      const boq = buildBoq(m, bbs);
      row.boq = { totalBdt: Math.round(boq.totalBdt), perSft: Math.round(boq.totalBdt / (gfa * 10.7639)), unpriced: boq.unpriced };
      const mesh = buildMesh(m);
      const kinds: Record<string, number> = {};
      for (const o of mesh.objects) kinds[o.kind] = (kinds[o.kind] ?? 0) + 1;
      row.mesh = { n: mesh.objects.length, kinds };
      // mesh sanity
      const mp: string[] = [];
      const objs = mesh.objects;
      const zmax = Math.max(...objs.map((o) => o.bboxMaxMm[2]));
      const zmin = Math.min(...objs.map((o) => o.bboxMinMm[2]));
      row.mesh.zRange = [zmin, zmax];
      const totalH = m.storeys.reduce((a, st) => a + st.heightMm, 0);
      row.mesh.totalStoreyH = totalH;
      const xs = [Math.min(...objs.map((o) => o.bboxMinMm[0])), Math.max(...objs.map((o) => o.bboxMaxMm[0]))];
      const ys = [Math.min(...objs.map((o) => o.bboxMinMm[1])), Math.max(...objs.map((o) => o.bboxMaxMm[1]))];
      row.mesh.xRange = xs; row.mesh.yRange = ys;
      // columns: count per storey and that columns are not floating (each column bottom is at a slab/footing top)
      const cols = objs.filter((o) => o.kind === "column");
      const colBottoms = new Set(cols.map((c) => Math.round(c.bboxMinMm[2])));
      row.mesh.columnBottoms = [...colBottoms].sort((a, b) => a - b);
      const footings = objs.filter((o) => o.kind === "footing" || o.kind === "pad");
      row.mesh.footings = footings.length;
      // overlapping solids between different kinds (structural)
      const struct = objs.filter((o) => ["column", "beam", "slab", "footing"].includes(o.kind));
      let overlaps = 0;
      const ex: string[] = [];
      for (let i = 0; i < struct.length; i++)
        for (let j = i + 1; j < struct.length; j++) {
          const a = struct[i], b2 = struct[j];
          if (a.kind === b2.kind && a.parentId !== undefined) continue;
          const A = { min: a.bboxMinMm as any, max: a.bboxMaxMm as any }, B = { min: b2.bboxMinMm as any, max: b2.bboxMaxMm as any };
          try { if (volumesOverlap(A as any, B as any)) { overlaps++; if (ex.length < 3) ex.push(`${a.id}|${b2.id}`); } } catch { /* ignore */ }
        }
      row.mesh.structOverlaps = overlaps; row.mesh.overlapEx = ex;
      row.ms = Date.now() - t0;
      out.push(row);
    }
  }
  require("node:fs").writeFileSync("scripts/audits/audit-out/engineering-scenarios.json", JSON.stringify(out, null, 1));
}, 600000);
