/**
 * Regression test: the plan chosen on the setup screen must reach the 3D floors.
 *   npx tsx scripts/tests/floorplan-chain.ts
 * Checks, for every catalogue plan (1/2/3-unit): the project records the plan, every floor
 * resolves to the same typical preset, a floor's own selection still overrides it, different
 * unit counts give different 3D partitions (v2.4 always built the 2-unit default), and the
 * generated mesh passes the strict solid validator.
 */
import { createNewProject } from "../../src/engine/projectState";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator";
import { resolveFloorPresetId } from "../../src/data/floorplanMapping";
import { validateSolids } from "../../src/cad/solidKernel";
import { getFloorPlansByUnits } from "../../src/data/bangladeshFloorplans";

let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.log("FAIL", msg); } };
const partitions = (m: { objects: Array<{ kind: string }> }) => m.objects.filter((o) => o.kind === "partition").length;
const perUnits = new Map<number, number>();

for (const units of [1, 2, 3]) {
  for (const plan of getFloorPlansByUnits(units)) {
    const project = createNewProject({ name: "t", stories: 4, plotSize: 4, plotUnit: "katha", unitsPerFloor: units, floorplanId: plan.id });
    check(project.floorplanId === plan.id, `${plan.id}: floorplanId not stored`);
    const ids = [1, 2, 3].map((s) => resolveFloorPresetId(project, s));
    check(new Set(ids).size === 1 && ids[0] === project.typicalPresetId, `${plan.id}: floors resolve to different presets ${ids}`);
    if (plan === getFloorPlansByUnits(units)[0]) {
      const m = generateBuildingMesh(project, "final");
      perUnits.set(units, partitions(m));
      const r = validateSolids(m.objects);
      check(r.pass, `${plan.id}: mesh invalid (overlaps ${r.overlappingPairs}, zfight ${r.sameFacingCoplanarPairs}, floating ${r.floatingObjects.length})`);
    }
  }
}
check(new Set(perUnits.values()).size === 3, `unit counts 1/2/3 built identical partitions: ${[...perUnits]}`);

const p = createNewProject({ name: "o", stories: 4, plotSize: 4, plotUnit: "katha", unitsPerFloor: 2 });
p.phases.find((x) => x.kind === "floor" && x.storeyIndex === 2)!.data = { selectedFloorplanPreset: "preset-single-luxury" };
check(resolveFloorPresetId(p, 2) === "preset-single-luxury", "floor-level selection must override the typical plan");
check(resolveFloorPresetId(p, 1) === p.typicalPresetId, "other floors keep the typical plan");

console.log(failed ? `${failed} FAILED` : "floorplan chain: all checks passed");
process.exit(failed ? 1 : 0);
