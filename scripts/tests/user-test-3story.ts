/**
 * Rafiq's Test: 3-story building on 5 katha plot, Dhanmondi Dhaka
 * Simulates the full user workflow through the real app code.
 */
import { writeFileSync } from "fs";

// Shim: no DOM needed
const { createNewProject, generatePhasesForStories, plotToSqm, createDefaultCustomization } = await import("../src/engine/projectState.js");
const { generateBuildingMesh } = await import("../src/cad/parametricBuildingGenerator.js");
const { buildIfcStep, buildFreeCadMacro, validateIfcStep } = await import("../src/cad/exporters.js");
const { generateBOQ, exportBOQCSV, generateBOQReport } = await import("../src/cad/boqGenerator.js");
const { buildComplianceContext, runComplianceCheck } = await import("../src/cad/codeCompliance.js");
const { generateFloorPlanFromMesh, generateSection, generateElevation, exportDrawingAsSVG, exportDrawingAsDXF } = await import("../src/cad/drawingEngine.js");

const log = (s: string) => console.log(`[Rafiq] ${s}`);

const bugs: Array<{ title: string; severity: "Critical" | "Major" | "Minor"; repro: string; expected: string; actual: string }> = [];

log("Step 1: Creating new project — 'Dhanmondi 3-Story Residence', 5 katha, 3 stories, 2 units/floor");

let project;
try {
  project = createNewProject({
    name: "Dhanmondi 3-Story Residence",
    address: "Road 11, Dhanmondi, Dhaka",
    stories: 3,
    plotSize: 5,
    plotUnit: "katha",
    unitsPerFloor: 2,
  });
  log(`✓ Project created: ${project.id}`);
  log(`  Plot: 5 katha = ${project.plotSqm} m²`);
  log(`  Phases generated: ${project.phases.map(p => p.nameEn).join(" → ")}`);
} catch (e) {
  bugs.push({ title: "createNewProject crashed", severity: "Critical", repro: "npm script", expected: "project created", actual: String(e) });
  log(`✗ CRASH: ${e}`);
}

// Simulate completing all phase interviews
log("\nStep 2: Completing all phase interviews (site → foundation → ground → floor1 → floor2 → roof → utility)");
const now = new Date().toISOString();
const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

const phaseData: Record<string, { metrics: Record<string, string | number>; preset: string; msg: string }> = {
  "phase-site": {
    metrics: { "Plot Area": `5 Katha (${project.plotSqm} m²)`, "Excavation Volume": `${Math.round(project.plotSqm * 2.2)} m³`, "Front Road Width": "20 ft (RAJUK DAP Compliant)", "Soil Bearing Capacity": "140 kN/m² (Stiff Clay)" },
    preset: "preset-dual-3bed",
    msg: "Site surveyed. Plot 5 katha, 20 ft front road. SBC 140 kN/m² — suitable for isolated footings.",
  },
  "phase-foundation": {
    metrics: { "Foundation Type": "Isolated RCC Spread Footings", "Total Footing Count": "12 Footings", "Footing Depth": "1.8 meters (6 ft)", "Grade Beam Sizing": "250mm × 450mm", "Concrete Mix": "C25 (f'c = 25 MPa)" },
    preset: "preset-dual-3bed",
    msg: "12 isolated footings at 1.8 m depth, 250×450 mm grade beams.",
  },
  "phase-ground-floor": {
    metrics: { "Covered Parking Bays": "4 Car Slots", "Clear Driveway Width": "3.6 meters (12 ft)", "Ground Pavement Slab": "150 mm RCC" },
    preset: "preset-ground-parking",
    msg: "Ground floor: 4 car parking + lobby + stair core.",
  },
  "phase-floor-1": {
    metrics: { "Selected Layout": "preset-dual-3bed", "Units Per Floor": "2 Flats", "RCC Slab Thickness": "125 mm (5 in)", "Column Grid Sizing": "300mm × 300mm RCC Columns" },
    preset: "preset-dual-3bed",
    msg: "1st floor: dual 3-bed flats, 125 mm slabs.",
  },
  "phase-floor-2": {
    metrics: { "Selected Layout": "preset-dual-3bed", "Units Per Floor": "2 Flats", "RCC Slab Thickness": "125 mm (5 in)", "Column Grid Sizing": "300mm × 300mm RCC Columns" },
    preset: "preset-dual-3bed",
    msg: "2nd floor: dual 3-bed flats, 125 mm slabs.",
  },
  "phase-rooftop": {
    metrics: { "Roof Terrace Slab": "125 mm RCC", "Overhead Water Reservoir": "7,500 Liters RCC Tank", "Parapet Height": "900 mm" },
    preset: "preset-dual-3bed",
    msg: "Rooftop terrace with 7,500 L overhead tank and 900 mm parapet.",
  },
  "phase-utilities": {
    metrics: { "Underground Septic Tank": "15 m³ Two-Chamber Tank", "Underground Reservoir": "15,000 Liters Capacity" },
    preset: "preset-dual-3bed",
    msg: "Underground 15 m³ septic tank + 15,000 L reservoir.",
  },
};

