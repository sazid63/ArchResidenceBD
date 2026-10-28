import { buildIfcStep, orderedPhases } from "../src/cad/exporters.js";
import { generateBuildingMesh } from "../src/cad/parametricBuildingGenerator.js";
import { generateRandomBuildingProject } from "../src/engine/projectState.js";
import { writeFileSync } from "node:fs";

const p = generateRandomBuildingProject();
const doc = generateBuildingMesh(p);
console.log("stories:", p.stories);
console.log("doc phases:", [...new Set(doc.objects.map(o => o.phase || 'other'))].sort());

// Now trace inside the actual buildIfcStep by copying its logic
const projectName = "test";
const phases = orderedPhases(doc);
console.log("orderedPhases result:", phases);

const objectsByPhase = new Map<string, any[]>();
for (const phase of phases) objectsByPhase.set(phase, []);
for (const object of doc.objects) {
  const phase = object.phase || "other";
  const bucket = objectsByPhase.get(phase);
  if (bucket) bucket.push(object);
}
console.log("objectsByPhase keys:", [...objectsByPhase.keys()].sort());

const productIdsByPhase = new Map<string, number[]>();
for (const phase of phases) productIdsByPhase.set(phase, []);
for (const object of doc.objects) {
  const phase = object.phase || "other";
  const bucket = productIdsByPhase.get(phase);
  if (bucket) bucket.push(1);
}
console.log("productIdsByPhase keys:", [...productIdsByPhase.keys()].sort());
console.log("productIdsByPhase sizes:", JSON.stringify([...productIdsByPhase.entries()].map(([k,v]) => [k, v.length])));

const storeyIds = new Map<string, number>();
for (const phase of phases) {
  storeyIds.set(phase, 100); // dummy
}
console.log("storeyIds keys:", [...storeyIds.keys()].sort());

// The containment loop
console.log("--- CONTAINMENT LOOP ---");
for (const phase of phases) {
  const productIds = productIdsByPhase.get(phase) ?? [];
  const storeyId = storeyIds.get(phase);
  console.log(`phase="${phase}", productIds.length=${productIds.length}, storeyId=${storeyId}`);
  if (!storeyId || productIds.length === 0) {
    console.log(`  SKIPPED!`);
    continue;
  }
  console.log(`  WOULD EMIT`);
}

const step = buildIfcStep(doc, { projectName, stories: p.stories ?? 2, plotSize: p.plotSqm, plotUnit: "sqm" });
console.log("has RELCONTAINED in step:", step.includes("IFCRELCONTAINED"));