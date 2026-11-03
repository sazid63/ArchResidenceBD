/**
 * Central State Management for ArchResidenceBD
 *
 * Dynamically computes building phases based on the user's stories count,
 * tracks phase interview dialogues, calculated structural parameters,
 * design generation state, and dynamic PWD BOQ pricing.
 */

import type { BuildingCustomization } from "../types/customization";
import { presetForFloorPlan } from "../data/floorplanMapping";
import { getFloorPlansByUnits } from "../data/bangladeshFloorplans";
import {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";

export interface PhaseItem {
  id: string;
  nameEn: string;
  nameBn: string;
  kind: "site" | "foundation" | "ground_floor" | "floor" | "roof" | "utility";
  storeyIndex?: number;
  status: "not_started" | "in_progress" | "completed";
  data: Record<string, unknown>;
  messages: Array<{
    who: "ai" | "user";
    text: string;
    metrics?: Record<string, string | number>;
    timestamp?: string;
  }>;
}

export interface BuildingProject {
  id: string;
  name: string;
  address: string;
  stories: number;
  plotSize: number;
  plotUnit: "katha" | "decimal" | "sqft" | "sqm";
  plotSqm: number;
  unitsPerFloor: number;
  createdAt: string;
  updatedAt: string;
  phases: PhaseItem[];
  designStarted: boolean;
  activePhaseId?: string;
  /** Catalogue plan (bangladeshFloorplans.ts id) the user picked as the typical floor. */
  floorplanId?: string;
  /** Parametric preset built for every floor that has no selection of its own. */
  typicalPresetId?: string;
  /**
   * Full customization bundle — drives mesh generation, BOQ, and all optional
   * features (accessibility, sustainability, fire safety, value engineering,
   * construction management). Optional for backward compatibility.
   */
  customization?: BuildingCustomization;
}

const STORAGE_KEY = "archres_v2_active_project";
const ALL_PROJECTS_KEY = "archres_v2_all_projects";

export function plotToSqm(size: number, unit: string): number {
  switch (unit) {
    case "katha": return size * 66.89;
    case "decimal": return size * 40.468;
    case "sqft": return size * 0.0929;
    case "sqm": return size;
    default: return size * 66.89;
  }
}

/**
 * Single source of truth for default customization.
 * Eliminates 4x duplication across createNewProject, generateRandomBuildingProject,
 * create4StoryBuildingProject, and create6StoryBuildingProject.
 */
export function createDefaultCustomization(): BuildingCustomization {
  return {
    concreteGrade: 25,
    steelGrade: 415,
    accessibility: { ...DEFAULT_ACCESSIBILITY },
    sustainability: { ...DEFAULT_SUSTAINABILITY_DHAKA },
    fireSafety: { ...DEFAULT_FIRE_SAFETY },
    valueEngineering: { ...DEFAULT_VALUE_ENGINEERING },
    constructionMgmt: { ...DEFAULT_CONSTRUCTION_MGMT },
  };
}

/** Create a completed phase item with metrics and message. */
function makeCompletedPhase(
  phase: PhaseItem,
  metrics: Record<string, string | number>,
  preset: string,
  timestamp: string,
  messageText: string,
  userPrompt?: string,
): PhaseItem {
  const messages: PhaseItem["messages"] = [];
  if (userPrompt) {
    messages.push({
      who: "user" as const,
      text: userPrompt,
      timestamp,
    });
  }
  messages.push({
    who: "ai" as const,
    text: messageText,
    metrics,
    timestamp,
  });

  return {
    ...phase,
    status: "completed",
    data: { ...metrics, selectedFloorplanPreset: preset },
    messages,
  };
}

/**
 * Generate building phases dynamically based on the user's stories input.
 */
export function generatePhasesForStories(stories: number): PhaseItem[] {
  const phases: PhaseItem[] = [];
  const now = new Date().toISOString();

  phases.push({
    id: "phase-site", nameEn: "Site & Excavation", nameBn: "সাইট ও মাটি খনন",
    kind: "site", status: "not_started", data: {}, messages: [],
  });
  phases.push({
    id: "phase-foundation", nameEn: "Foundation & Footings", nameBn: "ফাউন্ডেশন ও ফুটিং",
    kind: "foundation", status: "not_started", data: {}, messages: [],
  });
  phases.push({
    id: "phase-ground-floor", nameEn: "Ground Floor (Parking & Entry)", nameBn: "নিচতলা (পার্কিং ও প্রবেশদ্বার)",
    kind: "ground_floor", storeyIndex: 0, status: "not_started", data: {}, messages: [],
  });

  for (let i = 1; i < stories; i++) {
    const floorLabelEn = i === 1 ? "1st Floor" : i === 2 ? "2nd Floor" : i === 3 ? "3rd Floor" : `${i}th Floor`;
    const floorLabelBn = i === 1 ? "১ম তলা" : i === 2 ? "২য় তলা" : i === 3 ? "৩য় তলা" : `${i}নং তলা`;
    phases.push({
      id: `phase-floor-${i}`,
      nameEn: `${floorLabelEn} (Residential Unit)`,
      nameBn: `${floorLabelBn} (আবাসিক ইউনিট)`,
      kind: "floor", storeyIndex: i, status: "not_started", data: {}, messages: [],
    });
  }

  phases.push({
    id: "phase-rooftop", nameEn: "Rooftop & Boundary Wall", nameBn: "ছাদ ও সীমানা প্রাচীর",
    kind: "roof", status: "not_started", data: {}, messages: [],
  });
  phases.push({
    id: "phase-utilities", nameEn: "Utilities (Water, Sewage, Gas, Power)", nameBn: "ইউটিলিটি (পানি, স্যায়ারেজ, গ্যাস, বিদ্যুৎ)",
    kind: "utility", status: "not_started", data: {}, messages: [],
  });

  return phases;
}

export function createNewProject(params: {
  name: string;
  stories: number;
  plotSize: number;
  plotUnit: "katha" | "decimal" | "sqft" | "sqm";
  unitsPerFloor: number;
  address?: string;
  floorplanId?: string;
}): BuildingProject {
  const id = `project-${Date.now()}`;
  const plotSqm = plotToSqm(params.plotSize, params.plotUnit);
  const phases = generatePhasesForStories(params.stories);

  const project: BuildingProject = {
    id,
    name: params.name || "Residential Building",
    address: params.address || "Dhaka, Bangladesh",
    stories: params.stories || 2,
    plotSize: params.plotSize || 3,
    plotUnit: params.plotUnit || "katha",
    plotSqm: Math.round(plotSqm * 100) / 100,
    unitsPerFloor: params.unitsPerFloor || 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    phases,
    designStarted: false,
    activePhaseId: phases[0].id,
    customization: createDefaultCustomization(),
    floorplanId: params.floorplanId,
    typicalPresetId: presetForFloorPlan(
      params.floorplanId ? getFloorPlansByUnits(params.unitsPerFloor).find((f) => f.id === params.floorplanId) : null,
      params.unitsPerFloor || 2,
    ),
  };

  saveActiveProject(project);

  // Add to all projects history
  const all = getSavedProjects();
  if (typeof localStorage !== "undefined") {
    const existingIdx = all.findIndex((p) => p.id === project.id);
    if (existingIdx >= 0) all[existingIdx] = project;
    else all.unshift(project);
    localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(all));
  }

  return project;
}

