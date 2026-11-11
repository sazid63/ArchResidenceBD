/**
 * Central State Management for ArchResidenceBD
 *
 * Dynamically computes building phases based on the user's stories count,
 * tracks phase interview dialogues, calculated structural parameters,
 * design generation state, and dynamic PWD BOQ pricing.
 */

import { basicsPhase } from "../interview/chat";
import { applyLegacy, specToLegacy } from "../model/legacyAdapter";
import type { V2Project } from "../model/legacyV2";
import { migrateV2 } from "../model/migrate";
import type { ProjectSpec } from "../model/projectSpec";
import { getActiveProjectId, loadProjects, saveProjects, setActiveProjectId, STORAGE_KEYS, upsertProject, type KeyValueStore } from "../model/projectStore";
import type { Deviation } from "../spec.gen";
import type { BuildingCustomization } from "../types/customization";
import { mergeImported } from "../model/projectFile";
import { FEET_TO_M, planChoices } from "../model/planChoices";
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
  kind: "setup" | "site" | "foundation" | "ground_floor" | "floor" | "roof" | "utility";
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
  /**
   * Full customization bundle — drives mesh generation, BOQ, and all optional
   * features (accessibility, sustainability, fire safety, value engineering,
   * construction management). Optional for backward compatibility.
   */
  customization?: BuildingCustomization;
  /** The plot's real shape and access road (2.6, M2-4). Absent in older saves: ask, never guess. */
  plot?: {
    frontageM: number;
    depthM: number;
    roadWidthM: number;
    roadSide: "north" | "south" | "east" | "west";
    cornerPlot?: boolean;
  };
  /** Plan from `src/plans/library.ts` chosen for this plot. */
  planId?: string;
  /** Flip the plan left-right. */
  mirror?: boolean;
  /** Known deviations the owner recorded on the Compliance screen (a note, never a pass). */
  deviations?: Deviation[];
}

