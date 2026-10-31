/**
 * Parametric 3D Building Mesh Generator for ArchResidenceBD — v2.3
 *
 * Dynamically synthesizes watertight 3D solid geometry for residential buildings
 * in Bangladesh according to BNBC 2020 structural standards.
 * Supports arbitrary stories (2, 4, 6, 8+), plot dimensions, column grids,
 * footing pads, grade beams, floor slabs, external walls, balconies, and rooftops.
 *
 * v2.3 refinements (the watertightness / Z-fighting / synthesis pass):
 *  - Wall-network synthesis: every partition is emitted exactly once from a merged
 *    wall graph (shared walls between rooms are deduplicated), the four facade
 *    envelope walls are guaranteed, and all wall solids are trimmed at RCC column
 *    faces and at wall junctions by solid subtraction — no overlapping volumes and
 *    no coplanar Z-fighting faces remain at column/wall or wall/wall junctions.
 *  - Non-rectangular floorplans: rooms may declare `pointsRel` polygon outlines
 *    (L-shaped, stepped) in addition to the legacy rectangle `boundsRel`.
 *  - Fitted fixtures: staircases, kitchen counters and bathrooms are generated to
 *    fit their rooms and stop under the beam line (no clipping through slabs/beams).
 *  - Ground floor: parking/guard layout walls, gates and windows come from the
 *    active ground-floor preset; grade beams are trimmed at pedestal stubs;
 *    parapets are trimmed at corners; interior grid beams are added per storey.
 */

import { MeshDocument, MeshObject } from "./mesh";
import { BuildingProject } from "../engine/projectState";
import { resolveSolids, DEFAULT_PRIORITY } from "./solidKernel";
import { resolveFloorPresetId } from "../data/floorplanMapping";
import { FLOORPLAN_PRESETS, RoomPartition, snapRoomsToEnvelope } from "../data/floorplanPresets";
import type {
  BuildingCustomization,
  AccessibilitySettings,
  SustainabilitySettings,
  FireSafetySettings,
  ValueEngineeringSettings,
  ConstructionMgmtSettings,
} from "../types/customization";
import {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";

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
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "railing", phase, x + width - 120, y + depth - 20, z + 950, x + width - 90, y + depth - 5, z + 1070));
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
      objects.push(createBoxMesh(`${baseId}_handle`, "Brass Door Handle", "railing", phase, x + depth - 20, y + width - 120, z + 950, x + depth - 5, y + width - 90, z + 1070));
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
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "beam", phase, x - sillInset, y - sillInset, z - 60, x + width + sillInset, y + depth + sillInset, z));
    // Frame Left
    objects.push(createBoxMesh(`${baseId}_frm_l`, "Window Channel Left", "wall", phase, x, y, z, x + frameThick, y + depth, z + height));
    // Frame Right
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Right", "wall", phase, x + width - frameThick, y, z, x + width, y + depth, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "wall", phase, x, y, z + height - frameThick, x + width, y + depth, z + height));

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
    objects.push(createBoxMesh(`${baseId}_sill`, "RCC Window Sill", "beam", phase, x - sillInset, y - sillInset, z - 60, x + depth + sillInset, y + width + sillInset, z));
    // Frame Front
    objects.push(createBoxMesh(`${baseId}_frm_f`, "Window Channel Front", "wall", phase, x, y, z, x + depth, y + frameThick, z + height));
    // Frame Rear
    objects.push(createBoxMesh(`${baseId}_frm_r`, "Window Channel Rear", "wall", phase, x, y + width - frameThick, z, x + depth, y + width, z + height));
    // Frame Top
    objects.push(createBoxMesh(`${baseId}_frm_t`, "Window Channel Top", "wall", phase, x, y, z + height - frameThick, x + depth, y + width, z + height));

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

// ======================================================================
// Watertight solid-assembly utilities (v2.3)
// ======================================================================

interface BoxDef {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function boxVolumeMm3(b: BoxDef): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY) * Math.max(0, b.maxZ - b.minZ);
}

function boxOverlapVolumeMm3(a: BoxDef, b: BoxDef): number {
  const dx = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const dy = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  const dz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
  return dx * dy * dz;
}

/** Split interval [a0,a1] at cut points c0,c1 that lie strictly inside it. */
function split1D(a0: number, a1: number, c0: number, c1: number): Array<[number, number]> {
  const pts = [a0];
  if (c0 > a0 && c0 < a1) pts.push(c0);
  if (c1 > a0 && c1 < a1) pts.push(c1);
  pts.push(a1);
  const sorted = [...new Set(pts.map((p) => Math.round(p * 10) / 10))].sort((p, q) => p - q);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] > 0.1) out.push([sorted[i], sorted[i + 1]]);
  }
  return out;
}

/** a minus cut: axis-aligned box difference (up to 6 pieces). */
function subtractBox(a: BoxDef, cut: BoxDef): BoxDef[] {
  if (boxOverlapVolumeMm3(a, cut) <= 0.5) return [a];
  const xs = split1D(a.minX, a.maxX, cut.minX, cut.maxX);
  const ys = split1D(a.minY, a.maxY, cut.minY, cut.maxY);
  const zs = split1D(a.minZ, a.maxZ, cut.minZ, cut.maxZ);
  const out: BoxDef[] = [];
  for (const [x0, x1] of xs) {
    for (const [y0, y1] of ys) {
      for (const [z0, z1] of zs) {
        const piece: BoxDef = { minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 };
        if (boxVolumeMm3(piece) > 0.5 && boxOverlapVolumeMm3(piece, cut) <= 0.5) {
          out.push(piece);
        }
      }
    }
  }
  return out;
}

// ======================================================================
// Wall-network synthesis (v2.3)
// ======================================================================

type WallAxis = "x" | "y";
type SideLabel = "front" | "rear" | "left" | "right" | "inner";

interface OpeningRequest {
  type: "door" | "window";
  roomKind: string;
  /** The sub-span (along the wall axis) the requesting room occupies. */
  span: [number, number];
}

interface WallSeg {
  axis: WallAxis;
  /** Perpendicular band [p0, p1] (wall thickness footprint). */
  band: [number, number];
  /** Span along the wall axis [a0, a1]. */
  span: [number, number];
  exterior: boolean;
  side: SideLabel;
  label: string;
  roomKind: string;
  openings: OpeningRequest[];
}

interface OpeningSpec {
  a0: number;
  a1: number;
  type: "door" | "window";
  roomKind: string;
  z0: number;
  z1: number;
  wZ?: number;
}

interface FloorGeo {
  bldgMinX: number;
  bldgMaxX: number;
  bldgMinY: number;
  bldgMaxY: number;
  bldgWidthMm: number;
  bldgLengthMm: number;
  frameMinX: number;
  frameMaxX: number;
  frameMinY: number;
  frameMaxY: number;
  colSizeX: number;
  colSizeY: number;
  spanX: number;
  spanY: number;
  colsX: number;
  colsY: number;
  extThick: number;
  intThick: number;
  wallBotZ: number;
  wallTopZ: number;
  phaseKey: string;
}

