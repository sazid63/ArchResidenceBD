/**
 * Bill of Quantities (BOQ) Generator for ArchResidenceBD
 * 
 * Produces professional BOQ from the parametric building mesh following
 * BNBC 2020 / RAJUK DAP 2022 standards for Bangladesh construction.
 * 
 * Output format: structured JSON + CSV export for contractor tendering.
 */

import type { MeshDocument, MeshObject } from "./mesh";
import { exposedFaceAreas } from "./quantityTakeoff";
import { generateBuildingMesh, type BuildingCustomization } from "./parametricBuildingGenerator";
import type { BuildingProject } from "../engine/projectState";

/** Standard unit rates for Dhaka residential construction (BDT 2025) */
export interface RateTable {
  [material: string]: {
    unit: string;
    rateBDT: number;
    description: string;
    uom: string;
  };
}

/** Standard Dhaka residential rate table (updated 2025) */
export const DHAKA_RATES_2025: RateTable = {
  // Concrete works
  "ready-mix-concrete-m25": { unit: "m³", rateBDT: 12500, description: "Ready-mix concrete M25 grade, including formwork and placement", uom: "m³" },
  "excavation": { unit: "m³", rateBDT: 450, description: "Manual excavation in ordinary soil, depth up to 1.5m", uom: "m³" },
  "concrete-work-slab": { unit: "m²", rateBDT: 850, description: "RCC slab 125mm thick, M25, including formwork", uom: "m²" },
  "concrete-work-beam": { unit: "m²", rateBDT: 950, description: "RCC beam 250×500mm, M25, including formwork", uom: "m²" },
  "concrete-work-column": { unit: "m²", rateBDT: 900, description: "RCC column 250×300mm, M25, including formwork", uom: "m²" },
  "columns-and-beams": { unit: "m³", rateBDT: 10500, description: "RCC columns and beams, M25, including formwork", uom: "m³" },
  "footing": { unit: "m³", rateBDT: 9000, description: "RCC footing M25, including formwork and excavation", uom: "m³" },
  "staircase-rcc": { unit: "m³", rateBDT: 11500, description: "RCC dog-legged staircase, M25, including formwork and railing", uom: "m³" },

  // Masonry works
  "brick-wall-3x": { unit: "m²", rateBDT: 3850, description: "Fired clay brick wall 102.5mm thick, CM 1:6", uom: "m²" },
  "brick-wall-4x": { unit: "m²", rateBDT: 4200, description: "Fired clay brick wall 136mm thick, CM 1:6", uom: "m²" },
  "partition-wall": { unit: "m²", rateBDT: 2200, description: "Partition wall, brick 102.5mm, CM 1:6", uom: "m²" },
  "block-wall": { unit: "m²", rateBDT: 2100, description: "Hollow concrete block wall 150mm, 1500kg/m³ density", uom: "m²" },

  // Finishes
  "floor-screed": { unit: "m²", rateBDT: 450, description: "Cement sand screed 50mm thick, CM 1:3", uom: "m²" },
  "floor-polish": { unit: "m²", rateBDT: 850, description: "Concrete floor polish, 2-coat epoxy", uom: "m²" },
  "wall-plaster": { unit: "m²", rateBDT: 320, description: "Internal wall plaster 12mm, CM 1:4", uom: "m²" },
  "wall-lime-wash": { unit: "m²", rateBDT: 280, description: "External wall lime wash 2 coats", uom: "m²" },
  "tile-flooring-ceramic": { unit: "m²", rateBDT: 1200, description: "Ceramic floor tiles 300x300mm, white cement grout", uom: "m²" },
  "tile-bathroom-vitrified": { unit: "m²", rateBDT: 1850, description: "Vitrified floor tiles 600x600mm for wet areas", uom: "m²" },

  // Openings
  "window-wooden-600x1200": { unit: "m²", rateBDT: 4200, description: "Wooden window 600x1200mm, single shutter", uom: "m²" },
  "window-wooden-800x1500": { unit: "m²", rateBDT: 3800, description: "Wooden window 800x1500mm, single shutter", uom: "m²" },
  "window-louver": { unit: "m²", rateBDT: 3200, description: "Frosted louver window 600x1600mm", uom: "m²" },
  "door-wooden-main": { unit: "m²", rateBDT: 5200, description: "Main entrance door, hardwood frame + shutter", uom: "m²" },
  "door-wooden-interior": { unit: "m²", rateBDT: 3200, description: "Interior door, flush shutter, timber frame", uom: "m²" },

  // Services (estimated)
  "plumbing-sanitary": { unit: "kp", rateBDT: 285000, description: "Complete sanitary plumbing for 1 bathroom", uom: "each" },
  "electrical-wiring": { unit: "m", rateBDT: 120, description: "Copper wiring 2.5mm², PVC conduit concealed, per meter", uom: "m" },
  "electrical-switchgear": { unit: "unit", rateBDT: 3500, description: "Distribution board + MCB switchgear per floor", uom: "unit" },
  "electrical-fixtures": { unit: "unit", rateBDT: 850, description: "LED light fixture + fan + socket point", uom: "unit" },
  "electrical-earth": { unit: "unit", rateBDT: 12000, description: "Earthing system, 6m copper rod + GI strip", uom: "unit" },
  "electrical-generator": { unit: "unit", rateBDT: 150000, description: "Backup generator + ATS panel", uom: "unit" },
  "water-supply": { unit: "m²", rateBDT: 720, description: "Cold water supply system", uom: "m²" },

  // Structural steel
  "steel-tmt-16mm": { unit: "ton", rateBDT: 95000, description: "TMT reinforcement bars Fe415, 16mm diameter", uom: "ton" },
  "steel-tmt-12mm": { unit: "ton", rateBDT: 95000, description: "TMT reinforcement bars Fe415, 12mm diameter", uom: "ton" },
  "steel-tmt-20mm": { unit: "ton", rateBDT: 95000, description: "TMT reinforcement bars Fe415, 20mm diameter", uom: "ton" },
  "steel-tmt-25mm": { unit: "ton", rateBDT: 95000, description: "TMT reinforcement bars Fe415, 25mm diameter", uom: "ton" },

  // Site works
  "site-levelling": { unit: "m²", rateBDT: 120, description: "Site clearing and leveling", uom: "m²" },
  "driveway- paving": { unit: "m²", rateBDT: 1800, description: "Cement concrete driveway 100mm thick", uom: "m²" },
  "boundary-wall": { unit: "m²", rateBDT: 2800, description: "Reinforced concrete boundary wall 150mm thick", uom: "m²" },
};

