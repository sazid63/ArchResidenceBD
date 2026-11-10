/**
 * Everything a fitted plan implies: walls on the grid lines between different rooms, doors on
 * shared walls, windows on outside walls, columns at structural grid crossings and beams along
 * structural lines. Pure functions over a FittedPlan; all lengths in mm.
 */

import { DOOR_JAMB_MM, DOOR_MM, RAILING, WALL_MM, WINDOW_MM, windowWidthForAreaMm } from "./rules";
import type { FittedPlan, FittedRoom, RoomKind } from "./types";

/** Room index, or -1 for outside the building. */
export type Owner = number;
export const OUTSIDE: Owner = -1;

export interface WallSegment {
  /** "v" runs along y at x = at; "h" runs along x at y = at. */
  orientation: "v" | "h";
  at: number;
  from: number;
  to: number;
  /** Rooms on each side (left/bottom first); OUTSIDE (-1) for the outside. */
  a: Owner;
  b: Owner;
  exterior: boolean;
  thicknessMm: number;
  /** The open edge of a balcony: a railing, not a brick wall (no masonry, no wall load). */
  railing?: boolean;
}

export interface Opening {
  kind: "door" | "window";
  orientation: "v" | "h";
  at: number;
  from: number;
  to: number;
  /** Rooms it connects (door) or the room it lights (window: b = OUTSIDE). */
  a: Owner;
  b: Owner;
  main?: boolean;
  /** Doors only: the leaf swings 90 degrees into `into` (a room, never the room it serves from), see opensInto. */
  swing?: DoorSwing;
}

/** How a hinged door opens. `side` is the direction of the room it opens into, along the axis across the wall (+1 = towards larger x or y). */
export interface DoorSwing {
  into: Owner;
  side: 1 | -1;
  /** Which end of the opening carries the hinge. */
  hinge: "from" | "to";
}

/** The three points of an open door in plan (mm): the hinge, the free end of the closed leaf, and the free end of the leaf swung open. */
export function doorLeaf(d: Opening): { hinge: [number, number]; closed: [number, number]; open: [number, number]; lengthMm: number } | null {
  if (!d.swing) return null;
  const len = d.to - d.from;
  const h = d.swing.hinge === "from" ? d.from : d.to;
  const o = d.swing.hinge === "from" ? d.to : d.from;
  const s = d.swing.side * len;
  return d.orientation === "v"
    ? { hinge: [d.at, h], closed: [d.at, o], open: [d.at + s, h], lengthMm: len }
    : { hinge: [h, d.at], closed: [o, d.at], open: [h, d.at + s], lengthMm: len };
}

/** Higher = more private or more enclosed; a door opens into the room with the higher rank. */
const PRIVACY: Partial<Record<RoomKind, number>> = { toilet: 7, store: 6.5, bedroom: 6, kitchen: 5, stair: 4, dining: 3, living: 2, corridor: 1, lobby: 1 };

/**
 * The room a door between `a` and `b` opens into: doors open inwards, into the room they protect. A door between a dwelling and
 * the shared core (the entrance) opens into the dwelling. Otherwise the more private room wins (toilet, dressing or store, bedroom,
 * kitchen, stair, dining, living, corridor, lobby); equal ranks go to the smaller room. Lift doors slide and have no swing (returns null).
 */
export function opensInto(rooms: FittedRoom[], a: number, b: number): number | null {
  const ra = rooms[a];
  const rb = rooms[b];
  if (ra.def.kind === "lift" || rb.def.kind === "lift") return null;
  if (!!ra.def.unit !== !!rb.def.unit) return ra.def.unit ? a : b;
  const pa = PRIVACY[ra.def.kind] ?? 0;
  const pb = PRIVACY[rb.def.kind] ?? 0;
  if (pa !== pb) return pa > pb ? a : b;
  return ra.grossAreaMm2 <= rb.grossAreaMm2 ? a : b;
}

export interface Column {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
}

export interface Beam {
  orientation: "v" | "h";
  at: number;
  from: number;
  to: number;
  spanMm: number;
}