/** Time-ordered and unique even when two projects are created in the same millisecond. */
function uniqueSuffix(): string {
  const rand =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}`;
}

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

  phases.push(basicsPhase() as PhaseItem);
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
  plot?: BuildingProject["plot"];
  planId?: string;
  mirror?: boolean;
}): BuildingProject {
  const id = `project-${uniqueSuffix()}`;
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
    ...(params.plot ? { plot: params.plot } : {}),
    ...(params.planId ? { planId: params.planId } : {}),
    ...(params.mirror ? { mirror: true } : {}),
  };

  saveActiveProject(project);
  return project;
}

export function generateRandomBuildingProject(): BuildingProject {
  // Dhaka (RAJUK) plots; each is sized so at least one library plan fits.
  const archetypes = [
    { name: "Banani Family House (6-Storey)", address: "Road 11, Banani, Dhaka", stories: 6, frontageFt: 40, depthFt: 65, roadFt: 20, unitsPerFloor: 1 },
    { name: "Uttara Executive Residence (7-Storey)", address: "Sector 4, Uttara, Dhaka", stories: 7, frontageFt: 45, depthFt: 70, roadFt: 25, unitsPerFloor: 1 },
    { name: "Purbachal Villa (2-Storey)", address: "Sector 1, Purbachal, Dhaka", stories: 2, frontageFt: 40, depthFt: 65, roadFt: 30, unitsPerFloor: 1 },
    { name: "Dhanmondi Two-Flat Block (6-Storey)", address: "Road 5, Dhanmondi, Dhaka", stories: 6, frontageFt: 45, depthFt: 80, roadFt: 20, unitsPerFloor: 2 },
    { name: "Gulshan Wide-Plot Block (8-Storey)", address: "Road 71, Gulshan 2, Dhaka", stories: 8, frontageFt: 60, depthFt: 60, roadFt: 30, unitsPerFloor: 2 },
    { name: "Mirpur Residential Block (5-Storey)", address: "Section 10, Mirpur, Dhaka", stories: 5, frontageFt: 45, depthFt: 80, roadFt: 20, unitsPerFloor: 2 },
  ];

  const selected = archetypes[Math.floor(Math.random() * archetypes.length)];
  const { name, address, stories, unitsPerFloor } = selected;
  const frontageM = Math.round(selected.frontageFt * FEET_TO_M * 100) / 100;
  const depthM = Math.round(selected.depthFt * FEET_TO_M * 100) / 100;
  const roadWidthM = Math.round(selected.roadFt * FEET_TO_M * 100) / 100;
  const planId = planChoices(frontageM, depthM, { unitsPerFloor, storeys: stories }).find((c) => c.fit.ok)?.plan.id;
  const id = `project-rand-${uniqueSuffix()}`;
  const plotSqm = frontageM * depthM;
  const plotSize = Math.round((plotSqm / 66.89) * 100) / 100;
  const phases = generatePhasesForStories(stories);
  const now = new Date().toISOString();
  const timeStr = "10:01 AM";

  const populatedPhases = phases.map((p) => {
    const populated = populatePhaseMetrics(p, stories, plotSqm, plotSize, planId ?? "", name, unitsPerFloor, now, timeStr);
    return makeCompletedPhase(p, populated.metrics, populated.preset, populated.timestamp, populated.msg, populated.userPrompt);
  });

  const project: BuildingProject = {
    id, name, address, stories, plotSize, plotUnit: "katha",
    plotSqm: Math.round(plotSqm * 100) / 100, unitsPerFloor,
    createdAt: now, updatedAt: now,
    phases: populatedPhases, designStarted: true, activePhaseId: "final",
    customization: createDefaultCustomization(),
    plot: { frontageM, depthM, roadWidthM, roadSide: "south" },
    ...(planId ? { planId } : {}),
  };
  saveActiveProject(project);
  return project;
}

/** Helper: populate phase metrics based on phase kind. */
function populatePhaseMetrics(  phase: PhaseItem, stories: number, plotSqm: number, plotSize: number, preset: string,
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
    msg: `[Phase Planner]\nPlanned ${phase.nameEn} for ${name} in accordance with BNBC 2020 & RAJUK 2008 by-laws.`,
    userPrompt: `Plan ${phase.nameEn} for ${name}.`,
  };
}

/**
 * The project a fresh install opens on: a 4-storey block with two flats per floor on a real plot (18 x 28 m, 9 m road),
 * with a plan that fits and keeps within the RAJUK ground-coverage limit. Its phases are not started: nothing is
 * pre-answered, so the guided interview and every screen work as for a project the user made.
 * Adds the demo; never clears saved projects (v2 wiped them all here on every fresh start).
 */
export function create4StoryBuildingProject(): BuildingProject {
  const frontageM = 18;
  const depthM = 28;
  const roadWidthM = 9;
  const stories = 4;
  const choices = planChoices(frontageM, depthM, { unitsPerFloor: 2, storeys: stories, roadWidthM });
  const pick = choices.find((c) => c.fit.ok && c.coverage?.status !== "fail") ?? choices.find((c) => c.fit.ok);
  const areaSqm = frontageM * depthM;
  return createNewProject({
    name: "Sample block (4 storeys)",
    stories,
    plotSize: Math.round((areaSqm / plotToSqm(1, "katha")) * 10) / 10,
    plotUnit: "katha",
    unitsPerFloor: 2,
    address: "Dhaka",
    plot: { frontageM, depthM, roadWidthM, roadSide: "south" },
    ...(pick ? { planId: pick.plan.id } : {}),
  });
}

// ─── Storage Operations ─────────────────────────────────────────────────
//
// The screens still read and write the project shape above, but the data lives in the v3 store
// (src/model/projectStore.ts): every call below goes through the legacy adapter. A browser that
// still holds v2 saves is migrated once, on first load, and the v2 keys are left untouched as a backup.

function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // blocked storage (private window, denied site data)
  }
}

/** Storage can throw (private window, denied site data, quota): reads give the fallback, writes are dropped. */
function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** The v3 projects, migrating v2 saves into the v3 keys the first time. */
function loadSpecs(store: KeyValueStore): ProjectSpec[] {
  const loaded = loadProjects(store);
  if (loaded.source === "v2") {
    saveProjects(store, loaded.projects);
    let active: string | null = null;
    try {
      const v2 = JSON.parse(store.getItem(STORAGE_KEYS.v2Active) ?? "null") as { id?: unknown } | null;
      if (v2 && typeof v2.id === "string") active = v2.id;
    } catch {
      /* a damaged v2 active key: fall through to the most recent */
    }
    const pick = loaded.projects.find((s) => s.project.id === active) ?? [...loaded.projects].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
    if (pick) setActiveProjectId(store, pick.project.id);
  }
  return loaded.projects;
}

export function getActiveProject(): BuildingProject | null {
  const store = browserStore();
  if (!store) return null;
  return guard(() => {
    const specs = loadSpecs(store); // first: a first load migrates v2 saves and sets the active id
    const id = getActiveProjectId(store);
    const spec = specs.find((s) => s.project.id === id);
    return spec ? specToLegacy(spec) : null;
  }, null);
}

/** The open project as the v3 spec (the guided interview reads and writes this). */
export function getActiveSpec(): ProjectSpec | null {
  const store = browserStore();
  if (!store) return null;
  return guard(() => {
    const specs = loadSpecs(store);
    const id = getActiveProjectId(store);
    return specs.find((s) => s.project.id === id) ?? null;
  }, null);
}

/** Save a spec as the open project (bumps its revision). */
export function saveActiveSpec(spec: ProjectSpec): ProjectSpec | null {
  const store = browserStore();
  if (!store) return null;
  return guard(() => {
    const saved = upsertProject(store, spec);
    setActiveProjectId(store, saved.project.id);
    return saved;
  }, null);
}

export function saveActiveProject(project: BuildingProject): void {
  project.updatedAt = new Date().toISOString();
  const store = browserStore();
  if (!store) return;
  guard(() => {
    const existing = loadSpecs(store).find((s) => s.project.id === project.id);
    const base = existing ?? migrateV2(project as unknown as V2Project, project.updatedAt);
    const saved = upsertProject(store, applyLegacy(base, project), project.updatedAt);
    setActiveProjectId(store, saved.project.id);
  }, undefined);
}

/**
 * Make a saved project the open one without modifying it: the given id, or else the most
 * recently changed. Returns it, or null when nothing is saved.
 */
export function activateSavedProject(id?: string): BuildingProject | null {
  const store = browserStore();
  if (!store) return null;
  return guard(() => {
    const all = loadSpecs(store);
    const pick = id ? all.find((s) => s.project.id === id) : [...all].sort((x, y) => (y.updatedAt || "").localeCompare(x.updatedAt || ""))[0];
    if (!pick) return null;
    setActiveProjectId(store, pick.project.id);
    return specToLegacy(pick);
  }, null);
}

export function getSavedProjects(): BuildingProject[] {
  const store = browserStore();
  return store ? guard(() => loadSpecs(store).map(specToLegacy), []) : [];
}

/** Every saved project as the v3 spec (what a project file holds). */
export function getSavedSpecs(): ProjectSpec[] {
  const store = browserStore();
  return store ? guard(() => loadSpecs(store), []) : [];
}

/** Add imported projects to the saved ones without overwriting any (see mergeImported). Returns how many were added. */
export function addImportedSpecs(imported: ProjectSpec[]): number {
  const store = browserStore();
  if (!store) return 0;
  return guard(() => {
    const { merged, added } = mergeImported(loadSpecs(store), imported, () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    saveProjects(store, merged);
    return added.length;
  }, 0);
}

export function deleteSavedProject(id: string): void {
  const store = browserStore();
  if (!store) return;
  guard(() => {
    saveProjects(store, loadSpecs(store).filter((s) => s.project.id !== id));
    if (getActiveProjectId(store) === id) store.removeItem(STORAGE_KEYS.activeId);
  }, undefined);
}

export function clearAllProjects(): void {
  const store = browserStore();
  if (!store) return;
  guard(() => {
    saveProjects(store, []);
    store.removeItem(STORAGE_KEYS.activeId);
  }, undefined);
}

/**
 * Check whether all phases are completed to unlock design.
 */
export function areAllPhasesCompleted(project: BuildingProject): boolean {
  if (!project.phases || project.phases.length === 0) return false;
  return project.phases.every((p) => p.status === "completed");
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