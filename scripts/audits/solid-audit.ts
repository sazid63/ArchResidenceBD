/**
 * Mesh audit: generates the building for every floor-plan preset x storey count x plot size and
 * runs the solid-kernel validator. Exit code 1 if any configuration fails.
 *
 *   npx tsx scripts/audit-mesh.ts            # summary table
 *   npx tsx scripts/audit-mesh.ts --verbose  # print offending ids
 */
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator";
import { validateSolids } from "../../src/cad/solidKernel";
import { FLOORPLAN_PRESETS } from "../../src/data/floorplanPresets";
import { generatePhasesForStories } from "../../src/engine/projectState";

const verbose = process.argv.includes("--verbose");
let failures = 0;
const rows: string[] = [];

for (const preset of FLOORPLAN_PRESETS) {
  for (const stories of [2, 4, 6]) {
    for (const plotSqm of [200, 335]) {
      // Real phases (one per storey), the chosen preset on every floor phase.
      const phases = generatePhasesForStories(stories).map((p) =>
        p.kind === "floor" ? { ...p, data: { selectedFloorplanPreset: preset.id } } : p);
      const project: any = {
        id: "audit", name: "audit", address: "", stories, plotSize: 3, plotUnit: "katha", plotSqm,
        unitsPerFloor: 2, createdAt: "", updatedAt: "", designStarted: true, phases,
      };
      const mesh = generateBuildingMesh(project, "final");
      const r = validateSolids(mesh.objects);
      if (!r.pass) failures++;
      rows.push(
        `${r.pass ? "PASS" : "FAIL"} ${preset.id.padEnd(24)} ${stories}st ${String(plotSqm).padStart(3)}m2 ` +
        `objs=${String(r.objects).padStart(4)} overlaps=${String(r.overlappingPairs).padStart(4)} ` +
        `(${r.overlapVolumeM3}m3) zfight=${String(r.sameFacingCoplanarPairs).padStart(4)} ` +
        `inverted=${r.invertedWindingObjects.length} open=${r.nonManifoldObjects.length} ` +
        `degenerate=${r.degenerateObjects.length} floating=${r.floatingObjects.length}`,
      );
      if (verbose && !r.pass) {
        console.log(rows[rows.length - 1]);
        console.log("   overlaps:", r.samples.overlaps.slice(0, 4));
        console.log("   zfight  :", r.samples.zfight.slice(0, 4));
        console.log("   degenerate:", r.degenerateObjects.slice(0, 6), "floating:", r.floatingObjects.slice(0, 6));
      }
    }
  }
}
if (!verbose) console.log(rows.join("\n"));
console.log(`\n${rows.length - failures}/${rows.length} configurations pass`);
process.exit(failures ? 1 : 0);