export function generateRandomBuildingProject(): BuildingProject {
  const archetypes = [
    { name: "Padma Garden Heights (6-Storey Dual Units)", address: "Road 11, Banani, Dhaka", stories: 6, plotSize: 4.2, preset: "preset-dual-3bed", unitsPerFloor: 2 },
    { name: "Shapla Executive Villa (7-Storey Full-Floor)", address: "Sector 4, Uttara, Dhaka", stories: 7, plotSize: 4.8, preset: "preset-single-luxury", unitsPerFloor: 1 },
    { name: "Jamuna Rental Suite (8-Storey Triple Units)", address: "Mirpur DOHS, Dhaka", stories: 8, plotSize: 5.2, preset: "preset-triple-rental", unitsPerFloor: 3 },
    { name: "Purbachal Duplex Villa (2-Storey Courtyard)", address: "Sector 1, Purbachal Smart City, Dhaka", stories: 2, plotSize: 3.5, preset: "preset-duplex-courtyard", unitsPerFloor: 1 },
    { name: "South Khulshi Corner Tower (6-Storey Corner Plot)", address: "Road 3, South Khulshi, Chittagong", stories: 6, plotSize: 4.5, preset: "preset-dual-3bed", unitsPerFloor: 2 },
    { name: "Farmgate Studio Apartments (6-Storey 4-Unit)", address: "Indira Road, Farmgate, Dhaka", stories: 6, plotSize: 3.8, preset: "preset-studio-bachelor", unitsPerFloor: 4 },
    { name: "Pragoti Mixed Tower (7-Storey Showroom + Flats)", address: "Pragoti Sarani, Baridhara, Dhaka", stories: 7, plotSize: 5.5, preset: "preset-commercial-mixed", unitsPerFloor: 2 },
    { name: "Sylhet Family Residence (4-Storey Joint Family)", address: "Zindabazar, Sylhet", stories: 4, plotSize: 3.6, preset: "preset-family-duplex", unitsPerFloor: 1 },
    { name: "Gulshan Sky Penthouse (8-Storey Luxury Suite)", address: "Road 71, Gulshan 2, Dhaka", stories: 8, plotSize: 6.0, preset: "preset-penthouse-luxury", unitsPerFloor: 1 },
    { name: "Lalbagh Heritage Residence (6-Storey Narrow Plot)", address: "Water Works Road, Lalbagh, Old Dhaka", stories: 6, plotSize: 2.8, preset: "preset-narrow-duct", unitsPerFloor: 2 },
  ];

  const selected = archetypes[Math.floor(Math.random() * archetypes.length)];
  const { name, address, stories, plotSize, preset, unitsPerFloor } = selected;
  const id = `project-rand-${Date.now()}`;
  const plotSqm = plotToSqm(plotSize, "katha");
  const phases = generatePhasesForStories(stories);
  const now = new Date().toISOString();
  const timeStr = "10:01 AM";

  const populatedPhases = phases.map((p) => {
    const populated = populatePhaseMetrics(p, stories, plotSqm, plotSize, preset, name, unitsPerFloor, now, timeStr);
    return makeCompletedPhase(p, populated.metrics, populated.preset, populated.timestamp, populated.msg, populated.userPrompt);
  });

  const project: BuildingProject = {
    id, name, address, stories, plotSize, plotUnit: "katha",
    plotSqm: Math.round(plotSqm * 100) / 100, unitsPerFloor: 2,
    createdAt: now, updatedAt: now,
    phases: populatedPhases, designStarted: true, activePhaseId: "final",
    customization: createDefaultCustomization(),
  };

  saveActiveProject(project);
  return project;
}

