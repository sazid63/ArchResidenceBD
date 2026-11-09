/**
 * Building model → 3D mesh (ticket M2-2). Replaces the preset-driven generator for projects with a
 * real plot and plan. Every element comes from the model, so the 3D, the plan drawing and the
 * structural grid can't disagree.
 *
 * Plot frame, integer mm. z = 0 is the ground-floor finish. Per storey i (level L_i):
 *   floor slab [L_i − t, L_i] (ground: [−150, 0]); walls [L_i, L_{i+1} − 125], carved by beams;
 *   beams [L_{i+1} − 450, L_{i+1}] on structural lines; columns [L_i, L_{i+1}].
 * Foundation: pads under every column, column stubs and plinth beams. Section sizes come from the
 * structure result when one is passed (the app always passes it), so the 3D shows the members the
 * structure, bar schedule and BOQ were made for; without one, PLACEHOLDER sizes are used.
 *
 * Phases match the old generator ("foundation", "ground_floor", "floor_<n>", "roof"), so
 * `filterMeshByPhase`, the viewer, BOQ and exporters keep working.
 */

import type { MeshDocument, MeshObject } from "../cad/mesh";
import { createDoor3DMesh, createWindow3DMesh } from "../cad/meshParts";
import { createBoxMesh, resolveSolids, type Box, type Void } from "../cad/solidKernel";
import { buildDogLegStair, planStair, type StairPlacement } from "../cad/stairBuilder";
import { OUTSIDE, type FloorGeometry } from "../plans/geometry";
import type { Rect } from "../plans/types";
import type { StructureResult } from "../structure/analyze";
import type { BuildingModel } from "./building";

/** Placeholder sections (mm) until M4 sizes them. */
export const PLACEHOLDER = {
  column: 300,
  beamWidth: 250,
  beamDepth: 450,
  slabGround: 150,
  slabTypical: 125,
  padSize: 1500,
  padDepth: 450,
  foundationDepth: 1500,
  plinthDepth: 450,
} as const;

const DOOR_HEIGHT = 2100;
const WINDOW_SILL = 900;
const WINDOW_HEIGHT = 1200;
const VENT_SILL = 1800;
const VENT_HEIGHT = 600;
/** Clear space at the foot of the stair inside the stair room (arrival landing). */
const STAIR_ARRIVAL = 1000;

const meshPhase = (index: number) => (index === 0 ? "ground_floor" : `floor_${index}`);

/** The section sizes the mesh draws: the designed ones when a structure result is given, else the placeholders. */
export function sectionsFor(design: StructureResult | undefined) {
  const P = PLACEHOLDER;
  const colAt = (x: number, y: number) => design?.frame.columns.find((c) => c.xMm === x && c.yMm === y);
  const lineAt = (orientation: "v" | "h", at: number, level: number) => design?.levels[level]?.beamLines.find((b) => b.orientation === orientation && b.at === at);
  return {
    designed: !!design,
    column(x: number, y: number, storey: number): { bx: number; by: number } {
      const s = colAt(x, y)?.storeys[storey]?.section;
      return s ? { bx: s.bx, by: s.by } : { bx: P.column, by: P.column };
    },
    pad(x: number, y: number): { side: number; depth: number } {
      const f = colAt(x, y)?.footing;
      return f ? { side: f.sideMm, depth: f.depthMm } : { side: P.padSize, depth: P.padDepth };
    },
    /** Beam under the slab above storey `level`. */
    beam(orientation: "v" | "h", at: number, level: number): { b: number; h: number } {
      const s = lineAt(orientation, at, level)?.result.section;
      return s ? { b: s.bMm, h: s.hMm } : { b: P.beamWidth, h: P.beamDepth };
    },
    /** Slab above storey `level` (the last level is the roof). */
    slabAbove(level: number): number {
      return design?.levels[level]?.slabThicknessMm ?? P.slabTypical;
    },
  };
}