export interface BOQItem {
  itemNo: string;
  description: string;
  unit: string;
  quantity: number;
  rateBDT: number;
  amountBDT: number;
  category: string;
  meshKinds: string[];
  assumptions?: string[];
}

export interface BOQDocument {
  projectId: string;
  projectName: string;
  location: string;
  generatedAt: string;
  currency: string;
  rateTable: string;
  items: BOQItem[];
  totals: {
    totalItems: number;
    subtotalBDT: number;
    taxRate: number;
    taxBDT: number;
    totalBDT: number;
    totalsByCategory: Record<string, { quantity: number; amount: number }>;
  };
}

/** Map mesh object kinds to BOQ categories and rates */
const KIND_TO_BOQ: Record<string, { category: string; rateKey: string; unitFactor: number; meshKinds: string[] }> = {
  "slab": { category: "Concrete Works", rateKey: "ready-mix-concrete-m25", unitFactor: 1, meshKinds: ["slab"] },
  "beam": { category: "Concrete Works", rateKey: "columns-and-beams", unitFactor: 1, meshKinds: ["beam"] },
  "column": { category: "Concrete Works", rateKey: "columns-and-beams", unitFactor: 1, meshKinds: ["column"] },
  "footing": { category: "Concrete Works", rateKey: "footing", unitFactor: 1, meshKinds: ["footing"] },
  "wall": { category: "Masonry Works", rateKey: "brick-wall-4x", unitFactor: 1, meshKinds: ["wall", "parapet_rear", "parapet_front", "parapet_left", "parapet_right"] },
  "partition": { category: "Masonry Works", rateKey: "partition-wall", unitFactor: 1, meshKinds: ["partition"] },
  "stair": { category: "Concrete Works", rateKey: "staircase-rcc", unitFactor: 1, meshKinds: ["stair"] },
  "window": { category: "Joinery", rateKey: "window-wooden-800x1500", unitFactor: 1, meshKinds: ["window"] },
  "louver": { category: "Joinery", rateKey: "window-louver", unitFactor: 1, meshKinds: ["louver"] },
  "door": { category: "Joinery", rateKey: "door-wooden-interior", unitFactor: 1, meshKinds: ["door"] },
  "canopy": { category: "Concrete Works", rateKey: "ready-mix-concrete-m25", unitFactor: 1, meshKinds: ["canopy"] },
  "railing": { category: "Metal Works", rateKey: "steel-tmt-16mm", unitFactor: 1, meshKinds: ["railing", "balcony"] },
  "tank": { category: "Concrete Works", rateKey: "ready-mix-concrete-m25", unitFactor: 1, meshKinds: ["tank"] },
  "bath": { category: "Finishes", rateKey: "tile-bathroom-vitrified", unitFactor: 1, meshKinds: ["bath"] },
  "kitchen": { category: "Finishes", rateKey: "tile-flooring-ceramic", unitFactor: 1, meshKinds: ["kitchen"] },
};