/** Relative coordinate below which a room edge counts as the building boundary. */
const BOUND_EPS = 0.055;

function segKey(s: WallSeg): string {
  return `${s.axis}|${Math.round(s.band[0])}|${Math.round(s.band[1])}`;
}

function columnCutterBoxes(geo: FloorGeo, z0: number, z1: number): BoxDef[] {
  const boxes: BoxDef[] = [];
  for (let ix = 0; ix < geo.colsX; ix++) {
    for (let iy = 0; iy < geo.colsY; iy++) {
      const cx = geo.bldgMinX + ix * geo.spanX;
      const cy = geo.bldgMinY + iy * geo.spanY;
      boxes.push({
        minX: cx - geo.colSizeX / 2,
        maxX: cx + geo.colSizeX / 2,
        minY: cy - geo.colSizeY / 2,
        maxY: cy + geo.colSizeY / 2,
        minZ: z0,
        maxZ: z1,
      });
    }
  }
  return boxes;
}

/** The four facade envelope wall segments — the building is always closed. */
function envelopeSegs(geo: FloorGeo): WallSeg[] {
  const ext = geo.extThick;
  return [
    { axis: "x", band: [geo.frameMinY, geo.frameMinY + ext], span: [geo.frameMinX, geo.frameMaxX], exterior: true, side: "rear", label: "Rear Exterior Wall", roomKind: "wall", openings: [] },
    { axis: "x", band: [geo.frameMaxY - ext, geo.frameMaxY], span: [geo.frameMinX, geo.frameMaxX], exterior: true, side: "front", label: "Front Exterior Wall", roomKind: "wall", openings: [] },
    { axis: "y", band: [geo.frameMinX, geo.frameMinX + ext], span: [geo.frameMinY, geo.frameMaxY], exterior: true, side: "left", label: "Left Exterior Wall", roomKind: "wall", openings: [] },
    { axis: "y", band: [geo.frameMaxX - ext, geo.frameMaxX], span: [geo.frameMinY, geo.frameMaxY], exterior: true, side: "right", label: "Right Exterior Wall", roomKind: "wall", openings: [] },
  ];
}

function rectRoomSegs(r: RoomPartition, geo: FloorGeo): WallSeg[] {
  const rx1 = geo.bldgMinX + r.boundsRel[0] * geo.bldgWidthMm;
  const ry1 = geo.bldgMinY + r.boundsRel[1] * geo.bldgLengthMm;
  const rx2 = geo.bldgMinX + r.boundsRel[2] * geo.bldgWidthMm;
  const ry2 = geo.bldgMinY + r.boundsRel[3] * geo.bldgLengthMm;

  const isRearExt = r.boundsRel[1] <= BOUND_EPS;
  const isFrontExt = r.boundsRel[3] >= 1 - BOUND_EPS;
  const isLeftExt = r.boundsRel[0] <= BOUND_EPS;
  const isRightExt = r.boundsRel[2] >= 1 - BOUND_EPS;

  const ext = geo.extThick;
  const int = geo.intThick;
  const xSpan: [number, number] = [isLeftExt ? geo.frameMinX : rx1, isRightExt ? geo.frameMaxX : rx2];
  const ySpan: [number, number] = [isRearExt ? geo.frameMinY : ry1, isFrontExt ? geo.frameMaxY : ry2];

  const segs: WallSeg[] = [];
  segs.push({
    axis: "x",
    band: isRearExt ? [geo.frameMinY, geo.frameMinY + ext] : [ry1 - int / 2, ry1 + int / 2],
    span: xSpan,
    exterior: isRearExt,
    side: "rear",
    label: r.nameEn,
    roomKind: r.kind,
    openings: [
      ...(r.doorSide === "rear" ? [{ type: "door" as const, roomKind: r.kind, span: xSpan }] : []),
      ...(r.windowSide === "rear" ? [{ type: "window" as const, roomKind: r.kind, span: xSpan }] : []),
    ],
  });
  segs.push({
    axis: "x",
    band: isFrontExt ? [geo.frameMaxY - ext, geo.frameMaxY] : [ry2 - int / 2, ry2 + int / 2],
    span: xSpan,
    exterior: isFrontExt,
    side: "front",
    label: r.nameEn,
    roomKind: r.kind,
    openings: [
      ...(r.doorSide === "front" ? [{ type: "door" as const, roomKind: r.kind, span: xSpan }] : []),
      ...(r.windowSide === "front" ? [{ type: "window" as const, roomKind: r.kind, span: xSpan }] : []),
    ],
  });
  segs.push({
    axis: "y",
    band: isLeftExt ? [geo.frameMinX, geo.frameMinX + ext] : [rx1 - int / 2, rx1 + int / 2],
    span: ySpan,
    exterior: isLeftExt,
    side: "left",
    label: r.nameEn,
    roomKind: r.kind,
    openings: [
      ...(r.doorSide === "left" ? [{ type: "door" as const, roomKind: r.kind, span: ySpan }] : []),
      ...(r.windowSide === "left" ? [{ type: "window" as const, roomKind: r.kind, span: ySpan }] : []),
    ],
  });
  segs.push({
    axis: "y",
    band: isRightExt ? [geo.frameMaxX - ext, geo.frameMaxX] : [rx2 - int / 2, rx2 + int / 2],
    span: ySpan,
    exterior: isRightExt,
    side: "right",
    label: r.nameEn,
    roomKind: r.kind,
    openings: [
      ...(r.doorSide === "right" ? [{ type: "door" as const, roomKind: r.kind, span: ySpan }] : []),
      ...(r.windowSide === "right" ? [{ type: "window" as const, roomKind: r.kind, span: ySpan }] : []),
    ],
  });
  return segs;
}

