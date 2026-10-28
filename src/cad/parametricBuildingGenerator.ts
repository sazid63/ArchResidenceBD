/**
 * Parametric 3D Building Mesh Generator for ArchResidenceBD
 *
 * Dynamically synthesizes watertight 3D solid geometry for residential buildings
 * in Bangladesh according to BNBC 2020 structural standards.
 * Supports arbitrary stories (2, 4, 6, 8+), plot dimensions, column grids,
 * footing pads, grade beams, floor slabs, external walls, balconies, and rooftops.
 */

import { MeshDocument, MeshObject } from "./mesh";
import { BuildingProject } from "../engine/projectState";
import { ARCHITECTURAL_ASSETS } from "./assetsLibrary";
import { FLOORPLAN_PRESETS } from "../data/floorplanPresets";

/**
 * Generates vertices, normals, and indices for an axis-aligned 3D box solid.
 */
export function createBoxMesh(
  id: string,
  label: string,
  kind: string,
  phase: string,
  x1: number,
  y1: number,
  z1: number,
  x2: number,
  y2: number,
  z2: number,
): MeshObject {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  const minZ = Math.min(z1, z2);
  const maxZ = Math.max(z1, z2);

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const volumeMm3 = dx * dy * dz;

  // 6 faces * 4 vertices = 24 vertices
  const positions: number[] = [
    // Front (+Y)
    minX, maxY, minZ,
    maxX, maxY, minZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ,
    // Back (-Y)
    maxX, minY, minZ,
    minX, minY, minZ,
    minX, minY, maxZ,
    maxX, minY, maxZ,
    // Top (+Z)
    minX, minY, maxZ,
    maxX, minY, maxZ,
    maxX, maxY, maxZ,
    minX, maxY, maxZ,
    // Bottom (-Z)
    minX, maxY, minZ,
    maxX, maxY, minZ,
    maxX, minY, minZ,
    minX, minY, minZ,
    // Right (+X)
    maxX, minY, minZ,
    maxX, maxY, minZ,
    maxX, maxY, maxZ,
    maxX, minY, maxZ,
    // Left (-X)
    minX, maxY, minZ,
    minX, minY, minZ,
    minX, minY, maxZ,
    minX, maxY, maxZ,
  ];

  const normals: number[] = [
    // Front
    0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
    // Back
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Top
    0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
    // Bottom
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Right
    1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
    // Left
    -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
  ];

  const indices: number[] = [];
  for (let f = 0; f < 6; f++) {
    const base = f * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return {
    id,
    label,
    kind,
    phase,
    volumeMm3,
    bboxMinMm: [minX, minY, minZ],
    bboxMaxMm: [maxX, maxY, maxZ],
    positions,
    normals,
    indices,
  };
}

/**
 * Helper to synthesize oriented 3D Door Mesh (frame, leaf panel, handle)
 */
export function createDoor3DMesh(
  baseId: string,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  orientation: "X" | "Y",
  kind: string,
  phase: string,
): MeshObject[] {
  const objects: MeshObject[] = [];
  const isGlass = kind === "balcony";
  const frameThick = 40;

  if (orientation === "X") {
    // Frame Left
    objects.push(createBoxMesh(`${baseId}_frm_l`, "Door Frame Left", "door_frame", phase, x, y, z, x + frameThick, y + depth, z + height));
    // Frame Right
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Door Frame Right", "door_frame", phase, x + width - frameThick, y, z, x + width, y + depth, z + height));
    // Frame Top Lintel
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Door Frame Lintel", "door_frame", phase, x, y, z + height - frameThick, x + width, y + depth, z + height));

    // Panel Leaf
    if (isGlass) {
      objects.push(createBoxMesh(`${baseId}_leaf`, "Balcony Sliding Glass Door", "window", phase, x + frameThick, y + depth / 2 - 15, z, x + width - frameThick, y + depth / 2 + 15, z + height - frameThick));
    } else {
      objects.push(createBoxMesh(`${baseId}_leaf`, "Teak Solid Door Panel", "door", phase, x + frameThick, y + 20, z, x + width - frameThick, y + depth - 20, z + height - frameThick));
      // Brass Handle
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "railing", phase, x + width - 120, y + depth + 5, z + 950, x + width - 90, y + depth + 35, z + 1070));
    }
  } else {
    // Orientation Y
    // Frame Front
    objects.push(createBoxMesh(`${baseId}_frm_f`, "Door Frame Front", "door_frame", phase, x, y, z, x + depth, y + frameThick, z + height));
    // Frame Rear
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Door Frame Rear", "door_frame", phase, x, y + width - frameThick, z, x + depth, y + width, z + height));
    // Frame Top Lintel
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Door Frame Lintel", "door_frame", phase, x, y, z + height - frameThick, x + depth, y + width, z + height));

    // Panel Leaf
    if (isGlass) {
      objects.push(createBoxMesh(`${baseId}_leaf`, "Balcony Sliding Glass Door", "window", phase, x + depth / 2 - 15, y + frameThick, z, x + depth / 2 + 15, y + width - frameThick, z + height - frameThick));
    } else {
      objects.push(createBoxMesh(`${baseId}_leaf`, "Teak Solid Door Panel", "door", phase, x + 20, y + frameThick, z, x + depth - 20, y + width - frameThick, z + height - frameThick));
      // Brass Handle
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "railing", phase, x + depth + 5, y + width - 120, z + 950, x + depth + 35, y + width - 90, z + 1070));
    }
  }
  return objects;
}

/**
 * Helper to synthesize oriented 3D Window Mesh (concrete sill, frame, glass pane)
 */