/**
 * Generate a professional Bill of Quantities from a building mesh.
 * Quantities are derived from mesh object volumes and bounding-box surface areas.
 */
export function generateBOQ(
  mesh: MeshDocument,
  project: BuildingProject,
  rates: RateTable = DHAKA_RATES_2025,
  options?: { taxRate?: number }
): BOQDocument {
  const taxRate = options?.taxRate ?? 0.05; // 5% VAT per Bangladesh
  const items: BOQItem[] = [];
  const totalsByCategory: Record<string, { quantity: number; amount: number }> = {};

  // ---- Measured quantities (v2.4.3) ---------------------------------------------------------
  // Solids are interior-disjoint, so volumes are summed directly and exposed face areas give
  // plaster / floor areas without counting hidden contact faces. Units follow the rate table.
  const objs = mesh.objects;
  const faces = exposedFaceAreas(objs);
  const m3 = (o: MeshObject) => o.volumeMm3 / 1e9;
  const vol = (pred: (o: MeshObject) => boolean) => objs.filter(pred).reduce((t, o) => t + m3(o), 0);
  const kindIs = (...k: string[]) => (o: MeshObject) => k.includes(o.kind);
  const dims = (o: MeshObject) => [o.bboxMaxMm[0] - o.bboxMinMm[0], o.bboxMaxMm[1] - o.bboxMinMm[1], o.bboxMaxMm[2] - o.bboxMinMm[2]];
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const categoryOrder: Record<string, number> = {
    "Excavation & Site Works": 1,
    "Concrete Works": 2,
    "Reinforcement": 3,
    "Masonry Works": 4,
    "Joinery": 5,
    "Finishes": 6,
    "Plumbing & Sanitary": 7,
    "Electrical": 8,
    "Metal Works": 9,
    "Site Works": 10,
  };
  let itemNo = 0;
  const addItem = (
    category: string, description: string, rateKey: string | null, quantity: number,
    meshKinds: string[], assumptions: string[], opts?: { effectiveRate?: number; unit?: string },
  ) => {
    if (!(quantity > 0)) return;
    const rate = rateKey ? rates[rateKey] : undefined;
    const rateBDT = opts?.effectiveRate ?? rate?.rateBDT ?? 0;
    const unit = opts?.unit ?? rate?.unit ?? "item";
    const amount = quantity * rateBDT;
    itemNo++;
    items.push({
      itemNo: String(itemNo).padStart(3, "0"),
      description,
      unit,
      quantity: round3(quantity),
      rateBDT: Math.round(rateBDT),
      amountBDT: Math.round(amount),
      category,
      meshKinds,
      assumptions: rateBDT === 0 ? ["UNPRICED: no rate in the rate table; quantity only", ...assumptions] : assumptions,
    });
    (totalsByCategory[category] ??= { quantity: 0, amount: 0 });
    totalsByCategory[category].quantity += quantity;
    totalsByCategory[category].amount += amount;
  };

  // Frame extents (outer faces of the ground-storey columns) for exterior-face detection.
  const frameCols = objs.filter((o) => o.kind === "column" && o.phase === "ground_floor" && o.bboxMinMm[2] >= 0);
  const fMinX = Math.min(...frameCols.map((o) => o.bboxMinMm[0]));
  const fMaxX = Math.max(...frameCols.map((o) => o.bboxMaxMm[0]));
  const fMinY = Math.min(...frameCols.map((o) => o.bboxMinMm[1]));
  const fMaxY = Math.max(...frameCols.map((o) => o.bboxMaxMm[1]));
  const frameAreaM2 = frameCols.length ? ((fMaxX - fMinX) * (fMaxY - fMinY)) / 1e6 : (project.plotSqm || 200) * 0.7;

  // 1. Excavation: underground tanks only (the footing rate already includes its excavation).
  const ugTanks = objs.filter((o) => o.kind === "tank" && o.bboxMaxMm[2] <= 0);
  const excavation = ugTanks.reduce((t, o) => { const d = dims(o); return t + ((d[0] + 1200) * (d[1] + 1200) * (o.bboxMaxMm[2] + 600 - o.bboxMinMm[2] + 600)) / 1e9; }, 0);
  addItem("Excavation & Site Works", "Excavation for underground tanks (600 mm working space each side)", "excavation", excavation, ["tank"],
    ["Footing excavation is included in the footing rate", "Backfill and dewatering not measured"]);

  // 2. Concrete (rates include formwork and placement)
  const footingVol = vol(kindIs("footing"));
  addItem("Concrete Works", "RCC footings M25 incl. formwork, excavation", "footing", footingVol, ["footing"], [`${objs.filter(kindIs("footing")).length} footing pads`]);
  const frameVol = vol(kindIs("column", "pier", "beam", "lintel"));
  addItem("Concrete Works", "RCC columns, beams and lintels M25 incl. formwork", "columns-and-beams", frameVol, ["column", "pier", "beam", "lintel"],
    ["Disjoint solids: no double count at column/beam/wall junctions", "Window sills measured with lintels"]);
  const slabVol = vol(kindIs("slab", "balcony", "canopy"));
  addItem("Concrete Works", "RCC slabs, balconies, canopy and entry steps M25 incl. formwork", "ready-mix-concrete-m25", slabVol, ["slab", "balcony", "canopy"], []);
  addItem("Concrete Works", "RCC dog-legged staircases M25 incl. formwork", "staircase-rcc", vol(kindIs("stair")), ["stair"],
    ["Stepped solid blocks (riser + 150 mm waist) overstate a true waist-slab stair by roughly 10-20 %"]);
  const shell = (o: MeshObject, t: number) => { const d = dims(o); return (2 * (d[0] * d[1] + d[0] * d[2] + d[1] * d[2]) * t) / 1e9; };
  const tankShell = objs.filter(kindIs("tank")).reduce((tot, o) => tot + shell(o, o.bboxMaxMm[2] <= 0 ? 200 : 150), 0);
  addItem("Concrete Works", "RCC tank shells M25 (walls, base and cover slab)", "ready-mix-concrete-m25", tankShell, ["tank"],
    ["Shell = envelope surface x 200 mm (underground) / 150 mm (overhead); tanks are modelled as solid boxes, so their volume is NOT concrete"]);

  // 3. Reinforcement: screening kg/m3 factors (ASSUMED typical residential values, not a bar schedule)
  const KG_PER_M3 = { footing: 80, column: 200, beam: 150, slab: 90, stair: 110, tank: 120 };
  const steelKg =
    footingVol * KG_PER_M3.footing +
    vol(kindIs("column", "pier")) * KG_PER_M3.column +
    vol(kindIs("beam", "lintel")) * KG_PER_M3.beam +
    vol(kindIs("slab", "balcony", "canopy")) * KG_PER_M3.slab +
    vol(kindIs("stair")) * KG_PER_M3.stair +
    tankShell * KG_PER_M3.tank;
  addItem("Reinforcement", "TMT reinforcement Fe415, all diameters (screening estimate)", "steel-tmt-16mm", steelKg / 1000, ["footing", "column", "beam", "slab", "stair", "tank"],
    [`ASSUMED kg/m3: footing ${KG_PER_M3.footing}, column ${KG_PER_M3.column}, beam/lintel ${KG_PER_M3.beam}, slab ${KG_PER_M3.slab}, stair ${KG_PER_M3.stair}, tank shell ${KG_PER_M3.tank}`, "Replace with the bar schedule when available"],
    { unit: "ton" });

  // 4. Masonry: net face area (volume / thickness); rate scaled by thickness / reference thickness
  const masonry = (pred: (o: MeshObject) => boolean, rateKey: string, refMm: number) => {
    let area = 0, amount = 0;
    for (const o of objs.filter(pred)) {
      const d = dims(o);
      const a = (Math.max(d[0], d[1]) * d[2]) / 1e6; // face area = length x height
      const t = m3(o) / a * 1000; // mm; pieces may be L-shaped after column carving
      area += a;
      amount += a * (rates[rateKey]?.rateBDT ?? 0) * (t / refMm);
    }
    return { area, eff: area ? amount / area : 0, refMm };
  };
  const ext = masonry(kindIs("wall", "parapet"), "brick-wall-4x", 136);
  addItem("Masonry Works", "Brickwork, external walls, parapets and plinth course (net of openings)", "brick-wall-4x", ext.area, ["wall", "parapet"],
    ["Net area = volume / thickness (openings and column/beam wraps already removed)", `Table rate is for ${ext.refMm} mm; scaled by actual thickness (250 mm walls ~ x1.8)`], { effectiveRate: ext.eff });
  const part = masonry(kindIs("partition"), "partition-wall", 102.5);
  addItem("Masonry Works", "Brick partition walls (net of openings)", "partition-wall", part.area, ["partition"],
    ["Net area = volume / thickness", `Table rate is for ${part.refMm} mm; scaled by actual thickness`], { effectiveRate: part.eff });

  // 5. Finishes from exposed faces
  const wallObjs = objs.filter(kindIs("wall", "parapet", "partition"));
  let plasterMm2 = 0, extMm2 = 0;
  for (const o of wallObjs) {
    const f = faces.get(o.id)!;
    plasterMm2 += f.px + f.nx + f.py + f.ny;
    if (Math.abs(o.bboxMinMm[0] - fMinX) < 5) extMm2 += f.nx;
    if (Math.abs(o.bboxMaxMm[0] - fMaxX) < 5) extMm2 += f.px;
    if (Math.abs(o.bboxMinMm[1] - fMinY) < 5) extMm2 += f.ny;
    if (Math.abs(o.bboxMaxMm[1] - fMaxY) < 5) extMm2 += f.py;
  }
  addItem("Finishes", "Cement plaster 12 mm, all exposed masonry faces", "wall-plaster", plasterMm2 / 1e6, ["wall", "partition", "parapet"],
    ["Exposed vertical faces only (faces touching columns, beams, slabs or other walls are excluded)", "Plaster on RCC faces and soffits not measured"]);
  addItem("Finishes", "External lime wash 2 coats, exterior wall faces", "wall-lime-wash", extMm2 / 1e6, ["wall"], ["Exterior faces on the frame line"]);
  const floorMm2 = objs.filter((o) => /^(slab_f\d+|balcony_front_f\d+)/.test(o.id)).reduce((t, o) => t + faces.get(o.id)!.pz, 0);
  const floorM2 = floorMm2 / 1e6 + frameAreaM2;
  addItem("Finishes", "Cement-sand screed 50 mm under floor finishes", "floor-screed", floorM2, ["slab"],
    ["Upper floors + balconies: exposed slab top (excludes wall footprints); ground floor: frame footprint"]);
  addItem("Finishes", "Ceramic floor tiles 300x300", "tile-flooring-ceramic", floorM2, ["slab"], ["Same area as screed; wet-area vitrified premium not separated"]);
  const roofMm2 = objs.filter((o) => /^(roof_slab|penthouse_slab)(~\d+)?$/.test(o.id)).reduce((t, o) => t + faces.get(o.id)!.pz, 0);
  addItem("Finishes", "Roof screed / topping (waterproofing membrane not in rate table)", "floor-screed", roofMm2 / 1e6, ["slab"], ["Waterproofing membrane unpriced: add a rate"]);

  // 6. Joinery: opening areas from assemblies (groups of door / window / louver parts)
  const assembly = (id: string) => id.replace(/~\d+$/, "").replace(/_(leaf|pane_\d+|blade_\d+|frm_[a-z]+)$/, "");
  const groups = new Map<string, MeshObject[]>();
  for (const o of objs.filter(kindIs("door", "window", "louver", "window_frame", "door_frame"))) (groups.get(assembly(o.id)) ?? groups.set(assembly(o.id), []).get(assembly(o.id))!).push(o);
  let mainArea = 0, mainN = 0, doorArea = 0, doorN = 0, winArea = 0, winN = 0, louverArea = 0, louverN = 0;
  for (const [id, parts] of groups) {
    const minX = Math.min(...parts.map((p) => p.bboxMinMm[0])), maxX = Math.max(...parts.map((p) => p.bboxMaxMm[0]));
    const minY = Math.min(...parts.map((p) => p.bboxMinMm[1])), maxY = Math.max(...parts.map((p) => p.bboxMaxMm[1]));
    const minZ = Math.min(...parts.map((p) => p.bboxMinMm[2])), maxZ = Math.max(...parts.map((p) => p.bboxMaxMm[2]));
    const area = (Math.max(maxX - minX, maxY - minY) * (maxZ - minZ)) / 1e6;
    if (!parts.some((p) => p.kind === "door" || p.kind === "window" || p.kind === "louver")) continue;
    const isDoor = parts.some((p) => p.kind === "door");
    if (isDoor) { if (/main/i.test(id)) { mainArea += area; mainN++; } else { doorArea += area; doorN++; } }
    else if (parts.some((p) => p.kind === "louver")) { louverArea += area; louverN++; }
    else { winArea += area; winN++; }
  }
  addItem("Joinery", "Main entrance door, hardwood frame + shutter", "door-wooden-main", mainArea, ["door", "door_frame"], [`${mainN} door(s), clear opening area`]);
  addItem("Joinery", "Interior doors, flush shutter, timber frame", "door-wooden-interior", doorArea, ["door", "door_frame"], [`${doorN} door(s), clear opening area`]);
  addItem("Joinery", "Windows and balcony doors (glazed, sliding)", "window-wooden-800x1500", winArea, ["window", "window_frame"], [`${winN} window(s)/glazed door(s), opening area`]);
  addItem("Joinery", "Louvre ventilators (bath)", "window-louver", louverArea, ["louver", "window_frame"], [`${louverN} ventilator(s), opening area`]);

  // 7. Metal works: balcony railings measured in metres; no rate in the table -> unpriced
  const railLen = objs.filter(kindIs("railing")).reduce((t, o) => { const d = dims(o); return t + Math.max(d[0], d[1]) / 1000; }, 0);
  addItem("Metal Works", "Balcony glass / steel railing 900 mm (supply + fix)", null, railLen, ["railing"], ["Add a per-metre rate to the rate table to price this line"], { unit: "m" });

  // Counts used by the services below
  const bathCount = new Set(objs.filter((o) => /_bath_shaft(~\d+)?$/.test(o.id)).map((o) => o.id.replace(/~\d+$/, ""))).size;

  // Add estimated services (not directly measurable in mesh)
  const floorArea = frameAreaM2; // built area per floor from the model frame
  const servicesItems: BOQItem[] = [];
  if (project.stories >= 1) {
    // Sanitary
    itemNo++;
    servicesItems.push({
      itemNo: `${itemNo.toString().padStart(3, "0")}`,
      description: `Sanitary plumbing, ${bathCount || Math.ceil(project.stories / 2)} bathroom(s)`,
      unit: "kp",
      quantity: bathCount || Math.ceil(project.stories / 2),
      rateBDT: DHAKA_RATES_2025["plumbing-sanitary"].rateBDT,
      amountBDT: (bathCount || Math.ceil(project.stories / 2)) * DHAKA_RATES_2025["plumbing-sanitary"].rateBDT,
      category: "Plumbing & Sanitary",
      meshKinds: [],
      assumptions: [bathCount ? "Bathrooms counted from plumbing risers in the 3D model" : "No bathrooms in the model: estimated 1 per 2 storeys"],
    });

    // ── Electrical BOQ (proper method per PWD SOR / IEC 60364) ──
    // Wiring length: 1.8× floor area per floor (circuits + vertical risers)
    const wiringLengthPerFloor = Math.round(floorArea * 1.8);
    const totalWiringLength = wiringLengthPerFloor * project.stories;
    itemNo++;
    servicesItems.push({
      itemNo: `${itemNo.toString().padStart(3, "0")}`,
      description: `Copper wiring 2.5mm² PVC conduit concealed — ${project.stories} storey`,
      unit: "m",
      quantity: totalWiringLength,
      rateBDT: DHAKA_RATES_2025["electrical-wiring"].rateBDT,
      amountBDT: Math.round(totalWiringLength * DHAKA_RATES_2025["electrical-wiring"].rateBDT),
      category: "Electrical",
      meshKinds: [],
      assumptions: ["1.8× floor area per floor (circuits + vertical risers)", "2.5mm² copper, PVC conduit"],
    });

    // Switchgear / distribution board per floor
    itemNo++;
    const switchgearQty = project.stories;
    servicesItems.push({
      itemNo: `${itemNo.toString().padStart(3, "0")}`,
      description: `Distribution board + MCB switchgear — ${project.stories} storey`,
      unit: "unit",
      quantity: switchgearQty,
      rateBDT: DHAKA_RATES_2025["electrical-switchgear"].rateBDT,
      amountBDT: Math.round(switchgearQty * DHAKA_RATES_2025["electrical-switchgear"].rateBDT),
      category: "Electrical",
      meshKinds: [],
      assumptions: ["One distribution board per floor", "8-way MCB panel"],
    });

    // Lighting + fan + socket fixtures
    const fixtureCount = Math.round(floorArea * project.stories * 0.18);
    itemNo++;
    servicesItems.push({
      itemNo: `${itemNo.toString().padStart(3, "0")}`,
      description: `LED light fixtures + fan + socket points`,
      unit: "unit",
      quantity: fixtureCount,
      rateBDT: DHAKA_RATES_2025["electrical-fixtures"].rateBDT,
      amountBDT: Math.round(fixtureCount * DHAKA_RATES_2025["electrical-fixtures"].rateBDT),
      category: "Electrical",
      meshKinds: [],
      assumptions: ["0.18 fixtures per m² of floor area", "LED + fan + socket per point"],
    });

    // Earthing system
    itemNo++;
    servicesItems.push({
      itemNo: `${itemNo.toString().padStart(3, "0")}`,
      description: "Earthing system — 6m copper rod + GI strip (BNBC Ch.13)",
      unit: "unit",
      quantity: 1,
      rateBDT: DHAKA_RATES_2025["electrical-earth"].rateBDT,
      amountBDT: DHAKA_RATES_2025["electrical-earth"].rateBDT,
      category: "Electrical",
      meshKinds: [],
      assumptions: ["BNBC 2020 Chapter 13 mandatory", "6m deep copper rod + 25×3mm GI strip"],
    });

    // Backup generator (for 4+ storeys)
    if (project.stories >= 4) {
      itemNo++;
      servicesItems.push({
        itemNo: `${itemNo.toString().padStart(3, "0")}`,
        description: "Backup diesel generator + ATS panel (BNBC 2020)",
        unit: "unit",
        quantity: 1,
        rateBDT: DHAKA_RATES_2025["electrical-generator"].rateBDT,
        amountBDT: DHAKA_RATES_2025["electrical-generator"].rateBDT,
        category: "Electrical",
        meshKinds: [],
        assumptions: ["Required for buildings ≥ 4 stories per BNBC 2020", "30-50 kVA generator + ATS"],
      });
    }
  }
  for (const item of servicesItems) {
    items.push(item);
    if (!totalsByCategory[item.category]) {
      totalsByCategory[item.category] = { quantity: 0, amount: 0 };
    }
    totalsByCategory[item.category].quantity += item.quantity;
    totalsByCategory[item.category].amount += item.amountBDT;
  }

  const subtotal = items.reduce((sum, i) => sum + i.amountBDT, 0);
  const tax = subtotal * taxRate;

  // Sort items by category order then by item number
  items.sort((a, b) => {
    const catA = categoryOrder[a.category] ?? 99;
    const catB = categoryOrder[b.category] ?? 99;
    return catA - catB || a.itemNo.localeCompare(b.itemNo, undefined, { numeric: true });
  });

  // Renumber after sort
  items.forEach((item, i) => { item.itemNo = `${(i + 1).toString().padStart(3, "0")}`; });

  return {
    projectId: project.id || "unknown",
    projectName: project.name || "ArchResidence Project",
    location: "Dhaka, Bangladesh",
    generatedAt: new Date().toISOString(),
    currency: "BDT",
    rateTable: "DHAKA_RATES_2025",
    items,
    totals: {
      totalItems: items.length,
      subtotalBDT: Math.round(subtotal),
      taxRate,
      taxBDT: Math.round(tax),
      totalBDT: Math.round(subtotal + tax),
      totalsByCategory,
    },
  };
}