function polygonRoomSegs(r: RoomPartition, geo: FloorGeo): WallSeg[] {
  const pts = (r.pointsRel || []).map(([px, py]) => [
    geo.bldgMinX + px * geo.bldgWidthMm,
    geo.bldgMinY + py * geo.bldgLengthMm,
    px,
    py,
  ] as [number, number, number, number]);
  if (pts.length < 4) return rectRoomSegs(r, geo);

  const ext = geo.extThick;
  const int = geo.intThick;
  const segs: WallSeg[] = [];
  const innerSegs: WallSeg[] = [];

  for (let i = 0; i < pts.length; i++) {
    const [ax, ay, axRel, ayRel] = pts[i];
    const [bx, by, bxRel, byRel] = pts[(i + 1) % pts.length];
    const dx = bx - ax;
    const dy = by - ay;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;

    if (Math.abs(dx) >= Math.abs(dy)) {
      // Wall runs along X; perpendicular coordinate is Y.
      const fixed = Math.round((ay + by) / 2);
      const fixedRel = (ayRel + byRel) / 2;
      let side: SideLabel = "inner";
      let band: [number, number] = [fixed - int / 2, fixed + int / 2];
      let exterior = false;
      if (fixedRel <= BOUND_EPS) {
        side = "rear";
        exterior = true;
        band = [geo.frameMinY, geo.frameMinY + ext];
      } else if (fixedRel >= 1 - BOUND_EPS) {
        side = "front";
        exterior = true;
        band = [geo.frameMaxY - ext, geo.frameMaxY];
      }
      const span: [number, number] = [Math.min(ax, bx), Math.max(ax, bx)];
      const seg: WallSeg = {
        axis: "x",
        band,
        span,
        exterior,
        side,
        label: r.nameEn,
        roomKind: r.kind,
        openings: [],
      };
      segs.push(seg);
      if (!exterior) innerSegs.push(seg);
    } else {
      // Wall runs along Y; perpendicular coordinate is X.
      const fixed = Math.round((ax + bx) / 2);
      const fixedRel = (axRel + bxRel) / 2;
      let side: SideLabel = "inner";
      let band: [number, number] = [fixed - int / 2, fixed + int / 2];
      let exterior = false;
      if (fixedRel <= BOUND_EPS) {
        side = "left";
        exterior = true;
        band = [geo.frameMinX, geo.frameMinX + ext];
      } else if (fixedRel >= 1 - BOUND_EPS) {
        side = "right";
        exterior = true;
        band = [geo.frameMaxX - ext, geo.frameMaxX];
      }
      const span: [number, number] = [Math.min(ay, by), Math.max(ay, by)];
      const seg: WallSeg = {
        axis: "y",
        band,
        span,
        exterior,
        side,
        label: r.nameEn,
        roomKind: r.kind,
        openings: [],
      };
      segs.push(seg);
      if (!exterior) innerSegs.push(seg);
    }
  }

  // Openings: door on the matching side (or the longest inner edge for "inner"),
  // window only on an exterior matching side.
  const matching = (s: WallSeg) => s.side === r.doorSide;
  const doorCandidates = segs.filter(matching);
  const doorTarget =
    doorCandidates.length > 0
      ? doorCandidates.reduce((best, s) => (spanLen(s) > spanLen(best) ? s : best))
      : r.doorSide === "inner" && innerSegs.length > 0
        ? innerSegs.reduce((best, s) => (spanLen(s) > spanLen(best) ? s : best))
        : null;
  if (doorTarget) doorTarget.openings.push({ type: "door", roomKind: r.kind, span: doorTarget.span });

  const winCandidates = segs.filter((s) => s.side === r.windowSide && s.exterior);
  if (winCandidates.length > 0) {
    const winTarget = winCandidates.reduce((best, s) => (spanLen(s) > spanLen(best) ? s : best));
    winTarget.openings.push({ type: "window", roomKind: r.kind, span: winTarget.span });
  }
  return segs;
}

function spanLen(s: WallSeg): number {
  return s.span[1] - s.span[0];
}

/** True when this room represents open space (no walls of its own). */
function roomIsOpen(r: RoomPartition, isGround: boolean): boolean {
  if (r.open) return true;
  if (r.kind === "corridor") return true;
  if (isGround && r.kind === "living") return true; // open parking bays / driveway
  return false;
}

function doorSizes(roomKind: string, wallH: number): { dW: number; dH: number } {
  const dW = roomKind === "bath" ? 750 : roomKind === "corridor" ? 1200 : 900;
  const dH = Math.min(roomKind === "bath" ? 2000 : 2100, wallH - 150);
  return { dW, dH };
}

function windowSizes(roomKind: string, wallH: number): { wW: number; wH: number; wZ: number } | null {
  const wW = roomKind === "bath" ? 600 : roomKind === "kitchen" ? 1200 : 1500;
  const wH = roomKind === "bath" ? 500 : 1200;
  let wZ = roomKind === "bath" ? 1950 : 900;
  const avail = wallH - wH - 100;
  if (wZ > avail) wZ = avail;
  if (wZ < 500) return null;
  return { wW, wH, wZ };
}

/** Does opening [o0,o1] on this segment intersect a grid column footprint? */
function openingHitsColumn(geo: FloorGeo, seg: WallSeg, o0: number, o1: number): boolean {
  for (let ix = 0; ix < geo.colsX; ix++) {
    for (let iy = 0; iy < geo.colsY; iy++) {
      const cx = geo.bldgMinX + ix * geo.spanX;
      const cy = geo.bldgMinY + iy * geo.spanY;
      if (seg.axis === "x") {
        if (o1 > cx - geo.colSizeX / 2 && o0 < cx + geo.colSizeX / 2 && seg.band[1] > cy - geo.colSizeY / 2 && seg.band[0] < cy + geo.colSizeY / 2) {
          return true;
        }
      } else {
        if (o1 > cy - geo.colSizeY / 2 && o0 < cy + geo.colSizeY / 2 && seg.band[1] > cx - geo.colSizeX / 2 && seg.band[0] < cx + geo.colSizeX / 2) {
          return true;
        }
      }
    }
  }
  return false;
}

const SIDE_LABELS: Record<string, string> = {
  front: "Front Exterior Wall",
  rear: "Rear Exterior Wall",
  left: "Left Exterior Wall",
  right: "Right Exterior Wall",
};

/**
 * Emits one floor's complete wall network: envelope + room partitions, merged,
 * trimmed at columns and at wall junctions, with doors/windows fitted between
 * the floor slab and the beam line. `placed` receives the cutters (columns) and
 * every emitted wall solid so later pieces subtract against them.
 */
