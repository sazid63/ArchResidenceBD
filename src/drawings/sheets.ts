/**
 * Drawing sheets built from the building model (M5-2): site plan, a floor plan per storey, one
 * section and four elevations. Pure; lengths are mm in the plan frame (x across the frontage, y
 * from the road side to the back); the scenes put y up, so the road side is at the bottom.
 *
 * Section and elevations are schematic (walls, slabs, windows, levels): they show what the model
 * knows. Window sill and head heights are assumptions (`ELEVATION`), the same window height as the BOQ.
 */

import { requiredParking } from "../rules/check";
import { layoutParking } from "../rules/parking";
import type { BuildingModel } from "../model/building";
import { BOQ } from "../quantities/takeoff";
import { doorLeaf, OUTSIDE, type WallSegment } from "../plans/geometry";
import { bounds, SceneBuilder, type Entity, type Scene } from "./scene";

export type Lang = "en" | "bn";
export type ElevationSide = "front" | "rear" | "left" | "right";

export const ELEVATION = {
  /** Window sill above the floor, mm (assumption). */
  sillMm: 900,
  windowHeightMm: BOQ.windowHeightMm,
  /** Ground line stub either side of the building, mm. */
  groundStubMm: 1500,
} as const;

export interface TitleInfo {
  project: string;
  sheetNo: string;
  title: string;
  date: string;
  /** Scale statement, e.g. "1 unit = 1 mm". */
  scale: string;
}

export interface SheetOptions {
  lang?: Lang;
  /** Column section sizes by position and storey (from the structure result); otherwise 300 mm squares. */
  columnSize?: (x: number, y: number, storey: number) => { bx: number; by: number } | null;
  /** Deepest beam under the slab above a storey (from the structure result), for the section; omitted when not designed. */
  beamUnderSlab?: (storey: number) => { bMm: number; hMm: number } | null;
}

const T = (lang: Lang, en: string, bn: string) => (lang === "bn" ? bn : en);
const m2 = (n: number) => n.toFixed(1);
const metres = (mm: number) => (mm / 1000).toFixed(2);
const levelLabel = (mm: number) => `${mm >= 0 ? "+" : "-"}${(Math.abs(mm) / 1000).toFixed(2)}`;

/** Adds the title block under the drawing. Returns a new scene. */
export function withTitleBlock(scene: Scene, info: TitleInfo, lang: Lang = "en"): Scene {
  const b = bounds(scene.entities);
  const w = Math.max(b.maxX - b.minX, 12000);
  const x0 = b.minX;
  const rowH = 640;
  const top = b.minY - 2600;
  const h = rowH * 4;
  const bottom = top - h;
  const sb = new SceneBuilder();
  sb.rect("TITLE", x0, bottom, x0 + w, top);
  for (let i = 1; i < 4; i++) sb.line("TITLE", x0, top - i * rowH, x0 + w, top - i * rowH);
  const tx = x0 + 150;
  sb.text("TITLE", tx, top - rowH + 200, 240, `${info.project}`);
  sb.text("TITLE", tx, top - 2 * rowH + 200, 220, `${info.sheetNo}  ${info.title}`);
  sb.text("TITLE", tx, top - 3 * rowH + 200, 180, `${T(lang, "Date", "তারিখ")}: ${info.date}   ${T(lang, "Scale", "স্কেল")}: ${info.scale}`);
  sb.text("TITLE", tx, top - 4 * rowH + 200, 150, T(lang, "ArchResidenceBD. Screening drawing, not for construction. Must be checked and signed by licensed professionals.", "ArchResidenceBD। প্রাথমিক নকশা, নির্মাণের জন্য নয়। লাইসেন্সপ্রাপ্ত পেশাজীবীর যাচাই ও স্বাক্ষর প্রয়োজন।"));
  return { ...scene, entities: [...scene.entities, ...sb.entities] };
}

/** Wall outline as a closed rectangle at the wall's real thickness (the same as the plan renderer). */
function wallRect(w: WallSegment): [number, number, number, number] {
  const t = w.thicknessMm;
  return w.orientation === "v" ? [w.at - t / 2, w.from, w.at + t / 2, w.to] : [w.from, w.at - t / 2, w.to, w.at + t / 2];
}