export function buildMesh(model: BuildingModel, design?: StructureResult): MeshDocument {
  const S = sectionsFor(design);
  const { x: ox, y: oy } = model.origin;
  const objs: MeshObject[] = [];
  const voids: Void[] = [];
  const isWall = (o: MeshObject) => o.kind === "wall" || o.kind === "partition";
  const isSlab = (o: MeshObject) => o.kind === "slab";

  const box = (id: string, label: string, kind: string, phase: string, b: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }) =>
    objs.push(createBoxMesh(id, label, kind, phase, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1));
  const voidBox = (id: string, b: Box, appliesTo: (o: MeshObject) => boolean) => voids.push({ id, box: b, appliesTo });

  const W = model.widthMm;
  const D = model.depthMm;
  const N = model.storeys.length;
  const level = (i: number) => (i < N ? model.storeys[i].levelMm : model.roof.levelMm);
  const typical = model.storeys[N > 1 ? 1 : 0].geometry;

  // ---- Foundation ------------------------------------------------------------------------
  const P = PLACEHOLDER;
  const tagOf = (what: string) => (S.designed ? what : `${what} (placeholder size)`);
  // The top of every pad sits at one level; a deeper pad reaches further down.
  const padTop = -P.foundationDepth + P.padDepth;
  for (const col of typical.columns) {
    const x = ox + col.x;
    const y = oy + col.y;
    const tag = `${col.gridX}_${col.gridY}`;
    const pad = S.pad(col.x, col.y);
    box(`pad_${tag}`, tagOf("Isolated Footing"), "footing", "foundation", {
      x0: x - pad.side / 2, y0: y - pad.side / 2, z0: padTop - pad.depth, x1: x + pad.side / 2, y1: y + pad.side / 2, z1: padTop,
    });
    // Stub from the pad to the ground-floor finish (z = 0).
    const c0 = S.column(col.x, col.y, 0);
    box(`stub_${tag}`, "Column Stub", "column", "foundation", { x0: x - c0.bx / 2, y0: y - c0.by / 2, z0: padTop, x1: x + c0.bx / 2, y1: y + c0.by / 2, z1: 0 });
  }
  typical.beams.forEach((bm, k) => {
    const r = beamRect(bm, ox, oy, S.beam(bm.orientation, bm.at, 0).b / 2);
    box(`plinth_${k}`, "Plinth Beam", "beam", "foundation", { ...r, z0: -P.plinthDepth, z1: 0 });
  });

  // ---- Storeys ---------------------------------------------------------------------------
  model.storeys.forEach((storey, i) => {
    const geo = storey.geometry;
    const phase = meshPhase(i);
    const L = level(i);
    const top = level(i + 1);
    const slabT = i === 0 ? P.slabGround : S.slabAbove(i - 1);
    const slabTop = S.slabAbove(i);
    const pre = `s${i}`;

    // Floor slab over the whole footprint; openings cut below.
    box(`${pre}_slab`, i === 0 ? "Ground Floor Slab" : `Floor ${i} Slab`, "slab", phase, { x0: ox, y0: oy, z0: L - slabT, x1: ox + W, y1: oy + D, z1: L });
    if (i > 0) slabOpenings(geo, ox, oy, L - slabT, L, `${pre}_slab`, model, voidBox, isSlab);

    // Columns and the beams that carry the slab above.
    for (const col of geo.columns) {
      const x = ox + col.x;
      const y = oy + col.y;
      const sc = S.column(col.x, col.y, i);
      box(`${pre}_col_${col.gridX}_${col.gridY}`, tagOf("RCC Column"), "column", phase, { x0: x - sc.bx / 2, y0: y - sc.by / 2, z0: L, x1: x + sc.bx / 2, y1: y + sc.by / 2, z1: top });
    }
    geo.beams.forEach((bm, k) => {
      const sb = S.beam(bm.orientation, bm.at, i);
      const r = beamRect(bm, ox, oy, sb.b / 2);
      box(`${pre}_beam_${k}`, tagOf("RCC Beam"), "beam", phase, { ...r, z0: top - sb.h, z1: top });
    });

    // Walls on the grid lines; the ground floor leaves the parking open to the outside.
    geo.walls.forEach((w, k) => {
      const rooms = geo.fitted.rooms;
      const sides = [w.a, w.b].map((s) => (s === OUTSIDE ? "outside" : rooms[s].def.kind));
      if (storey.use === "ground" && sides.includes("outside") && sides.includes("parking")) return;
      const t = w.thicknessMm;
      const r = w.orientation === "v"
        ? { x0: ox + w.at - t / 2, y0: oy + w.from, x1: ox + w.at + t / 2, y1: oy + w.to }
        : { x0: ox + w.from, y0: oy + w.at - t / 2, x1: ox + w.to, y1: oy + w.at + t / 2 };
      box(`${pre}_wall_${k}`, w.exterior ? "Brick Wall 250" : "Brick Partition 125", w.exterior ? "wall" : "partition", phase, {
        ...r, z0: L, z1: top - slabTop,
      });
    });

    // Doors and windows: cut the wall, then put the joinery in the hole.
    const openingRect = (o: { orientation: "v" | "h"; at: number; from: number; to: number }, t: number) =>
      o.orientation === "v"
        ? { x0: ox + o.at - t / 2, y0: oy + o.from, x1: ox + o.at + t / 2, y1: oy + o.to }
        : { x0: ox + o.from, y0: oy + o.at - t / 2, x1: ox + o.to, y1: oy + o.at + t / 2 };
    const wallT = (o: { orientation: "v" | "h"; at: number; from: number; to: number }) => {
      const w = geo.walls.find((s) => s.orientation === o.orientation && s.at === o.at && s.from <= o.from && s.to >= o.to);
      return w ? w.thicknessMm : 250;
    };
    geo.doors.forEach((d, k) => {
      const t = wallT(d);
      const r = openingRect(d, t + 2);
      voidBox(`${pre}_door_void_${k}`, { min: [r.x0, r.y0, L], max: [r.x1, r.y1, L + DOOR_HEIGHT] }, isWall);
      const inner = openingRect(d, t);
      const along = d.orientation === "h" ? "X" : "Y";
      objs.push(...createDoor3DMesh(`${pre}_door_${k}`, inner.x0, inner.y0, L, d.to - d.from, t, DOOR_HEIGHT, along, "door", phase));
    });
    geo.windows.forEach((win, k) => {
      const t = wallT(win);
      const room = geo.fitted.rooms[win.a];
      const vent = room?.def.kind === "toilet";
      const z0 = L + (vent ? VENT_SILL : WINDOW_SILL);
      const h = vent ? VENT_HEIGHT : WINDOW_HEIGHT;
      const r = openingRect(win, t + 2);
      voidBox(`${pre}_win_void_${k}`, { min: [r.x0, r.y0, z0], max: [r.x1, r.y1, z0 + h] }, isWall);
      const inner = openingRect(win, t);
      const along = win.orientation === "h" ? "X" : "Y";
      objs.push(...createWindow3DMesh(`${pre}_win_${k}`, inner.x0, inner.y0, z0, win.to - win.from, t, h, along, vent, phase));
    });

    // Stair from this floor to the next.
    const stairRoom = geo.fitted.rooms.find((r) => r.def.kind === "stair");
    if (stairRoom) {
      const pl = stairPlacement(stairRoom.rects[0], ox, oy);
      const { objects } = buildDogLegStair(`${pre}_stair`, L, top - L, pl, phase);
      objs.push(...objects);
    }
  });

  // ---- Roof ------------------------------------------------------------------------------
  const R = model.roof.levelMm;
  const roofT = S.slabAbove(N - 1);
  box("roof_slab", "Roof Slab", "slab", "roof", { x0: ox, y0: oy, z0: R - roofT, x1: ox + W, y1: oy + D, z1: R });
  slabOpenings(typical, ox, oy, R - roofT, R, "roof_slab", model, voidBox, isSlab);

  const cover = (rect: Rect | null, name: string, label: string) => {
    if (!rect) return;
    const H = model.roof.coverHeightMm;
    const r = { x0: ox + rect.x0, y0: oy + rect.y0, x1: ox + rect.x1, y1: oy + rect.y1 };
    const sides: Array<{ id: string; b: { x0: number; y0: number; x1: number; y1: number }; perimeter: boolean; len: number; orient: "X" | "Y" }> = [
      { id: "s", b: { x0: r.x0 - 125, y0: r.y0 - 125, x1: r.x1 + 125, y1: r.y0 + 125 }, perimeter: rect.y0 === 0, len: rect.x1 - rect.x0, orient: "X" },
      { id: "n", b: { x0: r.x0 - 125, y0: r.y1 - 125, x1: r.x1 + 125, y1: r.y1 + 125 }, perimeter: rect.y1 === D, len: rect.x1 - rect.x0, orient: "X" },
      { id: "w", b: { x0: r.x0 - 125, y0: r.y0 + 125, x1: r.x0 + 125, y1: r.y1 - 125 }, perimeter: rect.x0 === 0, len: rect.y1 - rect.y0, orient: "Y" },
      { id: "e", b: { x0: r.x1 - 125, y0: r.y0 + 125, x1: r.x1 + 125, y1: r.y1 - 125 }, perimeter: rect.x1 === W, len: rect.y1 - rect.y0, orient: "Y" },
    ];
    for (const s of sides) box(`${name}_wall_${s.id}`, `${label} Wall`, "wall", "roof", { ...s.b, z0: R, z1: R + H - P.slabTypical });
    box(`${name}_slab`, `${label} Roof`, "slab", "roof", { x0: r.x0 - 125, y0: r.y0 - 125, z0: R + H - P.slabTypical, x1: r.x1 + 125, y1: r.y1 + 125, z1: R + H });
    return { r, sides };
  };
  const stairCover = cover(model.roof.stairCover, "stair_cover", "Stair Cover");
  cover(model.roof.liftRoom, "lift_room", "Lift Machine Room");
  // Roof door out of the stair cover, on the longest side that faces the roof (not the facade).
  if (stairCover) {
    const side = stairCover.sides.filter((s) => !s.perimeter).sort((a, b) => b.len - a.len)[0];
    if (side) {
      const cx = (side.b.x0 + side.b.x1) / 2;
      const cy = (side.b.y0 + side.b.y1) / 2;
      const half = 450;
      const vb: Box = side.orient === "X"
        ? { min: [Math.round(cx - half), side.b.y0 - 1, R], max: [Math.round(cx + half), side.b.y1 + 1, R + DOOR_HEIGHT] }
        : { min: [side.b.x0 - 1, Math.round(cy - half), R], max: [side.b.x1 + 1, Math.round(cy + half), R + DOOR_HEIGHT] };
      voidBox("stair_cover_door_void", vb, (o) => o.id.startsWith("stair_cover_wall"));
      const x = side.orient === "X" ? Math.round(cx - half) : side.b.x0;
      const y = side.orient === "X" ? side.b.y0 : Math.round(cy - half);
      objs.push(...createDoor3DMesh("roof_door", x, y, R, 2 * half, 250, DOOR_HEIGHT, side.orient, "door", "roof"));
    }
    // Overhead water tank on the stair cover.
    const r = stairCover.r;
    const top = R + model.roof.coverHeightMm;
    box("roof_tank", "Overhead Water Tank", "tank", "roof", { x0: r.x0 + 300, y0: r.y0 + 300, z0: top, x1: r.x1 - 300, y1: r.y1 - 300, z1: top + 1200 });
  }
  // Parapet around the roof edge (after the covers, so a cover wall on the facade wins the overlap).
  const p = model.roof.parapetMm;
  const edges = [
    { id: "front", x0: ox, y0: oy, x1: ox + W, y1: oy + 250 },
    { id: "rear", x0: ox, y0: oy + D - 250, x1: ox + W, y1: oy + D },
    { id: "left", x0: ox, y0: oy + 250, x1: ox + 250, y1: oy + D - 250 },
    { id: "right", x0: ox + W - 250, y0: oy + 250, x1: ox + W, y1: oy + D - 250 },
  ];
  for (const e of edges) box(`parapet_${e.id}`, "Roof Parapet", "parapet", "roof", { ...e, z0: R, z1: R + p });

  const { objects } = resolveSolids(objs, voids);
  return { schemaVersion: "0.1.0", units: "mm", objects };
}

