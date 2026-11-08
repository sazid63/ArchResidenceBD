/**
 * Mesh audit: generates the building for every floor-plan preset x storey count x plot size and
 * runs the solid-kernel validator. Exit code 1 if any configuration fails.
 *
 *   npx tsx scripts/audit-mesh.ts            # summary table
 *   npx tsx scripts/audit-mesh.ts --verbose  # print offending ids
 */
import { validateSolids } from "../../src/cad/solidKernel";
import { deriveBuilding, DEFAULT_SETBACKS_MM, type BuildingInput } from "../../src/model/building";
import { buildMesh } from "../../src/model/toMesh";
import { fitRange } from "../../src/plans/fit";
import { PLAN_LIBRARY } from "../../src/plans/library";

/** New path (M2-2): every library plan at its min / preferred / max size × 2, 6, 10 storeys. */
function modelCases(): Array<{ caseId: string; input: BuildingInput }> {
  const out: Array<{ caseId: string; input: BuildingInput }> = [];
  for (const plan of PLAN_LIBRARY) {
    const r = fitRange(plan);
    const sizes = (["min", "pref", "max"] as const).map((k) => [k, r.widthMm[k], r.depthMm[k]] as const);
    for (const [k, w, d] of sizes)
      for (const storeys of [2, 6, 10])
        out.push({
          caseId: `model-${plan.id}-${k}-${storeys}st`,
          input: {
            planId: plan.id,
            storeys,
            plotWidthMm: w + DEFAULT_SETBACKS_MM.left + DEFAULT_SETBACKS_MM.right,
            plotDepthMm: d + DEFAULT_SETBACKS_MM.front + DEFAULT_SETBACKS_MM.rear,
          },
        });
  }
  return out;
}

const verbose = process.argv.includes("--verbose");
let failures = 0;
const rows: string[] = [];

// New path (M2-2): building model → mesh, every library plan swept across its fit range.
for (const c of modelCases()) {
  const b = deriveBuilding(c.input);
  if (!b.ok) {
    failures++;
    rows.push(`FAIL ${c.caseId}: ${b.reasons[0].message.en}`);
    continue;
  }
  const r = validateSolids(buildMesh(b.model).objects);
  if (!r.pass) failures++;
  rows.push(
    `${r.pass ? "PASS" : "FAIL"} ${c.caseId.padEnd(34)} objs=${String(r.objects).padStart(5)} overlaps=${r.overlappingPairs} zfight=${r.sameFacingCoplanarPairs} ` +
      `inverted=${r.invertedWindingObjects.length} open=${r.nonManifoldObjects.length} degenerate=${r.degenerateObjects.length} floating=${r.floatingObjects.length}`,
  );
  if (verbose && !r.pass) console.log(rows[rows.length - 1], r.samples);
}

if (!verbose) console.log(rows.join("\n"));
console.log(`\n${rows.length - failures}/${rows.length} configurations pass`);
process.exit(failures ? 1 : 0);
