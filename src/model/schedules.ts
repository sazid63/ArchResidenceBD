/**
 * Door and window schedule, read from the same floor geometry the plans, 3D model and drawings use, so the schedule
 * lists exactly the openings that are drawn. Sizes: door height, window sill and height are the values the 3D model
 * uses (assumptions, not a code figure). Toilet windows are the high vents (sill 1800, height 600).
 */

import { OUTSIDE } from "../plans/geometry";
import type { BuildingModel } from "./building";
import { DOOR_HEIGHT, VENT_HEIGHT, VENT_SILL, WINDOW_HEIGHT, WINDOW_SILL } from "./toMesh";

export type ScheduleKind = "door" | "window" | "vent";

export interface ScheduleRow {
  /** D1, D2 ... / W1 ... / V1 ... */
  mark: string;
  kind: ScheduleKind;
  /** The entrance door of a dwelling (doors only). */
  main: boolean;
  widthMm: number;
  heightMm: number;
  sillMm: number;
  /** Number of this opening on each storey, ground first. */
  perStorey: number[];
  total: number;
  /** Rooms it serves, English and Bangla, in plan order and without repeats. */
  rooms: { en: string[]; bn: string[] };
}

const PREFIX: Record<ScheduleKind, string> = { door: "D", window: "W", vent: "V" };

/** The schedule of a building: one row per kind, size and (for doors) entrance flag; largest first. */
export function openingSchedule(model: BuildingModel): ScheduleRow[] {
  const n = model.storeys.length;
  const rows = new Map<string, Omit<ScheduleRow, "mark">>();
  const add = (kind: ScheduleKind, main: boolean, widthMm: number, heightMm: number, sillMm: number, storey: number, names: Array<{ en: string; bn: string }>) => {
    const key = `${kind}|${main ? 1 : 0}|${widthMm}|${heightMm}|${sillMm}`;
    let row = rows.get(key);
    if (!row) {
      row = { kind, main, widthMm, heightMm, sillMm, perStorey: new Array<number>(n).fill(0), total: 0, rooms: { en: [], bn: [] } };
      rows.set(key, row);
    }
    row.perStorey[storey] += 1;
    row.total += 1;
    for (const nm of names) {
      if (!row.rooms.en.includes(nm.en)) { row.rooms.en.push(nm.en); row.rooms.bn.push(nm.bn); }
    }
  };

  model.storeys.forEach((st, i) => {
    const geo = st.geometry;
    const nameOf = (owner: number) => (owner === OUTSIDE ? null : geo.fitted.rooms[owner]?.def.name ?? null);
    for (const d of geo.doors) {
      add("door", !!d.main, d.to - d.from, DOOR_HEIGHT, 0, i, [nameOf(d.a), nameOf(d.b)].filter((x): x is { en: string; bn: string } => !!x));
    }
    for (const w of geo.windows) {
      const room = geo.fitted.rooms[w.a];
      const vent = room?.def.kind === "toilet";
      add(vent ? "vent" : "window", false, w.to - w.from, vent ? VENT_HEIGHT : WINDOW_HEIGHT, vent ? VENT_SILL : WINDOW_SILL, i, [nameOf(w.a)].filter((x): x is { en: string; bn: string } => !!x));
    }
  });

  const order: ScheduleKind[] = ["door", "window", "vent"];
  const out: ScheduleRow[] = [];
  for (const kind of order) {
    const sorted = [...rows.values()]
      .filter((r) => r.kind === kind)
      .sort((a, b) => Number(b.main) - Number(a.main) || b.widthMm - a.widthMm || b.heightMm - a.heightMm);
    sorted.forEach((r, k) => out.push({ ...r, mark: `${PREFIX[kind]}${k + 1}` }));
  }
  return out;
}

export function scheduleToCsv(rows: ScheduleRow[]): string {
  const cell = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["mark,type,width_mm,height_mm,sill_mm,total,per_storey_ground_first,rooms"];
  for (const r of rows) {
    const type = r.kind === "door" ? (r.main ? "entrance door" : "door") : r.kind === "vent" ? "ventilator" : "window";
    lines.push([cell(r.mark), cell(type), r.widthMm, r.heightMm, r.sillMm, r.total, cell(r.perStorey.join(" ")), cell(r.rooms.en.join("; "))].join(","));
  }
  return lines.join("\n");
}