/** Export BOQ as CSV format for spreadsheet import */
export function exportBOQCSV(boq: BOQDocument): string {
  const header = "Item No,Description,Unit,Quantity,Rate (BDT),Amount (BDT),Category";
  const rows = boq.items.map(i =>
    `"${i.itemNo}","${i.description.replace(/"/g, '""')}","${i.unit}",${i.quantity},${i.rateBDT},${i.amountBDT},"${i.category}"`
  );
  const footer = `\n\nTOTAL ITEMS: ${boq.totals.totalItems}\nSUBTOTAL (BDT): ${boq.totals.subtotalBDT.toLocaleString()}\nVAT (${boq.totals.taxRate * 100}%): ${boq.totals.taxBDT.toLocaleString()}\nGRAND TOTAL (BDT): ${boq.totals.totalBDT.toLocaleString()}`;
  return [header, ...rows, "", footer].join("\n");
}

/** Generate a detailed markdown report for the BOQ */
export function generateBOQReport(boq: BOQDocument): string {
  let md = `# Bill of Quantities — ${boq.projectName}\n\n`;
  md += `**Project ID:** ${boq.projectId}  \n`;
  md += `**Location:** ${boq.location}  \n`;
  md += `**Currency:** ${boq.currency}  \n`;
  md += `**Rate Table:** ${boq.rateTable}  \n`;
  md += `**Generated:** ${new Date(boq.generatedAt).toLocaleString("en-GB")}  \n\n`;
  md += `---\n\n`;
  md += `## Summary by Category\n\n`;
  md += "| Category | Quantity | Amount (BDT) |\n";
  md += "|----------|----------|-------------|\n";
  for (const [cat, totals] of Object.entries(boq.totals.totalsByCategory)) {
    md += `| ${cat} | ${Math.round(totals.quantity * 100) / 100} | ${totals.amount.toLocaleString()} |\n`;
  }
  md += `\n**Total Items:** ${boq.totals.totalItems}\n`;
  md += `**Subtotal:** ৳${boq.totals.subtotalBDT.toLocaleString()}\n`;
  md += `**VAT (${boq.totals.taxRate * 100}%):** ৳${boq.totals.taxBDT.toLocaleString()}\n`;
  md += `**Grand Total:** ৳${boq.totals.totalBDT.toLocaleString()}\n\n`;
  md += `---\n\n## Item Details\n\n`;
  md += "| # | Description | Unit | Qty | Rate (৳) | Amount (৳) | Category |\n";
  md += "|---|-------------|------|-----|---------|-----------|----------|\n";
  for (const item of boq.items) {
    md += `| ${item.itemNo} | ${item.description} | ${item.unit} | ${item.quantity} | ${item.rateBDT.toLocaleString()} | ${item.amountBDT.toLocaleString()} | ${item.category} |\n`;
  }
  return md;
}

