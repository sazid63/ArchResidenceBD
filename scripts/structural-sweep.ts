/**
 * Structural Sweep — ArchResidenceBD
 * Parametric validation of beam, column, footing, and seismic analysis
 * across story count, plot size, and column size combinations.
 * 
 * Run: npx tsx scripts/structural-sweep.ts
 */

import { 
  analyzeBeam, 
  analyzeColumn, 
  designFooting, 
  seismicAnalysis, 
  CONCRETE_GRADES, 
  STEEL_GRADES, 
  DEFAULT_CONCRETE, 
  DEFAULT_STEEL_EXPORT,
  BNBC_DEFAULT,
  type RectSection 
} from "../src/cad/structuralEngine.js";
import type { BuildingProject } from "../src/engine/projectState.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "audit-out");
mkdirSync(OUT, { recursive: true });

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const STORIES = [2, 3, 5, 7];
const PLOT_SQM = [133.8, 234.1, 334.5];  // ~2, 3.5, 5 katha
const COL_SIZES = [250, 300, 350];       // mm

// BNBC 2020 Dhaka defaults
const SOIL = { qu: 250, ad: 150, cohesion: 50, frictionAngle: 20, unitWeight: 18, sptN: 15 };
const CONCRETE = CONCRETE_GRADES[25];    // M25
const STEEL = STEEL_GRADES[415];         // Fe415

// Section properties helper
function makeColSection(colSize: number, stories: number): RectSection {
  // Scale rebar with column size and stories
  const mainBarDia = colSize >= 350 ? 20 : colSize >= 300 ? 16 : 12;
  const numMainBars = colSize >= 350 ? 12 : colSize >= 300 ? 10 : 8;
  return { width: colSize, depth: colSize, cover: 40, mainBarDia, numMainBars, linkDia: 8 };
}

function makeBeamSection(colSize: number): RectSection {
  // Beam depth scales with span (assume 4.5m typical)
  const depth = colSize >= 350 ? 600 : colSize >= 300 ? 550 : 500;
  return { width: 250, depth, cover: 40, mainBarDia: 16, numMainBars: 6, linkDia: 8 };
}

function makeProject(id: string, stories: number, plotSqm: number): BuildingProject {
  return {
    id, name: id, address: "Dhaka",
    stories, plotSize: plotSqm / 66.89, plotUnit: "katha",
    plotSqm, unitsPerFloor: 2,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    phases: [], designStarted: true
  };
}

// ─── SWEEP ────────────────────────────────────────────────────────────────────
interface SweepCase {
  caseId: string;
  stories: number;
  plotSqm: number;
  colSize: number;
  project: BuildingProject;
  beam: ReturnType<typeof analyzeBeam>;
  column: ReturnType<typeof analyzeColumn>;
  footing: ReturnType<typeof designFooting>;
  seismic: ReturnType<typeof seismicAnalysis>;
  checks: {
    columnUtilOk: boolean;
    beamUtilOk: boolean;
    beamDeflOk: boolean;
    seismicPeriodOk: boolean;
    footingSFOk: boolean;
    allPass: boolean;
  };
  recommendations: string[];
}

const results: SweepCase[] = [];

for (const stories of STORIES) {
  for (const plotSqm of PLOT_SQM) {
    for (const colSize of COL_SIZES) {
      const caseId = `s${stories}-p${plotSqm}-c${colSize}`;
      const project = makeProject(caseId, stories, plotSqm);

      // --- Load model ---
      const floorArea = plotSqm * 0.7; // 70% coverage
      const gravityPerStory = floorArea * 24; // kN (DL+LL approx)
      const numCols = Math.max(9, Math.round(Math.sqrt(plotSqm) / 3.6) * 4); // ~4x3 grid
      const colLoad = (gravityPerStory * stories) / numCols; // kN per column

      // Typical beam loads (4.5m span)
      const beamSpan = 4.5;
      const beamLoad = {
        selfWeight: 0.25 * 0.5 * 24,      // 250x500 beam self-weight
        superimposedDead: 2.0,             // finishes
        liveLoad: 2.5,                     // residential
        wallLoad: 1.2 * 3.0 * 14           // 14m wall @ 120mm
      };

      // --- Analyze ---
      const colSection = makeColSection(colSize, stories);
      const beamSection = makeBeamSection(colSize);

      const beam = analyzeBeam(beamSection, beamSpan, beamLoad, CONCRETE, STEEL);
      
      const column = analyzeColumn(colSection, {
        axialLoad: colLoad,
        momentMajor: colLoad * 0.12,
        momentMinor: colLoad * 0.08,
        unbracedLength: 3.0
      }, CONCRETE, STEEL);

      const footing = designFooting(colSize, colSize, colLoad, SOIL, CONCRETE);

      const heights = Array.from({ length: stories }, (_, i) => (i + 1) * 3.0); // m
      const seismic = seismicAnalysis(
        gravityPerStory * stories * 1.2, // seismic weight ~1.2x DL
        heights,
        BNBC_DEFAULT,
        heights.map(() => 1.8e7) // placeholder stiffness
      );

      // --- Checks ---
      const checks = {
        columnUtilOk: column.utilization <= 0.80,
        beamUtilOk: beam.utilizationMoment <= 0.85,
        beamDeflOk: beam.maxDeflection <= beam.allowableDeflection,
        seismicPeriodOk: seismic.naturalPeriod >= 0.2 && seismic.naturalPeriod <= 2.0,
        footingSFOk: footing.safetyFactor >= 2.5,
        allPass: false // will set below
      };
      checks.allPass = checks.columnUtilOk && checks.beamUtilOk && checks.beamDeflOk && checks.seismicPeriodOk && checks.footingSFOk;

      // --- Recommendations ---
      const recommendations: string[] = [];
      if (!checks.columnUtilOk) recommendations.push(`Column util ${column.utilization.toFixed(2)} > 0.80 — increase col size or add bars`);
      if (!checks.beamUtilOk) recommendations.push(`Beam util ${beam.utilizationMoment.toFixed(2)} > 0.85 — increase depth or bars`);
      if (!checks.beamDeflOk) recommendations.push(`Beam deflection ${beam.maxDeflection.toFixed(1)}mm > L/360 (${beam.allowableDeflection.toFixed(1)}mm) — increase depth`);
      if (!checks.seismicPeriodOk) recommendations.push(`Seismic period ${seismic.naturalPeriod.toFixed(2)}s outside [0.2, 2.0]s`);
      if (!checks.footingSFOk) recommendations.push(`Footing SF ${footing.safetyFactor.toFixed(2)} < 2.5 — increase footing size`);
      if (recommendations.length === 0) recommendations.push("All checks passed");

      results.push({
        caseId, stories, plotSqm, colSize, project,
        beam, column, footing, seismic,
        checks, recommendations
      });
    }
  }
}

