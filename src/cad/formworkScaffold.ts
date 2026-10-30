/**
 * Scaffold & Formwork Quantities for ArchResidenceBD
 * 
 * Calculates formwork area and scaffold requirements from building mesh
 * following BNBC 2020 and PWD standards for Bangladesh construction.
 */

import type { MeshDocument, MeshObject } from "./mesh";

export interface FormworkItem {
  elementId: string;
  elementKind: string;
  label: string;
  formworkAreaM2: number;    // Contact area (m²) — shuttering surface
  concreteVolumeM3: number;  // Concrete volume (m³)
  formworkType: "column" | "beam" | "slab" | "wall" | "footing" | "stair" | "lintel";
  material: "timber" | "steel" | "aluminum" | "plywood";
  reuseCount: number;        // Number of reuses expected
  totalShutteringM2: number; // formworkAreaM2 / reuseCount
}

export interface ScaffoldItem {
  elementId: string;
  elementKind: string;
  label: string;
  scaffoldType: "frame" | "tube-coupler" | "system" | "mobile";
  areaM2: number;            // Scaffold footprint area
  heightM: number;           // Scaffold height
  loadClass: "light" | "medium" | "heavy"; // kN/m² per BNBC
  durationDays: number;      // Duration needed
}

export interface FormworkSummary {
  totalFormworkAreaM2: number;
  totalShutteringM2: number;
  byType: Record<string, { areaM2: number; shutteringM2: number }>;
  byMaterial: Record<string, { areaM2: number; shutteringM2: number }>;
  items: FormworkItem[];
}

export interface ScaffoldSummary {
  totalScaffoldAreaM2: number;
  totalScaffoldVolumeM3: number;
  byType: Record<string, { areaM2: number; volumeM3: number }>;
  items: ScaffoldItem[];
}

/** Standard formwork material properties */
export const FORMWORK_MATERIALS: Record<string, { name: string; maxReuses: number; costPerM2: number; weightKgPerM2: number }> = {
  "timber": { name: "Timber (Bangladesh local)", maxReuses: 8, costPerM2: 850, weightKgPerM2: 12 },
  "plywood": { name: "Film-faced plywood 18mm", maxReuses: 15, costPerM2: 1200, weightKgPerM2: 15 },
  "steel": { name: "Steel panel formwork", maxReuses: 50, costPerM2: 3500, weightKgPerM2: 45 },
  "aluminum": { name: "Aluminum formwork (Mivan)", maxReuses: 100, costPerM2: 8500, weightKgPerM2: 22 },
};

/** Standard scaffold load classes per BNBC 2020 */
export const SCAFFOLD_LOAD_CLASSES = {
  light: { maxLoad: 1.5, description: "Inspection, light maintenance" },     // 1.5 kN/m²
  medium: { maxLoad: 3.0, description: "General construction, masonry" },     // 3.0 kN/m²
  heavy: { maxLoad: 6.0, description: "Concreting, heavy material storage" }, // 6.0 kN/m²
} as const;

/**
 * Calculate formwork contact area for a single mesh object
 */
function calculateFormworkArea(obj: MeshObject): number {
  const dx = (obj.bboxMaxMm[0] - obj.bboxMinMm[0]) / 1000; // m
  const dy = (obj.bboxMaxMm[1] - obj.bboxMinMm[1]) / 1000; // m
  const dz = (obj.bboxMaxMm[2] - obj.bboxMinMm[2]) / 1000; // m

  switch (obj.kind) {
    case "column":
      // 4 sides of column (no top/bottom)
      return 2 * (dx + dy) * dz;
    case "beam":
    case "lintel":
    case "grade_beam":
    case "grade-beam":
      // Bottom + 2 sides (top is open for slab)
      return dx * dy + 2 * dx * dz;
    case "slab":
    case "canopy":
      // Bottom surface only (top is finished floor)
      return dx * dy;
    case "wall":
    case "partition":
    case "parapet_front":
    case "parapet_rear":
    case "parapet_left":
    case "parapet_right":
    case "parapet":
    case "spandrel":
      // Both faces of wall
      return 2 * dx * dz;
    case "footing":
      // 4 sides of footing (bottom on ground, top open)
      return 2 * (dx + dy) * dz;
    case "stair":
    case "stairs":
      // Complex — approximate as sloping slab + risers
      const treadArea = dx * dy;
      const riserArea = dz * Math.sqrt(dx * dx + dy * dy);
      return treadArea + riserArea;
    case "tank":
      // 4 sides + bottom
      return 2 * (dx + dy) * dz + dx * dy;
    default:
      // Conservative: all faces except bottom
      const totalArea = 2 * (dx * dy + dx * dz + dy * dz);
      return totalArea - dx * dy; // subtract bottom
  }
}

