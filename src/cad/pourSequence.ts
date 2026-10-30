/**
 * Pour Sequence Planner for ArchResidenceBD
 * 
 * Generates an optimized concrete pour sequence with lift-by-lift analysis,
 * formwork cycling, and curing times following BNBC 2020 and ACI 318 standards.
 */

import type { MeshDocument, MeshObject } from "./mesh";
import { generateBuildingMesh, type BuildingCustomization } from "./parametricBuildingGenerator";
import type { BuildingProject } from "../engine/projectState";

export type PourType = "foundation" | "mat" | "column" | "beam" | "slab" | "stair" | "tank" | "lintel" | "canopy";
export type CuringMethod = "water" | "wet-curing" | "membrane" | "steam" | "dry-heat";

export interface PourStep {
  step: number;
  elementId: string;
  elementKind: string;
  label: string;
  pourType: PourType;
  volumeM3: number;
  areaM2: number;
  estimatedHours: number;      // Total hours including setup + pour + finish
  setupHours: number;          // Formwork + rebar placement
  pourHours: number;           // Actual concrete placement
  finishHours: number;         // Screed + float finish
  startTime: string;           // ISO date string
  endTime: string;           // ISO date string
  curingDays: number;
  curingMethod: CuringMethod;
  requiresPump: boolean;
  crewSize: number;            // Number of workers needed
  dependencies: number[];      // Step indices that must complete first
}

export interface PourSequence {
  projectId: string;
  projectName: string;
  totalVolumeM3: number;
  totalSteps: number;
  totalDurationDays: number;
  totalManHours: number;
  estimatedCostBDT: number;
  steps: PourStep[];
  phases: PourPhase[];
}

export interface PourPhase {
  phaseId: string;
  name: string;
  description: string;
  order: number;
  steps: number[];
  totalVolumeM3: number;
  durationDays: number;
  startDate: string;
  endDate: string;
}

/** Standard concrete pour rates (BDT + productivity) - Dhaka market rates 2025 */
export const POUR_RATES = {
  // Foundation: excavation, footing, grade beams - lower rate, no pump typically
  "foundation": { rateBDT: 7800, m3PerHour: 8, crewSize: 6, curingDays: 7, curingMethod: "water" as CuringMethod, requiresPump: false },
  // Mat/raft foundation - higher rate due to scale, pump required
  "mat": { rateBDT: 8800, m3PerHour: 6, crewSize: 8, curingDays: 7, curingMethod: "water" as CuringMethod, requiresPump: true },
  // Columns - higher rate due to vertical placement, pump required
  "column": { rateBDT: 10800, m3PerHour: 6, crewSize: 8, curingDays: 5, curingMethod: "wet-curing" as CuringMethod, requiresPump: true },
  // Beams - similar to columns
  "beam": { rateBDT: 10800, m3PerHour: 6, crewSize: 8, curingDays: 5, curingMethod: "wet-curing" as CuringMethod, requiresPump: true },
  // Slabs - large area, pump required, membrane curing
  "slab": { rateBDT: 9800, m3PerHour: 8, crewSize: 6, curingDays: 7, curingMethod: "membrane" as CuringMethod, requiresPump: true },
  // Stairs - complex formwork, slower
  "stair": { rateBDT: 11800, m3PerHour: 5, crewSize: 6, curingDays: 5, curingMethod: "wet-curing" as CuringMethod, requiresPump: true },
  // Tanks - water tightness requirements
  "tank": { rateBDT: 11300, m3PerHour: 5, crewSize: 6, curingDays: 7, curingMethod: "membrane" as CuringMethod, requiresPump: true },
  // Lintels - small pours, no pump
  "lintel": { rateBDT: 9800, m3PerHour: 4, crewSize: 4, curingDays: 3, curingMethod: "wet-curing" as CuringMethod, requiresPump: false },
  // Canopies - similar to slabs
  "canopy": { rateBDT: 10300, m3PerHour: 6, crewSize: 6, curingDays: 5, curingMethod: "membrane" as CuringMethod, requiresPump: true },
} as const;