export interface RoomMetrics {
  netAreaM2: number;
  /** Net width and depth of the room's largest rectangle. */
  netWidthMm: number;
  netDepthMm: number;
  /** Length of wall to the outside, and to light shafts. */
  exteriorMm: number;
  shaftMm: number;
}

export interface FloorGeometry {
  fitted: FittedPlan;
  owner: Owner[][]; // [x][y]
  walls: WallSegment[];
  doors: Opening[];
  /** Doors that could not be placed (rooms don't share enough wall). */
  doorProblems: Array<{ between: readonly [string, string]; reason: string; reasonBn: string }>;
  windows: Opening[];
  columns: Column[];
  beams: Beam[];
  metrics: RoomMetrics[];
}

export function ownerGrid(f: FittedPlan): Owner[][] {
  const nx = f.xLines.length - 1;
  const ny = f.yLines.length - 1;
  const grid: Owner[][] = Array.from({ length: nx }, () => Array<Owner>(ny).fill(OUTSIDE));
  f.rooms.forEach((room, i) => {
    for (const [x0, y0, x1, y1] of room.def.cells) for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) grid[x][y] = i;
  });
  return grid;
}

function wallsOf(f: FittedPlan, owner: Owner[][]): WallSegment[] {
  const nx = f.xLines.length - 1;
  const ny = f.yLines.length - 1;
  const at = (x: number, y: number): Owner => (x < 0 || y < 0 || x >= nx || y >= ny ? OUTSIDE : owner[x][y]);
  const out: WallSegment[] = [];
  const push = (seg: Omit<WallSegment, "exterior" | "thicknessMm">) => {
    const exterior = seg.a === OUTSIDE || seg.b === OUTSIDE;
    const prev = out[out.length - 1];
    if (prev && prev.orientation === seg.orientation && prev.at === seg.at && prev.to === seg.from && prev.a === seg.a && prev.b === seg.b) {
      prev.to = seg.to;
      return;
    }
    const open = exterior && [seg.a, seg.b].some((o) => o !== OUTSIDE && f.rooms[o].def.kind === "balcony");
    out.push({ ...seg, exterior, thicknessMm: open ? RAILING.thicknessMm : exterior ? WALL_MM.exterior : WALL_MM.interior, ...(open ? { railing: true } : {}) });
  };
  for (let k = 0; k <= nx; k++)
    for (let j = 0; j < ny; j++) {
      const a = at(k - 1, j);
      const b = at(k, j);
      if (a !== b) push({ orientation: "v", at: f.xLines[k], from: f.yLines[j], to: f.yLines[j + 1], a, b });
    }
  for (let k = 0; k <= ny; k++)
    for (let i = 0; i < nx; i++) {
      const a = at(i, k - 1);
      const b = at(i, k);
      if (a !== b) push({ orientation: "h", at: f.yLines[k], from: f.xLines[i], to: f.xLines[i + 1], a, b });
    }
  return out;
}

const touches = (w: WallSegment, i: Owner) => w.a === i || w.b === i;
const other = (w: WallSegment, i: Owner) => (w.a === i ? w.b : w.a);

/** Half a column (300 mm marker): openings stop at the column face. */
const COLUMN_HALF_MM = 150;

interface Stretch {
  from: number;
  to: number;
  /** Whether each end is a column face (which can serve as a door jamb) rather than a wall junction. */
  columnAtStart: boolean;
  columnAtEnd: boolean;
}