/**
 * Determine formwork type from element kind
 */
function getFormworkType(kind: string): FormworkItem["formworkType"] {
  const k = kind.toLowerCase();
  switch (k) {
    case "column": return "column";
    case "beam":
    case "lintel":
    case "grade-beam":
    case "grade_beam": return "beam";
    case "slab":
    case "canopy": return "slab";
    case "wall":
    case "partition":
    case "parapet_front":
    case "parapet_rear":
    case "parapet_left":
    case "parapet_right":
    case "parapet":
    case "spandrel": return "wall";
    case "footing": return "footing";
    case "stair":
    case "stairs": return "stair";
    case "tank": return "wall";
    default: return "beam";
  }
}

/**
 * Determine recommended formwork material based on element type and project scale
 */
function getRecommendedMaterial(formworkType: FormworkItem["formworkType"], totalArea: number): FormworkItem["material"] {
  if (formworkType === "slab" && totalArea > 500) return "aluminum";
  if (formworkType === "column" || formworkType === "beam") return "steel";
  if (formworkType === "wall" && totalArea > 300) return "steel";
  return "plywood";
}

/**
 * Calculate scaffold requirements for an element
 */
function calculateScaffoldForElement(obj: MeshObject, formworkType: FormworkItem["formworkType"]): ScaffoldItem | null {
  const dx = (obj.bboxMaxMm[0] - obj.bboxMinMm[0]) / 1000;
  const dy = (obj.bboxMaxMm[1] - obj.bboxMinMm[1]) / 1000;
  const dz = (obj.bboxMaxMm[2] - obj.bboxMinMm[2]) / 1000;

  let scaffoldType: ScaffoldItem["scaffoldType"] = "frame";
  let loadClass: ScaffoldItem["loadClass"] = "medium";
  let durationDays = 7;
  let areaM2 = 0;
  let heightM = dz;

  switch (formworkType) {
    case "column":
      // Column scaffold around perimeter
      areaM2 = (dx + 1.0) * (dy + 1.0) * 1.2; // perimeter + working space
      heightM = dz + 1.5; // up to soffit + working height
      scaffoldType = "frame";
      loadClass = "medium";
      durationDays = 5;
      break;
    case "beam":
      // Beam scaffold under soffit
      areaM2 = dx * (dy + 1.0);
      heightM = dz + 1.5;
      scaffoldType = "frame";
      loadClass = "heavy"; // concreting load
      durationDays = 7;
      break;
    case "slab":
      // Full slab scaffold (tower/frame)
      areaM2 = dx * dy * 1.1;
      heightM = dz + 2.0;
      scaffoldType = "system";
      loadClass = "heavy";
      durationDays = 14;
      break;
    case "wall":
      // Wall scaffold on both sides
      areaM2 = dx * (dz + 2.0) * 2;
      heightM = dz + 2.0;
      scaffoldType = "frame";
      loadClass = "medium";
      durationDays = 10;
      break;
    case "footing":
      // Minimal scaffold for footing
      areaM2 = (dx + 1.0) * (dy + 1.0);
      heightM = Math.max(dz, 1.0);
      scaffoldType = "mobile";
      loadClass = "light";
      durationDays = 3;
      break;
    case "stair":
      // Stair scaffold
      areaM2 = dx * dy * 1.2;
      heightM = dz + 2.0;
      scaffoldType = "tube-coupler";
      loadClass = "medium";
      durationDays = 10;
      break;
    default:
      // Handle unknown types with conservative defaults
      areaM2 = dx * dy * 1.1;
      heightM = dz + 1.5;
      scaffoldType = "frame";
      loadClass = "medium";
      durationDays = 7;
  }

  return {
    elementId: obj.id,
    elementKind: obj.kind,
    label: obj.label,
    scaffoldType,
    areaM2: Math.round(areaM2 * 100) / 100,
    heightM: Math.round(heightM * 100) / 100,
    loadClass,
    durationDays,
  };
}

/**
 * Generate formwork quantities from mesh
 */