/** Standard work hours per day */
const WORK_HOURS_PER_DAY = 8;

/** Standard cost factors for Dhaka construction (2025 rates) */
const LABOR_RATE_BDT = 950; // BDT/hour for general labor (2025 Dhaka rate)
const SUPERVISION_FACTOR = 0.15; // 15% supervision overhead
const EQUIPMENT_FACTOR = 0.10; // 10% equipment overhead
const PUMP_RATE_BDT = 8500; // BDT/hour for concrete pump rental
const FORMWORK_RATE_BDT = 450; // BDT/m2 for formwork rental

/**
 * Determine pour type from element kind
 */
function getPourType(kind: string): PourType {
  const k = kind.toLowerCase();
  switch (k) {
    case "footing": return "foundation";
    case "column": return "column";
    case "beam":
    case "lintel":
    case "door_frame":
    case "window_channel":
    case "grade-beam":
    case "grade_beam": return "beam";
    case "slab": return "slab";
    case "stair":
    case "stairs": return "stair";
    case "tank": return "tank";
    case "canopy": return "canopy";
    case "wall":
    case "partition":
    case "parapet_front":
    case "parapet_rear":
    case "parapet_left":
    case "parapet_right":
    case "parapet":
    case "spandrel": return "mat"; // Treat wall concrete as mass pour
    default: return "slab";
  }
}

/**
 * Calculate area of element in m²
 */
function calculateElementArea(obj: MeshObject): number {
  const dx = (obj.bboxMaxMm[0] - obj.bboxMinMm[0]) / 1000;
  const dy = (obj.bboxMaxMm[1] - obj.bboxMinMm[1]) / 1000;
  const dz = (obj.bboxMaxMm[2] - obj.bboxMinMm[2]) / 1000;
  
  const kind = obj.kind.toLowerCase();
  
  switch (kind) {
    case "column": return 2 * (dx + dy) * dz;
    case "beam":
    case "lintel":
    case "grade-beam":
    case "grade_beam": return dx * dy + 2 * dx * dz;
    case "slab":
    case "canopy": return dx * dy;
    case "wall":
    case "partition":
    case "parapet_front":
    case "parapet_rear":
    case "parapet_left":
    case "parapet_right":
    case "parapet":
    case "spandrel": return 2 * dx * dz;
    case "footing": return dx * dy;
    case "stair":
    case "stairs": return dx * dy;
    case "tank": return dx * dy;
    default: return dx * dy;
  }
}

/**
 * Determine if pump is required based on pour volume and height
 */
function requiresConcretePump(obj: MeshObject, pourType: PourType): boolean {
  const volume = obj.volumeMm3 / 1e9;
  const height = (obj.bboxMaxMm[2] - obj.bboxMinMm[2]) / 1000;
  
  // Pump required for:
  // - Volume > 5 m³
  // - Height > 4m
  // - Slab pours at height
  // - Stair pours
  if (volume > 5) return true;
  if (height > 4) return true;
  if (pourType === "slab" && obj.bboxMinMm[2] > 3000) return true;
  if (pourType === "stair") return true;
  if (pourType === "tank" && height > 2) return true;
  
  return false;
}

/**
 * Group elements by floor (Z coordinate ranges)
 */
function groupElementsByFloor(mesh: MeshDocument): Map<number, MeshObject[]> {
  const floorGroups = new Map<number, MeshObject[]>();
  
  for (const obj of mesh.objects) {
    const zMin = obj.bboxMinMm[2];
    // Determine floor based on Z position
    // Ground floor: 0-1500mm, typical floor height: 3000mm
    const floor = zMin < 2000 ? 0 : Math.floor(zMin / 3000);
    
    if (!floorGroups.has(floor)) floorGroups.set(floor, []);
    floorGroups.get(floor)!.push(obj);
  }
  
  return floorGroups;
}

/**
 * Determine optimal pour order based on structural logic
 */