/** The stretches of a wall segment between columns (columns sit on structural crossings), longest first. */
function clearStretches(seg: { orientation: "v" | "h"; at: number; from: number; to: number }, columns: Column[]): Stretch[] {
  const cuts = columns
    .filter((c) => (seg.orientation === "v" ? c.x === seg.at : c.y === seg.at))
    .map((c) => (seg.orientation === "v" ? c.y : c.x))
    .filter((v) => v > seg.from - COLUMN_HALF_MM && v < seg.to + COLUMN_HALF_MM)
    .sort((a, b) => a - b);
  const out: Stretch[] = [];
  let start = seg.from;
  let startCol = false;
  for (const c of cuts) {
    const end = Math.min(seg.to, c - COLUMN_HALF_MM);
    if (end > start) out.push({ from: start, to: end, columnAtStart: startCol, columnAtEnd: true });
    start = Math.max(start, c + COLUMN_HALF_MM);
    startCol = true;
  }
  if (seg.to > start) out.push({ from: start, to: seg.to, columnAtStart: startCol, columnAtEnd: false });
  return out.sort((a, b) => b.to - b.from - (a.to - a.from));
}

/** Usable length for a door: a jamb of wall is needed at each end that isn't a column face. */
function doorRoom(st: Stretch) {
  const from = st.from + (st.columnAtStart ? 0 : DOOR_JAMB_MM);
  const to = st.to - (st.columnAtEnd ? 0 : DOOR_JAMB_MM);
  return { from, to, length: to - from };
}

function doorWidth(kinds: RoomKind[], main?: boolean): number {
  if (main) return DOOR_MM.main;
  const ws = kinds.map((k) => DOOR_MM[k] ?? DOOR_MM.default);
  // A toilet or store door is the small one even when it opens off a bedroom.
  return Math.min(...ws);
}

function metricsOf(f: FittedPlan, room: FittedRoom, index: number, walls: WallSegment[], rooms: FittedRoom[]): RoomMetrics {
  // Net = gross minus the half-wall on every boundary segment (corner overlaps ignored: conservative by a few cm²).
  let lost = 0;
  let exteriorMm = 0;
  let shaftMm = 0;
  for (const w of walls) {
    if (!touches(w, index)) continue;
    const len = w.to - w.from;
    lost += len * (w.thicknessMm / 2);
    const o = other(w, index);
    if (o === OUTSIDE) exteriorMm += len;
    // Assumption: a room that opens onto an open balcony or verandah is lit and aired through it (BNBC 2020 gives no depth limit we could cite).
    else if (rooms[o].def.kind === "balcony") exteriorMm += len;
    else if (rooms[o].def.kind === "shaft") shaftMm += len;
  }
  const main = [...room.rects].sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
  // A side is an outside wall when it lies on the building edge or faces a notch (void): the walls list knows which.
  const ext = (orientation: "v" | "h", at: number, from: number, to: number) =>
    walls.some((w) => touches(w, index) && w.exterior && !w.railing && w.orientation === orientation && w.at === at && Math.min(w.to, to) - Math.max(w.from, from) > 0);
  const half = (onEdge: boolean) => (onEdge ? WALL_MM.exterior / 2 : WALL_MM.interior / 2);
  const netW = main.x1 - main.x0 - half(main.x0 === 0 || ext("v", main.x0, main.y0, main.y1)) - half(main.x1 === f.widthMm || ext("v", main.x1, main.y0, main.y1));
  const netD = main.y1 - main.y0 - half(main.y0 === 0 || ext("h", main.y0, main.x0, main.x1)) - half(main.y1 === f.depthMm || ext("h", main.y1, main.x0, main.x1));
  return {
    netAreaM2: (room.grossAreaMm2 - lost) / 1e6,
    netWidthMm: Math.min(netW, netD),
    netDepthMm: Math.max(netW, netD),
    exteriorMm,
    shaftMm,
  };
}

const bnDigits = (v: number) => String(v).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);

