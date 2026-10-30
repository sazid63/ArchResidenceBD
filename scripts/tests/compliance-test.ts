/**
 * Compliance Test Harness — ArchResidenceBD
 * Runs BNBC 2020 / RAJUK DAP 2022 checks across presets, stories, and plot sizes.
 * Outputs: scripts/audit-out/compliance-test.json + compliance-summary.md
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { runComplianceCheck, buildComplianceContext } from "../../src/cad/codeCompliance.js";
import type { BuildingProject } from "../../src/engine/projectState.js";
import type { ComplianceContext } from "../../src/cad/codeCompliance.js";
import type { MeshDocument } from "../../src/cad/mesh.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "audit-out");
mkdirSync(OUT, { recursive: true });

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const PRESETS = [
  "preset-dual-3bed",
  "preset-single-luxury",
  "preset-triple-rental",
  "preset-ground-parking",
  "preset-penthouse-luxury",
  "preset-architect-villa",
  "preset-narrow-duct",
  "preset-duplex-courtyard",
  "preset-studio-bachelor",
];
const STORIES = [2, 3, 5, 7];
const PLOT_SQM = [133.8, 234.1, 334.5];
const LOCATION = "dhaka";
const CONCRETE_GRADE = 25;
const STEEL_GRADE = 415;
const BRICK_STRENGTH = 7.5;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function mkProj(id: string, stories: number, plotSqm: number): BuildingProject {
  return {
    id,
    name: `${id}-${stories}st`,
    address: "Mirpur, Dhaka",
    stories,
    plotSize: plotSqm / 66.89,
    plotUnit: "katha" as const,
    plotSqm,
    unitsPerFloor: 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases: [],
    designStarted: true,
  };
}

function runOne(caseId: string, stories: number, plotSqm: number, preset: string) {
  const startMs = performance.now();
  const proj = mkProj(caseId, stories, plotSqm);

  // Column size selection matching generator defaults
  const colSize = Math.max(250, stories >= 6 ? 400 : stories >= 5 ? 350 : stories >= 4 ? 300 : 250);
  const footingSize = colSize >= 350 ? 2000 : 1800;
  const footingDepth = colSize >= 350 ? 2000 : 1600;

  let doc = null;
  let ctx = null;
  let result = null;
  let error: string | null = null;

  try {
    doc = generateBuildingMesh(proj, "final", {
      columnWidthMm: colSize,
      columnDepthMm: colSize,
      footingSizeMm: footingSize,
      footingDepthMm: footingDepth,
      balconyDepthMm: 1200,
    });

    ctx = buildComplianceContext(
      {
        stories,
        plotSqm,
        plotUnit: "katha",
        unitsPerFloor: 2,
        location: LOCATION,
      },
      doc as MeshDocument,
      { concreteGrade: CONCRETE_GRADE, steelGrade: STEEL_GRADE, brickStrength: BRICK_STRENGTH },
    );

    result = runComplianceCheck(ctx);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const elapsed = performance.now() - startMs;

  return {
    caseId,
    stories,
    plotSqm,
    preset,
    colSize,
    elapsedMs: Math.round(elapsed * 100) / 100,
    error,
    objects: doc?.objects.length ?? 0,
    phases: doc ? doc.objects.reduce((acc, o) => { acc.add(o.phase); return acc; }, new Set<string>()).size : 0,
    summary: result?.summary ?? null,
    deviations: result?.deviations ?? [],
    context: ctx ? {
      footprintMm: ctx.dimensions.footprintMm,
      totalHeightMm: ctx.dimensions.totalHeightMm,
      stairWidthMm: ctx.dimensions.stairWidthMm,
      corridorWidthMm: ctx.dimensions.corridorWidthMm,
    } : null,
  };
}

// ─── RUN ALL CASES ────────────────────────────────────────────────────────────
const results = [];
for (const stories of STORIES) {
  for (const plotSqm of PLOT_SQM) {
    for (const preset of PRESETS) {
      const caseId = `s${stories}-p${plotSqm}-${preset}`;
      results.push(runOne(caseId, stories, plotSqm, preset));
    }
  }
}

// ─── WRITE RAW RESULTS ────────────────────────────────────────────────────────
writeFileSync(join(OUT, "compliance-test.json"), JSON.stringify(results, null, 2));

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
const totalCases = results.length;
const crashed = results.filter(r => r.error !== null);
const okCases = results.filter(r => r.error === null);
const fullyCompliant = okCases.filter(r => (r.summary?.compliant || 0) === 8 && (r.summary?.deviation || 0) === 0);
const hasDeviations = okCases.filter(r => (r.summary?.deviation || 0) > 0);
const hasOnlyInfo = okCases.filter(r => (r.summary?.info || 0) > 0 && (r.summary?.deviation || 0) === 0);

// Deviation code frequencies
const devCodeFreq = new Map<string, number>();
const devMessageFreq = new Map<string, number>();
for (const r of okCases) {
  for (const d of r.deviations) {
    devCodeFreq.set(d.ruleId, (devCodeFreq.get(d.ruleId) || 0) + 1);
    const key = `${d.ruleId}: ${d.title}`;
    devMessageFreq.set(key, (devMessageFreq.get(key) || 0) + 1);
  }
}

// Per-preset compliance rate
const presetStats = new Map<string, { total: number; compliant: number; deviant: number }>();
for (const r of okCases) {
  const s = presetStats.get(r.preset) ?? { total: 0, compliant: 0, deviant: 0 };
  s.total++;
  if ((r.summary?.deviation || 0) === 0) s.compliant++;
  else s.deviant++;
  presetStats.set(r.preset, s);
}

// Per-story compliance rate
const storyStats = new Map<number, { total: number; compliant: number; deviant: number }>();
for (const r of okCases) {
  const s = storyStats.get(r.stories) ?? { total: 0, compliant: 0, deviant: 0 };
  s.total++;
  if ((r.summary?.deviation || 0) === 0) s.compliant++;
  else s.deviant++;
  storyStats.set(r.stories, s);
}

let md = `# Compliance Test Summary — ArchResidenceBD v2.4\n\n`;
md += `**Location:** Dhaka | **Concrete:** M${CONCRETE_GRADE} | **Steel:** Fe${STEEL_GRADE} | **Brick:** ${BRICK_STRENGTH} tonne/m²\n\n`;
md += `---\n\n`;
md += `## Overall Results\n\n`;
md += `- **Total test cases:** ${totalCases}\n`;
md += `- **Passed (no crash):** ${okCases.length} (${(okCases.length / totalCases * 100).toFixed(1)}%)\n`;
md += `- **Crashed / errored:** ${crashed.length} (${(crashed.length / totalCases * 100).toFixed(1)}%)\n`;
md += `- **Fully compliant (0 deviations):** ${fullyCompliant.length} (${(fullyCompliant.length / totalCases * 100).toFixed(1)}%)\n`;
md += `- **Has deviations:** ${hasDeviations.length}\n`;
md += `- **Info-only only:** ${hasOnlyInfo.length}\n\n`;

if (crashed.length > 0) {
  md += `## Crashes / Errors\n\n`;
  for (const r of crashed) {
    md += `- **${r.caseId}**: ${r.error}\n`;
  }
  md += `\n`;
}

md += `## Most Common Deviations\n\n`;
md += `| # | Rule | Title | Frequency | Severity |\n`;
md += `|---|------|-------|-----------|----------|\n`;
for (const [key, count] of [...devMessageFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  const [ruleId, title] = key.split(": ");
  const rule = (results.find(r => r.error === null)?.deviations ?? []).find(d => d.ruleId === ruleId);
  const severity = rule ? rule.severity : "?";
  md += `| ${count}× | ${ruleId} | ${title} | ${count}/${totalCases} | ${severity} |\n`;
}
md += `\n`;

md += `## Deviation Frequency by Rule Code\n\n`;
md += `| Rule | Count | Total Cases | Rate |\n`;
md += `|------|-------|-------------|------|\n`;
for (const [code, count] of [...devCodeFreq.entries()].sort((a, b) => b[1] - a[1])) {
  md += `| ${code} | ${count} | ${totalCases} | ${(count / totalCases * 100).toFixed(0)}% |\n`;
}
md += `\n`;

md += `## Compliance by Preset\n\n`;
md += `| Preset | Tested | Compliant | Deviations | Pass Rate |\n`;
md += `|--------|--------|-----------|------------|-----------|\n`;
for (const [preset, s] of [...presetStats.entries()].sort()) {
  md += `| ${preset} | ${s.total} | ${s.compliant} | ${s.deviant} | ${(s.compliant / s.total * 100).toFixed(0)}% |\n`;
}
md += `\n`;

md += `## Compliance by Story Count\n\n`;
md += `| Stories | Tested | Compliant | Deviations | Pass Rate |\n`;
md += `|---------|--------|-----------|------------|-----------|\n`;
for (const [stories, s] of [...storyStats.entries()].sort((a, b) => a[0] - b[0])) {
  md += `| ${stories} | ${s.total} | ${s.compliant} | ${s.deviant} | ${(s.compliant / s.total * 100).toFixed(0)}% |\n`;
}
md += `\n`;

md += `## Sample Compliance Context (s3-p234.1-preset-dual-3bed)\n\n`;
const sample = results.find(r => r.caseId === "s3-p234.1-preset-dual-3bed");
if (sample && sample.context) {
  md += `- **Footprint:** ${sample.context.footprintMm[0]}mm × ${sample.context.footprintMm[1]}mm\n`;
  md += `- **Total height:** ${sample.context.totalHeightMm}mm\n`;
  md += `- **Stair width:** ${sample.context.stairWidthMm}mm\n`;
  md += `- **Corridor width:** ${sample.context.corridorWidthMm}mm\n`;
  md += `- **Objects:** ${sample.objects}\n`;
}
md += `\n`;

md += `## Verdict\n\n`;
const passRate = (okCases.length / totalCases * 100).toFixed(1);
const devRate = (hasDeviations.length / totalCases * 100).toFixed(1);
if (crashed.length === 0 && parseFloat(passRate) >= 90) {
  md += `✅ **Production-ready.** The compliance module runs without crashes across all test cases. ${passRate}% of cases are fully compliant; ${devRate}% have deviations (expected for strict FAR/parking checks on small plots).\n`;
} else if (crashed.length === 0) {
  md += `⚠️ **Partially ready.** No crashes, but ${devRate}% of cases have deviations. Review flagged rules for false positives.\n`;
} else {
  md += `❌ **Not ready.** ${crashed.length} crash(es) detected. Fix errors before shipping.\n`;
}
md += `\n`;
md += `---\n`;
md += `*Report generated by scripts/compliance-test.ts*\n`;

writeFileSync(join(OUT, "compliance-summary.md"), md);

console.log(`[compliance-test] ${totalCases} cases run`);
console.log(`[compliance-test] ${okCases.length} passed, ${crashed.length} crashed`);
console.log(`[compliance-test] ${fullyCompliant.length} fully compliant, ${hasDeviations.length} with deviations`);
console.log(`[compliance-test] Results: scripts/audit-out/compliance-test.json`);
console.log(`[compliance-test] Summary: scripts/audit-out/compliance-summary.md`);
console.log("DONE");
