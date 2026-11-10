/**
 * B3: a dining room is lit like any habitable room (BNBC 2020 Part 3 Table 3.1.12 lists dining among habitable uses),
 * so it needs an outside wall or a light shaft. Where a plan has a dining room buried in the middle with neither, it is
 * opened into the living room beside it (an open living-dining space, the usual Dhaka arrangement) and shares the
 * living room's window. The plan keeps its topology: every door of the dining room moves to the living room.
 */

import type { CellRect, PlanDefinition, RoomDef } from "./types";

const touches = (a: CellRect, b: CellRect): boolean => {
  const xOverlap = a[0] <= b[2] && b[0] <= a[2];
  const yOverlap = a[1] <= b[3] && b[1] <= a[3];
  return (xOverlap && (a[3] + 1 === b[1] || b[3] + 1 === a[1])) || (yOverlap && (a[2] + 1 === b[0] || b[2] + 1 === a[0]));
};

const anyTouch = (a: readonly CellRect[], b: readonly CellRect[]) => a.some((p) => b.some((q) => touches(p, q)));

/** True when no cell of the room is on the grid edge and no shaft or balcony of the plan touches it. */
function isInterior(plan: PlanDefinition, room: RoomDef): boolean {
  const nx = plan.baysX.length;
  const ny = plan.baysY.length;
  if (room.cells.some(([x0, y0, x1, y1]) => x0 === 0 || y0 === 0 || x1 === nx - 1 || y1 === ny - 1)) return false;
  if ((plan.voids ?? []).some((v) => anyTouch(room.cells, [v]))) return false;
  return !plan.rooms.some((r) => (r.kind === "shaft" || r.kind === "balcony") && anyTouch(room.cells, r.cells));
}

/** The plan with every interior dining room merged into the living room of its dwelling that it touches; unchanged if none. */
export function openInteriorDining(plan: PlanDefinition): PlanDefinition {
  let rooms = plan.rooms;
  let doors = plan.doors;
  for (const dining of plan.rooms.filter((r) => r.kind === "dining" && isInterior(plan, r))) {
    // Living room first; else the kitchen (BNBC Sec 1.14.3.2: a kitchen may provide dining space, then 7.5 m2 and 2.2 m).
    const mate = (kind: RoomDef["kind"]) => rooms.find((r) => r.kind === kind && r.unit === dining.unit && anyTouch(r.cells, dining.cells));
    const living = mate("living") ?? mate("kitchen");
    if (!living) continue;
    rooms = rooms.filter((r) => r.id !== dining.id).map((r) => (r.id === living.id ? { ...r, cells: [...r.cells, ...dining.cells] } : r));
    const seen = new Set<string>();
    doors = doors
      .filter((d) => !(d.between.includes(dining.id) && d.between.includes(living.id)))
      .map((d) => (d.between.includes(dining.id) ? { ...d, between: [d.between[0] === dining.id ? living.id : d.between[0], d.between[1] === dining.id ? living.id : d.between[1]] as const } : d))
      .filter((d) => {
        const key = [...d.between].sort().join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }
  return rooms === plan.rooms ? plan : { ...plan, rooms, doors };
}