export function deriveGeometry(f: FittedPlan): FloorGeometry {
  const owner = ownerGrid(f);
  const walls = wallsOf(f, owner);
  const idx = new Map(f.rooms.map((r, i) => [r.def.id, i] as const));

  const columns: Column[] = [];
  for (const gx of f.structuralX) for (const gy of f.structuralY) columns.push({ x: f.xLines[gx], y: f.yLines[gy], gridX: gx, gridY: gy });
  const doors: Opening[] = [];
  const doorProblems: FloorGeometry["doorProblems"] = [];
  for (const d of f.plan.doors) {
    const a = idx.get(d.between[0]);
    const b = idx.get(d.between[1]);
    if (a === undefined || b === undefined) {
      doorProblems.push({ between: d.between, reason: "unknown room", reasonBn: "ঘরটি অজানা" });
      continue;
    }
    const width = d.widthMm ?? doorWidth([f.rooms[a].def.kind, f.rooms[b].def.kind], d.main);
    const shared = walls.filter((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)).sort((p, q) => q.to - q.from - (p.to - p.from));
    if (!shared.length) {
      doorProblems.push({ between: d.between, reason: "the rooms do not share a wall", reasonBn: "ঘর দুটির মধ্যে সাধারণ দেয়াল নেই" });
      continue;
    }
    // The longest stretch of shared wall that is clear of columns.
    const options = shared
      .flatMap((seg) => clearStretches(seg, columns).map((st) => ({ seg, room: doorRoom(st) })))
      .sort((p, q) => q.room.length - p.room.length);
    const best = options[0];
    const usable = best ? best.room.length : 0;
    if (!best || usable < width) {
      doorProblems.push({ between: d.between, reason: `usable shared wall is ${usable} mm (after jambs and columns); the door is ${width} mm`, reasonBn: `দরজা বসানোর মতো দেয়াল ${bnDigits(usable)} মিমি (চৌকাঠ ও কলাম বাদে); দরজা ${bnDigits(width)} মিমি` });
      continue;
    }
    const mid = Math.round((best.room.from + best.room.to) / 2);
    const into = opensInto(f.rooms, a, b);
    const swing: DoorSwing | undefined = into === null ? undefined : { into, side: best.seg.b === into ? 1 : -1, hinge: "from" };
    doors.push({ kind: "door", orientation: best.seg.orientation, at: best.seg.at, from: mid - width / 2, to: mid + width / 2, a, b, main: d.main, ...(swing ? { swing } : {}) });
  }

  const windows: Opening[] = [];
  f.rooms.forEach((room, i) => {
    const want = WINDOW_MM[room.def.kind];
    if (!want) return;
    // The longest stretch of outside wall between columns.
    const stretches = walls
      .filter((w) => w.exterior && touches(w, i))
      .flatMap((seg) => clearStretches(seg, columns).map((st) => ({ seg, st })))
      .sort((p, q) => q.st.to - q.st.from - (p.st.to - p.st.from));
    // One window per stretch, longest stretch first, until the width needed for Table 3.1.12 is reached (at least the usual width).
    let remaining = Math.max(want, windowWidthForAreaMm(room.def.kind, metricsOf(f, room, i, walls, f.rooms).netAreaM2));
    for (const best of stretches) {
      if (remaining <= 0) break;
      const width = Math.min(remaining, best.st.to - best.st.from - 2 * 300);
      if (width < 600) continue;
      const mid = Math.round((best.st.from + best.st.to) / 2);
      windows.push({ kind: "window", orientation: best.seg.orientation, at: best.seg.at, from: mid - Math.floor(width / 2), to: mid - Math.floor(width / 2) + width, a: i, b: OUTSIDE });
      remaining -= width;
    }
  });

  const beams: Beam[] = [];
  for (const gx of f.structuralX)
    for (let k = 1; k < f.structuralY.length; k++) {
      const from = f.yLines[f.structuralY[k - 1]];
      const to = f.yLines[f.structuralY[k]];
      beams.push({ orientation: "v", at: f.xLines[gx], from, to, spanMm: to - from });
    }
  for (const gy of f.structuralY)
    for (let k = 1; k < f.structuralX.length; k++) {
      const from = f.xLines[f.structuralX[k - 1]];
      const to = f.xLines[f.structuralX[k]];
      beams.push({ orientation: "h", at: f.yLines[gy], from, to, spanMm: to - from });
    }

  const metrics = f.rooms.map((r, i) => metricsOf(f, r, i, walls, f.rooms));
  return { fitted: f, owner, walls, doors, doorProblems, windows, columns, beams, metrics };
}