export function planScene(model: BuildingModel, storey: number, opts: SheetOptions = {}): Scene {
  const lang = opts.lang ?? "en";
  const st = model.storeys[storey];
  const geo = st.geometry;
  const f = geo.fitted;
  const sb = new SceneBuilder();
  for (const w of geo.walls) {
    const [x0, y0, x1, y1] = wallRect(w);
    sb.rect("WALLS", x0, y0, x1, y1);
  }
  for (const d of geo.doors) {
    const t = 260;
    if (d.orientation === "v") sb.rect("DOORS", d.at - t / 2, d.from, d.at + t / 2, d.to);
    else sb.rect("DOORS", d.from, d.at - t / 2, d.to, d.at + t / 2);
    // The leaf swung open and its arc (8 chords), always into the room the door protects.
    const leaf = doorLeaf(d);
    if (leaf) {
      const [hx, hy] = leaf.hinge;
      const a0 = Math.atan2(leaf.closed[1] - hy, leaf.closed[0] - hx);
      const a1 = Math.atan2(leaf.open[1] - hy, leaf.open[0] - hx);
      let da = a1 - a0;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      sb.line("DOORS", hx, hy, leaf.open[0], leaf.open[1]);
      let px = leaf.closed[0];
      let py = leaf.closed[1];
      for (let k = 1; k <= 8; k++) {
        const ang = a0 + (da * k) / 8;
        const nx = hx + leaf.lengthMm * Math.cos(ang);
        const ny = hy + leaf.lengthMm * Math.sin(ang);
        sb.line("DOORS", px, py, nx, ny);
        px = nx;
        py = ny;
      }
    }
  }
  for (const wn of geo.windows) {
    const t = 250;
    if (wn.orientation === "v") {
      sb.rect("WINDOWS", wn.at - t / 2, wn.from, wn.at + t / 2, wn.to);
      sb.line("WINDOWS", wn.at, wn.from, wn.at, wn.to);
    } else {
      sb.rect("WINDOWS", wn.from, wn.at - t / 2, wn.to, wn.at + t / 2);
      sb.line("WINDOWS", wn.from, wn.at, wn.to, wn.at);
    }
  }
  for (const c of geo.columns) {
    const sz = opts.columnSize?.(c.x, c.y, storey) ?? { bx: 300, by: 300 };
    sb.rect("COLUMNS", c.x - sz.bx / 2, c.y - sz.by / 2, c.x + sz.bx / 2, c.y + sz.by / 2, "#b3402d");
  }
  if (st.index === 0) {
    // B4: the car and motorcycle stalls the Compliance parking row counts.
    const lay = layoutParking(model);
    // Draw the stalls the building needs (Schedule 4), not every stall that would fit: the rest is shown as free floor.
    const need = requiredParking(model);
    const cars = need ? lay.cars.slice(0, need.cars) : lay.cars;
    const motos = need ? lay.motorcycles.slice(0, need.motorcycles) : [];
    cars.forEach((q, n) => {
      sb.rect("PARKING", q.x0, q.y0, q.x1, q.y1);
      sb.text("TEXT", (q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, 150, `P${n + 1}`, "middle");
    });
    motos.forEach((q) => sb.rect("PARKING", q.x0, q.y0, q.x1, q.y1));
    if (lay.aisle && lay.aisle.y0 >= 0) sb.rect("PARKING", lay.aisle.x0, lay.aisle.y0, lay.aisle.x1, lay.aisle.y1);
  }
  f.rooms.forEach((room, i) => {
    const r = [...room.rects].sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
    const raw = room.def.name[lang].replace(/^[A-Z] /, "").replace(/^(এ|বি|সি|ডি) /, "");
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    sb.text("TEXT", cx, cy + 80, 190, raw.charAt(0).toUpperCase() + raw.slice(1), "middle");
    if (room.def.kind !== "shaft") sb.text("TEXT", cx, cy - 220, 150, `${m2(geo.metrics[i].netAreaM2)} m2`, "middle");
  });
  planAnnotations(sb, geo, lang);
  // Overall dimensions, 700 mm outside the walls.
  sb.dimension(0, -700, f.widthMm, -700, `${f.widthMm}`);
  sb.dimension(-700, 0, -700, f.depthMm, `${f.depthMm}`);
  sb.text("TEXT", f.widthMm / 2, -1300, 170, T(lang, "ROAD SIDE", "রাস্তার দিক"), "middle");
  const name = st.index === 0 ? T(lang, "Ground floor plan", "নিচতলার প্ল্যান") : T(lang, `Floor ${st.index} plan`, `${st.index} তলার প্ল্যান`);
  return sb.scene(`plan-${st.index}`, name);
}

const GRID_R = 330;

/** A circle (24-gon) with a centred label: a grid bubble. */
function bubble(sb: SceneBuilder, cx: number, cy: number, label: string) {
  const pts: Array<[number, number]> = Array.from({ length: 24 }, (_, i) => [cx + GRID_R * Math.cos((2 * Math.PI * i) / 24), cy + GRID_R * Math.sin((2 * Math.PI * i) / 24)]);
  sb.poly("DIMENSIONS", pts, true);
  sb.text("DIMENSIONS", cx, cy - 85, 130, label, "middle");
}

const gridLetter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Grid bubbles (A, B, C along x; 1, 2, 3 along y) with the span between neighbouring grids, door and window tags with their schedules, and the stair arrow. */
export function planAnnotations(sb: SceneBuilder, geo: BuildingModel["storeys"][number]["geometry"], lang: Lang): void {
  const f = geo.fitted;
  // Structural grids: lines through the columns.
  const xs = f.structuralX.map((i) => f.xLines[i]);
  const ys = f.structuralY.map((i) => f.yLines[i]);
  xs.forEach((x, i) => {
    sb.line("DIMENSIONS", x, f.depthMm + 200, x, f.depthMm + 1100);
    bubble(sb, x, f.depthMm + 1100 + GRID_R, gridLetter(i));
    if (i > 0) sb.dimension(xs[i - 1], f.depthMm + 1900 + GRID_R, x, f.depthMm + 1900 + GRID_R, `${x - xs[i - 1]}`, 110);
  });
  ys.forEach((y, i) => {
    sb.line("DIMENSIONS", f.widthMm + 200, y, f.widthMm + 1100, y);
    bubble(sb, f.widthMm + 1100 + GRID_R, y, String(i + 1));
    if (i > 0) sb.dimension(f.widthMm + 1900 + GRID_R, ys[i - 1], f.widthMm + 1900 + GRID_R, y, `${y - ys[i - 1]}`, 110);
  });
  // Tags: one per distinct size, doors D1.., windows W1.. in order of first use.
  const tag = (kind: "door" | "window", items: typeof geo.doors) => {
    const sizes: Array<{ w: number; n: number }> = [];
    for (const o of items) {
      const w = o.to - o.from;
      let s = sizes.find((q) => q.w === w);
      if (!s) sizes.push((s = { w, n: 0 }));
      s.n += 1;
      const i = sizes.indexOf(s) + 1;
      const mid = (o.from + o.to) / 2;
      const x = o.orientation === "v" ? o.at + 200 : mid;
      const y = o.orientation === "v" ? mid : o.at + 200;
      sb.text("TEXT", x, y, 105, `${kind === "door" ? "D" : "W"}${i}`, "middle");
    }
    return sizes;
  };
  const doorSizes = tag("door", geo.doors);
  const winSizes = tag("window", geo.windows);
  // Schedules to the right of the plan.
  const x0 = f.widthMm + 3600;
  let y = f.depthMm;
  const row = (cells: string[]) => {
    cells.forEach((c, i) => sb.text("TEXT", x0 + i * 1500, y, 120, c));
    y -= 330;
  };
  sb.text("TEXT", x0, y + 200, 150, lang === "bn" ? "দরজার তালিকা" : "Door schedule");
  y -= 250;
  row([lang === "bn" ? "চিহ্ন" : "Mark", lang === "bn" ? "মাপ (মিমি)" : "Size (mm)", lang === "bn" ? "সংখ্যা" : "Qty"]);
  doorSizes.forEach((q, i) => row([`D${i + 1}`, `${q.w} x ${BOQ.doorHeightMm}`, String(q.n)]));
  y -= 350;
  sb.text("TEXT", x0, y + 200, 150, lang === "bn" ? "জানালার তালিকা" : "Window schedule");
  y -= 250;
  row([lang === "bn" ? "চিহ্ন" : "Mark", lang === "bn" ? "মাপ (মিমি)" : "Size (mm)", lang === "bn" ? "সংখ্যা" : "Qty"]);
  winSizes.forEach((q, i) => row([`W${i + 1}`, `${q.w} x ${ELEVATION.windowHeightMm}`, String(q.n)]));
  // Stair: an arrow along the longer side with UP.
  const st = f.rooms.find((r) => r.def.kind === "stair");
  if (st) {
    const r = [...st.rects].sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0))[0];
    const horizontal = r.x1 - r.x0 >= r.y1 - r.y0;
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const len = (horizontal ? r.x1 - r.x0 : r.y1 - r.y0) * 0.6;
    const [ax, ay, bx, by] = horizontal ? [cx - len / 2, cy - 450, cx + len / 2, cy - 450] : [cx - 450, cy - len / 2, cx - 450, cy + len / 2];
    sb.line("DIMENSIONS", ax, ay, bx, by);
    const hx = horizontal ? 180 : 0;
    const hy = horizontal ? 0 : 180;
    sb.poly("DIMENSIONS", [[bx - hx - hy, by - hy - hx], [bx, by], [bx - hx + hy, by - hy + hx]], false);
    sb.text("TEXT", horizontal ? cx : cx - 450 + 250, horizontal ? cy - 450 + 120 : cy, 130, lang === "bn" ? "উপরে" : "UP", "middle");
  }
}