// ─── WRITE JSON ──────────────────────────────────────────────────────────────
writeFileSync(join(OUT, "structural-sweep.json"), JSON.stringify(results, null, 2));
console.log(`[sweep] ${results.length} cases written to ${OUT}/structural-sweep.json`);

// ─── GENERATE MARKDOWN REPORT ────────────────────────────────────────────────
let md = `# Structural Sweep Report\n\n`;
md += `Generated: ${new Date().toISOString()}\n`;
md += `Total cases: ${results.length}\n\n`;

md += `## Summary\n\n`;
const passCount = results.filter(r => r.checks.allPass).length;
const failCount = results.length - passCount;
md += `- **Pass all checks**: ${passCount}\n`;
md += `- **Need changes**: ${failCount}\n\n`;

md += `## Cases by Story Count\n\n`;

for (const stories of STORIES) {
  md += `### ${stories} Storey\n\n`;
  md += `| Plot (m²) | Col (mm) | Col Util | Beam Util | Defl (mm) | Allow (mm) | Seismic T (s) | Footing SF | Status |\n`;
  md += `|-----------|----------|----------|-----------|-----------|------------|---------------|------------|--------|\n`;

  for (const plotSqm of PLOT_SQM) {
    for (const colSize of COL_SIZES) {
      const r = results.find(c => c.stories === stories && c.plotSqm === plotSqm && c.colSize === colSize)!;
      const status = r.checks.allPass ? "✅ PASS" : "❌ FAIL";
      md += `| ${plotSqm} | ${colSize} | ${r.column.utilization.toFixed(2)} | ${r.beam.utilizationMoment.toFixed(2)} | ${r.beam.maxDeflection.toFixed(1)} | ${r.beam.allowableDeflection.toFixed(1)} | ${r.seismic.naturalPeriod.toFixed(2)} | ${r.footing.safetyFactor.toFixed(2)} | ${status} |\n`;
    }
  }
  md += `\n`;
}

md += `## Recommended Column Sizes by Story Count\n\n`;

for (const stories of STORIES) {
  md += `### ${stories} Storey\n\n`;
  md += `| Plot (m²) | Min Col Size | Recommended | Notes |\n`;
  md += `|-----------|--------------|-------------|-------|\n`;

  for (const plotSqm of PLOT_SQM) {
    // Find first passing col size
    let recommended = "—";
    for (const colSize of COL_SIZES) {
      const r = results.find(c => c.stories === stories && c.plotSqm === plotSqm && c.colSize === colSize)!;
      if (r.checks.columnUtilOk && r.checks.beamUtilOk && r.checks.beamDeflOk) {
        recommended = `${colSize} mm`;
        break;
      }
    }
    // If none pass, recommend largest
    if (recommended === "—") {
      const r350 = results.find(c => c.stories === stories && c.plotSqm === plotSqm && c.colSize === 350)!;
      recommended = `350+ mm (${r350.column.utilization > 0.8 ? "needs 400mm" : "check bars"})`;
    }
    md += `| ${plotSqm} | ${COL_SIZES[0]} mm | ${recommended} |\n`;
  }
  md += `\n`;
}

md += `## Detailed Failed Cases\n\n`;
for (const r of results) {
  if (!r.checks.allPass) {
    md += `### ${r.caseId}\n`;
    md += `- Stories: ${r.stories}, Plot: ${r.plotSqm} m², Col: ${r.colSize} mm\n`;
    for (const rec of r.recommendations) {
      md += `- ${rec}\n`;
    }
    md += `\n`;
  }
}

md += `## Cases Passing All Checks\n\n`;
for (const r of results) {
  if (r.checks.allPass) {
    md += `- ${r.caseId} (${r.stories}st, ${r.plotSqm}m², ${r.colSize}mm)\n`;
  }
}

writeFileSync(join(OUT, "structural-recommendations.md"), md);
console.log(`[sweep] Recommendations written to ${OUT}/structural-recommendations.md`);
console.log(`[sweep] Pass: ${passCount}/${results.length}, Fail: ${failCount}/${results.length}`);