export function generateFormworkQuantities(
  mesh: MeshDocument,
  projectId: string = "unknown",
  defaultMaterial: "timber" | "plywood" | "steel" | "aluminum" = "plywood"
): FormworkSummary {
  const items: FormworkItem[] = [];
  const byType: FormworkSummary["byType"] = {};
  const byMaterial: FormworkSummary["byMaterial"] = {};

  // First pass: calculate all formwork areas
  const typeAreas: Record<string, number> = {};
  for (const obj of mesh.objects) {
    const formworkType = getFormworkType(obj.kind);
    const area = calculateFormworkArea(obj);
    typeAreas[formworkType] = (typeAreas[formworkType] || 0) + area;
  }

  // Second pass: create items with material selection based on total area per type
  for (const obj of mesh.objects) {
    const formworkType = getFormworkType(obj.kind);
    const material = getRecommendedMaterial(formworkType, typeAreas[formworkType]);
    const matProps = FORMWORK_MATERIALS[material];
    const area = calculateFormworkArea(obj);
    const shuttering = area / matProps.maxReuses;
    const volume = obj.volumeMm3 / 1e9;

    const item: FormworkItem = {
      elementId: obj.id,
      elementKind: obj.kind,
      label: obj.label,
      formworkAreaM2: Math.round(area * 100) / 100,
      concreteVolumeM3: Math.round(volume * 1000) / 1000,
      formworkType,
      material,
      reuseCount: matProps.maxReuses,
      totalShutteringM2: Math.round(shuttering * 100) / 100,
    };
    items.push(item);

    // Aggregate by type
    if (!byType[formworkType]) byType[formworkType] = { areaM2: 0, shutteringM2: 0 };
    byType[formworkType].areaM2 += item.formworkAreaM2;
    byType[formworkType].shutteringM2 += item.totalShutteringM2;

    // Aggregate by material
    if (!byMaterial[material]) byMaterial[material] = { areaM2: 0, shutteringM2: 0 };
    byMaterial[material].areaM2 += item.formworkAreaM2;
    byMaterial[material].shutteringM2 += item.totalShutteringM2;
  }

  // Round aggregates
  for (const key of Object.keys(byType)) {
    byType[key].areaM2 = Math.round(byType[key].areaM2 * 100) / 100;
    byType[key].shutteringM2 = Math.round(byType[key].shutteringM2 * 100) / 100;
  }
  for (const key of Object.keys(byMaterial)) {
    byMaterial[key].areaM2 = Math.round(byMaterial[key].areaM2 * 100) / 100;
    byMaterial[key].shutteringM2 = Math.round(byMaterial[key].shutteringM2 * 100) / 100;
  }

  const totalFormworkAreaM2 = Math.round(items.reduce((sum, i) => sum + i.formworkAreaM2, 0) * 100) / 100;
  const totalShutteringM2 = Math.round(items.reduce((sum, i) => sum + i.totalShutteringM2, 0) * 100) / 100;

  return {
    totalFormworkAreaM2,
    totalShutteringM2,
    byType,
    byMaterial,
    items,
  };
}

/**
 * Generate scaffold quantities from mesh
 */
export function generateScaffoldQuantities(
  mesh: MeshDocument,
  projectId: string = "unknown"
): ScaffoldSummary {
  const items: ScaffoldItem[] = [];
  const byType: ScaffoldSummary["byType"] = {};

  for (const obj of mesh.objects) {
    const formworkType = getFormworkType(obj.kind);
    const scaffold = calculateScaffoldForElement(obj, formworkType);
    if (!scaffold) continue;

    items.push(scaffold);

    if (!byType[scaffold.scaffoldType]) byType[scaffold.scaffoldType] = { areaM2: 0, volumeM3: 0 };
    byType[scaffold.scaffoldType].areaM2 += scaffold.areaM2;
    byType[scaffold.scaffoldType].volumeM3 += scaffold.areaM2 * scaffold.heightM;
  }

  // Round aggregates
  for (const key of Object.keys(byType)) {
    byType[key].areaM2 = Math.round(byType[key].areaM2 * 100) / 100;
    byType[key].volumeM3 = Math.round(byType[key].volumeM3 * 100) / 100;
  }

  const totalScaffoldAreaM2 = Math.round(items.reduce((sum, i) => sum + i.areaM2, 0) * 100) / 100;
  const totalScaffoldVolumeM3 = Math.round(items.reduce((sum, i) => sum + i.areaM2 * i.heightM, 0) * 100) / 100;

  return {
    totalScaffoldAreaM2,
    totalScaffoldVolumeM3,
    byType,
    items,
  };
}

/**
 * Generate combined formwork + scaffold report
 */