export function createWindow3DMesh(
  baseId: string,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
  height: number,
  orientation: "X" | "Y",
  isLouvre: boolean,
  phase: string,
): MeshObject[] {
  const objects: MeshObject[] = [];
  const frameThick = 40;

  if (orientation === "X") {
    // Concrete Sill Slab
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "slab", phase, x - 30, y - 20, z - 60, x + width + 30, y + depth + 20, z));
    // Frame Left
    objects.push(createBoxMesh(`${baseId}_frm_l`, "Window Channel Left", "wall", phase, x, y, z, x + frameThick, y + depth, z + height));
    // Frame Right
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Right", "wall", phase, x + width - frameThick, y, z, x + width, y + depth, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "wall", phase, x, y, z + height - frameThick, x + width, y + depth, z + height));

    if (isLouvre) {
      // 3 Louver blades
      for (let i = 0; i < 3; i++) {
        objects.push(createBoxMesh(`${baseId}_blade_${i + 1}`, `Frosted Louver Blade ${i + 1}`, "window", phase, x + frameThick, y + 15, z + 60 + i * 160, x + width - frameThick, y + depth - 15, z + 100 + i * 160));
      }
    } else {
      // 2 Sliding Glass Panes
      objects.push(createBoxMesh(`${baseId}_pane_1`, "Left Sliding Glass Pane", "window", phase, x + frameThick, y + 20, z + 30, x + width / 2 + 10, y + depth - 25, z + height - 30));
      objects.push(createBoxMesh(`${baseId}_pane_2`, "Right Sliding Glass Pane", "window", phase, x + width / 2 - 10, y + 25, z + 30, x + width - frameThick, y + depth - 20, z + height - 30));
    }
  } else {
    // Orientation Y
    // Concrete Sill Slab
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "slab", phase, x - 20, y - 30, z - 60, x + depth + 20, y + width + 30, z));
    // Frame Front
    objects.push(createBoxMesh(`${baseId}_frm_f`, "Window Channel Front", "wall", phase, x, y, z, x + depth, y + frameThick, z + height));
    // Frame Rear
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Rear", "wall", phase, x, y + width - frameThick, z, x + depth, y + width, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "wall", phase, x, y, z + height - frameThick, x + depth, y + width, z + height));

    if (isLouvre) {
      // 3 Louver blades
      for (let i = 0; i < 3; i++) {
        objects.push(createBoxMesh(`${baseId}_blade_${i + 1}`, `Frosted Louver Blade ${i + 1}`, "window", phase, x + 15, y + frameThick, z + 60 + i * 160, x + depth - 15, y + width - frameThick, z + 100 + i * 160));
      }
    } else {
      // 2 Sliding Glass Panes
      objects.push(createBoxMesh(`${baseId}_pane_1`, "Front Sliding Glass Pane", "window", phase, x + 20, y + frameThick, z + 30, x + depth - 25, y + width / 2 + 10, z + height - 30));
      objects.push(createBoxMesh(`${baseId}_pane_2`, "Rear Sliding Glass Pane", "window", phase, x + 25, y + width / 2 - 10, z + 30, x + depth - 20, y + width - frameThick, z + height - 30));
    }
  }
  return objects;
}

export interface BuildingCustomization {
  columnWidthMm?: number;
  columnDepthMm?: number;
  footingSizeMm?: number;
  footingDepthMm?: number;
  balconyDepthMm?: number;
}

/**
 * Builds the complete 3D parametric building model from project parameters.
 */