function getPourOrder(obj: MeshObject): number {
  // Lower elements first, then work up
  const zMin = obj.bboxMinMm[2];
  const baseOrder = Math.floor(zMin / 3000) * 100;
  
  // Within same floor, foundations first, then columns/beams, then slabs
  const kindPriority: Record<string, number> = {
    "footing": 1,
    "wall": 2,
    "column": 3,
    "beam": 4,
    "lintel": 5,
    "door_frame": 6,
    "stair": 7,
    "slab": 10,
    "canopy": 11,
    "tank": 12,
    "partition": 15,
    "railing": 20,
    "balcony": 20,
    "bath": 20,
    "kitchen": 20,
  };
  
  return baseOrder + (kindPriority[obj.kind] ?? 30);
}

/**
 * Generate optimized pour sequence
 */
export function generatePourSequence(
  mesh: MeshDocument,
  project: BuildingProject,
  startFrom: Date = new Date()
): PourSequence {
  const steps: PourStep[] = [];
  const phases: PourPhase[] = [];
  const sortedObjects = [...mesh.objects].sort((a, b) => getPourOrder(a) - getPourOrder(b));
  
  let currentStep = 0;
  let currentDateTime = new Date(startFrom);
  let stepDependencies: number[] = [];
  
  // Group by floor for phase organization
  const floorGroups = groupElementsByFloor(mesh);
  const floorKeys = Array.from(floorGroups.keys()).sort((a, b) => a - b);
  
  for (const floorNum of floorKeys) {
    const floorObjects = floorGroups.get(floorNum)!;
    const phaseId = `floor-${floorNum + 1}`;
    const phaseName = floorNum === 0 
      ? (floorKeys.length === 1 ? "Ground Floor" : "Ground Floor & Foundation")
      : `Floor ${floorNum + 1}`;
    const phaseStart = new Date(currentDateTime);
    const phaseStepIndices: number[] = [];
    
    // Sort floor elements by pour order
    floorObjects.sort((a, b) => getPourOrder(a) - getPourOrder(b));
    
    for (const obj of floorObjects) {
      const volume = obj.volumeMm3 / 1e9;
      if (volume < 0.01) continue; // Skip tiny elements
      
      const pourType = getPourType(obj.kind);
      const rates = POUR_RATES[pourType];
      const area = calculateElementArea(obj);
      
      // Calculate time
      const pourHours = Math.max(2, Math.ceil(volume / rates.m3PerHour)); // Minimum 2 hours
      const setupHours = Math.ceil(pourHours * 0.5); // 50% setup time
      const finishHours = Math.ceil(volume * 2); // 2 hours per m³ for finishing
      const estimatedHours = setupHours + pourHours + finishHours;
      
      // Calculate dates
      const startHours = currentDateTime.getHours() + currentDateTime.getMinutes() / 60;
      let endDateTime = new Date(currentDateTime);
      endDateTime.setTime(endDateTime.getTime() + estimatedHours * 3600000);
      
      // If pour extends beyond work hours, move to next working period
      if (endDateTime.getHours() > 17) {
        endDateTime.setDate(endDateTime.getDate() + 1);
        endDateTime.setHours(9, 0, 0, 0);
      }
      
      const curingEndDate = new Date(endDateTime);
      curingEndDate.setDate(curingEndDate.getDate() + rates.curingDays);
      
      const requiresPump = requiresConcretePump(obj, pourType);
      const crewSize = requiresPump ? rates.crewSize + 2 : rates.crewSize;
      
      currentStep++;
      const step: PourStep = {
        step: currentStep,
        elementId: obj.id,
        elementKind: obj.kind,
        label: obj.label,
        pourType,
        volumeM3: Math.round(volume * 100) / 100,
        areaM2: Math.round(area * 100) / 100,
        estimatedHours,
        setupHours,
        pourHours,
        finishHours,
        startTime: currentDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        curingDays: rates.curingDays,
        curingMethod: rates.curingMethod,
        requiresPump,
        crewSize,
        dependencies: [...stepDependencies],
      };
      
      steps.push(step);
      phaseStepIndices.push(currentStep - 1);
      stepDependencies.push(currentStep - 1);
      
      // Move time forward: pour time + half curing time before next pour on same element
      const moveForwardHours = estimatedHours;
      currentDateTime.setTime(currentDateTime.getTime() + (moveForwardHours + 2) * 3600000);
      
      // Reset to next working day if past work hours
      if (currentDateTime.getHours() > 17) {
        currentDateTime.setDate(currentDateTime.getDate() + 1);
        currentDateTime.setHours(9, 0, 0, 0);
      }
    }
    
    const phaseEnd = new Date(currentDateTime);
    phases.push({
      phaseId,
      name: phaseName,
      description: `${floorNum === 0 ? " foundation & ground floor" : ""} concrete works — pour sequence optimized for structural continuity`,
      order: floorNum + 1,
      steps: phaseStepIndices,
      totalVolumeM3: Math.round(phaseStepIndices.reduce((sum, i) => sum + steps[i].volumeM3, 0) * 100) / 100,
      durationDays: Math.ceil((phaseEnd.getTime() - phaseStart.getTime()) / (24 * 3600000)),
      startDate: phaseStart.toISOString(),
      endDate: phaseEnd.toISOString(),
    });
    
    // Add curing gap between floors
    currentDateTime = new Date(phaseEnd);
    currentDateTime.setDate(currentDateTime.getDate() + 3); // Standard 3-day cure between floor cycles
    currentDateTime.setHours(9, 0, 0, 0);
    stepDependencies = []; // Reset dependencies for next floor
  }
  
  const totalVolumeM3 = Math.round(steps.reduce((sum, s) => sum + s.volumeM3, 0) * 100) / 100;
  const totalManHours = steps.reduce((sum, s) => sum + s.estimatedHours * s.crewSize, 0);
  const laborCost = totalManHours * LABOR_RATE_BDT;
  const pumpHours = steps.filter(s => s.requiresPump).reduce((sum, s) => sum + s.estimatedHours, 0);
  const pumpCost = pumpHours * PUMP_RATE_BDT;
  const formworkArea = steps.reduce((sum, s) => sum + s.areaM2, 0);
  const formworkCost = formworkArea * FORMWORK_RATE_BDT;
  const materialCost = totalVolumeM3 * 11500; // Ready-mix M25 Dhaka 2025 rate
  const totalCostBDT = Math.round(laborCost * (1 + SUPERVISION_FACTOR) + pumpCost + formworkCost + materialCost);
  
  const totalDurationDays = phases.length > 0 
    ? Math.ceil((phases[phases.length - 1].endDate && phases[0].startDate 
        ? (new Date(phases[phases.length - 1].endDate).getTime() - new Date(phases[0].startDate).getTime()) / (24 * 3600000)
        : 0) + 1)
    : 0;
  
  return {
    projectId: project.id,
    projectName: project.name,
    totalVolumeM3,
    totalSteps: steps.length,
    totalDurationDays,
    totalManHours: Math.round(totalManHours),
    estimatedCostBDT: totalCostBDT,
    steps,
    phases,
  };
}

