#!/usr/bin/env tsx
/**
 * Batch Export Script for ArchResidenceBD
 * 
 * Exports all project deliverables in one command:
 * - IFC4 STEP file
 * - FreeCAD Python macro
 * - SVG drawings (plans, sections, elevations)
 * - DXF drawings
 * - BOQ CSV
 * - Compliance report (JSON + Markdown)
 * - Project summary JSON
 * 
 * Usage: npx tsx scripts/batch-export.ts [project-id]
 *        If no project-id provided, exports active project
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Polyfill for Node.js globals in Vite context
const __dirname = dirname(fileURLToPath(import.meta.url));

// Import project state and generators
import { getActiveProject, getSavedProjects, BuildingProject } from "../../src/engine/projectState.js";
import { generateBuildingMesh } from "../../src/cad/parametricBuildingGenerator.js";
import { generateBOQ, exportBOQCSV, generateBOQReport, generateBoqFromProject } from "../../src/cad/boqGenerator.js";
import { runComplianceCheck, buildComplianceContext, DeviationItem } from "../../src/cad/codeCompliance.js";
import { generateFloorPlanFromMesh, generateSection, generateElevation, exportDrawingAsSVG, exportDrawingAsDXF } from "../../src/cad/drawingEngine.js";
import { buildIfcStep, buildFreeCadMacro, ExportMeta } from "../../src/cad/exporters.js";
import type { MeshDocument } from "../../src/cad/mesh.js";

interface ExportOptions {
  projectId?: string;
  outputDir?: string;
  formats?: ("ifc" | "freecad" | "svg" | "dxf" | "csv" | "json" | "md")[];
  includeCompliance?: boolean;
  includeDrawings?: boolean;
}

const DEFAULT_OPTIONS: Required<ExportOptions> = {
  projectId: "",
  outputDir: join(__dirname, "..", "scripts", "audit-out", "batch"),
  formats: ["ifc", "freecad", "svg", "dxf", "csv", "json", "md"],
  includeCompliance: true,
  includeDrawings: true,
};

async function batchExport(options: ExportOptions = {}): Promise<void> {
  const config: Required<ExportOptions> = { ...DEFAULT_OPTIONS, ...options };
  
  console.log("📦 ArchResidenceBD Batch Export");
  console.log("=================================");
  
  // Get project
  let project: BuildingProject | null = null;
  if (config.projectId) {
    const allProjects = getSavedProjects();
    project = allProjects.find(p => p.id === config.projectId) || null;
  } else {
    project = getActiveProject();
  }
  
  if (!project) {
    console.error("❌ No project found. Create or load a project first.");
    process.exit(1);
  }
  
  console.log(`\n📋 Project: ${project.name}`);
  console.log(`   ID: ${project.id}`);
  console.log(`   Stories: ${project.stories}`);
  console.log(`   Plot: ${project.plotSize} ${project.plotUnit} (${project.plotSqm} m²)`);
  console.log(`   Units/Floor: ${project.unitsPerFloor}`);
  
  // Create output directory
  const projectDir = join(config.outputDir, project.id);
  mkdirSync(projectDir, { recursive: true });
  console.log(`\n📁 Output directory: ${projectDir}`);
  
  // Generate mesh once
  console.log("\n🔨 Generating 3D mesh...");
  const customization = project.customization || {
    accessibility: { rampSlope: 12, rampWidthMm: 1200, doorClearWidthMm: 900, wcClearMm: [1500, 1500], tactilePathWidthMm: 300, elevatorRequired: true, elevatorPitMm: 1200, elevatorWellMm: [1400, 1100, 2100], grabRailHeightMm: 700, brailleSignage: true },
    sustainability: { annualRainfallMm: 2000, tankEfficiency: 0.85, roofUValue: 0.8, wallUValue: 1.2, windowUValue: 3.5, coolingLoadFactor: 12, windowToFloorRatioMin: 0.15, daylightFactorTarget: 2.0 },
    fireSafety: { enabled: false, stairWidthMm: 1000, corridorWidthMm: 1200, travelDistanceMaxM: 30, fireRatingHours: 2, sprinklerSystem: false, smokeDetector: true },
    valueEngineering: { enabled: false, autoApply: false },
    constructionMgmt: { enabled: false },
  };
  
  const mesh = generateBuildingMesh(project, "final", customization);
  console.log(`   Objects: ${mesh.objects.length}`);
  
  // 1. Export IFC
  if (config.formats.includes("ifc")) {
    console.log("\n📐 Exporting IFC4 STEP...");
    const meta: ExportMeta = {
      projectName: project.name,
      stories: project.stories,
      plotSize: project.plotSize,
      plotUnit: project.plotUnit,
      generatedAt: new Date().toISOString(),
    };
    const ifcContent = buildIfcStep(mesh, meta);
    writeFileSync(join(projectDir, `${project.id}.ifc`), ifcContent);
    console.log(`   ✅ ${project.id}.ifc`);
  }
  
  // 2. Export FreeCAD Macro
  if (config.formats.includes("freecad")) {
    console.log("\n🐍 Exporting FreeCAD Python macro...");
    const meta: ExportMeta = {
      projectName: project.name,
      stories: project.stories,
      plotSize: project.plotSize,
      plotUnit: project.plotUnit,
      generatedAt: new Date().toISOString(),
    };
    const macroContent = buildFreeCadMacro(mesh, meta);
    writeFileSync(join(projectDir, `${project.id}_freecad.FCMacro`), macroContent);
    console.log(`   ✅ ${project.id}_freecad.FCMacro`);
  }
  
  // 3. Export Drawings (SVG + DXF)
  if (config.includeDrawings && config.formats.some(f => ["svg", "dxf"].includes(f))) {
    console.log("\n📐 Generating architectural drawings...");
    
    // Generate floor plans for each story
    const floorPlans: Record<string, any> = {};
    for (let i = 0; i < project.stories; i++) {
      const phase = i === 0 ? "ground_floor" : `floor-${i + 1}`;
      try {
        const plan = generateFloorPlanFromMesh(mesh, phase, {
          scale: 100,
          project: project.name,
          drawingNo: `A-${i + 1}`,
        });
        floorPlans[`floor${i + 1}`] = plan;
      } catch (e) {
        console.log(`   ⚠️  Could not generate floor plan for ${phase}`);
      }
    }
    
    // Generate section
    const storyHeights = Array.from({ length: project.stories }, (_, i) => i === 0 ? 4500 : 3000);
    const section = generateSection(storyHeights, project.plotSqm * 0.7, {
      scale: 100,
      project: project.name,
      drawingNo: "A-SEC-01",
    });
    
    // Generate elevations
    const buildingHeight = storyHeights.reduce((a, b) => a + b, 0);
    const elevations = {
      front: generateElevation(
        project.plotSqm * 0.7,
        storyHeights,
        [],
        { scale: 100, direction: "front", project: project.name }
      ),
      rear: generateElevation(
        project.plotSqm * 0.7,
        storyHeights,
        [],
        { scale: 100, direction: "rear", project: project.name }
      ),
      left: generateElevation(
        project.plotSqm * 0.7,
        storyHeights,
        [],
        { scale: 100, direction: "left", project: project.name }
      ),
      right: generateElevation(
        project.plotSqm * 0.7,
        storyHeights,
        [],
        { scale: 100, direction: "right", project: project.name }
      ),
    };
    
    if (config.formats.includes("svg")) {
      for (const [name, drawing] of Object.entries(floorPlans)) {
        const svg = exportDrawingAsSVG(drawing);
        writeFileSync(join(projectDir, `${project.id}_${name}.svg`), svg);
        console.log(`   ✅ ${project.id}_${name}.svg`);
      }
      for (const [name, drawing] of Object.entries(elevations)) {
        const svg = exportDrawingAsSVG(drawing);
        writeFileSync(join(projectDir, `${project.id}_elevation_${name}.svg`), svg);
        console.log(`   ✅ ${project.id}_elevation_${name}.svg`);
      }
      const sectionSvg = exportDrawingAsSVG(section);
      writeFileSync(join(projectDir, `${project.id}_section.svg`), sectionSvg);
      console.log(`   ✅ ${project.id}_section.svg`);
    }
    
    if (config.formats.includes("dxf")) {
      for (const [name, drawing] of Object.entries(floorPlans)) {
        const dxf = exportDrawingAsDXF(drawing);
        writeFileSync(join(projectDir, `${project.id}_${name}.dxf`), dxf);
        console.log(`   ✅ ${project.id}_${name}.dxf`);
      }
      for (const [name, drawing] of Object.entries(elevations)) {
        const dxf = exportDrawingAsDXF(drawing);
        writeFileSync(join(projectDir, `${project.id}_elevation_${name}.dxf`), dxf);
        console.log(`   ✅ ${project.id}_elevation_${name}.dxf`);
      }
      const sectionDxf = exportDrawingAsDXF(section);
      writeFileSync(join(projectDir, `${project.id}_section.dxf`), sectionDxf);
      console.log(`   ✅ ${project.id}_section.dxf`);
    }
  }
  
  // 4. Export BOQ
  if (config.formats.includes("csv") || config.formats.includes("json") || config.formats.includes("md")) {
    console.log("\n📊 Generating Bill of Quantities...");
    const boq = generateBoqFromProject(project);
    
    if (config.formats.includes("csv")) {
      const csvContent = exportBOQCSV(boq);
      writeFileSync(join(projectDir, `${project.id}_BOQ.csv`), csvContent);
      console.log(`   ✅ ${project.id}_BOQ.csv`);
    }
    
    if (config.formats.includes("json")) {
      writeFileSync(join(projectDir, `${project.id}_BOQ.json`), JSON.stringify(boq, null, 2));
      console.log(`   ✅ ${project.id}_BOQ.json`);
    }
    
    if (config.formats.includes("md")) {
      const mdContent = generateBOQReport(boq);
      writeFileSync(join(projectDir, `${project.id}_BOQ.md`), mdContent);
      console.log(`   ✅ ${project.id}_BOQ.md`);
    }
  }
  
  // 5. Export Compliance Report
  if (config.includeCompliance && config.formats.some(f => ["json", "md"].includes(f))) {
    console.log("\n✅ Running compliance checks...");
    const ctx = buildComplianceContext(
      {
        stories: project.stories,
        plotSqm: project.plotSqm,
        plotUnit: project.plotUnit,
        unitsPerFloor: project.unitsPerFloor,
        location: "dhaka",
      },
      mesh,
      { concreteGrade: 25, steelGrade: 415, brickStrength: 10 }
    );
    const complianceResult = runComplianceCheck(ctx);
    
    const deviations = complianceResult.deviations || [];
    const summary = complianceResult.summary || { compliant: 0, deviation: 0, info: 0 };
    
    // Calculate compliant, warning, deviation, critical from deviations
    const compliant = summary.compliant || deviations.filter((d: DeviationItem) => d.pass).length;
    const warning = summary.info || deviations.filter((d: DeviationItem) => d.severity === "info" && !d.pass).length;
    const deviation = summary.deviation || deviations.filter((d: DeviationItem) => d.severity === "minor" && !d.pass).length;
    const critical = deviations.filter((d: DeviationItem) => d.severity === "critical" && !d.pass).length;
    
    console.log(`   Passed: ${compliant}`);
    console.log(`   Warnings: ${warning}`);
    console.log(`   Deviations: ${deviation}`);
    console.log(`   Critical: ${critical}`);
    
    if (config.formats.includes("json")) {
      const complianceReport = {
        projectId: project.id,
        projectName: project.name,
        generatedAt: new Date().toISOString(),
        summary,
        deviations,
      };
      writeFileSync(join(projectDir, `${project.id}_compliance.json`), JSON.stringify(complianceReport, null, 2));
      console.log(`   ✅ ${project.id}_compliance.json`);
    }
    
    if (config.formats.includes("md")) {
      let mdContent = `# Compliance Report — ${project.name}\n\n`;
      mdContent += `**Project ID:** ${project.id}  \n`;
      mdContent += `**Generated:** ${new Date().toLocaleString("en-GB")}  \n\n`;
      mdContent += `## Summary\n\n`;
      mdContent += `| Status | Count |\n|--------|-------|\n`;
      mdContent += `| Compliant | ${summary.compliant} |\n`;
      mdContent += `| Warnings | ${summary.warning} |\n`;
      mdContent += `| Deviations | ${summary.deviation} |\n`;
      mdContent += `| Critical | ${summary.critical} |\n\n`;
      mdContent += `## Deviations\n\n`;
      mdContent += `| Rule | Severity | Message |\n|------|----------|---------|\n`;
      for (const d of deviations.filter((d: DeviationItem) => !d.pass)) {
        mdContent += `| ${d.ruleId} | ${d.severity} | ${d.message.replace(/\|/g, "\\|")} |\n`;
      }
      writeFileSync(join(projectDir, `${project.id}_compliance.md`), mdContent);
      console.log(`   ✅ ${project.id}_compliance.md`);
    }
  }
  
  // 6. Export Project Summary
  if (config.formats.includes("json")) {
    console.log("\n📄 Exporting project summary...");
    const summary = {
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        stories: project.stories,
        plotSize: project.plotSize,
        plotUnit: project.plotUnit,
        plotSqm: project.plotSqm,
        unitsPerFloor: project.unitsPerFloor,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        customization: project.customization,
      },
      mesh: {
        objects: mesh.objects.length,
        kinds: [...new Set(mesh.objects.map(o => o.kind))],
      },
      exportOptions: config,
      exportedAt: new Date().toISOString(),
    };
    writeFileSync(join(projectDir, `${project.id}_summary.json`), JSON.stringify(summary, null, 2));
    console.log(`   ✅ ${project.id}_summary.json`);
  }
  
  // 7. Create ZIP archive (Windows PowerShell)
  console.log("\n🗜️  Creating ZIP archive...");
  try {
    const { spawn } = await import("child_process");
    
    const zipPath = join(config.outputDir, `${project.id}_complete_package.zip`);
    const child = spawn("powershell", [
      "-Command",
      `Compress-Archive -Path "${projectDir}\\*" -DestinationPath "${zipPath}" -Force`
    ]);
    
    await new Promise((resolve, reject) => {
      child.on("close", (code) => {
        if (code === 0) resolve(void 0);
        else reject(new Error(`Zip failed with code ${code}`));
      });
      child.on("error", reject);
    });
    
    console.log(`   ✅ ${project.id}_complete_package.zip`);
  } catch (zipError) {
    console.log(`   ⚠️  ZIP creation skipped (${zipError instanceof Error ? zipError.message : "zip not available"})`);
    console.log(`   📁 Files available in: ${projectDir}`);
  }
  
  console.log("\n✨ Batch export complete!");
  console.log(`\n📁 All files in: ${projectDir}`);
  console.log(`📦 Total formats exported: ${config.formats.join(", ")}`);
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const projectId = args[0] || undefined;
  const outputDir = args[1] || undefined;
  
  batchExport({ projectId, outputDir }).catch((err) => {
    console.error("❌ Export failed:", err);
    process.exit(1);
  });
}

export { batchExport, type ExportOptions };