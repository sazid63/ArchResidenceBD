/**
 * Floor plans as real geometry (BUILD_PLAN.md §5).
 *
 * A plan is a TARTAN GRID: bays across the frontage (x, left to right when facing the plot from the
 * road) and bays along the depth (y, from the road side to the back). Every bay has a minimum,
 * preferred and maximum size, so one plan fits a range of plots without stretching rooms by
 * percentages. Rooms are unions of grid cells; walls sit on the grid lines between cells that
 * belong to different rooms; the lines marked structural carry the columns and beams, so the
 * structural grid can never drift away from the plan.
 *
 * All lengths are integer millimetres.
 */

/** Size range of one bay, centre-line to centre-line, in mm. */
export interface Bay {
  min: number;
  pref: number;
  max: number;
}

/** A block of cells by inclusive cell indices: [x0, y0, x1, y1]. */
export type CellRect = readonly [number, number, number, number];

export type RoomKind =
  | "bedroom"
  | "living"
  | "dining"
  | "kitchen"
  | "toilet"
  | "store"
  | "corridor"
  | "lobby"
  | "stair"
  | "lift"
  | "shaft"
  | "parking"
  | "driveway"
  | "guard"
  | "balcony";

export interface Text {
  en: string;
  bn: string;
}

export interface RoomDef {
  id: string;
  kind: RoomKind;
  /** Dwelling the room belongs to ("A", "B", ...); omitted for the shared core. */
  unit?: string;
  name: Text;
  cells: CellRect[];
}

export interface DoorDef {
  /** The two rooms the door connects, by id. */
  between: readonly [string, string];
  /** Clear opening width; defaults by room kind (see rules.ts). */
  widthMm?: number;
  /** The entrance door of a dwelling (from the shared lobby). */
  main?: boolean;
}

export interface PlanDefinition {
  id: string;
  name: Text;
  description: Text;
  unitsPerFloor: number;
  bedroomsPerUnit: number;
  /** Bays across the frontage, left to right (facing the plot from the road). */
  baysX: Bay[];
  /** Bays along the depth, from the road side (y = 0) to the back. */
  baysY: Bay[];
  /** Indices of the x grid lines (0..baysX.length) that carry columns. Must include both ends. */
  structuralX: number[];
  /** Indices of the y grid lines (0..baysY.length) that carry columns. Must include both ends. */
  structuralY: number[];
  rooms: RoomDef[];
  doors: DoorDef[];
}

/** Axis-aligned rectangle in mm (x1 > x0, y1 > y0). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FittedRoom {
  def: RoomDef;
  /** Centre-line rectangles (on grid lines), one per CellRect. */
  rects: Rect[];
  /** Centre-line area in mm². */
  grossAreaMm2: number;
}

/** A plan placed on a buildable envelope: every grid line has a real position. */
export interface FittedPlan {
  plan: PlanDefinition;
  mirrored: boolean;
  /** Grid line positions in mm from the building's left edge / road-side edge. */
  xLines: number[];
  yLines: number[];
  widthMm: number;
  depthMm: number;
  rooms: FittedRoom[];
  /** Bay order and cell indices after mirroring (rooms[i].def.cells are already mirrored). */
  baysX: Bay[];
  structuralX: number[];
  structuralY: number[];
}

export interface FitRejection {
  code: "too_narrow" | "too_shallow" | "invalid_plan";
  message: Text;
  requiredMm?: number;
  availableMm?: number;
}

export type FitResult =
  | { ok: true; fitted: FittedPlan; notes: Text[] }
  | { ok: false; reasons: FitRejection[] };
