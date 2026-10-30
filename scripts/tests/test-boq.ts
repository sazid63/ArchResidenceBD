/**
 * Test script for BOQ Generator
 * Generates Bill of Quantities from the parametric building mesh
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { generateBOQ, exportBOQCSV, generateBOQReport } from "../../src/cad/boqGenerator.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "audit-out", "boq");
mkdirSync(OUT, { recursive: true });

// Test case: 5-storey building
const project = {
  id: "boq-test-5st",
  name: "5-Storey Residential BOQ Test",
  stories: 5,
  plotSize: 5.8,
  plotUnit: "katha" as const,
  plotSqm: 234.1,
  unitsPerFloor: 2,
  address: "Mirpur, Dhaka",
  phases: [],
  designStarted: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

console.log("[BOQ-test] Generating 5-storey building mesh...");
const doc = generateBuildingMesh(project, "final", {
  columnWidthMm: 300,
  columnDepthMm: 300,
  footingSizeMm: 1800,
  footingDepthMm: 1600,
  balconyDepthMm: 1200,
});

console.log(`[BOQ-test] Mesh generated: ${doc.objects.length} objects`);

// Generate BOQ
console.log("[BOQ-test] Generating BOQ...");
const boq = generateBOQ(doc, project);

// Export CSV
const csv = exportBOQCSV(boq);
const csvPath = join(OUT, `${project.id}.csv`);
writeFileSync(csvPath, csv);

// Export Markdown report
const md = generateBOQReport(boq);
const mdPath = join(OUT, `${project.id}.md`);
writeFileSync(mdPath, md);

// Export JSON
const jsonPath = join(OUT, `${project.id}.json`);
writeFileSync(jsonPath, JSON.stringify(boq, null, 2));

console.log(`\n[BOQ-test] ✓ BOQ generated with ${boq.totals.totalItems} items`);
console.log(`[BOQ-test] Subtotal: ৳${boq.totals.subtotalBDT.toLocaleString()}`);
console.log(`[BOQ-test] VAT (5%): ৳${boq.totals.taxBDT.toLocaleString()}`);
console.log(`[BOQ-test] Grand Total: ৳${boq.totals.totalBDT.toLocaleString()}`);
console.log(`\n[BOQ-test] CSV:  ${csvPath}`);
console.log(`[BOQ-test] MD:   ${mdPath}`);
console.log(`[BOQ-test] JSON: ${jsonPath}`);

// Print category summary
console.log("\n[BOQ-test] Summary by Category:");
for (const [cat, totals] of Object.entries(boq.totals.totalsByCategory)) {
  console.log(`  ${cat}: ৳${Math.round(totals.amount).toLocaleString()} (qty: ${Math.round(totals.quantity * 100) / 100})`);
}

console.log("\n[BOQ-test] DONE");