for (const phase of project.phases) {
  const d = phaseData[phase.id];
  if (d) {
    phase.status = "completed";
    phase.data = { ...d.metrics, selectedFloorplanPreset: d.preset };
    phase.messages = [
      { who: "user" as const, text: "Proceed with standard dual-unit layout.", timestamp: timeStr },
      { who: "ai" as const, text: d.msg, metrics: d.metrics, timestamp: timeStr },
    ];
    log(`  ✓ ${phase.nameEn}`);
  }
}
project.designStarted = true;
project.activePhaseId = "final";
project.updatedAt = now;
log(`✓ All ${project.phases.length} phases completed. Design unlocked.`);

// Customization
log("\nStep 3: Customizing — concrete C25, steel Fe415, accessibility enabled");
project.customization = {
  ...createDefaultCustomization(),
  concreteGrade: 25,
  steelGrade: 415,
  accessibility: {
    rampSlope: 12, rampWidthMm: 1200, doorClearWidthMm: 900,
    wcClearMm: [1500, 1500], tactilePathWidthMm: 300,
    elevatorRequired: true, elevatorPitMm: 1200,
    elevatorWellMm: [1400, 1100, 2100], grabRailHeightMm: 700, brailleSignage: true,
  },
  fireSafety: { enabled: false, stairWidthMm: 1000, corridorWidthMm: 1200, travelDistanceMaxM: 30, fireRatingHours: 2, sprinklerSystem: false, smokeDetector: true },
};

// Generate mesh
log("\nStep 4: Generating 3D parametric building mesh...");
let mesh;
try {
  const t0 = Date.now();
  mesh = generateBuildingMesh(project, "final", project.customization);
  log(`✓ Mesh generated in ${Date.now() - t0}ms: ${mesh.objects.length} objects, units=${mesh.units}`);
  const kinds = new Set(mesh.objects.map(o => o.kind));
  log(`  Object kinds: ${[...kinds].join(", ")}`);

  // Check for nulls (known past bug)
  const nulls = mesh.objects.filter(o => !o).length;
  if (nulls > 0) bugs.push({ title: "Mesh contains null objects", severity: "Critical", repro: "generateBuildingMesh 3-story 5katha", expected: "no nulls", actual: `${nulls} null objects` });

  const noBbox = mesh.objects.filter(o => !o.bboxMinMm || !o.bboxMaxMm).length;
  if (noBbox > 0) bugs.push({ title: "Mesh objects missing bounding boxes", severity: "Major", repro: "generateBuildingMesh", expected: "all objects have bbox", actual: `${noBbox} missing` });
} catch (e: any) {
  bugs.push({ title: "generateBuildingMesh crashed", severity: "Critical", repro: "3-story 5 katha dual-unit", expected: "mesh generated", actual: `${e.message}\n${e.stack?.slice(0, 500)}` });
  log(`✗ CRASH: ${e.message}`);
}

// Compliance
log("\nStep 5: Running BNBC 2020 / RAJUK DAP 2022 compliance check...");
let compliance;
if (mesh) {
  try {
    const ctx = buildComplianceContext(
      { stories: project.stories, plotSqm: project.plotSqm, plotUnit: project.plotUnit, unitsPerFloor: project.unitsPerFloor, location: "dhaka" },
      mesh,
      { concreteGrade: 25, steelGrade: 415, brickStrength: 10 },
    );
    compliance = runComplianceCheck(ctx);
    log(`✓ Compliance: ${compliance.summary.compliant} passed, ${compliance.summary.deviation} deviations, ${compliance.summary.info} info`);
    for (const d of compliance.deviations) {
      log(`  ${d.pass ? "✓" : "✗"} [${d.severity.toUpperCase()}] ${d.ruleId} ${d.title}: ${d.message.slice(0, 100)}`);
    }
  } catch (e: any) {
    bugs.push({ title: "Compliance check crashed", severity: "Major", repro: "runComplianceCheck after mesh", expected: "results", actual: e.message });
    log(`✗ CRASH: ${e.message}`);
  }
}

// BOQ
log("\nStep 6: Generating Bill of Quantities (Dhaka 2025 rates)...");
let boq;
if (mesh) {
  try {
    boq = generateBOQ(mesh, project);
    log(`✓ BOQ generated: ${boq.items.length} line items`);
    const total = boq.totals?.totalBDT ?? boq.totals?.subtotalBDT ?? 0;
    log(`  Total cost: ৳${Number(total).toLocaleString("en-IN")}`);
  } catch (e: any) {
    bugs.push({ title: "BOQ generation crashed", severity: "Major", repro: "generateBOQ(mesh, project)", expected: "BOQ document", actual: e.message });
    log(`✗ CRASH: ${e.message}`);
  }
}

