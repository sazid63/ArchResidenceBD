/** Quick smoke test for exporters + generator. */
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { generateRandomBuildingProject } from "../../src/engine/projectState.js";
import { buildFreeCadMacro, buildIfcStep, validateIfcStep } from "../../src/cad/exporters.js";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, "exporter-out");
mkdirSync(OUT_DIR, { recursive: true });

const project = generateRandomBuildingProject();
const doc = generateBuildingMesh(project);
console.log(`[exporter-test] objects=${doc.objects.length} notes=${(doc as any).notes?.length ?? 0}`);

const meta = {
  projectName: project.name,
  stories: project.stories ?? 2,
  plotSize: project.plotSqm,
  plotUnit: "sqm",
  generatedAt: new Date().toISOString(),
};

const macroPath = join(OUT_DIR, "test-macro.fcmacro");
const macro = buildFreeCadMacro(doc, meta);
writeFileSync(macroPath, macro, "utf8");
console.log(`[exporter-test] FreeCAD macro: ${macroPath} (${statSync(macroPath).size} bytes)`);

const stepPath = join(OUT_DIR, "test-step.step");
const step = buildIfcStep(doc, meta);
writeFileSync(stepPath, step, "utf8");
const errs = validateIfcStep(step);
console.log(`[exporter-test] IFC STEP: ${stepPath} (${statSync(stepPath).size} bytes) validation errors=${errs.length}`);
if (errs.length > 0) {
  console.log("  errors:", JSON.stringify(errs.slice(0, 5)));
  process.exitCode = 1;
} else {
  console.log("[exporter-test] ALL CHECKS PASSED");
}
