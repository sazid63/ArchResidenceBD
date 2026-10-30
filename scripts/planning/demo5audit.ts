/**
 * Planning-phase audit for the 5-storey demo building.
 * Replicates NativeCadScreen's structural panel logic + runs geometry checks.
 * Read-only: writes only to scripts/exporter-out/
 */
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import {
  analyzeBeam, analyzeColumn, designFooting, seismicAnalysis,
  CONCRETE_GRADES, STEEL_GRADES, BNBC_DEFAULT,
  type RectSection,
} from "../../src/cad/structuralEngine.js";
import { writeFileSync } from "node:fs";

const project = {
  id: "demo-5story", name: "Dhaka 5-Storey Residential", address: "Mirpur, Dhaka",
  stories: 5, plotSize: 3.5, plotUnit: "katha" as const,
  plotSqm: 234.1, unitsPerFloor: 2, phases: [], designStarted: true,
  createdAt: "", updatedAt: "",
};

const custom = {
  columnWidthMm: project.stories >= 6 ? 350 : 250,
  columnDepthMm: project.stories >= 6 ? 350 : 250,
  footingSizeMm: project.stories >= 6 ? 2000 : 1800,
  footingDepthMm: project.stories >= 6 ? 2000 : 1600,
  balconyDepthMm: 1200,
};

const doc = generateBuildingMesh(project, "final", custom);
writeFileSync("scripts/exporter-out/demo-5story.mesh.json", JSON.stringify(doc));

// ---- Geometry self-audit (same checks as mesh-audit.ts, one case) ----
const boxes = doc.objects.map(o => ({
  id: o.id, kind: o.kind, phase: o.phase,
  min: o.bboxMinMm, max: o.bboxMaxMm,
}));

let degenerate = 0, duplicate = 0;
const degList: string[] = [], dupList: string[] = [];
const key = (b: typeof boxes[0]) => `${b.min.join(",")}|${b.max.join(",")}`;
const seen = new Map<string, string>();
for (const b of boxes) {
  const dx = b.max[0] - b.min[0], dy = b.max[1] - b.min[1], dz = b.max[2] - b.min[2];
  if (dx < 1 || dy < 1 || dz < 1) { degenerate++; degList.push(`${b.id} (${b.kind}) dims ${dx}x${dy}x${dz}`); }
  const k = key(b);
  if (seen.has(k)) { duplicate++; dupList.push(`${b.id} (${b.kind}) == ${seen.get(k)}`); }
  else seen.set(k, b.id);
}
console.log(`[geom] objects=${boxes.length} degenerate=${degenerate} duplicate=${duplicate}`);
degList.slice(0, 10).forEach(l => console.log("  DEG:", l));
dupList.slice(0, 10).forEach(l => console.log("  DUP:", l));

// ---- Phase sanity: every floor phase should have slab + columns ----
const phases = [...new Set(boxes.map(b => b.phase))].sort();
console.log("[phases]", phases.join(", "));
for (const ph of phases) {
  const ks = new Set(boxes.filter(b => b.phase === ph).map(b => b.kind));
  console.log(`  ${ph}: ${[...ks].join(",")}`);
}

// ---- Column/footing geometry consistency ----
const cols = boxes.filter(b => b.kind === "column");
const colSizes = new Set(cols.map(b => `${b.max[0]-b.min[0]}x${b.max[1]-b.min[1]}x${b.max[2]-b.min[2]}`));
console.log("[columns]", cols.length, "sizes:", [...colSizes].join(" | "));

const footings = boxes.filter(b => b.kind === "footing");
const fSizes = new Set(footings.map(b => `${(b.max[0]-b.min[0]).toFixed(0)}x${(b.max[1]-b.min[1]).toFixed(0)}x${(b.max[2]-b.min[2]).toFixed(0)}`));
console.log("[footings]", footings.length, "sizes:", [...fSizes].join(" | "));

// Column positions: check grid alignment (x and y should each be on a small set of values)
const colX = new Set(cols.map(b => Math.round((b.min[0]+b.max[0])/2/50)*50));
const colY = new Set(cols.map(b => Math.round((b.min[1]+b.max[1])/2/50)*50));
console.log("[grid] unique column X positions:", [...colX].length, "Y positions:", [...colY].length);
console.log("[grid] X:", [...colX].sort((a,b)=>a-b).join(","));
console.log("[grid] Y:", [...colY].sort((a,b)=>a-b).join(","));

// Stair positions per phase
const stairs = boxes.filter(b => b.kind === "stair");
const stairPhases = new Map<string, number>();
for (const s of stairs) stairPhases.set(s.phase, (stairPhases.get(s.phase) ?? 0) + 1);
console.log("[stairs] per phase:", JSON.stringify([...stairPhases]));
const stairSizes = new Set(stairs.map(b => `${(b.max[0]-b.min[0]).toFixed(0)}x${(b.max[1]-b.min[1]).toFixed(0)}`));
console.log("[stairs] footprints (w x l):", [...stairSizes].join(" | "));

