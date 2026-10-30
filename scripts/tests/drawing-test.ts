import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { FLOORPLAN_PRESETS, RoomPartition } from "../../src/data/floorplanPresets.js";
import * as drawingEngine from "../../src/cad/drawingEngine.js";
const { exportDrawingAsSVG, generateFloorPlan, generateSection, generateElevation } = drawingEngine;
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "audit-out", "drawings");
mkdirSync(OUT_DIR, { recursive: true });

interface TestResult {
  presetId: string;
  stories: number;
  status: "success" | "failed";
  error?: string;
  svgPath?: string;
  elementCount?: number;
  viewCount?: number;
  bbox?: { x: number; y: number; w: number; h: number };
}

function convertRoomsToDrawingFormat(
  rooms: RoomPartition[],
  plotSqm: number,
  stories: number,
  phase: string
): Array<{
  name: string;
  x: number; y: number; w: number; h: number;
  door?: { side: "N" | "S" | "E" | "W"; pos: number };
  window?: { side: "N" | "S" | "E" | "W"; pos: number; width: number };
}> {
  // Estimate building footprint from plot area (simplified: assume ~70% coverage)
  const buildingFootprint = plotSqm * 0.7;
  const aspect = 1.2; // typical length/width ratio
  const widthMm = Math.sqrt(buildingFootprint / aspect) * 1000;
  const lengthMm = widthMm * aspect;

  return rooms
    .filter(r => !r.open) // skip open spaces
    .map(r => {
      const x = r.boundsRel[0] * widthMm;
      const y = r.boundsRel[1] * lengthMm;
      const w = (r.boundsRel[2] - r.boundsRel[0]) * widthMm;
      const h = (r.boundsRel[3] - r.boundsRel[1]) * lengthMm;

      // Map door/window sides from preset format to drawing engine format
      const sideMap: Record<string, "N" | "S" | "E" | "W"> = {
        front: "N", rear: "S", left: "W", right: "E", inner: "S"
      };

      return {
        name: r.nameEn,
        x, y, w, h,
        door: r.doorSide ? { side: sideMap[r.doorSide] || "S", pos: w / 2 } : undefined,
        window: r.windowSide ? { side: sideMap[r.windowSide] || "N", pos: w / 2, width: Math.min(w * 0.6, 1500) } : undefined,
      };
    });
}

async function runDrawingTest(): Promise<void> {
  const presets = [
    { id: "preset-dual-3bed", stories: 3, plotSize: 3.5 },
    { id: "preset-dual-3bed", stories: 5, plotSize: 5.0 },
    { id: "preset-single-luxury", stories: 3, plotSize: 4.0 },
  ];

  const results: TestResult[] = [];

  for (const { id: presetId, stories, plotSize } of presets) {
    console.log(`\n=== Testing ${presetId} @ ${stories} stories ===`);
    
    const preset = FLOORPLAN_PRESETS.find(p => p.id === presetId);
    if (!preset) {
      console.log(`  ERROR: Preset not found`);
      results.push({ presetId, stories, status: "failed", error: "Preset not found" });
      continue;
    }

    // Build project
    const proj = {
      id: `draw-test-${presetId}-s${stories}`,
      name: `Drawing Test ${presetId} ${stories}st`,
      stories,
      plotSize,
      plotUnit: "katha" as const,
      plotSqm: plotSize * 66.89,
      unitsPerFloor: preset.unitsCount,
      address: "Dhaka",
      phases: [],
      designStarted: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      // Generate 3D mesh
      const mesh = generateBuildingMesh(proj, "final");
      console.log(`  Mesh: ${mesh.objects.length} objects, ${mesh.objects.reduce((a, o) => a + o.indices.length / 3, 0)} triangles`);

      // Extract floor plan rooms for typical floor (floor 1)
      const floorRooms = convertRoomsToDrawingFormat(
        preset.rooms,
        proj.plotSqm,
        stories,
        `floor_1`
      );

      console.log(`  Drawing rooms: ${floorRooms.length}`);
      for (const r of floorRooms) {
        console.log(`    - ${r.name}: ${(r.x/1000).toFixed(1)}x${(r.y/1000).toFixed(1)}m ${(r.w/1000).toFixed(1)}x${(r.h/1000).toFixed(1)}m`);
      }

      // Generate floor plan
      const drawing = await generateFloorPlan(floorRooms, {
        scale: 100, // 1:100
        project: proj.name,
        drawingNo: `A-${stories}-${presetId}`,
      });

      // Export SVG
      const svg = exportDrawingAsSVG(drawing);
      const svgPath = join(OUT_DIR, `${presetId}_s${stories}_floor.svg`);
      writeFileSync(svgPath, svg);
      
      // Count elements
      const totalElements = drawing.views.reduce((sum, v) => sum + v.elements.length, 0);
      
      results.push({
        presetId,
        stories,
        status: "success",
        svgPath,
        elementCount: totalElements,
        viewCount: drawing.views.length,
        bbox: drawing.views[0]?.bbox,
      });

      console.log(`  SUCCESS: ${totalElements} elements in ${drawing.views.length} views`);
      console.log(`  SVG saved to: ${svgPath}`);

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  FAILED: ${msg}`);
      results.push({ presetId, stories, status: "failed", error: msg });
    }
  }

  // Write status report
  const reportPath = join(OUT_DIR, "drawing-status.md");
  let report = "# Drawing Generation Test Report\n\n";
  report += `Generated: ${new Date().toISOString()}\n\n`;
  
  for (const r of results) {
    report += `## ${r.presetId} (${r.stories} stories)\n\n`;
    report += `- **Status**: ${r.status}\n`;
    if (r.error) report += `- **Error**: ${r.error}\n`;
    if (r.svgPath) report += `- **SVG**: ${r.svgPath}\n`;
    if (r.elementCount !== undefined) report += `- **Elements**: ${r.elementCount}\n`;
    if (r.viewCount !== undefined) report += `- **Views**: ${r.viewCount}\n`;
    if (r.bbox) report += `- **BBox**: ${JSON.stringify(r.bbox)}\n`;
    report += "\n";
  }

  const successCount = results.filter(r => r.status === "success").length;
  report += `## Summary\n\n`;
  report += `- Total tests: ${results.length}\n`;
  report += `- Passed: ${successCount}\n`;
  report += `- Failed: ${results.length - successCount}\n`;

  writeFileSync(reportPath, report);
  console.log(`\n=== Report written to ${reportPath} ===`);
  console.log(`Passed: ${successCount}/${results.length}`);
}

runDrawingTest().catch(console.error);