function synthesizeFloorWalls(
  geo: FloorGeo,
  rooms: RoomPartition[],
  placed: BoxDef[],
  out: MeshObject[],
  notes: string[],
  idPrefix: string,
  isGround: boolean,
): void {
  const wallH = geo.wallTopZ - geo.wallBotZ;
  const segs: WallSeg[] = [...envelopeSegs(geo)];

  for (const room of rooms) {
    if (roomIsOpen(room, isGround)) continue;
    const roomSegs = room.pointsRel && room.pointsRel.length >= 4 ? polygonRoomSegs(room, geo) : rectRoomSegs(room, geo);
    for (const s of roomSegs) {
      // Filter out interior windows (only exterior walls get windows)
      s.openings = s.openings.filter((op) => {
        if (op.type === "window" && !s.exterior) {
          notes.push(`skipped interior window for ${room.nameEn} (${s.side} edge)`);
          return false;
        }
        return true;
      });
      segs.push(s);
    }
  }

  // Merge collinear segments that share the same wall band (shared walls).
  const map = new Map<string, WallSeg>();
  for (const s of segs) {
    // Skip near-zero-thickness bands — they indicate adjacent room edges separated
    // by less than a millimetre, which would otherwise produce degenerate partitions.
    const bandW = s.band[1] - s.band[0];
    if (!s.exterior && bandW < 50) {
      notes.push(`skipped near-zero-thickness band for ${s.label} (${Math.round(bandW)}mm gap)`);
      continue;
    }
    const key = segKey(s);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...s });
      continue;
    }
    existing.span = [Math.min(existing.span[0], s.span[0]), Math.max(existing.span[1], s.span[1])];
    existing.exterior = existing.exterior || s.exterior;
    // Concatenate openings; skip overlaps within 50mm
    for (const op of s.openings) {
      const overlap = existing.openings.some(
        (e) => e.type === op.type && Math.abs(e.span[0] - op.span[0]) < 50,
      );
      if (!overlap) existing.openings.push(op);
    }
    if (!existing.exterior && s.exterior) existing.label = s.label;
  }

  // Exterior walls first (through walls win), then longer spans first.
  const merged = [...map.values()].sort(
    (a, b) => (b.exterior ? 1 : 0) - (a.exterior ? 1 : 0) || spanLen(b) - spanLen(a),
  );

  let pieceSeq = 0;

  for (const seg of merged) {
    const [a0, a1] = seg.span;
    const [p0, p1] = seg.band;
    const thick = p1 - p0;
    const wallKind = seg.exterior ? "wall" : "partition";
    const wallLabel = seg.exterior ? SIDE_LABELS[seg.side] || "Exterior Wall" : `${seg.label} Partition`;
    const margin = seg.exterior ? 350 : 250;

    const makeBox = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, kind: string, label: string) => {
      let pieces: BoxDef[] = [{ minX: x0, minY: y0, minZ: z0, maxX: x1, maxY: y1, maxZ: z1 }];
      for (const cutter of placed) {
        const next: BoxDef[] = [];
        for (const piece of pieces) next.push(...subtractBox(piece, cutter));
        pieces = next;
      }
      for (const piece of pieces) {
        const obj = createBoxMesh(
          `${idPrefix}_w${pieceSeq++}`,
          label,
          kind,
          geo.phaseKey,
          piece.minX,
          piece.minY,
          piece.minZ,
          piece.maxX,
          piece.maxY,
          piece.maxZ,
        );
        if (obj && (obj.bboxMaxMm[0] - obj.bboxMinMm[0] >= 1) && (obj.bboxMaxMm[1] - obj.bboxMinMm[1] >= 1) && (obj.bboxMaxMm[2] - obj.bboxMinMm[2] >= 1)) {
          out.push(obj);
          placed.push(piece);
        }
      }
    };

    const solid = (a: number, b: number) => {
      if (b - a < 1) return;
      if (seg.axis === "x") {
        makeBox(a, p0, geo.wallBotZ, b, p1, geo.wallTopZ, wallKind, wallLabel);
      } else {
        makeBox(p0, a, geo.wallBotZ, p1, b, geo.wallTopZ, wallKind, wallLabel);
      }
    };

    // Opening specs (centered within each request's sub-span, margin-checked, column-checked)
    const openings: OpeningSpec[] = [];
    for (const req of seg.openings) {
      const { dW, dH } = req.type === "door"
        ? doorSizes(req.roomKind, wallH)
        : (() => ({ dW: 0, dH: 0 }))();
      const sizes = req.type === "window" ? windowSizes(req.roomKind, wallH) : null;
      const oW = req.type === "door" ? dW : sizes?.wW ?? 0;
      const oH = req.type === "door" ? dH : sizes?.wH ?? 0;
      const oZ = req.type === "window" ? sizes?.wZ ?? 0 : geo.wallBotZ;
      const [s0, s1] = req.span;
      const clampedSpan: [number, number] = [Math.max(a0, s0), Math.min(a1, s1)];
      // v2.4.1: slide the opening along its wall to clear columns, and let windows (not doors)
      // narrow to 80 % / 60 % before giving up, instead of silently dropping the window.
      const widths = req.type === "window" ? [oW, Math.round(oW * 0.8), Math.round(oW * 0.6)] : [oW];
      let placedSpan: [number, number] | null = null;
      let lastReason = "wall too short or span mismatch";
      for (const w of widths) {
        const lo = clampedSpan[0] + margin;
        const hi = clampedSpan[1] - margin - w;
        if (hi < lo || w < 500) continue;
        const centre = (clampedSpan[0] + clampedSpan[1]) / 2 - w / 2;
        for (let off = 0; off <= hi - lo + 1 && !placedSpan; off += 50) {
          for (const sign of off === 0 ? [1] : [1, -1]) {
            const o0 = Math.min(hi, Math.max(lo, centre + sign * off));
            if (!openingHitsColumn(geo, seg, o0, o0 + w)) { placedSpan = [o0, o0 + w]; break; }
            lastReason = "column at opening position";
          }
        }
        if (placedSpan) break;
      }
      if (placedSpan) {
        const oClamped = placedSpan;
        openings.push({
          a0: oClamped[0],
          a1: oClamped[1],
          type: req.type,
          roomKind: req.roomKind,
          z0: req.type === "door" ? geo.wallBotZ : geo.wallBotZ + (sizes?.wZ ?? 0),
          z1: req.type === "door" ? geo.wallBotZ + dH : geo.wallBotZ + (sizes?.wZ ?? 0) + (sizes?.wH ?? 0),
          wZ: req.type === "window" ? sizes?.wZ : undefined,
        });
      } else {
        notes.push(`skipped ${req.type} for ${seg.label} (${lastReason})`);
      }
    }

    openings.sort((p, q) => p.a0 - q.a0);

    let cursor = a0;
    for (const op of openings) {
      solid(cursor, op.a0);
      if (op.type === "door") {
        const dH = op.z1 - op.z0;
        // Lintel band above the door (clamped to the beam line)
        const lintelTop = Math.min(op.z1 + 150, geo.wallTopZ);
        if (lintelTop - op.z1 > 1) {
          if (seg.axis === "x") makeBox(op.a0, p0, op.z1, op.a1, p1, lintelTop, "beam", "RCC Lintel");
          else makeBox(p0, op.a0, op.z1, p1, op.a1, lintelTop, "beam", "RCC Lintel");
        }
        out.push(
          ...createDoor3DMesh(
            `${idPrefix}_d${pieceSeq++}`,
            seg.axis === "x" ? op.a0 : p0,
            seg.axis === "x" ? p0 : op.a0,
            op.z0,
            op.a1 - op.a0,
            thick,
            dH,
            seg.axis === "x" ? "X" : "Y",
            op.roomKind,
            geo.phaseKey,
          ),
        );
      } else {
        // Window: spandrel below, head above, then the window assembly
        if (op.z0 - geo.wallBotZ > 1) {
          if (seg.axis === "x") makeBox(op.a0, p0, geo.wallBotZ, op.a1, p1, op.z0, wallKind, wallLabel);
          else makeBox(p0, op.a0, geo.wallBotZ, p1, op.a1, op.z0, wallKind, wallLabel);
        }
        if (geo.wallTopZ - op.z1 > 1) {
          if (seg.axis === "x") makeBox(op.a0, p0, op.z1, op.a1, p1, geo.wallTopZ, wallKind, wallLabel);
          else makeBox(p0, op.a0, op.z1, p1, op.a1, geo.wallTopZ, wallKind, wallLabel);
        }
        out.push(
          ...createWindow3DMesh(
            `${idPrefix}_win${pieceSeq++}`,
            seg.axis === "x" ? op.a0 : p0,
            seg.axis === "x" ? p0 : op.a0,
            op.z0,
            op.a1 - op.a0,
            thick,
            op.z1 - op.z0,
            seg.axis === "x" ? "X" : "Y",
            op.roomKind === "bath",
            geo.phaseKey,
          ),
        );
      }
      cursor = op.a1;
    }
    solid(cursor, a1);
  }
}

