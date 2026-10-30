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
const ids = m.objects.map(o => o.id);
const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
console.log("Total objects:", m.objects.length);
console.log("Unique IDs:", new Set(ids).size);
console.log("Duplicate IDs:", dup.length);
if (dup.length) console.log("Examples:", [...new Set(dup)].slice(0, 10));

// Check for objects with zero volume
const zeroVol = m.objects.filter(o => o.volumeMm3 === 0).length;
console.log("Zero-volume objects:", zeroVol);

// Check for objects with same bbox (duplicate geometry)
const byBbox = new Map();
for (const o of m.objects) {
  const key = `${o.bboxMinMm.join(",")}|${o.bboxMaxMm.join(",")}`;
  if (!byBbox.has(key)) byBbox.set(key, []);
  byBbox.get(key).push(o.id);
}
const dupBbox = [...byBbox.values()].filter(v => v.length > 1);
console.log("Duplicate bounding boxes:", dupBbox.length);
if (dupBbox.length) console.log("Examples:", dupBbox.slice(0, 5));