/**
 * Generate BOQ directly from a BuildingProject, using its customization.
 * Replaces the heuristic calculateDynamicBoq with mesh-based quantification.
 * Adds customization-driven items (fire sprinkler, elevator, rainwater tank).
 */
export function generateBoqFromProject(
  project: BuildingProject,
  rates: RateTable = DHAKA_RATES_2025,
): BOQDocument {
  const mesh = generateBuildingMesh(project, "final", project.customization);
  const boq = generateBOQ(mesh, project, rates);

  // Add customization-driven items
  addFireProtectionItems(boq, project);
  addVerticalTransportationItems(boq, project);
  addSustainabilityItems(boq, project);

  // Renumber items after adding new ones
  boq.items.forEach((item, i) => { item.itemNo = `${(i + 1).toString().padStart(3, "0")}`; });
  boq.totals.totalItems = boq.items.length;

  return boq;
}

/** Add fire protection items (sprinkler system) */
function addFireProtectionItems(boq: BOQDocument, project: BuildingProject): void {
  if (!project.customization?.fireSafety?.enabled) return;

  const floorArea = (project.plotSqm || 200) * 0.7;
  const sprinklerQty = Math.round(floorArea * project.stories);
  const sprinklerAmount = sprinklerQty * 450;
  const item: BOQItem = {
    itemNo: `${(boq.items.length + 1).toString().padStart(3, "0")}`,
    description: "Fire Sprinkler System (BNBC Part 4) — automatic wet-pipe system",
    unit: "m²",
    quantity: sprinklerQty,
    rateBDT: 450,
    amountBDT: sprinklerAmount,
    category: "Fire Protection",
    meshKinds: [],
    assumptions: ["BNBC 2020 Part 4 requirement for buildings ≥ 6 stories"],
  };
  addBOQItem(boq, item);
}