// IFC export
log("\nStep 7: Exporting IFC (CAD-compatible, FreeCAD/Revit/Archicad)...");
let ifcText = "";
if (mesh) {
  try {
    ifcText = buildIfcStep(mesh, { projectName: project.name, stories: project.stories, plotSize: project.plotSize, plotUnit: project.plotUnit, generatedAt: now });
    const validation = validateIfcStep(ifcText);
    log(`✓ IFC STEP generated: ${ifcText.length.toLocaleString()} chars, ${ifcText.split("\n").length} lines`);
    if (validation.length > 0) {
      log(`  ⚠ Validation issues: ${validation.length}`);
      validation.slice(0, 5).forEach(v => log(`    - ${v}`));
      bugs.push({ title: "IFC validation issues", severity: "Major", repro: "buildIfcStep 3-story", expected: "0 validation errors", actual: validation.slice(0, 10).join("; ") });
    } else {
      log("  ✓ IFC validation: 0 errors (GUIDs, line numbers, references all valid)");
    }
    writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_3story.ifc", ifcText, "utf8");
    log("  ✓ Saved: user_test_3story.ifc");
  } catch (e: any) {
    bugs.push({ title: "IFC export crashed", severity: "Critical", repro: "buildIfcStep", expected: "valid .ifc file", actual: e.message });
    log(`✗ CRASH: ${e.message}`);
  }

  // FreeCAD macro too
  try {
    const macro = buildFreeCadMacro(mesh, { projectName: project.name, stories: project.stories, plotSize: project.plotSize, plotUnit: project.plotUnit, generatedAt: now });
    writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_3story.freecad-macro.py", macro, "utf8");
    log(`✓ FreeCAD macro saved: user_test_3story.freecad-macro.py (${macro.length.toLocaleString()} chars)`);
  } catch (e: any) {
    bugs.push({ title: "FreeCAD macro export crashed", severity: "Major", repro: "buildFreeCadMacro", expected: "macro file", actual: e.message });
  }
}

// Drawings
log("\nStep 8: Generating drawings (floor plans, section, elevations)...");
const outDir = "C:/1_SAJID/ArchResidenceBD/repo/user_test_drawings";
if (mesh) {
  try {
    const options = { scale: 100, project: project.name, drawingNo: "A-101" };

    for (let i = 0; i < project.stories; i++) {
      const phase = i === 0 ? "ground_floor" : `floor-${i + 1}`;
      const plan = generateFloorPlanFromMesh(mesh, phase, options);
      const svg = exportDrawingAsSVG(plan);
      const dxf = exportDrawingAsDXF(plan);
      writeFileSync(outDir + `/floor-${i + 1}.svg`, svg, "utf8");
      writeFileSync(outDir + `/floor-${i + 1}.dxf`, dxf, "utf8");
      log(`  ✓ Floor ${i + 1} plan: SVG (${svg.length} chars) + DXF (${dxf.length} chars)`);
    }

    const storyHeights = Array.from({ length: project.stories }, () => 3000);
    storyHeights[0] = 4500;
    const section = generateSection(storyHeights, project.plotSqm * 0.7, options);
    writeFileSync(`${outDir}/section.svg`, exportDrawingAsSVG(section), "utf8");
    log(`  ✓ Section view: SVG`);

    for (const dir of ["front", "rear", "left", "right"]) {
      const elev = generateElevation(project.plotSqm * 0.7, storyHeights, [], { ...options, drawingNo: "A-201", direction: dir });
      writeFileSync(`${outDir}/elevation-${dir}.svg`, exportDrawingAsSVG(elev), "utf8");
    }
    log(`  ✓ 4 elevation views: SVG`);
  } catch (e: any) {
    bugs.push({ title: "Drawing generation crashed", severity: "Major", repro: "floor plans/section/elevations", expected: "SVG+DXF files", actual: e.message });
    log(`✗ CRASH: ${e.message}`);
  }
}

// BOQ CSV
if (boq) {
  try {
    writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_boq.csv", exportBOQCSV(boq), "utf8");
    writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_boq.md", generateBOQReport(boq), "utf8");
    log("\n✓ BOQ exported: user_test_boq.csv + user_test_boq.md");
  } catch (e: any) {
    bugs.push({ title: "BOQ export crashed", severity: "Minor", repro: "exportBOQCSV", expected: "CSV file", actual: e.message });
  }
}

// Save project JSON so the user can load it into the app
writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_project.json", JSON.stringify(project, null, 2), "utf8");
log("\n✓ Project saved: user_test_project.json (importable into app via localStorage)");

// Summary for report
const summary = {
  project: { name: project.name, stories: project.stories, plotKatha: project.plotSize, plotSqm: project.plotSqm },
  mesh: mesh ? { objects: mesh.objects.length, kinds: [...new Set(mesh.objects.map(o => o.kind))] } : null,
  compliance: compliance?.summary || null,
  complianceDeviations: compliance?.deviations?.filter(d => !d.pass) || [],
  ifcChars: ifcText.length,
  bugsFound: bugs,
};
writeFileSync("C:/1_SAJID/ArchResidenceBD/repo/user_test_summary.json", JSON.stringify(summary, null, 2), "utf8");

console.log("\n=== RAFIQ'S WORKFLOW COMPLETE ===");
console.log(`Bugs found: ${bugs.length}`);
bugs.forEach((b, i) => console.log(`  ${i + 1}. [${b.severity}] ${b.title}`));