// ======================================================================
// Fitted room fixtures (v2.3) — sized to their rooms, stopping at the
// beam line so nothing clips through slabs or beams.
// ======================================================================

function createFittedStair(
  baseId: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  riseH: number,
  phase: string,
): MeshObject[] {
  const objects: MeshObject[] = [];
  if (w < 1000 || d < 1800) return objects;
  const gap = 200;
  const flightW = Math.max(600, (w - gap) / 2);
  let landing = Math.max(900, Math.min(flightW, Math.round(d * 0.3)));
  const n = Math.max(8, Math.min(22, Math.round(riseH / 150)));
  const riserH = riseH / n;
  const n1 = Math.ceil(n / 2);
  const n2 = n - n1;
  let tread = 250;
  let going1 = (n1 - 1) * tread;
  let going2 = (n2 - 1) * tread;
  while (tread > 180 && going1 + landing + going2 > d - 60) {
    tread -= 5;
    going1 = (n1 - 1) * tread;
    going2 = (n2 - 1) * tread;
  }
  if (going1 + landing + going2 > d - 40) return objects; // stairwell too shallow — skip

  // Flight 1 (up to mid landing)
  for (let i = 0; i < n1; i++) {
    objects.push(
      createBoxMesh(
        `${baseId}_f1_${i + 1}`,
        `Flight 1 Step ${i + 1}`,
        "stair",
        phase,
        x,
        y + i * tread,
        z + i * riserH,
        x + flightW,
        y + (i + 1) * tread,
        z + (i + 1) * riserH,
      ),
    );
  }
  // Mid landing slab — sits 5mm BELOW the flight treads to avoid Z-fighting
  objects.push(
    createBoxMesh(
      `${baseId}_landing`,
      "Mid-Landing RCC Slab",
      "slab",
      phase,
      x,
      y + going1,
      z + n1 * riserH - 130,
      x + flightW * 2 + gap,
      y + going1 + landing,
      z + n1 * riserH - 5,
    ),
  );
  // Flight 2 (returning)
  for (let i = 0; i < n2; i++) {
    objects.push(
      createBoxMesh(
        `${baseId}_f2_${i + 1}`,
        `Flight 2 Step ${i + 1}`,
        "stair",
        phase,
        x + flightW + gap,
        y + going1 + landing - (i + 1) * tread,
        z + n1 * riserH + i * riserH,
        x + flightW * 2 + gap,
        y + going1 + landing - i * tread,
        z + n1 * riserH + (i + 1) * riserH,
      ),
    );
  }
  // Top landing slab (flush with the upper floor level) — sits 5mm BELOW flight top to avoid Z-fight
  objects.push(
    createBoxMesh(
      `${baseId}_top`,
      "Top Landing RCC Slab",
      "slab",
      phase,
      x + flightW + gap,
      y,
      z + riseH - 130,
      x + flightW * 2 + gap,
      y + landing,
      z + riseH - 5,
    ),
  );
  // Handrail along flight 1 outer edge (stops under the beam line)
  objects.push(
    createBoxMesh(
      `${baseId}_rail`,
      "Flight Handrail",
      "railing",
      phase,
      x + flightW,
      y,
      z + 900,
      x + flightW + 40,
      y + going1 + landing,
      z + n1 * riserH + 900,
    ),
  );
  return objects;
}

function createFittedBath(
  baseId: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  phase: string,
): MeshObject[] {
  const objects: MeshObject[] = [];
  if (w < 900 || d < 700) return objects;
  // Basin sits at slab level (z), not below — sunken floor is achieved by lower slab Z in structural design
  objects.push(
    createBoxMesh(`${baseId}_basin`, "Bathroom Sunken Floor Basin", "bath", phase, x + 60, y + 60, z, x + w - 60, y + d - 60, z + 50),
  );
  objects.push(
    createBoxMesh(`${baseId}_curb`, "Bathroom Threshold Water Stop Curb", "wall", phase, x + 10, y + 10, z, x + w - 10, y + 110, z + 100),
  );
  objects.push(
    createBoxMesh(`${baseId}_shaft`, "MEP Plumbing Riser Pipe Duct", "wall", phase, x + w - 450, y + d - 450, z, x + w - 60, y + d - 60, z + 2600),
  );
  return objects;
}

function createFittedKitchen(
  baseId: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  phase: string,
): MeshObject[] {
  const objects: MeshObject[] = [];
  if (w < 1200 || d < 1200) return objects;
  const legX = Math.min(2400, w - 120);
  const legY = Math.min(1800, d - 120);
  objects.push(
    createBoxMesh(`${baseId}_leg1`, "Kitchen Counter Slab Main", "kitchen", phase, x, y, z + 775, x + legX, y + 600, z + 850),
  );
  objects.push(
    createBoxMesh(`${baseId}_leg2`, "Kitchen Counter Slab L-Return", "kitchen", phase, x, y + 600, z + 775, x + 600, y + legY, z + 850),
  );
  objects.push(
    createBoxMesh(`${baseId}_sup1`, "Counter Brick Support Wall 1", "wall", phase, x + 50, y + 50, z, x + 150, y + 550, z + 775),
  );
  objects.push(
    createBoxMesh(`${baseId}_sup2`, "Counter Brick Support Wall 2", "wall", phase, x + Math.max(150, legX - 100), y + 50, z, x + Math.max(250, legX), y + 550, z + 775),
  );
  objects.push(
    createBoxMesh(`${baseId}_splash`, "Granite Backsplash Upstand", "wall", phase, x, y + 580, z + 850, x + legX, y + 600, z + 1000),
  );
  return objects;
}

