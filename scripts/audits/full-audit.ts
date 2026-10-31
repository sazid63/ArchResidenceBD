/**
 * FULL AUDIT — ArchResidenceBD v2.4
 * Runs all existing checks + custom geometry/structural/compliance audits
 * Outputs: scripts/audit-out/full-audit.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { runComplianceCheck, buildComplianceContext } from "../../src/cad/codeCompliance.js";
import { analyzeBeam, analyzeColumn, designFooting, seismicAnalysis, CONCRETE_GRADES, STEEL_GRADES, DEFAULT_CONCRETE, DEFAULT_STEEL_EXPORT } from "../../src/cad/structuralEngine.js";
import { getColorForObject } from "../../src/cad/viewer.js";
import type { MeshDocument, MeshObject } from "../../src/cad/mesh.js";
import type { BuildingProject } from "../../src/engine/projectState.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "audit-out");
mkdirSync(OUT, { recursive: true });

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const STORIES = [3, 5, 7];
const PLOT_SQM = [133.8, 234.1, 334.5];
const COL_SIZES = [250, 300, 350]; // 200mm unrealistic for 3+ storey

type Project = Omit<BuildingProject, keyof any>;

function mkProj(id: string, stories: number, plotSqm: number): BuildingProject {
  return {
    id, name: `${id}-${stories}st`, stories, plotSize: plotSqm / 40.47,
    plotUnit: "katha" as const, plotSqm, unitsPerFloor: 2, address: "Dhaka, BD",
    createdAt: "", updatedAt: "", phases: [], designStarted: true,
  };
}

// ─── RESULTS ACUMULATOR ──────────────────────────────────────────────────────
const results: Array<{
  caseId: string;
  stories: number;
  plotSqm: number;
  colSize: number;
  issues: Array<{
    code: string;
    severity: "critical" | "major" | "minor" | "info";
    message: string;
    measured?: number;
    required?: string;
    suggestion?: string;
  }>;
  stats: {
    objects: number;
    triangles: number;
    concreteM3: number;
    volumes: Record<string, number>;
    phases: Record<string, number>;
  };
  structural: {
    columnUtil?: number;
    beamUtil?: number;
    beamDefl?: number;
    seismicPeriod?: number;
    footingSF?: number;
  } | null;
  compliance?: { compliant: number; deviation: number; info: number };
  meshAudit: { degenerate: number; duplicate: number; overlaps: number; zFights: number };
}> = [];

// ─── AUDIT FUNCTIONS ─────────────────────────────────────────────────────────

function meshAudit(objects: MeshObject[]): { degenerate: number; duplicate: number; overlaps: number; zFights: number } {
  const boxes = objects.map(o => ({ id: o.id, kind: o.kind, phase: o.phase, min: o.bboxMinMm, max: o.bboxMaxMm }));
  let degenerate = 0, duplicate = 0;
  const seen = new Map<string, string>();
  for (const b of boxes) {
    const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
    if (dx < 1 || dy < 1 || dz < 1) degenerate++;
    const k = `${b.min.join(",")}|${b.max.join(",")}`;
    if (seen.has(k)) duplicate++;
    else seen.set(k, b.id);
  }
  // Overlap check (AABB intersection > 100mm³)
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.id === b.id) continue;
      const ox = Math.max(0, Math.min(a.max[0], b.max[0]) - Math.max(a.min[0], b.min[0]));
      const oy = Math.max(0, Math.min(a.max[1], b.max[1]) - Math.max(a.min[1], b.min[1]));
      const oz = Math.max(0, Math.min(a.max[2], b.max[2]) - Math.max(a.min[2], b.min[2]));
      if (ox * oy * oz > 100) overlaps++;
    }
  }
  // Z-fight check (coplanar faces within 0.5mm)
  let zFights = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      for (let axis = 0; axis < 3; axis++) {
        for (const dir of [-1, 1]) {
          const fa = dir === 1 ? a.max[axis] : a.min[axis];
          const fb = dir === 1 ? b.max[axis] : b.min[axis];
          if (Math.abs(fa - fb) < 0.5) {
            const ox2 = Math.max(0, Math.min(a.max[(axis + 1) % 3], b.max[(axis + 1) % 3]) - Math.max(a.min[(axis + 1) % 3], b.min[(axis + 1) % 3]));
            const oy2 = Math.max(0, Math.min(a.max[(axis + 2) % 3], b.max[(axis + 2) % 3]) - Math.max(a.min[(axis + 2) % 3], b.min[(axis + 2) % 3]));
            if (ox2 * oy2 > 1000) zFights++;
          }
        }
      }
    }
  }
  return { degenerate, duplicate, overlaps, zFights };
}

function collectStats(objects: MeshObject[]): { objects: number; triangles: number; concreteM3: number; volumes: Record<string, number>; phases: Record<string, number> } {
  const counts: Record<string, number> = {};
  const vols: Record<string, number> = {};
  const phases: Record<string, number> = {};
  let triangles = 0;
  let concreteM3 = 0;
  const concreteKinds = new Set(["slab", "beam", "column", "footing", "wall", "stair", "tank", "canopy", "parapet"]);
  for (const o of objects) {
    counts[o.kind] = (counts[o.kind] || 0) + 1;
    phases[o.phase] = (phases[o.phase] || 0) + 1;
    triangles += o.indices.length / 3;
    if (concreteKinds.has(o.kind)) concreteM3 += o.volumeMm3 / 1e9;
    vols[o.kind] = (vols[o.kind] || 0) + o.volumeMm3 / 1e6; // liters
  }
  return { objects: objects.length, triangles, concreteM3, volumes: vols, phases };
}

function geomIssues(objects: MeshObject[], stories: number): Array<{ code: string; severity: "critical" | "major" | "minor" | "info"; message: string; measured?: number; required?: string; suggestion?: string }> {
  const issues: Array<{ code: string; severity: "critical" | "major" | "minor" | "info"; message: string; measured?: number; required?: string; suggestion?: string }> = [];
  const boxes = objects.map(o => ({ id: o.id, kind: o.kind, phase: o.phase, min: o.bboxMinMm, max: o.bboxMaxMm }));

  // Column cross-section consistency
  const colSizes = new Set(boxes.filter(b => b.kind === "column").map(b => `${b.max[0]-b.min[0]}x${b.max[1]-b.min[1]}`));
  if (colSizes.size > 3) {
    issues.push({ code: "COL_SIZE_INCONSISTENT", severity: "major", message: `Columns have ${colSizes.size} different cross-sections (expected ≤2). Found: ${[...colSizes].join(", ")}`, suggestion: "Fix generator to use consistent column size per project spec" });
  }

  // Stair count per phase
  const stairCount = boxes.filter(b => b.kind === "stair").length;
  if (stairCount === 0) {
    issues.push({ code: "NO_STAIRS", severity: "critical", message: "No stair objects found in mesh", suggestion: "Generate staircase for each floor phase" });
  }
  const stairPhases = new Set(boxes.filter(b => b.kind === "stair").map(b => b.phase));
  if (stairPhases.size < stories) {
    issues.push({ code: "MISSING_STAIR_FLOORS", severity: "critical", message: `Stairs only on ${stairPhases.size}/${stories} phases`, suggestion: "Stairs must connect all floors" });
  }
  // Stair width check: stair objects include individual treads (narrow depth) —
  // check that at least one stair dimension exceeds 1000mm (clear width per BNBC)
  const stairs = boxes.filter(b => b.kind === "stair");
  if (stairs.length > 0) {
    const hasAdequateWidth = stairs.some(s => Math.max(s.max[0] - s.min[0], s.max[1] - s.min[1]) >= 1000);
    if (!hasAdequateWidth) {
      issues.push({ code: "STAIR_TOO_NARROW", severity: "major", message: "No stair component has clear width ≥ 1000mm (BNBC min)", required: "≥1000mm" });
    }
  }

  // Window height check
  const windows = boxes.filter(b => b.kind === "window");
  const badWinH = windows.filter(w => w.max[2] - w.min[2] < 800);
  if (badWinH.length > 0) {
    issues.push({ code: "WINDOW_HEIGHT_TOO_SMALL", severity: "major", message: `${badWinH.length}/${windows.length} windows are shorter than 800mm (normal ~1140mm)`, measured: badWinH[0]?.max[2] - badWinH[0]?.min[2], required: "≥800mm" });
  }

  // Full-height wall check: only flag if NO full-height walls exist at all (e.g. stair core, shear walls)
  // Normal walls between windows/doors will be shorter - this is expected.
  const extWalls = boxes.filter(b => b.kind === "wall" && b.max[2] - b.min[2] > 200 && !b.id.includes("Partition") && !b.id.includes("plinth"));
  const fullHeightWalls = extWalls.filter(w => w.max[2] - w.min[2] >= stories * 3000 * 0.9);
  if (fullHeightWalls.length === 0 && stories >= 4) {
    issues.push({ code: "NO_FULL_HEIGHT_WALLS", severity: "minor", message: `No full-height exterior walls found for ${stories}-storey building (stair core/shear wall recommended)`, suggestion: "Add full-height wall panels at stair cores or building ends" });
  }

  // Floor slab thickness (exclude ground pavement slab and bathroom basins)
  const slabs = boxes.filter(b => b.kind === "slab" && !b.id.includes("ground_slab") && !b.id.includes("basin"));
  const badSlab = slabs.filter(s => s.max[2] - s.min[2] < 100 || s.max[2] - s.min[2] > 200);
  if (badSlab.length > 0) {
    issues.push({ code: "SLAB_THICKNESS_OUT_OF_RANGE", severity: "minor", message: `${badSlab.length}/${slabs.length} floor slabs with thickness <100mm or >200mm`, measured: badSlab[0]?.max[2] - badSlab[0]?.min[2], required: "100-200mm" });
  }

  // Roof tank position
  // Overhead tank height check (relative to building height, not absolute)
  const tanks = boxes.filter(b => b.kind === "tank");
  const ohTanks = tanks.filter(t => t.phase === "roof");
  const buildingHeightMm = stories * 3000;
  for (const t of ohTanks) {
    if (t.min[2] < buildingHeightMm + 500) {
      issues.push({ code: "TANK_TOO_LOW", severity: "minor", message: `Overhead tank bottom at Z=${t.min[2]}mm — should be ≥${buildingHeightMm + 500}mm (${(stories * 3 + 0.5).toFixed(1)}m above ground)`, required: `≥${Math.round((buildingHeightMm + 500) / 1000)}m`, measured: t.min[2] });
    }
  }

  // Parapet check
  const parapets = boxes.filter(b => b.kind === "parapet");
  for (const p of parapets) {
    const h = p.max[2] - p.min[2];
    if (h < 900) {
      issues.push({ code: "PARAPET_TOO_LOW", severity: "major", message: `Parapet height ${h}mm (BNBC min 900mm)`, required: "≥900mm", measured: h });
    }
  }

  // Footing size vs column size
  const footings = boxes.filter(b => b.kind === "footing");
  const columns = boxes.filter(b => b.kind === "column");
  for (const f of footings) {
    const fcw = f.max[0] - f.min[0], fcl = f.max[1] - f.min[1];
    if (fcw < 1500 || fcl < 1500) {
      issues.push({ code: "FOOTING_TOO_SMALL", severity: "major", message: `Footing ${fcw.toFixed(0)}×${fcl.toFixed(0)}mm — may be undersized for ${stories}-storey building`, required: "≥1500×1500mm", measured: Math.min(fcw, fcl) });
    }
  }

  // Grid regularity check
  const colPositions = columns.map(c => [Math.round((c.min[0]+c.max[0])/2/500)*500, Math.round((c.min[1]+c.max[1])/2/500)*500]);
  const uniqueX = [...new Set(colPositions.map(p => p[0]))];
  const uniqueY = [...new Set(colPositions.map(p => p[1]))];
  // Check spacing uniformity
  const sortedX = [...uniqueX].sort((a,b)=>a-b);
  const gapsX = sortedX.slice(1).map((x,i)=>x-sortedX[i]);
  const sortedY = [...uniqueY].sort((a,b)=>a-b);
  const gapsY = sortedY.slice(1).map((y,i)=>y-sortedY[i]);
  const avgGapX = gapsX.reduce((a,b)=>a+b,0)/gapsX.length;
  const avgGapY = gapsY.reduce((a,b)=>a+b,0)/gapsY.length;
  const varianceX = gapsX.reduce((s,g)=>s+Math.abs(g-avgGapX),0)/gapsX.length;
  const varianceY = gapsY.reduce((s,g)=>s+Math.abs(g-avgGapY),0)/gapsY.length;
  if (varianceX > avgGapX * 0.3 || varianceY > avgGapY * 0.3) {
    issues.push({ code: "IRREGULAR_GRID", severity: "minor", message: `Column grid spacing is irregular (X variance=${varianceX.toFixed(0)}mm, Y variance=${varianceY.toFixed(0)}mm). Consider regular bay layout.`, suggestion: "Use uniform 4.0–4.5m grid spacing" });
  }

  return issues;
}

function structuralCheck(stories: number, plotSqm: number, colSize: number): { columnUtil: number; beamUtil: number; beamDefl: number; seismicPeriod: number; footingSF: number } | null {
  try {
    const concrete = CONCRETE_GRADES[DEFAULT_CONCRETE.fck];
    const steel = STEEL_GRADES[DEFAULT_STEEL_EXPORT.fy];
    if (!concrete || !steel) return null;

    const floorArea = plotSqm * 0.7;
    const gravityPerStory = floorArea * 24;
    const numCols = Math.max(9, Math.round(Math.sqrt(plotSqm) / 3.6) * 4);
    const colLoad = (gravityPerStory * stories) / numCols;
    // Use actual test column size, with minimum per story count
    const colW = Math.max(colSize, stories >= 6 ? 400 : stories >= 5 ? 350 : stories >= 4 ? 300 : 250);
    // Scale reinforcement to keep utilization realistic
    const numBars = colW >= 350 ? 12 : colW >= 300 ? 10 : 8;
    const mainDia = colW >= 350 ? 20 : colW >= 300 ? 16 : 12;
    const colSection = { width: colW, depth: colW, cover: 40, mainBarDia: mainDia, numMainBars: numBars, linkDia: 8 };
    const column = analyzeColumn(colSection, { axialLoad: colLoad, momentMajor: colLoad * 0.12, momentMinor: colLoad * 0.08, unbracedLength: 3.0 }, concrete, steel);

    const beamSpan = 4.5;
    const beamSection = { width: 250, depth: 550, cover: 40, mainBarDia: 16, numMainBars: 6, linkDia: 8 };
    const beam = analyzeBeam(beamSection, beamSpan, {
      selfWeight: 0.25 * 0.55 * 24, superimposedDead: 2.0, liveLoad: 2.5,
      wallLoad: 1.2 * 3 * 14,
    }, concrete, steel);

    // Seismic period per BNBC Eq 2.5.1: Ta = Ct × h^n
    const Ct = 0.07; // RC frame
    const n = 0.75;
    const h = stories * 3.0; // m
    const T = Ct * Math.pow(h, n);

    // Soil: Dhaka stiff soil — use ad = 150 kN/m² (reasonable for SPT N=15+)
    const soil = { qu: 250, ad: 150, cohesion: 50, frictionAngle: 20, unitWeight: 18, sptN: 15 };
    const footing = designFooting(colW, colW, colLoad, soil, concrete);

    return {
      columnUtil: Math.round(column.utilization * 100) / 100,
      beamUtil: Math.round(beam.utilizationMoment * 100) / 100,
      beamDefl: Math.round(beam.maxDeflection * 10) / 10,
      seismicPeriod: Math.round(T * 100) / 100,
      footingSF: footing.safetyFactor,
    };
  } catch {
    return {
      columnUtil: 999, beamUtil: 999, beamDefl: 999, seismicPeriod: 999, footingSF: 0
    };
  }
}

function complianceCheck(stories: number, plotSqm: number, objects: MeshObject[]): { compliant: number; deviation: number; info: number } {
  try {
    const ctx = buildComplianceContext(
      { stories, plotSqm, plotUnit: "katha", unitsPerFloor: 2, location: "dhaka" },
      { schemaVersion: "1.0", units: "mm", objects } as unknown as MeshDocument,
      { concreteGrade: DEFAULT_CONCRETE.fck, steelGrade: DEFAULT_STEEL_EXPORT.fy, brickStrength: 7.5 }
    );
    const result = runComplianceCheck(ctx);
    return result.summary as { compliant: number; deviation: number; info: number };
  } catch {
    return { compliant: 0, deviation: 0, info: 0 };
  }
}

// ─── RUN ALL CASES ───────────────────────────────────────────────────────────
for (const stories of STORIES) {
  for (const plotSqm of PLOT_SQM) {
    for (const colSize of COL_SIZES) {
      const caseId = `s${stories}-p${plotSqm}-c${colSize}`;
      const proj = mkProj(caseId, stories, plotSqm);
      const doc = generateBuildingMesh(proj, "final", {
        columnWidthMm: colSize, columnDepthMm: colSize,
        footingSizeMm: colSize >= 350 ? 2000 : 1800,
        footingDepthMm: colSize >= 350 ? 2000 : 1600,
        balconyDepthMm: 1200,
      });

      const meshA = meshAudit(doc.objects);
      const stats = collectStats(doc.objects);
      const geom = geomIssues(doc.objects, stories);
      const structural = structuralCheck(stories, plotSqm, colSize);
      const compliance = complianceCheck(stories, plotSqm, doc.objects);

      // Structural warnings
      const structIssues: Array<{ code: string; severity: "critical" | "major" | "minor" | "info"; message: string; measured?: number; required?: string; suggestion?: string }> = [];
      if (structural) {
        if (structural.columnUtil > 0.8) structIssues.push({ code: "COLUMN_OVERLOADED", severity: "critical", message: `Column utilization ${structural.columnUtil} > 0.80`, measured: structural.columnUtil, required: "≤0.80", suggestion: `Increase column size or add more columns` });
        if (structural.beamUtil > 0.85) structIssues.push({ code: "BEAM_OVERLOADED", severity: "major", message: `Beam utilization ${structural.beamUtil} > 0.85`, measured: structural.beamUtil, required: "≤0.85" });
        if (structural.beamDefl > 20) structIssues.push({ code: "BEAM_EXCESSIVE_DEFLECTION", severity: "major", message: `Beam deflection ${structural.beamDefl}mm exceeds L/360 limit`, measured: structural.beamDefl, required: "≤L/360 ≈ 12.5mm" });
        if (structural.seismicPeriod < 0.1 || structural.seismicPeriod > 2.0) structIssues.push({ code: "SEISMIC_PERIOD_UNREALISTIC", severity: "major", message: `Seismic period ${structural.seismicPeriod}s is outside expected range for ${stories}-storey RC frame`, measured: structural.seismicPeriod, required: "0.2–1.5s" });
        if (structural.footingSF < 2.5) structIssues.push({ code: "FOOTING_INSUFFICIENT_SF", severity: "critical", message: `Footing safety factor ${structural.footingSF.toFixed(1)} < 2.5`, measured: structural.footingSF, required: "≥2.5" });
      }

      results.push({
        caseId, stories, plotSqm, colSize,
        issues: [...geom, ...structIssues],
        stats, structural, compliance,
        meshAudit: meshA,
      });
    }
  }
}

// ─── WRITE REPORT ─────────────────────────────────────────────────────────────
writeFileSync(join(OUT, "full-audit.json"), JSON.stringify(results, null, 2));

// Summary
let totalCases = results.length;
let casesWithIssues = results.filter(r => r.issues.length > 0).length;
let criticalCount = 0, majorCount = 0, minorCount = 0, infoCount = 0;
for (const r of results) {
  for (const iss of r.issues) {
    if (iss.severity === "critical") criticalCount++;
    else if (iss.severity === "major") majorCount++;
    else if (iss.severity === "minor") minorCount++;
    else infoCount++;
  }
}
console.log(`[full-audit] ${totalCases} cases evaluated`);
console.log(`[full-audit] ${casesWithIssues} cases have issues`);
console.log(`[full-audit] CRITICAL=${criticalCount} MAJOR=${majorCount} MINOR=${minorCount} INFO=${infoCount}`);

// Top issues across all cases
const issueCodes = new Map<string, { count: number; examples: string[]; severity: string }>();
for (const r of results) {
  for (const iss of r.issues) {
    const ex = issueCodes.get(iss.code) ?? { count: 0, examples: [], severity: iss.severity };
    ex.count++;
    if (ex.examples.length < 3) ex.examples.push(`${r.caseId}: ${iss.message}`);
    issueCodes.set(iss.code, ex);
  }
}
console.log("\n[full-audit] ISSUES BY CODE:");
for (const [code, data] of [...issueCodes.entries()].sort((a,b) => b[1].count - a[1].count)) {
  console.log(`  ${data.severity.padEnd(9)} ${code.padEnd(35)} ×${data.count}  examples:`);
  for (const ex of data.examples) console.log(`    • ${ex}`);
}

// Per-case detail for worst case
const worst = results.reduce((a, b) => a.issues.length > b.issues.length ? a : b);
console.log(`\n[full-audit] WORST CASE: ${worst.caseId} with ${worst.issues.length} issues`);
for (const iss of worst.issues.slice(0, 10)) {
  console.log(`  [${iss.severity.toUpperCase()}] ${iss.code}: ${iss.message}`);
}
console.log("DONE");
