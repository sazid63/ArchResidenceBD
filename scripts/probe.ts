// Temporary probe: verify tsx can load the generator import chain.
import { generateBuildingMesh } from "../src/cad/parametricBuildingGenerator";
import { FLOORPLAN_PRESETS } from "../src/data/floorplanPresets";

const preset = FLOORPLAN_PRESETS[0];
const project = {
  id: "probe",
  name: "Probe",
  address: "Dhaka",
  stories: 2,
  plotSize: 200,
  plotUnit: "sqm" as const,
  plotSqm: 200,
  unitsPerFloor: 2,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  designStarted: true,
  phases: [
    { id: "phase-foundation", nameEn: "", nameBn: "", kind: "foundation" as const, status: "completed" as const, data: {}, messages: [] },
    {
      id: "phase-floor-1", nameEn: "", nameBn: "", kind: "floor" as const, storeyIndex: 1, status: "completed" as const,
      data: { selectedFloorplanPreset: preset.id }, messages: [],
    },
  ],
};
const mesh = generateBuildingMesh(project, "final", { columnWidthMm: 250, columnDepthMm: 250 });
console.log("PROBE_OK objects=", mesh.objects.length, "presets=", FLOORPLAN_PRESETS.length);
console.log("kinds=", JSON.stringify([...new Set(mesh.objects.map((o) => o.kind))]));
console.log("phases=", JSON.stringify([...new Set(mesh.objects.map((o) => o.phase))]));