/** Helper: populate phase metrics based on phase kind. */
function populatePhaseMetrics(
  phase: PhaseItem, stories: number, plotSqm: number, plotSize: number, preset: string,
  name: string, unitsPerFloor: number, now: string, timeStr: string,
): { metrics: Record<string, string | number>; preset: string; timestamp: string; msg: string; userPrompt?: string } {
  let activePreset = preset;
  let metrics: Record<string, string | number> = {};
  let userPrompt: string | undefined;

  if (phase.kind === "site") {
    metrics = {
      "Plot Area": `${plotSize} Katha (${Math.round(plotSqm)} m²)`,
      "Excavation Volume": `${Math.round(plotSqm * 2.2)} m³`,
      "Front Road Width": "20 ft (RAJUK DAP Compliant)",
      "Soil Bearing Capacity": "120 kN/m² (Medium Stiff Clay)",
    };
    activePreset = preset;
  } else if (phase.kind === "foundation") {
    const isPiles = stories >= 6;
    metrics = isPiles
      ? {
          "Foundation Type": "Cast-in-situ Bored RCC Piles",
          "Total Pile Count": "16 Piles",
          "Pile Diameter": "500 mm",
          "Pile Depth": "18.5 meters (60.7 ft)",
          "Grade Beam Sizing": "300mm × 550mm",
          "Concrete Mix": "C25 (f'c = 25 MPa with Stone Chips)",
        }
      : {
          "Foundation Type": "Isolated RCC Spread Footings",
          "Total Footing Count": "12 Footings",
          "Footing Depth": "1.8 meters (6 ft)",
          "Grade Beam Sizing": "250mm × 450mm",
          "Concrete Mix": "C20 (f'c = 20 MPa)",
        };
  } else if (phase.kind === "ground_floor") {
    activePreset = "preset-ground-parking";
    metrics = {
      "Covered Parking Bays": stories >= 6 ? "6 Car Slots" : "4 Car Slots",
      "Clear Driveway Width": "3.6 meters (12 ft)",
      "Ground Pavement Slab": "150 mm RCC",
    };
    if (stories >= 6) metrics["Security Guard Post"] = "100 sq.ft with Driver Restroom";
  } else if (phase.kind === "floor") {
    activePreset = preset;
    metrics = {
      "Selected Layout": preset,
      "Units Per Floor": `${unitsPerFloor} Flats`,
      "RCC Slab Thickness": "125 mm (5 in)",
      "Column Grid Sizing": stories >= 6 ? "350mm × 350mm RCC Columns" : "250mm × 400mm RCC Columns",
    };
  } else if (phase.kind === "roof") {
    metrics = {
      "Overhead Water Tank": `${stories * 2500} Liters`,
    };
  } else if (phase.kind === "utility") {
    metrics = {
      "Underground Septic Tank": stories >= 6 ? "18.5 m³ Two-Chamber Tank" : "15 m³ Capacity",
      "Underground Reservoir": `${stories * 2500 * 2} Liters Capacity`,
    };
  }

  return {
    metrics,
    preset: activePreset,
    timestamp: timeStr,
    msg: `[Archie Civil AI — sazid63/archresidencebd-models]\nSuccessfully generated ${phase.nameEn} for ${name} in accordance with BNBC 2020 & RAJUK 2008 by-laws.`,
    userPrompt: `Generate BNBC 2020 structural parameters for ${phase.nameEn}.`,
  };
}

