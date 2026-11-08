/**
 * Small mesh helpers shared by the model-to-mesh path and the asset library: a box, a door, a
 * window, and the phase filter. (Moved out of the old preset-driven generator, which is gone.)
 */

import type { MeshObject } from "./mesh";


/**
 * Filter mesh objects by phase. Centralized phase filtering logic.
 * Returns all objects when phaseFilter is null, "final", or unrecognized.
 */
export function filterMeshByPhase(objects: MeshObject[], phaseFilter?: string): MeshObject[] {
  if (!phaseFilter || phaseFilter === "final") {
    return objects;
  }

  if (phaseFilter.includes("foundation") || phaseFilter.includes("site")) {
    return objects.filter((o) => o.phase === "foundation");
  }
  if (phaseFilter.includes("ground")) {
    return objects.filter((o) => o.phase === "ground_floor");
  }
  if (phaseFilter.includes("roof")) {
    return objects.filter((o) => o.phase === "roof");
  }
  if (phaseFilter.includes("floor-") || phaseFilter.includes("floor_")) {
    const match = phaseFilter.match(/\d+/);
    const floorNum = match ? Number(match[0]) : 1;
    return objects.filter((o) => o.phase === `floor_${floorNum}`);
  }

  // Unknown filter - return empty array, caller handles fallback
  return [];
}