function beamRect(bm: { orientation: "v" | "h"; at: number; from: number; to: number }, ox: number, oy: number, half: number) {
  return bm.orientation === "v"
    ? { x0: ox + bm.at - half, y0: oy + bm.from, x1: ox + bm.at + half, y1: oy + bm.to }
    : { x0: ox + bm.from, y0: oy + bm.at - half, x1: ox + bm.to, y1: oy + bm.at + half };
}

/**
 * The stair sits inside its room (clear of the wall faces), flights along the room's long side,
 * with the arrival landing at the start. A room edge at 0 is an outside wall (250 mm), else 125 mm.
 */
export function stairPlacement(rect: Rect, ox: number, oy: number): StairPlacement {
  const insetX = rect.x0 === 0 ? 125 : 63;
  const insetY = rect.y0 === 0 ? 125 : 63;
  const alongX = rect.x1 - rect.x0 >= rect.y1 - rect.y0;
  return alongX
    ? { originX: ox + rect.x0 + insetX + STAIR_ARRIVAL, originY: oy + rect.y0 + insetY, axis: "X", uDir: 1, vDir: 1 }
    : { originX: ox + rect.x0 + insetX, originY: oy + rect.y0 + insetY + STAIR_ARRIVAL, axis: "Y", uDir: 1, vDir: 1 };
}