export function create4StoryBuildingProject(): BuildingProject {
  clearAllProjects();

  const name = "Sitalakshya Heritage (4-Storey)";
  const address = "Road 5, Dhanmondi, Dhaka";
  const stories = 4;
  const plotSize = 3.5;
  const id = `project-4story-${Date.now()}`;
  const plotSqm = plotToSqm(plotSize, "katha");
  const phases = generatePhasesForStories(stories);
  const now = new Date().toISOString();
  const timeStr = new Date().toLocaleTimeString();

  const populatedPhases = phases.map((p) => {
    const populated = populatePhaseMetrics(p, stories, plotSqm, plotSize, "preset-dual-3bed", name, 2, now, timeStr);
    return makeCompletedPhase(
      p, populated.metrics, populated.preset, populated.timestamp,
      `[Archie Civil AI]\nSystem reset: New 4-Storey project initialized according to BNBC 2020.`,
    );
  });

  const project: BuildingProject = {
    id, name, address, stories, plotSize, plotUnit: "katha",
    plotSqm: Math.round(plotSqm * 100) / 100, unitsPerFloor: 2,
    createdAt: now, updatedAt: now,
    phases: populatedPhases, designStarted: true, activePhaseId: "final",
    customization: createDefaultCustomization(),
  };

  saveActiveProject(project);
  return project;
}