/**
 * Generate pour sequence as markdown report
 */
export function generatePourSequenceReport(
  sequence: PourSequence,
  project: BuildingProject
): string {
  let md = `# Pour Sequence Plan — ${sequence.projectName}\n\n`;
  md += `**Project ID:** ${sequence.projectId}  \n`;
  md += `**Location:** ${project.address || "Dhaka, Bangladesh"}  \n`;
  md += `**Stories:** ${project.stories}  \n`;
  md += `**Plot Area:** ${project.plotSqm} m²  \n`;
  md += `**Generated:** ${new Date().toLocaleString("en-GB")}  \n`;
  md += `**Standard:** BNBC 2020 / ACI 318  \n\n`;
  
  md += `---\n\n## Summary\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Volume | ${sequence.totalVolumeM3.toLocaleString()} m³ |\n`;
  md += `| Total Steps | ${sequence.totalSteps} |\n`;
  md += `| Duration | ${sequence.totalDurationDays} days |\n`;
  md += `| Total Man-Hours | ${sequence.totalManHours.toLocaleString()} hrs |\n`;
  md += `| Estimated Cost | ৳${sequence.estimatedCostBDT.toLocaleString()} |\n\n`;
  
  md += `---\n\n## Pour Phases\n\n`;
  md += `| # | Phase | Volume (m³) | Duration | Start | End |\n`;
  md += `|---|-------|-------------|----------|-------|-----|\n`;
  for (const phase of sequence.phases) {
    md += `| ${phase.order} | ${phase.name} | ${phase.totalVolumeM3.toLocaleString()} | ${phase.durationDays}d | ${new Date(phase.startDate).toLocaleDateString("en-GB")} | ${new Date(phase.endDate).toLocaleDateString("en-GB")} |\n`;
  }
  
  md += `\n---\n\n## Detailed Pour Schedule\n\n`;
  md += `| # | Element | Kind | Volume (m³) | Area (m²) | Hours | Crew | Pump | Start | End | Cure (days) |\n`;
  md += `|---|---------|------|-------------|-----------|-------|------|------|-------|-----|-------------|\n`;
  for (const step of sequence.steps) {
    md += `| ${step.step} | ${step.label} | ${step.elementKind} | ${step.volumeM3} | ${step.areaM2} | ${step.estimatedHours} | ${step.crewSize} | ${step.requiresPump ? "✓" : "✗"} | ${new Date(step.startTime).toLocaleDateString("en-GB")} ${new Date(step.startTime).toLocaleTimeString("en-GB", {hour: '2-digit', minute:'2-digit'})} | ${new Date(step.endTime).toLocaleDateString("en-GB")} ${new Date(step.endTime).toLocaleTimeString("en-GB", {hour: '2-digit', minute:'2-digit'})} | ${step.curingDays} |\n`;
  }
  
  md += `\n---\n\n## Curing & Stripping Schedule\n\n`;
  md += `| Element | Curing Method | Curing Days | Strip Date |\n`;
  md += `|---------|---------------|-------------|------------|\n`;
  for (const step of sequence.steps) {
    const stripDate = new Date(step.endTime);
    stripDate.setDate(stripDate.getDate() + step.curingDays);
    md += `| ${step.label} | ${step.curingMethod} | ${step.curingDays} | ${stripDate.toLocaleDateString("en-GB")} |\n`;
  }
  
  md += `\n---\n\n## Critical Path Elements (Largest Volumes)\n\n`;
  const criticalPath = [...sequence.steps].sort((a, b) => b.volumeM3 - a.volumeM3).slice(0, 5);
  for (const step of criticalPath) {
    md += `${step.step}. **${step.label}** — ${step.volumeM3} m³ (${step.pourType}, ${step.requiresPump ? "pump required" : "no pump"})\n`;
  }
  
  md += `\n---\n\n## Notes\n`;
  md += `- All pours assume 8-hour working day (09:00–17:00)\n`;
  md += `- Curing periods follow BNBC 2020 Table 3.1 minimums\n`;
  md += `- Pump requirement: volume > 5m³ OR height > 4m OR slab at height > 3m\n`;
  md += `- Labor rate: ৳${LABOR_RATE_BDT.toLocaleString()}/hr, supervision: ${SUPERVISION_FACTOR * 100}%\n`;
  md += `- Equipment overhead: ${EQUIPMENT_FACTOR * 100}%\n`;
  
  return md;
}

/** Export pour sequence to CSV */
export function exportPourSequenceCSV(sequence: PourSequence): string {
  const header = "Step,Element ID,Element Kind,Label,Pour Type,Volume (m³),Area (m²),Hours,Set Hours,Pour Hours,Finish Hours,Start,End,Curing Days,Method,Pump,Crew,Dependencies";
  const rows = sequence.steps.map((s) =>
    `${s.step},${s.elementId},${s.elementKind},"${s.label}",${s.pourType},${s.volumeM3},${s.areaM2},${s.estimatedHours},${s.setupHours},${s.pourHours},${s.finishHours},${s.startTime},${s.endTime},${s.curingDays},${s.curingMethod},${s.requiresPump ? "Yes" : "No"},${s.crewSize},"${s.dependencies.join(",")}"`
  );
  return [header, ...rows].join("\n");
}