/** Add vertical transportation items (elevator) */
function addVerticalTransportationItems(boq: BOQDocument, project: BuildingProject): void {
  if (!project.customization?.accessibility?.elevatorRequired) return;

  const elevatorQty = 1;
  const elevatorAmount = 450000;
  const item: BOQItem = {
    itemNo: `${(boq.items.length + 1).toString().padStart(3, "0")}`,
    description: "Passenger Elevator (BNBC Ch.8) — 8-person capacity, gearless traction",
    unit: "unit",
    quantity: elevatorQty,
    rateBDT: elevatorAmount,
    amountBDT: elevatorAmount,
    category: "Vertical Transportation",
    meshKinds: [],
    assumptions: ["Required for buildings ≥ 4 stories per BNBC 2020 Chapter 8"],
  };
  addBOQItem(boq, item);
}

/** Add sustainability items (rainwater harvesting) */
function addSustainabilityItems(boq: BOQDocument, project: BuildingProject): void {
  const sust = project.customization?.sustainability;
  if (!sust || sust.annualRainfallMm <= 0) return;

  const roofArea = (project.plotSqm || 200) * 0.7;
  const tankSizeM3 = Math.round((roofArea * sust.annualRainfallMm / 1000 * sust.tankEfficiency) * 10) / 10;
  if (tankSizeM3 <= 5) return;

  const tankAmount = Math.round(tankSizeM3 * 8500);
  const item: BOQItem = {
    itemNo: `${(boq.items.length + 1).toString().padStart(3, "0")}`,
    description: `Rainwater Harvesting Tank — ${tankSizeM3} m³ RCC underground`,
    unit: "m³",
    quantity: tankSizeM3,
    rateBDT: 8500,
    amountBDT: tankAmount,
    category: "Sustainability",
    meshKinds: [],
    assumptions: ["Based on Dhaka annual rainfall", `${sust.annualRainfallMm}mm, efficiency ${sust.tankEfficiency * 100}%`],
  };
  addBOQItem(boq, item);
}

/** Helper to add item and update totals safely */
function addBOQItem(boq: BOQDocument, item: BOQItem): void {
  boq.items.push(item);
  // Ensure totalsByCategory exists
  if (!boq.totals.totalsByCategory) {
    boq.totals.totalsByCategory = {};
  }
  if (!boq.totals.totalsByCategory[item.category]) {
    boq.totals.totalsByCategory[item.category] = { quantity: 0, amount: 0 };
  }
  boq.totals.totalsByCategory[item.category].quantity += item.quantity;
  boq.totals.totalsByCategory[item.category].amount += item.amountBDT;
  boq.totals.subtotalBDT += item.amountBDT;
  boq.totals.taxBDT = Math.round(boq.totals.subtotalBDT * boq.totals.taxRate);
  boq.totals.totalBDT = Math.round(boq.totals.subtotalBDT + boq.totals.taxBDT);
}