/** Holes in a floor or roof slab: the stair flights, the lift shaft and any light shafts. */
function slabOpenings(
  geo: FloorGeometry,
  ox: number,
  oy: number,
  z0: number,
  z1: number,
  slabId: string,
  model: BuildingModel,
  voidBox: (id: string, b: Box, appliesTo: (o: MeshObject) => boolean) => void,
  isSlab: (o: MeshObject) => boolean,
) {
  const applies = (o: MeshObject) => isSlab(o) && (o.id === slabId || o.parentId === slabId);
  for (const room of geo.fitted.rooms) {
    const kind = room.def.kind;
    const r = room.rects[0];
    if (kind === "stair") {
      const pl = stairPlacement(r, ox, oy);
      const layout = planStair(model.input.floorToFloorMm);
      const len = layout.lengthMm;
      const wid = layout.widthMm;
      const [x0, y0, x1, y1] = pl.axis === "X"
        ? [pl.originX, pl.originY, pl.originX + len, pl.originY + wid]
        : [pl.originX, pl.originY, pl.originX + wid, pl.originY + len];
      voidBox(`${slabId}_stair_hole`, { min: [x0, y0, z0 - 1], max: [x1, y1, z1 + 1] }, applies);
    } else if (kind === "lift" || kind === "shaft") {
      voidBox(`${slabId}_${room.def.id}_hole`, { min: [ox + r.x0 + 125, oy + r.y0 + 125, z0 - 1], max: [ox + r.x1 - 125, oy + r.y1 - 125, z1 + 1] }, applies);
    }
  }
}