/** Room interior rect with wall bands and a clearance margin removed. */
function roomInsetRect(r: RoomPartition, geo: FloorGeo): [number, number, number, number] {
  const rx1 = geo.bldgMinX + r.boundsRel[0] * geo.bldgWidthMm;
  const ry1 = geo.bldgMinY + r.boundsRel[1] * geo.bldgLengthMm;
  const rx2 = geo.bldgMinX + r.boundsRel[2] * geo.bldgWidthMm;
  const ry2 = geo.bldgMinY + r.boundsRel[3] * geo.bldgLengthMm;
  const isRearExt = r.boundsRel[1] <= BOUND_EPS;
  const isFrontExt = r.boundsRel[3] >= 1 - BOUND_EPS;
  const isLeftExt = r.boundsRel[0] <= BOUND_EPS;
  const isRightExt = r.boundsRel[2] >= 1 - BOUND_EPS;
  const t = (exterior: boolean) => (exterior ? geo.extThick : geo.intThick) / 2 + 80;
  return [rx1 + t(isLeftExt), ry1 + t(isRearExt), rx2 - t(isRightExt), ry2 - t(isFrontExt)];
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

  // ── Merge user customization with defaults (single source of truth) ──
  const acc = custom?.accessibility ?? DEFAULT_ACCESSIBILITY;
  const accResolved: AccessibilitySettings = {
    ...DEFAULT_ACCESSIBILITY,
    ...acc,
    elevatorRequired: acc.elevatorRequired ?? stories >= 4,
    wcClearMm: acc.wcClearMm ?? DEFAULT_ACCESSIBILITY.wcClearMm,
    elevatorWellMm: acc.elevatorWellMm ?? DEFAULT_ACCESSIBILITY.elevatorWellMm,
  };
  const sust = custom?.sustainability ?? DEFAULT_SUSTAINABILITY_DHAKA;
  const fire = custom?.fireSafety ?? { ...DEFAULT_FIRE_SAFETY, sprinklerSystem: stories >= 6 };
  const ve = custom?.valueEngineering ?? DEFAULT_VALUE_ENGINEERING;
  const cm = custom?.constructionMgmt ?? DEFAULT_CONSTRUCTION_MGMT;

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

  // Auto column sizing — validated by scripts/structural-sweep.ts (BNBC 2020, M25/Fe415,
  // 12-column 4x3 grid, target column utilization ≤ 0.80 and beam ≤ 0.85):
  //   Stories 2-3: 300mm all plots | 5: 300/300/350 | 7: 350/350/400 (by plot area)
  const plotArea = project.plotSqm || 200;
  const autoCol = (s: number, area: number): number => {
    if (s <= 3) return 300;
    if (s <= 6) return area > 300 ? 350 : 300;
    return area > 300 ? 400 : 350;
  };
  const defaultCol = Math.max(300, autoCol(stories, plotArea));
  const colSizeX = custom?.columnWidthMm || defaultCol;
  const colSizeY = custom?.columnDepthMm || defaultCol;
  const footingPadSize = custom?.footingSizeMm || Math.max(1800, stories >= 5 ? 2000 : 1800);
  const footingDepth = custom?.footingDepthMm || Math.max(1600, stories >= 5 ? 1800 : 1600);
  const storyHeightMm = 3000;
  const slabThickMm = 125;
  // Beam depth scales with column size (spanX/Y ~ 4-6m) — 500mm for 300mm+ columns
  const beamDepthMm = colSizeX >= 300 ? 500 : 450;
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
  const notes: string[] = [];
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

  // Stub footprints (for trimming grade beams)
  const stubHalf = (colSizeX + 50) / 2;
  const stubHalfY = (colSizeY + 50) / 2;
  const stubCuts: Array<[number, number]> = [];
  const stubCutsY: Array<[number, number]> = [];
  for (let ix = 0; ix < colsX; ix++) {
    const cx = bldgMinX + ix * spanX;
    stubCuts.push([cx - stubHalf, cx + stubHalf]);
  }
  for (let iy = 0; iy < colsY; iy++) {
    const cy = bldgMinY + iy * spanY;
    stubCutsY.push([cy - stubHalfY, cy + stubHalfY]);
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
          cx - stubHalf,
          cy - stubHalfY,
          -footingDepth + 450,
          cx + stubHalf,
          cy + stubHalfY,
          0,
        ),
      );
    }
  }

  // Grade Beams / Plinth Tie Beams along grid lines connecting columns —
  // trimmed at pedestal stub faces so beam and stub solids never overlap.
  {
    let k = 0;
    for (let iy = 0; iy < colsY; iy++) {
      const cy = bldgMinY + iy * spanY;
      for (const [a, b] of splitRanges(bldgMinX, bldgMaxX, stubCuts)) {
        allObjects.push(
          createBoxMesh(
            `grade_beam_x_${iy + 1}_${++k}`,
            `Grade Beam X Line ${iy + 1}`,
            "beam",
            "foundation",
            a,
            cy - beamWidthMm / 2,
            -beamDepthMm,
            b,
            cy + beamWidthMm / 2,
            0,
          ),
        );
      }
    }
    k = 0;
    for (let ix = 0; ix < colsX; ix++) {
      const cx = bldgMinX + ix * spanX;
      for (const [a, b] of splitRanges(bldgMinY, bldgMaxY, stubCutsY)) {
        allObjects.push(
          createBoxMesh(
            `grade_beam_y_${ix + 1}_${++k}`,
            `Grade Beam Y Line ${ix + 1}`,
            "beam",
            "foundation",
            cx - beamWidthMm / 2,
            a,
            -beamDepthMm,
            cx + beamWidthMm / 2,
            b,
            0,
          ),
        );
      }
    }
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
      frameMaxY + 1600, // front apron carries the entry steps and canopy pillars
      150,
    ),
  );

  // Plinth Wall (450mm elevated finish level above road driveway) — Z starts at ground floor level
  allObjects.push(
    createBoxMesh(
      "plinth_wall",
      "Elevated Plinth Wall (450mm above driveway)",
      "plinth",
      "ground_floor",
      frameMinX - 50,
      frameMinY - 50,
      600,
      frameMaxX + 50,
      frameMaxY + 50,
      1050,
    ),
  );

  // Main Entry Steps (3 steps rising from driveway to plinth level)
  const plinthEdgeY = frameMaxY + 50;
  for (let s = 0; s < 3; s++) {
    // s = 0 is the step against the building (top = plinth level 600); each step out is 150 lower.
    allObjects.push(
      createBoxMesh(
        `plinth_step_${s + 1}`,
        `Entrance Step ${3 - s}`,
        "canopy",
        "ground_floor",
        bldgMinX + spanX * 1.5,
        plinthEdgeY + s * 250,
        150,
        bldgMinX + spanX * 2.5,
        plinthEdgeY + (s + 1) * 250,
        600 - s * 150,
      ),
    );
  }

  // Underground Septic Tank (18.5 m3) — clear of the footing pad zone
  allObjects.push(
    createBoxMesh(
      "ug_septic_tank",
      "Underground RCC Septic Tank (18.5 m³, clear of footings)",
      "tank",
      "ground_floor",
      bldgMinX - 3400,
      bldgMinY + 400,
      -2200,
      bldgMinX - 1400,
      bldgMinY + 3400,
      -200,
    ),
  );

  // Underground Water Reservoir (25,000 Liters) — clear of the footing pad zone
  allObjects.push(
    createBoxMesh(
      "ug_water_reservoir",
      "Underground Water Reservoir (25,000 Liters, clear of footings)",
      "tank",
      "ground_floor",
      bldgMaxX + 1400,
      bldgMinY + 400,
      -2500,
      bldgMaxX + 3900,
      bldgMinY + 3900,
      -200,
    ),
  );

  // Ground Floor Columns (rise from plinth top)
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
          600,
          cx + colSizeX / 2,
          cy + colSizeY / 2,
          storyHeightMm,
        ),
      );
    }
  }

  // Ground Entrance Canopy (Porch Roof over main entry) —