export function generateFormworkScaffoldReport(
  mesh: MeshDocument,
  projectName: string = "Project",
  projectId: string = "unknown"
): string {
  const formwork = generateFormworkQuantities(mesh, projectId);
  const scaffold = generateScaffoldQuantities(mesh, projectId);

  let md = `# Formwork & Scaffold Quantities — ${projectName}\n\n`;
  md += `**Project ID:** ${projectId}  \n`;
  md += `**Generated:** ${new Date().toLocaleString("en-GB")}  \n`;
  md += `**Standard:** BNBC 2020 / PWD Bangladesh  \n\n`;

  md += `---\n\n## Formwork Summary\n\n`;
  md += `**Total Contact Area:** ${formwork.totalFormworkAreaM2.toLocaleString()} m²  \n`;
  md += `**Total Shuttering (with reuse):** ${formwork.totalShutteringM2.toLocaleString()} m²  \n\n`;

  md += `### By Formwork Type\n\n`;
  md += `| Type | Contact Area (m²) | Shuttering (m²) |\n`;
  md += `|------|-------------------|-----------------|\n`;
  for (const [type, totals] of Object.entries(formwork.byType)) {
    md += `| ${type} | ${totals.areaM2.toLocaleString()} | ${totals.shutteringM2.toLocaleString()} |\n`;
  }

  md += `\n### By Material\n\n`;
  md += `| Material | Contact Area (m²) | Shuttering (m²) | Reuses | Cost/M² (BDT) |\n`;
  md += `|----------|-------------------|-----------------|--------|---------------|\n`;
  for (const [mat, totals] of Object.entries(formwork.byMaterial)) {
    const props = FORMWORK_MATERIALS[mat];
    md += `| ${props.name} | ${totals.areaM2.toLocaleString()} | ${totals.shutteringM2.toLocaleString()} | ${props.maxReuses} | ৳${props.costPerM2.toLocaleString()} |\n`;
  }

  md += `\n---\n\n## Scaffold Summary\n\n`;
  md += `**Total Scaffold Area:** ${scaffold.totalScaffoldAreaM2.toLocaleString()} m²  \n`;
  md += `**Total Scaffold Volume:** ${scaffold.totalScaffoldVolumeM3.toLocaleString()} m³  \n\n`;

  md += `### By Scaffold Type\n\n`;
  md += `| Type | Area (m²) | Volume (m³) |\n`;
  md += `|------|-----------|-------------|\n`;
  for (const [type, totals] of Object.entries(scaffold.byType)) {
    md += `| ${type} | ${totals.areaM2.toLocaleString()} | ${totals.volumeM3.toLocaleString()} |\n`;
  }

  md += `\n---\n\n## Detailed Formwork Items\n\n`;
  md += `| # | Element | Kind | Type | Area (m²) | Volume (m³) | Material | Reuses | Shuttering (m²) |\n`;
  md += `|---|---------|------|------|-----------|-------------|----------|--------|-----------------|\n`;
  for (let i = 0; i < formwork.items.length; i++) {
    const it = formwork.items[i];
    md += `| ${i + 1} | ${it.label} | ${it.elementKind} | ${it.formworkType} | ${it.formworkAreaM2.toLocaleString()} | ${it.concreteVolumeM3.toLocaleString()} | ${it.material} | ${it.reuseCount} | ${it.totalShutteringM2.toLocaleString()} |\n`;
  }

  md += `\n---\n\n## Detailed Scaffold Items\n\n`;
  md += `| # | Element | Kind | Type | Area (m²) | Height (m) | Load Class | Duration (days) |\n`;
  md += `|---|---------|------|------|-----------|------------|------------|-----------------|\n`;
  for (let i = 0; i < scaffold.items.length; i++) {
    const it = scaffold.items[i];
    md += `| ${i + 1} | ${it.label} | ${it.elementKind} | ${it.scaffoldType} | ${it.areaM2.toLocaleString()} | ${it.heightM} | ${it.loadClass} | ${it.durationDays} |\n`;
  }

  return md;
}

/**
 * Export formwork/scaffold to CSV for procurement
 */
export function exportFormworkCSV(formwork: FormworkSummary): string {
  const header = "Item No,Element ID,Element Kind,Label,Formwork Type,Contact Area (m²),Concrete Volume (m³),Material,Reuse Count,Shuttering (m²)";
  const rows = formwork.items.map((item, i) =>
    `${i + 1},${item.elementId},${item.elementKind},"${item.label}",${item.formworkType},${item.formworkAreaM2},${item.concreteVolumeM3},${item.material},${item.reuseCount},${item.totalShutteringM2}`
  );
  const footer = `\n\nTotal Contact Area (m²),${formwork.totalFormworkAreaM2}\nTotal Shuttering (m²),${formwork.totalShutteringM2}`;
  return [header, ...rows, footer].join("\n");
}

export function exportScaffoldCSV(scaffold: ScaffoldSummary): string {
  const header = "Item No,Element ID,Element Kind,Label,Scaffold Type,Area (m²),Height (m),Volume (m³),Load Class,Duration (days)";
  const rows = scaffold.items.map((item, i) =>
    `${i + 1},${item.elementId},${item.elementKind},"${item.label}",${item.scaffoldType},${item.areaM2},${item.heightM},${(item.areaM2 * item.heightM).toFixed(2)},${item.loadClass},${item.durationDays}`
  );
  const footer = `\n\nTotal Area (m²),${scaffold.totalScaffoldAreaM2}\nTotal Volume (m³),${scaffold.totalScaffoldVolumeM3}`;
  return [header, ...rows, footer].join("\n");
}