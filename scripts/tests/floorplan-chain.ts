/**
 * Regression test: the curated 2D template chosen for a unit count must reach the 3D floors.
 *   npx tsx scripts/tests/floorplan-chain.ts
 *
 * Checks the template library's category mapping, manual selection, automatic random selection,
 * the "same unit count → same drawing" rule, category fallback, and that every generated mesh still
 * passes the strict solid validator.
 */
import {
  createNewProject,
  ensureFloorplanAssignments,
  randomizeFloorplanForUnits,
  setFloorplanForUnits,
} from "../../src/engine/projectState";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator";
import { resolveFloorPresetId } from "../../src/data/floorplanMapping";
import { validateSolids } from "../../src/cad/solidKernel";
import {
  FLOORPLAN_TEMPLATES,
  categoryForUnits,
  fallbackPresetForUnits,
  templatesForUnits,
} from "../../src/data/floorplanLibrary";
import { chooseTemplate, pickRandomTemplate } from "../../src/data/floorplanSelection";

let failed = 0;
const check = (ok: boolean, msg: string) => {
  if (!ok) {
    failed++;
    console.log("FAIL", msg);
  }
};
const partitions = (m: { objects: Array<{ kind: string }> }) => m.objects.filter((o) => o.kind === "partition").length;

// 1. Every template is filed under the category its own unit count implies, and is listed there.
for (const t of FLOORPLAN_TEMPLATES) {
  check(t.category === categoryForUnits(t.unitsPerFloor), `${t.id}: category ${t.category} does not match ${t.unitsPerFloor} unit(s)`);
  check(templatesForUnits(t.unitsPerFloor).some((x) => x.id === t.id), `${t.id}: missing from its unit category`);
}

// 2. Manual selection: every template is stored, applies to all residential floors, and builds a valid mesh.
const partitionsByUnits = new Map<number, number>();
for (const t of FLOORPLAN_TEMPLATES) {
  const project = createNewProject({
    name: "t",
    stories: 4,
    plotSize: 4,
    plotUnit: "katha",
    unitsPerFloor: t.unitsPerFloor,
    floorplanId: t.id,
  });
  check(project.floorplanId === t.id, `${t.id}: floorplanId not stored`);
  check(project.floorplanAssignments?.[String(t.unitsPerFloor)] === t.id, `${t.id}: assignment not keyed by unit count`);

  const presets = [1, 2, 3].map((s) => resolveFloorPresetId(project, s));
  check(new Set(presets).size === 1, `${t.id}: floors resolve to different presets ${presets}`);
  check(presets[0] === t.presetId, `${t.id}: floors built from ${presets[0]} instead of ${t.presetId}`);

  if (!partitionsByUnits.has(t.unitsPerFloor)) {
    const mesh = generateBuildingMesh(project, "final");
    partitionsByUnits.set(t.unitsPerFloor, partitions(mesh));
    const r = validateSolids(mesh.objects);
    check(
      r.pass,
      `${t.id}: mesh invalid (overlaps ${r.overlappingPairs}, zfight ${r.sameFacingCoplanarPairs}, floating ${r.floatingObjects.length})`,
    );
  }
}
check(new Set(partitionsByUnits.values()).size === partitionsByUnits.size, `unit counts built identical partitions: ${[...partitionsByUnits]}`);

// 3. Automatic selection: no manual pick still lands in the right category, and it varies.
const seen = new Set<string>();
for (let i = 0; i < 30; i++) {
  const units = [1, 2, 3][i % 3];
  const project = createNewProject({ name: "auto", stories: 3, plotSize: 3.5, plotUnit: "katha", unitsPerFloor: units });
  const picked = project.floorplanAssignments?.[String(units)];
  check(Boolean(picked), `${units} unit(s): automatic pick did not store an assignment`);
  const template = FLOORPLAN_TEMPLATES.find((t) => t.id === picked);
  check(
    Boolean(template) && categoryForUnits(template!.unitsPerFloor) === categoryForUnits(units),
    `auto pick ${picked} is not in the ${units}-unit category`,
  );
  check(
    Boolean(picked) && template!.presetId === project.typicalPresetId,
    `auto pick ${picked}: stored preset ${project.typicalPresetId} does not match ${template?.presetId}`,
  );
  seen.add(String(picked));
}
check(seen.size > 3, `automatic selection is not random: only ${seen.size} distinct drawings in 30 draws`);

// 4. A manual pick from the wrong category is rejected and replaced by a correct random one.
const wrong = chooseTemplate(1, "bd-2u-001");
check(wrong.auto === true, "a 2-unit plan must not be accepted for a 1-unit floor");
check(wrong.template?.unitsPerFloor === 1, `wrong-category fallback returned ${wrong.template?.id}`);

// 5. Consistency: pinning a drawing rewrites every floor with that unit count.
const base = createNewProject({ name: "c", stories: 5, plotSize: 4, plotUnit: "katha", unitsPerFloor: 2 });
const switched = setFloorplanForUnits(base, "bd-2u-011");
check(switched.floorplanAssignments?.["2"] === "bd-2u-011", "switch did not update the 2-unit assignment");
check(switched.floorplanId === "bd-2u-011", "switch did not update floorplanId");
const floorPresets = new Set(
  switched.phases.filter((p) => p.kind === "floor").map((p) => p.data?.selectedFloorplanPreset as string),
);
check(floorPresets.size === 1 && floorPresets.has("preset-dual-3bed"), `floors disagree after switch: ${[...floorPresets]}`);
check(switched.phases.find((p) => p.kind === "ground_floor")?.data?.selectedFloorplanPreset === undefined, "ground floor must keep its parking layout");

// 6. A single floor can still be overridden, and only that floor changes.
const overridden = {
  ...switched,
  phases: switched.phases.map((p) =>
    p.kind === "floor" && p.storeyIndex === 2 ? { ...p, data: { ...p.data, selectedFloorplanPreset: "preset-single-luxury" } } : p,
  ),
};
check(resolveFloorPresetId(overridden, 2) === "preset-single-luxury", "floor-level override must win");
check(resolveFloorPresetId(overridden, 3) === "preset-dual-3bed", "sibling floors keep the assigned drawing");

// 7. Shuffle stays inside the category; missing assignments are filled in.
const shuffled = randomizeFloorplanForUnits(switched, 2);
check(shuffled.floorplanAssignments?.["2"] === shuffled.floorplanId, "shuffle did not keep the 2-unit assignment slot");
check(
  categoryForUnits(FLOORPLAN_TEMPLATES.find((t) => t.id === shuffled.floorplanId)?.unitsPerFloor ?? 0) === categoryForUnits(2),
  "shuffle left the category",
);
const legacy = { ...switched, floorplanAssignments: undefined, typicalPresetId: undefined };
const repaired = ensureFloorplanAssignments(legacy);
check(Boolean(repaired.floorplanAssignments?.["2"]), "missing assignment was not filled");
check(repaired.typicalPresetId === "preset-dual-3bed", `repaired preset was ${repaired.typicalPresetId}`);

// 8. Categories with no verified drawing fall back instead of throwing.
check(templatesForUnits(1).length > 0, "the 1-unit category must not be empty");
check(pickRandomTemplate(1, () => 0) !== null, "random pick from a populated category must succeed");
check(fallbackPresetForUnits(6) === "preset-studio-bachelor", `unexpected fallback ${fallbackPresetForUnits(6)}`);

console.log(failed ? `${failed} FAILED` : "floorplan chain: all checks passed");
process.exit(failed ? 1 : 0);