// underside sits 10mm ABOVE the ground-floor beam top to eliminate beam overlap
  const beamTopG = storyHeightMm; // beam top = storyHeightMm (beams span storyHeightMm - beamDepthMm → storyHeightMm)
  allObjects.push(
    createBoxMesh(
      "entrance_canopy",
      "Main Entrance Portico & Canopy",
      "canopy",
      "ground_floor",
      bldgMinX + spanX * 1.2,
      bldgMaxY,
      2400,
      bldgMinX + spanX * 2.8,
      bldgMaxY + 1500,
      2525,
    ),
  );
  // Canopy Support Pillars (reclassified as "canopy" to avoid skewing structural column analysis)
  allObjects.push(
    createBoxMesh(
      "canopy_pillar_1",
      "Canopy Left Pillar",
      "canopy",
      "ground_floor",
      bldgMinX + spanX * 1.3,
      bldgMaxY + 1350,
      150,
      bldgMinX + spanX * 1.3 + colSizeX,
      bldgMaxY + 1500,
      2400,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "canopy_pillar_2",
      "Canopy Right Pillar",
      "canopy",
      "ground_floor",
      bldgMinX + spanX * 2.7 - colSizeX,
      bldgMaxY + 1350,
      150,
      bldgMinX + spanX * 2.7,
      bldgMaxY + 1500,
      2400,
    ),
  );

  // Ground-floor frame beams (grid lines, trimmed at columns)
  {
    let k = 0;
    for (let iy = 0; iy < colsY; iy++) {
      const cy = bldgMinY + iy * spanY;
      for (const [a, b] of splitRanges(frameMinX, frameMaxX, colCutsX(bldgMinX, spanX, colSizeX, colsX))) {
        allObjects.push(
          createBoxMesh(
            `beam_g_x_${iy + 1}_${++k}`,
            `Ground Beam X Line ${iy + 1}`,
            "beam",
            "ground_floor",
            a,
            cy - beamWidthMm / 2,
            storyHeightMm - beamDepthMm,
            b,
            cy + beamWidthMm / 2,
            storyHeightMm,
          ),
        );
      }
    }
    k = 0;
    for (let ix = 0; ix < colsX; ix++) {
      const cx = bldgMinX + ix * spanX;
      for (const [a, b] of splitRanges(frameMinY, frameMaxY, colCutsY(bldgMinY, spanY, colSizeY, colsY))) {
        allObjects.push(
          createBoxMesh(
            `beam_g_y_${ix + 1}_${++k}`,
            `Ground Beam Y Line ${ix + 1}`,
            "beam",
            "ground_floor",
            cx - beamWidthMm / 2,
            a,
            storyHeightMm - beamDepthMm,
            cx + beamWidthMm / 2,
            b,
            storyHeightMm,
          ),
        );
      }
    }
  }

  // Ground floor walls: active parking/guard preset + envelope
  {
    const groundPhase = project.phases?.find((p) => p.kind === "ground_floor");
    const presetId = (groundPhase?.data?.selectedFloorplanPreset as string) || "preset-ground-parking";
    const activePreset = FLOORPLAN_PRESETS.find((p) => p.id === presetId) || FLOORPLAN_PRESETS[2];

    const geo: FloorGeo = {
      bldgMinX,
      bldgMaxX,
      bldgMinY,
      bldgMaxY,
      bldgWidthMm,
      bldgLengthMm,
      frameMinX,
      frameMaxX,
      frameMinY,
      frameMaxY,
      colSizeX,
      colSizeY,
      spanX,
      spanY,
      colsX,
      colsY,
      extThick: EXT_WALL_THICK,
      intThick: INT_WALL_THICK,
      wallBotZ: 600,
      wallTopZ: storyHeightMm - beamDepthMm,
      phaseKey: "ground_floor",
    };
    const placed = columnCutterBoxes(geo, 600, storyHeightMm);
    synthesizeFloorWalls(geo, snapRoomsToEnvelope(activePreset.rooms), placed, allObjects, notes, "g", true);

    // Fixtures for enclosed ground rooms
    for (const room of snapRoomsToEnvelope(activePreset.rooms)) {
      if (roomIsOpen(room, true)) continue;
      if (room.kind === "bath") {
        const [x0, y0, x1, y1] = roomInsetRect(room, geo);
        allObjects.push(...createFittedBath(`g_${room.id}_bath`, x0, y0, 600, x1 - x0, y1 - y0, "ground_floor"));
      }
    }

    // Standalone dog-legged stair to the first floor, placed in the open driveway area
    const stairX = bldgMinX + bldgWidthMm * 0.5 - 1100;
    const stairY = bldgMinY + bldgLengthMm * 0.1;
    allObjects.push(
      ...createFittedStair("g_staircase", stairX, stairY, 600, 2200, 4200, storyHeightMm - beamDepthMm - 600, "ground_floor"),
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

    // Frame beams along every grid line (perimeter + interior), trimmed at columns
    {
      let k = 0;
      for (let iy = 0; iy < colsY; iy++) {
        const cy = bldgMinY + iy * spanY;
        for (const [a, b] of splitRanges(frameMinX, frameMaxX, colCutsX(bldgMinX, spanX, colSizeX, colsX))) {
          allObjects.push(
            createBoxMesh(
              `beam_f${s}_x_${iy + 1}_${++k}`,
              `Floor ${s} Beam X Line ${iy + 1}`,
              "beam",
              phaseKey,
              a,
              cy - beamWidthMm / 2,
              nextZ - beamDepthMm,
              b,
              cy + beamWidthMm / 2,
              nextZ,
            ),
          );
        }
      }
      k = 0;
      for (let ix = 0; ix < colsX; ix++) {
        const cx = bldgMinX + ix * spanX;
        for (const [a, b] of splitRanges(frameMinY, frameMaxY, colCutsY(bldgMinY, spanY, colSizeY, colsY))) {
          allObjects.push(
            createBoxMesh(
              `beam_f${s}_y_${ix + 1}_${++k}`,
              `Floor ${s} Beam Y Line ${ix + 1}`,
              "beam",
              phaseKey,
              cx - beamWidthMm / 2,
              a,
              nextZ - beamDepthMm,
              cx + beamWidthMm / 2,
              b,
              nextZ,
            ),
          );
        }
      }
    }

    // Interior Room Partition Walls from the active floor-plan layout
    // Floor's own selection -> project typical plan -> preset implied by units/floor (never a blind default)
    const presetId = resolveFloorPresetId(project, s);
    const activePreset = FLOORPLAN_PRESETS.find((p) => p.id === presetId) || FLOORPLAN_PRESETS[0];

    const geo: FloorGeo = {
      bldgMinX,
      bldgMaxX,
      bldgMinY,
      bldgMaxY,
      bldgWidthMm,
      bldgLengthMm,
      frameMinX,
      frameMaxX,
      frameMinY,
      frameMaxY,
      colSizeX,
      colSizeY,
      spanX,
      spanY,
      colsX,
      colsY,
      extThick: EXT_WALL_THICK,
      intThick: INT_WALL_THICK,
      wallBotZ: floorZ + slabThickMm,
      wallTopZ: nextZ - beamDepthMm,
      phaseKey,
    };
    const placed = columnCutterBoxes(geo, floorZ + slabThickMm, nextZ);
    synthesizeFloorWalls(geo, snapRoomsToEnvelope(activePreset.rooms), placed, allObjects, notes, `f${s}`, false);

    // Fitted fixtures per room
    for (const room of snapRoomsToEnvelope(activePreset.rooms)) {
      if (roomIsOpen(room, false)) continue;
      const [x0, y0, x1, y1] = roomInsetRect(room, geo);
      if (room.kind === "kitchen") {
        allObjects.push(...createFittedKitchen(`f${s}_${room.id}_kit`, x0, y0, geo.wallBotZ, x1 - x0, y1 - y0, phaseKey));
      } else if (room.kind === "bath") {
        allObjects.push(...createFittedBath(`f${s}_${room.id}_bath`, x0, y0, geo.wallBotZ, x1 - x0, y1 - y0, phaseKey));
    } else if (room.kind === "stair") {
        const stairResult = createFittedStair(`f${s}_${room.id}_stair`, x0, y0, geo.wallBotZ, x1 - x0, y1 - y0, geo.wallTopZ - geo.wallBotZ, phaseKey);
        if (stairResult.length === 0) {
          // Stairwell too narrow for dog-leg — emit a simple open-riser stair void marker
          allObjects.push(
            createBoxMesh(
              `f${s}_stair_void`,
              `Floor ${s} Stair Core (open riser)`,
              "stair",
              phaseKey,
              x0, y0, geo.wallBotZ,
              x1, y1, geo.wallTopZ,
            ),
          );
        } else {
          allObjects.push(...stairResult);
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

  // Perimeter Parapet Walls (1000mm safe continuous parapet with coping),
  // trimmed at corners so parapet solids never overlap each other.
  allObjects.push(
    createBoxMesh(
      "parapet_front",
      "Front Parapet Wall (1.0m)",
      "parapet",
      "roof",
      frameMinX + 125,
      frameMaxY - 125,
      roofZ + slabThickMm,
      frameMaxX - 125,
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
      frameMinX + 125,
      frameMinY,
      roofZ + slabThickMm,
      frameMaxX - 125,
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
      frameMinY + 125,
      roofZ + slabThickMm,
      frameMinX + 125,
      frameMaxY - 125,
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
      frameMinY + 125,
      roofZ + slabThickMm,
      frameMaxX,
      frameMaxY - 125,
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

  // Overhead Water Reservoir Tank with Support Piers (kind="tank" to avoid skewing column analysis)
  const tankCapacity = stories * 2500;
  // 4 Support Concrete Piers elevating tank above penthouse
  const pierZ = roofZ + slabThickMm + 2525;
  allObjects.push(
    createBoxMesh(
      "tank_pier_1",
      "Water Tank Support Pier 1",
      "tank",
      "roof",
      bldgMinX + spanX * 1.1,
      bldgMinY + spanY * 0.6,
      pierZ,
      bldgMinX + spanX * 1.1 + colSizeX,
      bldgMinY + spanY * 0.6 + colSizeY,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_2",
      "Water Tank Support Pier 2",
      "tank",
      "roof",
      bldgMinX + spanX * 2.0 - colSizeX,
      bldgMinY + spanY * 0.6,
      pierZ,
      bldgMinX + spanX * 2.0,
      bldgMinY + spanY * 0.6 + colSizeY,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_3",
      "Water Tank Support Pier 3",
      "tank",
      "roof",
      bldgMinX + spanX * 1.1,
      bldgMinY + spanY * 1.4 - colSizeY,
      pierZ,
      bldgMinX + spanX * 1.1 + colSizeX,
      bldgMinY + spanY * 1.4,
      pierZ + 800,
    ),
  );
  allObjects.push(
    createBoxMesh(
      "tank_pier_4",
      "Water Tank Support Pier 4",
      "tank",
      "roof",
      bldgMinX + spanX * 2.0 - colSizeX,
      bldgMinY + spanY * 1.4 - colSizeY,
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
  // PHASE FILTERING (extracted to filterMeshByPhase helper)
  // ==========================================
  // v2.4.1: make every solid interior-disjoint (columns > beams > lintels > slabs > stairs > ... > walls
  // > plinth fill). Walls therefore wrap columns and stop at beam soffits by carving, duplicated
  // door/window assemblies on shared walls collapse, and nothing shares volume => no z-fighting.
  const resolved = resolveSolids(
    allObjects.filter((o): o is MeshObject => o != null),
    [],
    { ...DEFAULT_PRIORITY, plinth: 30, bath: 45, kitchen: 45 },
  ).objects;
  let filtered = filterMeshByPhase(resolved, phaseFilter);

  // Fallback to the full mesh if filter yields empty
  if (filtered.length === 0) {
    console.warn(`Phase filter "${phaseFilter}" yielded no objects; returning full mesh`);
    filtered = resolved;
  }

  // Filter out any null entries (degenerate boxes from createBoxMesh)
  const cleanObjects = filtered.filter((o): o is MeshObject => o != null);

  return {
    schemaVersion: "0.1.0",
    units: "mm",
    objects: cleanObjects,
    ...(notes.length > 0 ? { notes } : {}),
  };
}

/** Split [a0,a1] at each cut interval [c0,c1] (sorted), yielding disjoint pieces. */
function splitRanges(a0: number, a1: number, cuts: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...cuts].sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cursor = a0;
  for (const [c0, c1] of sorted) {
    if (c1 <= cursor) continue;
    if (c0 > cursor) out.push([cursor, Math.min(c0, a1)]);
    cursor = Math.max(cursor, c1);
  }
  if (cursor < a1) out.push([cursor, a1]);
  return out.filter(([x, y]) => y - x > 1);
}

/** Column centerline cuts along X for beam trimming. */
function colCutsX(bldgMinX: number, spanX: number, colSizeX: number, colsX: number): Array<[number, number]> {
  const cuts: Array<[number, number]> = [];
  for (let ix = 0; ix < colsX; ix++) {
    const cx = bldgMinX + ix * spanX;
    cuts.push([cx - colSizeX / 2, cx + colSizeX / 2]);
  }
  return cuts;
}

/** Column centerline cuts along Y for beam trimming. */
function colCutsY(bldgMinY: number, spanY: number, colSizeY: number, colsY: number): Array<[number, number]> {
  const cuts: Array<[number, number]> = [];
  for (let iy = 0; iy < colsY; iy++) {
    const cy = bldgMinY + iy * spanY;
    cuts.push([cy - colSizeY / 2, cy + colSizeY / 2]);
  }
  return cuts;
}

// Re-export types from shared module for backward compatibility
export type {
  BuildingCustomization,
  AccessibilitySettings,
  SustainabilitySettings,
  FireSafetySettings,
  ValueEngineeringSettings,
  ConstructionMgmtSettings,
} from "../types/customization";

// Re-export defaults for backward compatibility
export {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";