export function generateBuildingMesh(
  project: BuildingProject,
  phaseFilter?: string, // e.g. "phase-foundation", "phase-ground-floor", "phase-floor-1", or "final"
  custom?: BuildingCustomization,
): MeshDocument {
  const stories = Math.max(1, project.stories || 2);
  const plotSqm = project.plotSqm || 200; // e.g. 200 m2 (3 katha)

  // Derive plot dimensions in mm (assume standard ~1:1.2 aspect ratio in Dhaka/Chittagong)
  const plotSide = Math.sqrt(plotSqm);
  const plotWidthMm = Math.round(plotSide * 0.9 * 1000);
  const plotDepthMm = Math.round(plotSide * 1.1 * 1000);

  // Setbacks according to RAJUK 2008
  const frontSetbackMm = 1500;
  const rearSetbackMm = 2000;
  const sideSetbackMm = 1000;

  // Building footprint in mm
  const bldgMinX = sideSetbackMm;
  const bldgMaxX = Math.max(bldgMinX + 7000, plotWidthMm - sideSetbackMm);
  const bldgMinY = rearSetbackMm;
  const bldgMaxY = Math.max(bldgMinY + 8000, plotDepthMm - frontSetbackMm);

  const bldgWidthMm = bldgMaxX - bldgMinX;
  const bldgLengthMm = bldgMaxY - bldgMinY;

  // Structural Column Grid (4 columns in X, 3 columns in Y = 12 columns)
  const colsX = 4;
  const colsY = 3;
  const spanX = bldgWidthMm / (colsX - 1);
  const spanY = bldgLengthMm / (colsY - 1);

  const colSizeX = custom?.columnWidthMm || (stories >= 6 ? 350 : 250);
  const colSizeY = custom?.columnDepthMm || (stories >= 6 ? 350 : 250);
  const footingPadSize = custom?.footingSizeMm || (stories >= 6 ? 2000 : 1800);
  const footingDepth = custom?.footingDepthMm || (stories >= 6 ? 2000 : 1600);
  const storyHeightMm = 3000;
  const slabThickMm = 125;
  const beamDepthMm = 450;
  const beamWidthMm = 250;
  const balconyDepth = custom?.balconyDepthMm || 1200;

  // Frame Boundaries (Outer faces of columns/beams)
  const frameMinX = bldgMinX - colSizeX / 2;
  const frameMaxX = bldgMaxX + colSizeX / 2;
  const frameMinY = bldgMinY - colSizeY / 2;
  const frameMaxY = bldgMaxY + colSizeY / 2;

  // Professional Architectural Wall Thicknesses (Standard BNBC)
  const EXT_WALL_THICK = 250; // 10 inch outer walls
  const INT_WALL_THICK = 125; // 5 inch partition walls

  const allObjects: MeshObject[] = [];
  const isFoundationView = phaseFilter?.includes("foundation") || phaseFilter?.includes("site");

  // ==========================================
  // 1. FOUNDATION PHASE (Z = -footingDepth to 0)
  // ==========================================
  // Show excavation trench ONLY in Foundation 3D isolation view, NOT in Master 3D view
  if (isFoundationView) {
    allObjects.push(
      createBoxMesh(
        "excavation_pit",
        "Site Excavation Pit Base",
        "excavation",
        "foundation",
        bldgMinX - 800,
        bldgMinY - 800,
        -footingDepth - 150,
        bldgMaxX + 800,
        bldgMaxY + 800,
        -footingDepth,
      ),
    );
  }

  // 12 Footing Pads & Pedestal Stubs under each grid column
  for (let ix = 0; ix < colsX; ix++) {
    for (let iy = 0; iy < colsY; iy++) {
      const cx = bldgMinX + ix * spanX;
      const cy = bldgMinY + iy * spanY;
      const fId = `footing_F${ix + 1}_${iy + 1}`;

      // Concrete Footing Pad (450mm thick)
      allObjects.push(
        createBoxMesh(
          fId,
          `Footing Pad ${ix + 1}-${iy + 1}`,
          "footing",
          "foundation",
          cx - footingPadSize / 2,
          cy - footingPadSize / 2,
          -footingDepth,
          cx + footingPadSize / 2,
          cy + footingPadSize / 2,
          -footingDepth + 450,
        ),
      );

      // Pedestal Column Stub (rising from footing pad to ground level 0)
      allObjects.push(
        createBoxMesh(
          `stub_${ix + 1}_${iy + 1}`,
          `Pedestal Stub ${ix + 1}-${iy + 1}`,
          "column",
          "foundation",
          cx - (colSizeX + 50) / 2,
          cy - (colSizeY + 50) / 2,
          -footingDepth + 450,
          cx + (colSizeX + 50) / 2,
          cy + (colSizeY + 50) / 2,
          0,
        ),
      );
    }
  }

  // Grade Beams / Plinth Tie Beams along grid lines connecting columns
  for (let iy = 0; iy < colsY; iy++) {
    const cy = bldgMinY + iy * spanY;
    allObjects.push(
      createBoxMesh(
        `grade_beam_x_${iy + 1}`,
        `Grade Beam X Line ${iy + 1}`,
        "beam",
        "foundation",
        bldgMinX,
        cy - beamWidthMm / 2,
        -beamDepthMm,
        bldgMaxX,
        cy + beamWidthMm / 2,
        0,
      ),
    );
  }
  for (let ix = 0; ix < colsX; ix++) {
    const cx = bldgMinX + ix * spanX;
    allObjects.push(
      createBoxMesh(
        `grade_beam_y_${ix + 1}`,
        `Grade Beam Y Line ${ix + 1}`,
        "beam",
        "foundation",
        cx - beamWidthMm / 2,
        bldgMinY,
        -beamDepthMm,
        cx + beamWidthMm / 2,
        bldgMaxY,
        0,
      ),
    );
  }

  // ==========================================
  // 2. GROUND FLOOR (Z = 0 to 3000mm)
  // ==========================================
  // Ground Reinforced Concrete Pavement Slab (150mm thick)
  allObjects.push(
    createBoxMesh(
      "ground_slab",
      "Ground Floor RCC Pavement & Driveway",
      "slab",
      "ground_floor",
      frameMinX - 300,
      frameMinY - 300,
      0,
      frameMaxX + 300,
      frameMaxY + 300,
      150,
    ),
  );

  // Plinth Wall (450mm elevated finish level above road driveway)
  allObjects.push(
    createBoxMesh(
      "plinth_wall",
      "Elevated Plinth Wall (450mm above driveway)",
      "wall",
      "ground_floor",
      frameMinX - 50,
      frameMinY - 50,
      150,
      frameMaxX + 50,
      frameMaxY + 50,
      600,
    ),
  );

  // Main Entry Steps (3 steps rising to plinth level)
  for (let s = 0; s < 3; s++) {
    allObjects.push(
      createBoxMesh(
        `plinth_step_${s + 1}`,
        `Entrance Step ${s + 1}`,
        "stair",
        "ground_floor",
        bldgMinX + spanX * 1.5,
        bldgMaxY + 300 + (3 - s) * 250,
        s * 150,
        bldgMinX + spanX * 2.5,
        bldgMaxY + 300 + (4 - s) * 250,
        (s + 1) * 150,
      ),
    );
  }

  // Underground Septic Tank (18.5 m3)
  allObjects.push(
    createBoxMesh(
      "ug_septic_tank",
      "Underground RCC Septic Tank (18.5 m³)",
      "tank",
      "ground_floor",
      bldgMinX - 2500,
      bldgMinY,
      -2200,
      bldgMinX - 500,
      bldgMinY + 3000,
      -200,
    ),
  );

  // Underground Water Reservoir (25,000 Liters)
  allObjects.push(
    createBoxMesh(
      "ug_water_reservoir",
      "Underground Water Reservoir (25,000 Liters)",
      "tank",
      "ground_floor",
      bldgMaxX + 500,
      bldgMinY,
      -2500,
      bldgMaxX + 3000,
      bldgMinY + 3500,
      -200,
    ),
  );

  // Ground Floor Columns
  for (let ix = 0; ix < colsX; ix++) {
    for (let iy = 0; iy < colsY; iy++) {
      const cx = bldgMinX + ix * spanX;
      const cy = bldgMinY + iy * spanY;
      allObjects.push(
        createBoxMesh(
          `col_g_${ix + 1}_${iy + 1}`,
          `Ground Column C${ix + 1}-${iy + 1}`,
          "column",
          "ground_floor",
          cx - colSizeX / 2,
          cy - colSizeY / 2,
          150,
          cx + colSizeX / 2,
          cy + colSizeY / 2,
          storyHeightMm,
        ),
      );
    }
  }

  // Guard Room & Security Gate Post
  allObjects.push(
    createBoxMesh(
      "guard_room",
      "Security Guard Post & Caretaker Office",
      "wall",
      "ground_floor",
      bldgMinX,
      bldgMinY,
      150,
      bldgMinX + 2400,
      bldgMinY + 2800,
      storyHeightMm,
    ),
  );

  // Ground Entrance Canopy (Porch Roof over main entry)
  allObjects.push(
    createBoxMesh(
      "entrance_canopy",
      "Main Entrance Portico & Canopy",
      "canopy",
      "ground_floor",
      bldgMinX + spanX * 1.2,
      bldgMaxY,
      2600,
      bldgMinX + spanX * 2.8,
      bldgMaxY + 1500,
      2725,
    ),
  );
  // Canopy Support Pillars
  allObjects.push(
    createBoxMesh(
      "canopy_pillar_1",
      "Canopy Left Pillar",
      "column",
      "ground_floor",
      bldgMinX + spanX * 1.3,
      bldgMaxY + 1350,
      150,
      bldgMinX + spanX * 1.3 + 200,
      bldgMaxY + 1500,
      2600,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "canopy_pillar_2",
      "Canopy Right Pillar",
      "column",
      "ground_floor",
      bldgMinX + spanX * 2.7 - 200,
      bldgMaxY + 1350,
      150,
      bldgMinX + spanX * 2.7,
      bldgMaxY + 1500,
      2600,
    ),
  );

  // Modular Asset Insertions for Ground Floor
  const mainDoorAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "door-main-teak");
  if (mainDoorAsset) {
    allObjects.push(
      ...mainDoorAsset.generateMesh(
        "g_main_door",
        bldgMinX + spanX * 2,
        bldgMaxY - 125,
        150,
        "ground_floor",
      ),
    );
  }

  const guardWinAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "win-sliding-std");
  if (guardWinAsset) {
    allObjects.push(
      ...guardWinAsset.generateMesh(
        "g_guard_win",
        bldgMinX + 500,
        bldgMinY - 20,
        1200,
        "ground_floor",
      ),
    );
  }

  const stairAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "stair-doglegged-rcc");
  if (stairAsset) {
    allObjects.push(
      ...stairAsset.generateMesh(
        "g_staircase",
        bldgMinX + spanX * 1.1,
        bldgMinY + spanY * 0.8,
        150,
        "ground_floor",
      ),
    );
  }

  // ==========================================
  // 3. UPPER STORIES (Floors 1 to Stories - 1)
  // ==========================================
  for (let s = 1; s < stories; s++) {
    const floorZ = s * storyHeightMm;
    const nextZ = (s + 1) * storyHeightMm;
    const phaseKey = `floor_${s}`;

    // Floor Slab (125mm)
    allObjects.push(
      createBoxMesh(
        `slab_f${s}`,
        `Floor ${s} RCC Slab (125mm)`,
        "slab",
        phaseKey,
        frameMinX,
        frameMinY,
        floorZ,
        frameMaxX,
        frameMaxY,
        floorZ + slabThickMm,
      ),
    );

    // Cantilever Balcony (Front Projection)
    allObjects.push(
      createBoxMesh(
        `balcony_front_f${s}`,
        `Floor ${s} Front Balcony`,
        "balcony",
        phaseKey,
        frameMinX + spanX * 0.4,
        frameMaxY,
        floorZ,
        frameMaxX - spanX * 0.4,
        frameMaxY + balconyDepth,
        floorZ + slabThickMm,
      ),
    );

    // Cantilever Balcony Railing (Modern Crystal Tinted Glass & Steel)
    allObjects.push(
      createBoxMesh(
        `balcony_railing_f${s}`,
        `Floor ${s} Front Balcony Glass/Steel Railing`,
        "railing",
        phaseKey,
        frameMinX + spanX * 0.4,
        frameMaxY + balconyDepth - 60,
        floorZ + slabThickMm,
        frameMaxX - spanX * 0.4,
        frameMaxY + balconyDepth,
        floorZ + slabThickMm + 900,
      ),
    );
    // Left Balcony Return Railing
    allObjects.push(
      createBoxMesh(
        `balcony_railing_left_f${s}`,
        `Floor ${s} Balcony Left Railing Return`,
        "railing",
        phaseKey,
        frameMinX + spanX * 0.4,
        frameMaxY,
        floorZ + slabThickMm,
        frameMinX + spanX * 0.4 + 60,
        frameMaxY + balconyDepth,
        floorZ + slabThickMm + 900,
      ),
    );
    // Right Balcony Return Railing
    allObjects.push(
      createBoxMesh(
        `balcony_railing_right_f${s}`,
        `Floor ${s} Balcony Right Railing Return`,
        "railing",
        phaseKey,
        frameMaxX - spanX * 0.4 - 60,
        frameMaxY,
        floorZ + slabThickMm,
        frameMaxX - spanX * 0.4,
        frameMaxY + balconyDepth,
        floorZ + slabThickMm + 900,
      ),
    );

    // Columns for this story (12 structural columns)
    for (let ix = 0; ix < colsX; ix++) {
      for (let iy = 0; iy < colsY; iy++) {
        const cx = bldgMinX + ix * spanX;
        const cy = bldgMinY + iy * spanY;
        allObjects.push(
          createBoxMesh(
            `col_f${s}_${ix + 1}_${iy + 1}`,
            `Floor ${s} Column C${ix + 1}-${iy + 1}`,
            "column",
            phaseKey,
            cx - colSizeX / 2,
            cy - colSizeY / 2,
            floorZ + slabThickMm,
            cx + colSizeX / 2,
            cy + colSizeY / 2,
            nextZ,
          ),
        );
      }
    }

    // Floor Perimeter Beams & Spandrels
    allObjects.push(
      createBoxMesh(
        `beam_front_f${s}`,
        `Floor ${s} Front Beam`,
        "beam",
        phaseKey,
        frameMinX,
        frameMaxY - beamWidthMm,
        nextZ - beamDepthMm,
        frameMaxX,
        frameMaxY,
        nextZ,
      ),
    );
    allObjects.push(
      createBoxMesh(
        `beam_rear_f${s}`,
        `Floor ${s} Rear Beam`,
        "beam",
        phaseKey,
        frameMinX,
        frameMinY,
        nextZ - beamDepthMm,
        frameMaxX,
        frameMinY + beamWidthMm,
        nextZ,
      ),
    );
    allObjects.push(
      createBoxMesh(
        `beam_left_f${s}`,
        `Floor ${s} West Side Beam`,
        "beam",
        phaseKey,
        frameMinX,
        frameMinY,
        nextZ - beamDepthMm,
        frameMinX + beamWidthMm,
        frameMaxY,
        nextZ,
      ),
    );
    allObjects.push(
      createBoxMesh(
        `beam_right_f${s}`,
        `Floor ${s} East Side Beam`,
        "beam",
        phaseKey,
        frameMaxX - beamWidthMm,
        frameMinY,
        nextZ - beamDepthMm,
        frameMaxX,
        frameMaxY,
        nextZ,
      ),
    );

    // Interior Room Partition Walls from Active Floor Plan Layout
    const floorPhase = project.phases?.find(
      (p) => (p.kind === "floor" && p.storeyIndex === s) || (p.kind === "floor" && p.data?.selectedFloorplanPreset)
    );
    const selectedPresetId = (floorPhase?.data?.selectedFloorplanPreset as string) || "preset-dual-3bed";
    const activePreset = FLOORPLAN_PRESETS.find((p) => p.id === selectedPresetId) || FLOORPLAN_PRESETS[0];

    for (const room of activePreset.rooms) {
      const rx1 = Math.round(bldgMinX + room.boundsRel[0] * bldgWidthMm);
      const ry1 = Math.round(bldgMinY + room.boundsRel[1] * bldgLengthMm);
      const rx2 = Math.round(bldgMinX + room.boundsRel[2] * bldgWidthMm);
      const ry2 = Math.round(bldgMinY + room.boundsRel[3] * bldgLengthMm);
      const rw = rx2 - rx1;
      const rh = ry2 - ry1;

      const isRearExt = room.boundsRel[1] <= 0.01;
      const isFrontExt = room.boundsRel[3] >= 0.99;
      const isLeftExt = room.boundsRel[0] <= 0.01;
      const isRightExt = room.boundsRel[2] >= 0.99;

      const wallTopZ = nextZ - beamDepthMm;
      const wallBotZ = floorZ + slabThickMm;

      // 1. REAR WALL (Y-axis face at ry1)
      {
        const thick = isRearExt ? EXT_WALL_THICK : INT_WALL_THICK;
        const yMin = isRearExt ? frameMinY : ry1 - thick / 2;
        const yMax = yMin + thick;
        const xStart = isLeftExt ? frameMinX : rx1;
        const xEnd = isRightExt ? frameMaxX : rx2;
        const xLen = xEnd - xStart;
        const wId = `f${s}_${room.id}_wn_r`;

        if (room.doorSide === "rear") {
          const dW = room.kind === "bath" ? 750 : 900;
          const dH = room.kind === "bath" ? 2000 : 2100;
          const dX1 = xStart + Math.round((xLen - dW) / 2);
          const dX2 = dX1 + dW;
          if (dX1 > xStart) allObjects.push(createBoxMesh(`${wId}_l`, `${room.nameEn} Wall`, "partition", phaseKey, xStart, yMin, wallBotZ, dX1, yMax, wallTopZ));
          if (xEnd > dX2) allObjects.push(createBoxMesh(`${wId}_r`, `${room.nameEn} Wall`, "partition", phaseKey, dX2, yMin, wallBotZ, xEnd, yMax, wallTopZ));
          allObjects.push(createBoxMesh(`${wId}_lint`, `${room.nameEn} Lintel`, "beam", phaseKey, dX1, yMin, wallBotZ + dH, dX2, yMax, wallBotZ + dH + 150));
          allObjects.push(...createDoor3DMesh(`${wId}_dr`, dX1, yMin, wallBotZ, dW, thick, dH, "X", room.kind, phaseKey));
        } else if (room.windowSide === "rear") {
          const wW = room.kind === "bath" ? 600 : (room.kind === "kitchen" ? 1200 : 1500);
          const wH = room.kind === "bath" ? 600 : 1200;
          const wZ = room.kind === "bath" ? 2000 : 900;
          const wX1 = xStart + Math.round((xLen - wW) / 2);
          const wX2 = wX1 + wW;
          allObjects.push(createBoxMesh(`${wId}_sp`, `${room.nameEn} Spandrel`, "wall", phaseKey, xStart, yMin, wallBotZ, xEnd, yMax, wallBotZ + wZ));
          if (wX1 > xStart) allObjects.push(createBoxMesh(`${wId}_wl`, `${room.nameEn} Wall`, "wall", phaseKey, xStart, yMin, wallBotZ + wZ, wX1, yMax, wallBotZ + wZ + wH));
          if (xEnd > wX2) allObjects.push(createBoxMesh(`${wId}_wr`, `${room.nameEn} Wall`, "wall", phaseKey, wX2, yMin, wallBotZ + wZ, xEnd, yMax, wallBotZ + wZ + wH));
          allObjects.push(createBoxMesh(`${wId}_hd`, `${room.nameEn} Head`, "wall", phaseKey, xStart, yMin, wallBotZ + wZ + wH, xEnd, yMax, wallTopZ));
          allObjects.push(...createWindow3DMesh(`${wId}_win`, wX1, yMin, wallBotZ + wZ, wW, thick, wH, "X", room.kind === "bath", phaseKey));
        } else {
          allObjects.push(createBoxMesh(wId, `${room.nameEn} Wall`, "partition", phaseKey, xStart, yMin, wallBotZ, xEnd, yMax, wallTopZ));
        }
      }

      // 2. FRONT WALL (Y-axis face at ry2)
      {
        const thick = isFrontExt ? EXT_WALL_THICK : INT_WALL_THICK;
        const yMax = isFrontExt ? frameMaxY : ry2 + thick / 2;
        const yMin = yMax - thick;
        const xStart = isLeftExt ? frameMinX : rx1;
        const xEnd = isRightExt ? frameMaxX : rx2;
        const xLen = xEnd - xStart;
        const wId = `f${s}_${room.id}_wn_f`;

        if (room.doorSide === "front") {
          const dW = room.kind === "bath" ? 750 : 900;
          const dH = room.kind === "bath" ? 2000 : 2100;
          const dX1 = xStart + Math.round((xLen - dW) / 2);
          const dX2 = dX1 + dW;
          if (dX1 > xStart) allObjects.push(createBoxMesh(`${wId}_l`, `${room.nameEn} Wall`, "partition", phaseKey, xStart, yMin, wallBotZ, dX1, yMax, wallTopZ));
          if (xEnd > dX2) allObjects.push(createBoxMesh(`${wId}_r`, `${room.nameEn} Wall`, "partition", phaseKey, dX2, yMin, wallBotZ, xEnd, yMax, wallTopZ));
          allObjects.push(createBoxMesh(`${wId}_lint`, `${room.nameEn} Lintel`, "beam", phaseKey, dX1, yMin, wallBotZ + dH, dX2, yMax, wallBotZ + dH + 150));
          allObjects.push(...createDoor3DMesh(`${wId}_dr`, dX1, yMin, wallBotZ, dW, thick, dH, "X", room.kind, phaseKey));
        } else if (room.windowSide === "front") {
          const wW = room.kind === "bath" ? 600 : (room.kind === "kitchen" ? 1200 : 1500);
          const wH = room.kind === "bath" ? 600 : 1200;
          const wZ = room.kind === "bath" ? 2000 : 900;
          const wX1 = xStart + Math.round((xLen - wW) / 2);
          const wX2 = wX1 + wW;
          allObjects.push(createBoxMesh(`${wId}_sp`, `${room.nameEn} Spandrel`, "wall", phaseKey, xStart, yMin, wallBotZ, xEnd, yMax, wallBotZ + wZ));
          if (wX1 > xStart) allObjects.push(createBoxMesh(`${wId}_wl`, `${room.nameEn} Wall`, "wall", phaseKey, xStart, yMin, wallBotZ + wZ, wX1, yMax, wallBotZ + wZ + wH));
          if (xEnd > wX2) allObjects.push(createBoxMesh(`${wId}_wr`, `${room.nameEn} Wall`, "wall", phaseKey, wX2, yMin, wallBotZ + wZ, xEnd, yMax, wallBotZ + wZ + wH));
          allObjects.push(createBoxMesh(`${wId}_hd`, `${room.nameEn} Head`, "wall", phaseKey, xStart, yMin, wallBotZ + wZ + wH, xEnd, yMax, wallTopZ));
          allObjects.push(...createWindow3DMesh(`${wId}_win`, wX1, yMin, wallBotZ + wZ, wW, thick, wH, "X", room.kind === "bath", phaseKey));
        } else {
          allObjects.push(createBoxMesh(wId, `${room.nameEn} Wall`, "partition", phaseKey, xStart, yMin, wallBotZ, xEnd, yMax, wallTopZ));
        }
      }

      // 3. LEFT WALL (X-axis face at rx1)
      {
        const thick = isLeftExt ? EXT_WALL_THICK : INT_WALL_THICK;
        const xMin = isLeftExt ? frameMinX : rx1 - thick / 2;
        const xMax = xMin + thick;
        const yStart = isRearExt ? frameMinY : ry1;
        const yEnd = isFrontExt ? frameMaxY : ry2;
        const yLen = yEnd - yStart;
        const wId = `f${s}_${room.id}_wn_l`;

        if (room.doorSide === "left") {
          const dW = room.kind === "bath" ? 750 : 900;
          const dH = room.kind === "bath" ? 2000 : 2100;
          const dY1 = yStart + Math.round((yLen - dW) / 2);
          const dY2 = dY1 + dW;
          if (dY1 > yStart) allObjects.push(createBoxMesh(`${wId}_b`, `${room.nameEn} Wall`, "partition", phaseKey, xMin, yStart, wallBotZ, xMax, dY1, wallTopZ));
          if (yEnd > dY2) allObjects.push(createBoxMesh(`${wId}_t`, `${room.nameEn} Wall`, "partition", phaseKey, xMin, dY2, wallBotZ, xMax, yEnd, wallTopZ));
          allObjects.push(createBoxMesh(`${wId}_lint`, `${room.nameEn} Lintel`, "beam", phaseKey, xMin, dY1, wallBotZ + dH, xMax, dY2, wallBotZ + dH + 150));
          allObjects.push(...createDoor3DMesh(`${wId}_dr`, xMin, dY1, wallBotZ, dW, thick, dH, "Y", room.kind, phaseKey));
        } else if (room.windowSide === "left") {
          const wW = room.kind === "bath" ? 600 : (room.kind === "kitchen" ? 1200 : 1500);
          const wH = room.kind === "bath" ? 600 : 1200;
          const wZ = room.kind === "bath" ? 2000 : 900;
          const wY1 = yStart + Math.round((yLen - wW) / 2);
          const wY2 = wY1 + wW;
          allObjects.push(createBoxMesh(`${wId}_sp`, `${room.nameEn} Spandrel`, "wall", phaseKey, xMin, yStart, wallBotZ, xMax, yEnd, wallBotZ + wZ));
          if (wY1 > yStart) allObjects.push(createBoxMesh(`${wId}_wb`, `${room.nameEn} Wall`, "wall", phaseKey, xMin, yStart, wallBotZ + wZ, xMax, wY1, wallBotZ + wZ + wH));
          if (yEnd > wY2) allObjects.push(createBoxMesh(`${wId}_wt`, `${room.nameEn} Wall`, "wall", phaseKey, xMin, wY2, wallBotZ + wZ, xMax, yEnd, wallBotZ + wZ + wH));
          allObjects.push(createBoxMesh(`${wId}_hd`, `${room.nameEn} Head`, "wall", phaseKey, xMin, yStart, wallBotZ + wZ + wH, xMax, yEnd, wallTopZ));
          allObjects.push(...createWindow3DMesh(`${wId}_win`, xMin, wY1, wallBotZ + wZ, wW, thick, wH, "Y", room.kind === "bath", phaseKey));
        } else {
          allObjects.push(createBoxMesh(wId, `${room.nameEn} Wall`, "partition", phaseKey, xMin, yStart, wallBotZ, xMax, yEnd, wallTopZ));
        }
      }

      // 4. RIGHT WALL (X-axis face at rx2)
      {
        const thick = isRightExt ? EXT_WALL_THICK : INT_WALL_THICK;
        const xMax = isRightExt ? frameMaxX : rx2 + thick / 2;
        const xMin = xMax - thick;
        const yStart = isRearExt ? frameMinY : ry1;
        const yEnd = isFrontExt ? frameMaxY : ry2;
        const yLen = yEnd - yStart;
        const wId = `f${s}_${room.id}_wn_rt`;

        if (room.doorSide === "right") {
          const dW = room.kind === "bath" ? 750 : 900;
          const dH = room.kind === "bath" ? 2000 : 2100;
          const dY1 = yStart + Math.round((yLen - dW) / 2);
          const dY2 = dY1 + dW;
          if (dY1 > yStart) allObjects.push(createBoxMesh(`${wId}_b`, `${room.nameEn} Wall`, "partition", phaseKey, xMin, yStart, wallBotZ, xMax, dY1, wallTopZ));
          if (yEnd > dY2) allObjects.push(createBoxMesh(`${wId}_t`, `${room.nameEn} Wall`, "partition", phaseKey, xMin, dY2, wallBotZ, xMax, yEnd, wallTopZ));
          allObjects.push(createBoxMesh(`${wId}_lint`, `${room.nameEn} Lintel`, "beam", phaseKey, xMin, dY1, wallBotZ + dH, xMax, dY2, wallBotZ + dH + 150));
          allObjects.push(...createDoor3DMesh(`${wId}_dr`, xMin, dY1, wallBotZ, dW, thick, dH, "Y", room.kind, phaseKey));
        } else if (room.windowSide === "right") {
          const wW = room.kind === "bath" ? 600 : (room.kind === "kitchen" ? 1200 : 1500);
          const wH = room.kind === "bath" ? 600 : 1200;
          const wZ = room.kind === "bath" ? 2000 : 900;
          const wY1 = yStart + Math.round((yLen - wW) / 2);
          const wY2 = wY1 + wW;
          allObjects.push(createBoxMesh(`${wId}_sp`, `${room.nameEn} Spandrel`, "wall", phaseKey, xMin, yStart, wallBotZ, xMax, yEnd, wallBotZ + wZ));
          if (wY1 > yStart) allObjects.push(createBoxMesh(`${wId}_wb`, `${room.nameEn} Wall`, "wall", phaseKey, xMin, yStart, wallBotZ + wZ, xMax, wY1, wallBotZ + wZ + wH));
          if (yEnd > wY2) allObjects.push(createBoxMesh(`${wId}_wt`, `${room.nameEn} Wall`, "wall", phaseKey, xMin, wY2, wallBotZ + wZ, xMax, yEnd, wallBotZ + wZ + wH));
          allObjects.push(createBoxMesh(`${wId}_hd`, `${room.nameEn} Head`, "wall", phaseKey, xMin, yStart, wallBotZ + wZ + wH, xMax, yEnd, wallTopZ));
          allObjects.push(...createWindow3DMesh(`${wId}_win`, xMin, wY1, wallBotZ + wZ, wW, thick, wH, "Y", room.kind === "bath", phaseKey));
        } else {
          allObjects.push(createBoxMesh(wId, `${room.nameEn} Wall`, "partition", phaseKey, xMin, yStart, wallBotZ, xMax, yEnd, wallTopZ));
        }
      }

      // 5. ROOM FIXTURES (Kitchen, Bath, Stair)
      if (room.kind === "kitchen") {
        const kAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "kitchen-l-counter-slab");
        if (kAsset) {
          allObjects.push(...kAsset.generateMesh(`f${s}_${room.id}_counter`, rx1 + 100, ry1 + 100, floorZ + slabThickMm, phaseKey));
        }
      } else if (room.kind === "bath") {
        const bAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "bath-sunken-pipe-shaft");
        if (bAsset) {
          allObjects.push(...bAsset.generateMesh(`f${s}_${room.id}_bath`, rx1 + 50, ry1 + 50, floorZ + slabThickMm, phaseKey));
        }
      } else if (room.kind === "stair") {
        const stAsset = ARCHITECTURAL_ASSETS.find((a) => a.id === "stair-doglegged-rcc");
        if (stAsset) {
          allObjects.push(...stAsset.generateMesh(`f${s}_${room.id}_stair`, rx1 + 50, ry1 + 50, floorZ + slabThickMm, phaseKey));
        }
      }
    }
  }

  // ==========================================
  // 4. ROOFTOP & BOUNDARY (Z = stories * 3000mm)
  // ==========================================
  const roofZ = stories * storyHeightMm;

  // Roof Terrace RCC Slab
  allObjects.push(
    createBoxMesh(
      "roof_slab",
      "Rooftop Terrace RCC Slab (125mm)",
      "slab",
      "roof",
      frameMinX,
      frameMinY,
      roofZ,
      frameMaxX,
      frameMaxY,
      roofZ + slabThickMm,
    ),
  );

  // Perimeter Parapet Walls (1000mm safe continuous parapet with coping)
  allObjects.push(
    createBoxMesh(
      "parapet_front",
      "Front Parapet Wall (1.0m)",
      "parapet",
      "roof",
      frameMinX,
      frameMaxY - 125,
      roofZ + slabThickMm,
      frameMaxX,
      frameMaxY,
      roofZ + slabThickMm + 1000,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "parapet_rear",
      "Rear Parapet Wall (1.0m)",
      "parapet",
      "roof",
      frameMinX,
      frameMinY,
      roofZ + slabThickMm,
      frameMaxX,
      frameMinY + 125,
      roofZ + slabThickMm + 1000,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "parapet_left",
      "West Parapet Wall (1.0m)",
      "parapet",
      "roof",
      frameMinX,
      frameMinY,
      roofZ + slabThickMm,
      frameMinX + 125,
      frameMaxY,
      roofZ + slabThickMm + 1000,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "parapet_right",
      "East Parapet Wall (1.0m)",
      "parapet",
      "roof",
      frameMaxX - 125,
      frameMinY,
      roofZ + slabThickMm,
      frameMaxX,
      frameMaxY,
      roofZ + slabThickMm + 1000,
    ),
  );

  // Staircase Head Room & Lift Machine Room Tower
  allObjects.push(
    createBoxMesh(
      "stair_headroom",
      "Stair Headroom & Lift Penthouse",
      "wall",
      "roof",
      bldgMinX + spanX,
      bldgMinY + spanY * 0.5,
      roofZ + slabThickMm,
      bldgMinX + spanX * 2.2,
      bldgMinY + spanY * 1.5,
      roofZ + slabThickMm + 2400,
    ),
  );
  // Penthouse Roof Slab
  allObjects.push(
    createBoxMesh(
      "penthouse_slab",
      "Stair Tower Roof Slab",
      "slab",
      "roof",
      bldgMinX + spanX - 100,
      bldgMinY + spanY * 0.5 - 100,
      roofZ + slabThickMm + 2400,
      bldgMinX + spanX * 2.2 + 100,
      bldgMinY + spanY * 1.5 + 100,
      roofZ + slabThickMm + 2525,
    ),
  );

  // Elevated Overhead RCC Water Reservoir Tank with Support Piers
  const tankCapacity = stories * 2500;
  // 4 Support Concrete Piers elevating tank above penthouse
  const pierZ = roofZ + slabThickMm + 2525;
  allObjects.push(
    createBoxMesh(
      "tank_pier_1",
      "Water Tank Support Pier 1",
      "column",
      "roof",
      bldgMinX + spanX * 1.1,
      bldgMinY + spanY * 0.6,
      pierZ,
      bldgMinX + spanX * 1.1 + 250,
      bldgMinY + spanY * 0.6 + 250,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_2",
      "Water Tank Support Pier 2",
      "column",
      "roof",
      bldgMinX + spanX * 2.0 - 250,
      bldgMinY + spanY * 0.6,
      pierZ,
      bldgMinX + spanX * 2.0,
      bldgMinY + spanY * 0.6 + 250,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_3",
      "Water Tank Support Pier 3",
      "column",
      "roof",
      bldgMinX + spanX * 1.1,
      bldgMinY + spanY * 1.4 - 250,
      pierZ,
      bldgMinX + spanX * 1.1 + 250,
      bldgMinY + spanY * 1.4,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_4",
      "Water Tank Support Pier 4",
      "column",
      "roof",
      bldgMinX + spanX * 2.0 - 250,
      bldgMinY + spanY * 1.4 - 250,
      pierZ,
      bldgMinX + spanX * 2.0,
      bldgMinY + spanY * 1.4,
      pierZ + 800,
    ),
  );

  // Overhead Water Reservoir Tank Body
  allObjects.push(
    createBoxMesh(
      "overhead_tank",
      `Overhead RCC Water Reservoir (${tankCapacity} Liters)`,
      "tank",
      "roof",
      bldgMinX + spanX * 1.05,
      bldgMinY + spanY * 0.55,
      pierZ + 800,
      bldgMinX + spanX * 2.05,
      bldgMinY + spanY * 1.45,
      pierZ + 2200,
    ),
  );

  // ==========================================
  // PHASE FILTERING
  // ==========================================
  let filtered = allObjects;
  if (phaseFilter && phaseFilter !== "final") {
    if (phaseFilter.includes("foundation") || phaseFilter.includes("site")) {
      filtered = allObjects.filter((o) => o.phase === "foundation");
    } else if (phaseFilter.includes("ground")) {
      filtered = allObjects.filter((o) => o.phase === "ground_floor");
    } else if (phaseFilter.includes("roof")) {
      filtered = allObjects.filter((o) => o.phase === "roof");
    } else if (phaseFilter.includes("floor-") || phaseFilter.includes("floor_")) {
      const match = phaseFilter.match(/\d+/);
      const floorNum = match ? Number(match[0]) : 1;
      filtered = allObjects.filter((o) => o.phase === `floor_${floorNum}`);
    }
  }

  // Fallback to allObjects if filter yields empty
  if (filtered.length === 0) filtered = allObjects;

  return {
    schemaVersion: "0.1.0",
    units: "mm",
    objects: filtered,
  };
}