export function siteScene(model: BuildingModel, opts: SheetOptions = {}): Scene {
  const lang = opts.lang ?? "en";
  const sb = new SceneBuilder();
  const p = model.plot;
  const e = model.envelope;
  sb.rect("SITE", p.x0, p.y0, p.x1, p.y1);
  sb.rect("SETBACK", e.x0, e.y0, e.x1, e.y1);
  sb.rect("OUTLINE", model.origin.x, model.origin.y, model.origin.x + model.widthMm, model.origin.y + model.depthMm, "#e3ece6");
  sb.text("TEXT", (p.x0 + p.x1) / 2, p.y0 - 900, 220, T(lang, "ROAD", "রাস্তা"), "middle");
  sb.text("TEXT", (model.origin.x + model.origin.x + model.widthMm) / 2, model.origin.y + model.depthMm / 2, 240, T(lang, "Building", "ভবন"), "middle");
  sb.text("TEXT", (model.origin.x + model.origin.x + model.widthMm) / 2, model.origin.y + model.depthMm / 2 - 400, 170, `${m2(model.footprintAreaM2)} m2`, "middle");
  sb.dimension(p.x0, p.y1 + 700, p.x1, p.y1 + 700, `${p.x1 - p.x0}`);
  sb.dimension(p.x1 + 700, p.y0, p.x1 + 700, p.y1, `${p.y1 - p.y0}`);
  sb.text("TEXT", p.x0, p.y1 + 1400, 170, `${T(lang, "Plot", "জমি")} ${m2(model.plotAreaM2)} m2   ${T(lang, "Footprint", "ফুটপ্রিন্ট")} ${m2(model.footprintAreaM2)} m2   ${T(lang, "Storeys", "তলা")} ${model.input.storeys}`);
  return sb.scene("site", T(lang, "Site plan", "সাইট প্ল্যান"));
}