export function create6StoryBuildingProject(): BuildingProject {
  clearAllProjects();

  const name = "Jamuna Crown Residence (6-Storey)";
  const address = "Sector 4, Road 12, Uttara, Dhaka";
  const stories = 6;
  const plotSize = 4.0;
  const id = `project-6story-${Date.now()}`;
  const plotSqm = plotToSqm(plotSize, "katha");
  const phases = generatePhasesForStories(stories);
  const now = new Date().toISOString();
  const timeStr = "10:01 AM";

  const populatedPhases = phases.map((p) => {
    const populated = populatePhaseMetrics(p, stories, plotSqm, plotSize, "preset-dual-3bed", name, 2, now, timeStr);
    return makeCompletedPhase(
      p, populated.metrics, populated.preset, populated.timestamp,
      `[Archie Civil AI — sazid63/archresidencebd-models]\nVerified ${p.nameEn} for ${name} (${stories} Stories, ${plotSize} Katha plot) in accordance with BNBC 2020 & RAJUK 2008 by-laws. 3D solid geometry recomputed.`,
      `User prompt for ${p.nameEn}: Please calculate BNBC 2020 metrics and structure preset-dual-3bed partition layout.`,
    );
  });

  const project: BuildingProject = {
    id, name, address, stories, plotSize, plotUnit: "katha",
    plotSqm: Math.round(plotSqm * 100) / 100, unitsPerFloor: 2,
    createdAt: now, updatedAt: now,
    phases: populatedPhases, designStarted: true, activePhaseId: "final",
    customization: createDefaultCustomization(),
  };

  saveActiveProject(project);
  return project;
}

// ─── Storage Operations ─────────────────────────────────────────────────

export function getActiveProject(): BuildingProject | null {
  if (typeof localStorage === "undefined") return null;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved) as BuildingProject; } catch { return null; }
  }
  return null;
}

export function saveActiveProject(project: BuildingProject): void {
  project.updatedAt = new Date().toISOString();
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    const all = getSavedProjects();
    const existingIdx = all.findIndex((p) => p.id === project.id);
    if (existingIdx >= 0) all[existingIdx] = project;
    else all.unshift(project);
    localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(all));
  }
}

export function getSavedProjects(): BuildingProject[] {
  if (typeof localStorage === "undefined") return [];
  const saved = localStorage.getItem(ALL_PROJECTS_KEY);
  if (saved) {
    try { return JSON.parse(saved) as BuildingProject[]; } catch { return []; }
  }
  return [];
}

