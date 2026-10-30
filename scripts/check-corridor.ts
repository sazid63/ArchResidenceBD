import { createNewProject } from "../src/engine/projectState.js";
import { generateBuildingMesh } from "../src/cad/parametricBuildingGenerator.js";

const p = createNewProject({ name: "Test", stories: 3, plotSize: 5, plotUnit: "katha", unitsPerFloor: 2 });
p.customization = {
  concreteGrade: 25, steelGrade: 415,
  accessibility: { rampSlope: 12, rampWidthMm: 1200, doorClearWidthMm: 900, wcClearMm: [1500, 1500], tactilePathWidthMm: 300, elevatorRequired: true, elevatorPitMm: 1200, elevatorWellMm: [1400, 1100, 2100], grabRailHeightMm: 700, brailleSignage: true },
  sustainability: { annualRainfallMm: 2000, tankEfficiency: 0.85, roofUValue: 0.8, wallUValue: 1.2, windowUValue: 3.5, coolingLoadFactor: 12, windowToFloorRatioMin: 0.15, daylightFactorTarget: 2.0 },
  fireSafety: { enabled: false, stairWidthMm: 1000, corridorWidthMm: 1200, travelDistanceMaxM: 30, fireRatingHours: 2, sprinklerSystem: false, smokeDetector: true },
  valueEngineering: { enabled: false, autoApply: false },
  constructionMgmt: { enabled: false },
};
const m = generateBuildingMesh(p, "final", p.customization);
const parts = m.objects.filter(o => o.kind === "partition" || (o.kind === "wall" && o.label.toLowerCase().includes("partition")));
console.log("Partitions found:", parts.length);
const xParts = parts.filter(o => (o.bboxMaxMm[0] - o.bboxMinMm[0]) < (o.bboxMaxMm[1] - o.bboxMinMm[1]));
console.log("X-partitions (run along X):", xParts.length);
xParts.slice(0, 8).forEach(o => console.log("  ", o.id, "Y:", o.bboxMinMm[1], o.bboxMaxMm[1]));
let minGap = Infinity;
for (let i = 0; i < xParts.length; i++)
  for (let j = i + 1; j < xParts.length; j++) {
    const gap = xParts[j].bboxMinMm[1] - xParts[i].bboxMaxMm[1];
    if (gap >= 500 && gap < minGap) minGap = gap;
  }
console.log("Min corridor gap (>=500mm):", minGap === Infinity ? "none" : minGap + "mm");