/** Half the thickness of the exterior walls: building faces sit this far outside the wall centre lines (x = 0, W; y = 0, D). */
export function faceInset(model: BuildingModel): number {
  let t = 0;
  for (const st of model.storeys) for (const w of st.geometry.walls) if (w.exterior) t = Math.max(t, w.thicknessMm);
  return t / 2;
}

/** Where the section cuts: through the stair cover when there is one, else the middle of the building. */
export function sectionCutY(model: BuildingModel): number {
  const c = model.roof.stairCover;
  return c ? Math.round((c.y0 + c.y1) / 2) : Math.round(model.depthMm / 2);
}

export function sectionScene(model: BuildingModel, slabMm: number, opts: SheetOptions = {}): Scene {
  const lang = opts.lang ?? "en";
  const W = model.widthMm;
  const cutY = sectionCutY(model);
  const inset = faceInset(model);
  const xL = -inset;
  const xR = W + inset;
  const sb = new SceneBuilder();
  const roofL = model.roof.levelMm;
  const stub = ELEVATION.groundStubMm;
  sb.line("GROUND", xL - stub, 0, xR + stub, 0);

  // Slabs run face to face: the plinth at level 0 and one at each storey top (the last is the roof).
  const slabLevels = [...model.storeys.map((s) => s.levelMm), roofL];
  slabLevels.forEach((lv, i) => {
    sb.rect("CUT", xL, lv - slabMm, xR, lv, "#9aa3b5");
    // The edge beams under the slab at both faces, from the structure result (when there is one).
    const beam = i > 0 ? opts.beamUnderSlab?.(i - 1) : null;
    if (beam) {
      sb.rect("CUT", xL, lv - beam.hMm, xL + beam.bMm, lv - slabMm, "#9aa3b5");
      sb.rect("CUT", xR - beam.bMm, lv - beam.hMm, xR, lv - slabMm, "#9aa3b5");
      if (i === 1) sb.text("TEXT", xR + 150, lv - slabMm - 120, 120, T(lang, `slab ${slabMm}, edge beam ${beam.bMm} x ${beam.hMm}`, `স্ল্যাব ${slabMm}, প্রান্ত বিম ${beam.bMm} x ${beam.hMm}`));
    }
  });
  // Walls cut by the plane: vertical walls (running along y) whose span holds cutY. A door or window of the wall
  // that spans the cut leaves a gap from its sill to its head, so only the wall above (and below, for a window) is cut.
  for (const st of model.storeys) {
    const lo = st.levelMm;
    const hi = st.levelMm + st.heightMm - slabMm;
    const openings = [
      ...st.geometry.doors.map((o) => ({ o, sill: 0, head: BOQ.doorHeightMm })),
      ...st.geometry.windows.map((o) => ({ o, sill: ELEVATION.sillMm, head: ELEVATION.sillMm + ELEVATION.windowHeightMm })),
    ];
    for (const w of st.geometry.walls) {
      if (w.orientation !== "v" || !(w.from < cutY && cutY < w.to)) continue;
      const x0 = w.at - w.thicknessMm / 2;
      const x1 = w.at + w.thicknessMm / 2;
      const gap = openings.find(({ o }) => o.orientation === "v" && o.at === w.at && o.from < cutY && cutY < o.to);
      if (!gap) {
        sb.rect("CUT", x0, lo, x1, hi, "#4e5668");
      } else {
        if (gap.sill > 0) sb.rect("CUT", x0, lo, x1, lo + gap.sill, "#4e5668");
        if (lo + gap.head < hi) sb.rect("CUT", x0, lo + gap.head, x1, hi, "#4e5668");
      }
    }
    sb.text("TEXT", xR + stub + 200, lo + st.heightMm / 2, 170, st.index === 0 ? T(lang, "Ground", "নিচতলা") : T(lang, `Floor ${st.index}`, `${st.index} তলা`));
  }
  // Parapet, then the stair cover and lift room when the cut passes through them.
  const par = model.roof.parapetMm;
  sb.rect("CUT", xL, roofL, xL + 125, roofL + par, "#4e5668");
  sb.rect("CUT", xR - 125, roofL, xR, roofL + par, "#4e5668");
  for (const r of [model.roof.stairCover, model.roof.liftRoom]) {
    if (!r || !(r.y0 < cutY && cutY < r.y1)) continue;
    const top = roofL + model.roof.coverHeightMm;
    sb.rect("CUT", r.x0, roofL, Math.min(r.x0 + 125, r.x1), top, "#4e5668");
    sb.rect("CUT", Math.max(r.x1 - 125, r.x0), roofL, r.x1, top, "#4e5668");
    sb.rect("CUT", r.x0, top - 125, r.x1, top, "#9aa3b5");
  }
  // Levels and total height.
  for (const lv of slabLevels) {
    sb.line("LEVELS", xL - stub, lv, xR + stub, lv);
    sb.text("TEXT", xL - stub - 150, lv + 40, 170, levelLabel(lv), "end");
  }
  sb.dimension(xL - stub - 1300, 0, xL - stub - 1300, roofL, `${roofL}`);
  sb.text("TEXT", W / 2, -700, 190, T(lang, `Section A-A (cut ${metres(cutY)} m from the road side, looking toward the back)`, `সেকশন এ-এ (রাস্তার দিক থেকে ${metres(cutY)} মি, পেছনের দিকে তাকিয়ে)`), "middle");
  return sb.scene("section-a-a", T(lang, "Section A-A", "সেকশন এ-এ"));
}