/**
 * Generates vertices, normals, and indices for an axis-aligned 3D box solid.
 * Coordinates are rounded to whole mm so flush contacts computed from shared
 * inputs stay exactly coplanar; degenerate boxes (sub-mm dimension) are clamped
 * so the viewer never receives NaN geometry.
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
  const minX = Math.round(Math.min(x1, x2));
  const maxX = Math.round(Math.max(x1, x2));
  const minY = Math.round(Math.min(y1, y2));
  const maxY = Math.round(Math.max(y1, y2));
  const minZ = Math.round(Math.min(z1, z2));
  const maxZ = Math.round(Math.max(z1, z2));

  // Reject sub-mm boxes produced by column/junction subtraction — clamp to zero
  // volume silently so the audit sees no degenerate solid.
  if (maxX - minX < 1 || maxY - minY < 1 || maxZ - minZ < 1) {
    return null as unknown as MeshObject;
  }
  const cx = (maxX + minX) / 2;
  const cy = (maxY + minY) / 2;
  const cz = (maxZ + minZ) / 2;
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;

  const bMinX = cx - dx / 2;
  const bMaxX = cx + dx / 2;
  const bMinY = cy - dy / 2;
  const bMaxY = cy + dy / 2;
  const bMinZ = cz - dz / 2;
  const bMaxZ = cz + dz / 2;

  const volumeMm3 = dx * dy * dz;

  // 6 faces * 4 vertices = 24 vertices
  const positions: number[] = [
    // Front (+Y) - counter-clockwise seen from outside (v2.4.1: was inward-wound)
    bMaxX, bMaxY, bMinZ,
    bMinX, bMaxY, bMinZ,
    bMinX, bMaxY, bMaxZ,
    bMaxX, bMaxY, bMaxZ,
    // Back (-Y) - counter-clockwise seen from outside (v2.4.1: was inward-wound)
    bMinX, bMinY, bMinZ,
    bMaxX, bMinY, bMinZ,
    bMaxX, bMinY, bMaxZ,
    bMinX, bMinY, bMaxZ,
    // Top (+Z)
    bMinX, bMinY, bMaxZ,
    bMaxX, bMinY, bMaxZ,
    bMaxX, bMaxY, bMaxZ,
    bMinX, bMaxY, bMaxZ,
    // Bottom (-Z)
    bMinX, bMaxY, bMinZ,
    bMaxX, bMaxY, bMinZ,
    bMaxX, bMinY, bMinZ,
    bMinX, bMinY, bMinZ,
    // Right (+X)
    bMaxX, bMinY, bMinZ,
    bMaxX, bMaxY, bMinZ,
    bMaxX, bMaxY, bMaxZ,
    bMaxX, bMinY, bMaxZ,
    // Left (-X)
    bMinX, bMaxY, bMinZ,
    bMinX, bMinY, bMinZ,
    bMinX, bMinY, bMaxZ,
    bMinX, bMaxY, bMaxZ,
  ];

  const normals: number[] = [
    // Front
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
    // Back
    0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
    // Top
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
    // Bottom
    0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
    // Right
    1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0,
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
    bboxMinMm: [bMinX, bMinY, bMinZ],
    bboxMaxMm: [bMaxX, bMaxY, bMaxZ],
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
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "hardware", phase, x + width - 120, y + depth - 20, z + 950, x + width - 90, y + depth - 5, z + 1070));
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
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "hardware", phase, x + depth - 20, y + width - 120, z + 950, x + depth - 5, y + width - 90, z + 1070));
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
    // Concrete Sill Slab — inset 25mm from wall faces to avoid Z-fighting
    const sillInset = 25;
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "lintel", phase, x - sillInset, y - sillInset, z - 60, x + width + sillInset, y + depth + sillInset, z));
    // Frame Left
    objects.push(createBoxMesh(`${baseId}_frm_l`, "Window Channel Left", "window_frame", phase, x, y, z, x + frameThick, y + depth, z + height));
    // Frame Right
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Right", "window_frame", phase, x + width - frameThick, y, z, x + width, y + depth, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "window_frame", phase, x, y, z + height - frameThick, x + width, y + depth, z + height));

    if (isLouvre) {
      // 3 Louver blades
      for (let i = 0; i < 3; i++) {
        objects.push(createBoxMesh(`${baseId}_blade_${i + 1}`, `Frosted Louver Blade ${i + 1}`, "louver", phase, x + frameThick, y + 15, z + 60 + i * 160, x + width - frameThick, y + depth - 15, z + 100 + i * 160));
      }
    } else {
      // 2 Sliding Glass Panes
      objects.push(createBoxMesh(`${baseId}_pane_1`, "Left Sliding Glass Pane", "window", phase, x + frameThick, y + 20, z + 30, x + width / 2 + 10, y + depth - 25, z + height - 30));
      objects.push(createBoxMesh(`${baseId}_pane_2`, "Right Sliding Glass Pane", "window", phase, x + width / 2 - 10, y + 25, z + 30, x + width - frameThick, y + depth - 20, z + height - 30));
    }
  } else {
    // Orientation Y
    // Concrete Sill Slab — inset 25mm from wall faces to avoid Z-fighting
    const sillInset = 25;
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "lintel", phase, x - sillInset, y - sillInset, z - 60, x + depth + sillInset, y + width + sillInset, z));
    // Frame Front
    objects.push(createBoxMesh(`${baseId}_frm_f`, "Window Channel Front", "window_frame", phase, x, y, z, x + depth, y + frameThick, z + height));
    // Frame Rear
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Rear", "window_frame", phase, x, y + width - frameThick, z, x + depth, y + width, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "window_frame", phase, x, y, z + height - frameThick, x + depth, y + width, z + height));

    if (isLouvre) {
      // 3 Louver blades
      for (let i = 0; i < 3; i++) {
        objects.push(createBoxMesh(`${baseId}_blade_${i + 1}`, `Frosted Louver Blade ${i + 1}`, "louver", phase, x + 15, y + frameThick, z + 60 + i * 160, x + depth - 15, y + width - frameThick, z + 100 + i * 160));
      }
    } else {
      // 2 Sliding Glass Panes
      objects.push(createBoxMesh(`${baseId}_pane_1`, "Front Sliding Glass Pane", "window", phase, x + 20, y + frameThick, z + 30, x + depth - 25, y + width / 2 + 10, z + height - 30));
      objects.push(createBoxMesh(`${baseId}_pane_2`, "Rear Sliding Glass Pane", "window", phase, x + 25, y + width / 2 - 10, z + 30, x + depth - 20, y + width - frameThick, z + height - 30));
    }
  }
  return objects;
}
