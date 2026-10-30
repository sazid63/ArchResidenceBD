import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { runComplianceCheck, buildComplianceContext } from "../../src/cad/codeCompliance.js";
import { writeFileSync } from "node:fs";

const project = {
  id: "demo-5story",
  name: "Dhaka 5-Storey Residential",
  address: "Mirpur, Dhaka",
  stories: 5,
  plotSize: 3.5,
  plotUnit: "katha" as const,
  plotSqm: 234.1,
  unitsPerFloor: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  phases: [],
  designStarted: true,
};

const doc = generateBuildingMesh(project, "final", {
  columnWidthMm: 250,
  columnDepthMm: 250,
  footingSizeMm: 1800,
  footingDepthMm: 1600,
  balconyDepthMm: 1200,
});

writeFileSync("scripts/exporter-out/demo-5story.mesh.json", JSON.stringify(doc, null, 2));

const counts: Record<string, number> = {};
for (const o of doc.objects) counts[o.kind] = (counts[o.kind] || 0) + 1;
console.log("OBJECT COUNTS:", JSON.stringify(counts));
console.log("TOTAL OBJECTS:", doc.objects.length);
console.log("TOTAL TRIANGLES:", doc.objects.reduce((s, o) => s + o.indices.length / 3, 0));

let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (const o of doc.objects) {
  for (let i = 0; i < 3; i++) {
    minX = Math.min(minX, o.bboxMinMm[i]); minY = Math.min(minY, o.bboxMinMm[i]); minZ = Math.min(minZ, o.bboxMinMm[i]);
    maxX = Math.max(maxX, o.bboxMaxMm[i]); maxY = Math.max(maxY, o.bboxMaxMm[i]); maxZ = Math.max(maxZ, o.bboxMaxMm[i]);
  }
}
console.log("BBOX:", JSON.stringify({ min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }));
console.log("FOOTPRINT:", (maxX - minX) / 1000, "x", (maxY - minY) / 1000, "m");
console.log("HEIGHT:", (maxZ - minZ) / 1000, "m");

const ctx = buildComplianceContext({
  stories: project.stories, plotSqm: project.plotSqm, plotUnit: project.plotUnit,
  unitsPerFloor: project.unitsPerFloor, location: "dhaka",
}, doc, { concreteGrade: 25, steelGrade: 415, brickStrength: 7.5 });
const result = runComplianceCheck(ctx);
console.log("COMPLIANCE SUMMARY:", JSON.stringify(result.summary));
console.log("DEVIATIONS:");
for (const d of result.deviations.filter(x => !x.pass)) console.log(" ", d.ruleId, d.severity, d.message);