const SIDE_NAME: Record<ElevationSide, { en: string; bn: string }> = {
  front: { en: "Front elevation (road side)", bn: "সামনের এলিভেশন (রাস্তার দিক)" },
  rear: { en: "Rear elevation", bn: "পেছনের এলিভেশন" },
  left: { en: "Left elevation", bn: "বাম পাশের এলিভেশন" },
  right: { en: "Right elevation", bn: "ডান পাশের এলিভেশন" },
};

/**
 * Horizontal position on the elevation as the viewer sees it, standing outside that face (x across the
 * frontage, y toward the back): front u = x, rear u = W - x, left u = D - y, right u = y.
 */
export function elevationU(side: ElevationSide, W: number, D: number, x: number, y: number): number {
  return side === "front" ? x : side === "rear" ? W - x : side === "left" ? D - y : y;
}

export function elevationScene(model: BuildingModel, side: ElevationSide, opts: SheetOptions = {}): Scene {
  const lang = opts.lang ?? "en";
  const W = model.widthMm;
  const D = model.depthMm;
  const across = side === "front" || side === "rear" ? W : D;
  const roofL = model.roof.levelMm;
  const stub = ELEVATION.groundStubMm;
  const sb = new SceneBuilder();
  const inset = faceInset(model);
  sb.line("GROUND", -inset - stub, 0, across + inset + stub, 0);
  sb.rect("OUTLINE", -inset, 0, across + inset, roofL + model.roof.parapetMm);
  for (const st of model.storeys) if (st.index > 0) sb.line("LEVELS", -inset, st.levelMm, across + inset, st.levelMm);
  sb.line("LEVELS", -inset, roofL, across + inset, roofL);
  // Roof structures behind the parapet.
  for (const r of [model.roof.stairCover, model.roof.liftRoom]) {
    if (!r) continue;
    const ua = elevationU(side, W, D, r.x0, r.y0);
    const ub = elevationU(side, W, D, r.x1, r.y1);
    const lo = Math.min(ua, ub);
    const hi = Math.max(ua, ub);
    sb.rect("OUTLINE", lo, roofL + model.roof.parapetMm, hi, roofL + model.roof.coverHeightMm);
  }
  // Windows on this face.
  const wallAt = side === "front" ? 0 : side === "rear" ? D : side === "left" ? 0 : W;
  const facing = side === "front" || side === "rear" ? "h" : "v";
  for (const st of model.storeys) {
    for (const wn of st.geometry.windows) {
      if (wn.orientation !== facing || wn.at !== wallAt) continue;
      const a = side === "front" || side === "rear" ? elevationU(side, W, D, wn.from, 0) : elevationU(side, W, D, 0, wn.from);
      const b = side === "front" || side === "rear" ? elevationU(side, W, D, wn.to, 0) : elevationU(side, W, D, 0, wn.to);
      const u0 = Math.min(a, b);
      const u1 = Math.max(a, b);
      const z0 = st.levelMm + ELEVATION.sillMm;
      const z1 = z0 + ELEVATION.windowHeightMm;
      sb.rect("WINDOWS", u0, z0, u1, z1);
      sb.line("WINDOWS", (u0 + u1) / 2, z0, (u0 + u1) / 2, z1);
    }
  }
  for (const st of model.storeys) sb.text("TEXT", across + stub + 200, st.levelMm + 80, 170, levelLabel(st.levelMm));
  sb.text("TEXT", across + stub + 200, roofL + 80, 170, levelLabel(roofL));
  sb.dimension(-stub - 700, 0, -stub - 700, roofL, `${roofL}`);
  sb.text("TEXT", across / 2, -700, 190, SIDE_NAME[side][lang], "middle");
  return sb.scene(`elevation-${side}`, SIDE_NAME[side][lang]);
}

/** Counts of window and door openings that sit on the outside, for tests and the index. */
export function exteriorOpeningCounts(model: BuildingModel): { windows: number; doors: number } {
  let windows = 0;
  let doors = 0;
  for (const st of model.storeys) {
    windows += st.geometry.windows.filter((w) => w.b === OUTSIDE).length;
    doors += st.geometry.doors.filter((d) => d.b === OUTSIDE || d.a === OUTSIDE).length;
  }
  return { windows, doors };
}

export type { Entity };