// ---- Structural check (replicates NativeCadScreen structural useMemo) ----
const concrete = CONCRETE_GRADES[25];
const steel = STEEL_GRADES[415];
const colSection: RectSection = {
  width: custom.columnWidthMm, depth: custom.columnDepthMm,
  cover: 40,
  mainBarDia: custom.columnWidthMm >= 350 ? 16 : 12,
  numMainBars: 8, linkDia: 8,
};
const floorAreaPerStory = project.plotSqm * 0.7;
const gravityPerStory = floorAreaPerStory * 24;
const columnCount = Math.max(9, Math.round(Math.sqrt(project.plotSqm) / 3.6) * 4);
const columnLoad = (gravityPerStory * project.stories) / columnCount;
const column = analyzeColumn(colSection, {
  axialLoad: columnLoad, momentMajor: columnLoad * 0.12, momentMinor: columnLoad * 0.08,
  unbracedLength: 3.0,
}, concrete, steel);
console.log("[structural] columnLoad:", Math.round(columnLoad), "kN", "columnCount:", columnCount);
console.log("[structural] column util:", column.utilization, "slender:", column.isSlender, "lambda:", column.slendernessRatioX, column.slendernessRatioY, "Pn:", column.Pu_capacity, "kN");

const beamSection: RectSection = { width: 250, depth: 450, cover: 40, mainBarDia: 16, numMainBars: 6, linkDia: 8 };
const beam = analyzeBeam(beamSection, 4.5, {
  selfWeight: 0.25 * 0.45 * 24, superimposedDead: 2.0, liveLoad: 2.5,
  wallLoad: 1.2 * 3 * 14,
}, concrete, steel);
console.log("[structural] beam:", JSON.stringify({
  M: beam.maxMoment, V: beam.maxShear, uM: beam.utilizationMoment,
  defl: beam.maxDeflection, allow: beam.allowableDeflection,
  links: beam.detail.stirrupCage,
}));

const soil = { qu: 200, ad: 120, cohesion: 50, frictionAngle: 20, unitWeight: 18, sptN: 12 };
const footing = designFooting(custom.columnWidthMm, custom.columnDepthMm, columnLoad, soil, concrete);
console.log("[structural] footing:", JSON.stringify(footing));

const heights = [3, 6, 9, 12, 15]; // meters
const totalWeight = floorAreaPerStory * project.stories * 12;
const seismic = seismicAnalysis(totalWeight, heights, BNBC_DEFAULT, heights.map(() => 1.8e7));
console.log("[structural] seismic:", JSON.stringify({
  W: seismic.seismicWeight, T: seismic.naturalPeriod, V: seismic.baseShear,
  VoverW: seismic.baseShearCoeff, maxDrift: seismic.maxDrift, allow: seismic.allowableDrift,
}));

// ---- Mesh object sanity: NaN/Infinity, unindexed objects, negative volume ----
let badNums = 0, emptyTri = 0;
for (const o of doc.objects) {
  for (const v of o.positions) if (!Number.isFinite(v)) { badNums++; break; }
  if (o.indices.length < 3 || o.indices.length % 3 !== 0) emptyTri++;
  if (o.volumeMm3 <= 0) emptyTri++;
}
console.log("[mesh-sanity] objectsWithBadNumbers:", badNums, "objectsWithBadIndicesOrVolume:", emptyTri);

// ---- Wall height check: walls should span story height (3000mm) ----
const walls = boxes.filter(b => b.kind === "wall");
const wallH = new Set(walls.map(b => Math.round(b.max[2] - b.min[2])));
console.log("[walls]", walls.length, "heights:", [...wallH].sort((a,b)=>a-b).join(","));

// ---- Slab thickness check ----
const slabs = boxes.filter(b => b.kind === "slab");
const slabT = new Set(slabs.map(b => Math.round(b.max[2] - b.min[2])));
console.log("[slabs]", slabs.length, "thicknesses:", [...slabT].sort((a,b)=>a-b).join(","));

// ---- Door/window z positions (should sit inside walls) ----
const doors = boxes.filter(b => b.kind === "door");
const wins = boxes.filter(b => b.kind === "window");
const doorH = new Set(doors.map(b => Math.round(b.max[2]-b.min[2])));
const winH = new Set(wins.map(b => Math.round(b.max[2]-b.min[2])));
console.log("[doors]", doors.length, "heights:", [...doorH].sort((a,b)=>a-b).join(","));
console.log("[windows]", wins.length, "heights:", [...winH].sort((a,b)=>a-b).join(","));

// ---- Tanks: roof tanks should sit above roof slab, not inside it ----
const tanks = boxes.filter(b => b.kind === "tank");
for (const t of tanks) {
  const label = t.id;
  console.log("[tank]", label, "z:", t.min[2], "-", t.max[2], "phase:", t.phase);
}

// ---- Parapet check ----
const parapets = boxes.filter(b => b.kind === "parapet");
for (const p of parapets) {
  console.log("[parapet]", p.id, "z:", p.min[2], "-", p.max[2], "phase:", p.phase);
}

console.log("DONE");