export function deleteSavedProject(id: string): void {
  if (typeof localStorage === "undefined") return;
  const all = getSavedProjects().filter((p) => p.id !== id);
  localStorage.setItem(ALL_PROJECTS_KEY, JSON.stringify(all));
  const active = getActiveProject();
  if (active && active.id === id) {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearAllProjects(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ALL_PROJECTS_KEY);
  localStorage.removeItem("archres_projects_v1");
}

/**
 * Check whether all phases are completed to unlock design.
 */
export function areAllPhasesCompleted(project: BuildingProject): boolean {
  if (!project.phases || project.phases.length === 0) return false;
  return project.phases.every((p) => p.status === "completed");
}

/**
 * Calculate dynamic BOQ for a given project.
 * Produces price estimates based on PWD SOR 2022 rates.
 */
export function calculateDynamicBoq(project: BuildingProject) {
  const stories = project.stories || 2;
  const floorAreaSqm = project.plotSqm * 0.65; // 65% MGC
  const totalFloorAreaSqm = floorAreaSqm * stories;
  const totalFloorAreaSqft = totalFloorAreaSqm * 10.7639;

  const concreteVolumeM3 = Math.round(totalFloorAreaSqm * 0.38);
  const cementBags = Math.round(concreteVolumeM3 * 8.5);
  const rebarTons = Math.round((concreteVolumeM3 * 0.12) * 100) / 100;
  const sylhetSandM3 = Math.round(concreteVolumeM3 * 0.45);
  const stoneChipsM3 = Math.round(concreteVolumeM3 * 0.9);
  const brickCount = Math.round(totalFloorAreaSqft * 14);
  const masonDays = Math.round(stories * 45);
  const rodBinderDays = Math.round(stories * 35);
  const mixerDays = Math.round(stories * 12);

  const lines = [
    { key: "cement", label: { bn: "OPC সিমেন্ট (৫০ কেজি ব্যাগ)", en: "OPC Cement (50kg bag)" }, phase: "foundation", costType: "material" as const, unit: "bag", quantity: cementBags, rateBdt: 640, amountBdt: cementBags * 640, priced: true, provenance: "PWD SOR 2022" },
    { key: "rebar", label: { bn: "বি৫০০ রড / ৬০-গ্রেড রিবার (৭২.৫জি)", en: "Rebar B500 / 60-Grade (72.5G)" }, phase: "foundation", costType: "material" as const, unit: "ton", quantity: rebarTons, rateBdt: 94000, amountBdt: Math.round(rebarTons * 94000), priced: true, provenance: "PWD SOR 2022" },
    { key: "sylhet_sand", label: { bn: "সিলেট বালু (এফএম ২.৫)", en: "Sylhet Sand (FM 2.5)" }, phase: "foundation", costType: "material" as const, unit: "m³", quantity: sylhetSandM3, rateBdt: 2800, amountBdt: sylhetSandM3 * 2800, priced: true, provenance: "PWD SOR 2022" },
    { key: "stone_chips", label: { bn: "পাথর কুচি (২০ মিমি ডাউন)", en: "Stone Chips (20mm down)" }, phase: "foundation", costType: "material" as const, unit: "m³", quantity: stoneChipsM3, rateBdt: 3400, amountBdt: stoneChipsM3 * 3400, priced: true, provenance: "PWD SOR 2022" },
    { key: "bricks", label: { bn: "১ম শ্রেণীর ইট (গাঁথুনি ও খোঁয়া)", en: "1st Class Bricks (Walls & Khoa)" }, phase: "floor", costType: "material" as const, unit: "pcs", quantity: brickCount, rateBdt: 14.5, amountBdt: Math.round(brickCount * 14.5), priced: true, provenance: "PWD SOR 2022" },
    { key: "mason", label: { bn: "রাজমিস্ত্রি (প্রতি দিন)", en: "Head Mason / Mason (daily wage)" }, phase: "floor", costType: "labour" as const, unit: "day", quantity: masonDays, rateBdt: 950, amountBdt: masonDays * 950, priced: true, provenance: "PWD SOR Labour Schedule" },
    { key: "rod_binder", label: { bn: "রড মিস্ত্রি / বাইন্ডার", en: "Rod Binder (daily wage)" }, phase: "floor", costType: "labour" as const, unit: "day", quantity: rodBinderDays, rateBdt: 900, amountBdt: rodBinderDays * 900, priced: true, provenance: "PWD SOR Labour Schedule" },
    { key: "concrete_mixer", label: { bn: "কংক্রিট মিক্সার মেশিন ও ভাইব্রেটর", en: "Concrete Mixer & Needle Vibrator" }, phase: "floor", costType: "machinery" as const, unit: "day", quantity: mixerDays, rateBdt: 2200, amountBdt: mixerDays * 2200, priced: true, provenance: "Machinery Hire Schedule" },
  ];

  const totalAmountBdt = lines.reduce((sum, line) => sum + line.amountBdt, 0);
  const byPhase: Record<string, number> = {};
  const byCostType: Record<string, number> = {};
  for (const line of lines) {
    byPhase[line.phase] = (byPhase[line.phase] || 0) + line.amountBdt;
    byCostType[line.costType] = (byCostType[line.costType] || 0) + line.amountBdt;
  }

  return {
    lines,
    totals: { amountBdt: totalAmountBdt, pricedLines: lines.length, unpricedLines: [] },
    subtotals: { byPhase, byCostType },
    rateCard: { cardId: "pwd-sor-2022-civil-works", region: "Dhaka & Major Metros", effectiveFrom: "2026-01-01" },
  };
}

// Re-export from the shared types module so existing imports from projectState still work
export {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";

// Re-export types for backward compatibility
export type {
  AccessibilitySettings,
  SustainabilitySettings,
  FireSafetySettings,
  ValueEngineeringSettings,
  ConstructionMgmtSettings,
} from "../types/customization";