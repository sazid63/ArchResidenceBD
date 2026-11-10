/**
 * Front balconies (Phase B2): a plan variant with one extra bay along the road side. Each flat that has habitable rooms on the
 * front gets a balcony over its own run of front cells, reached by a door from its living room (or dining room) and from its largest
 * bedroom on that run. In front of the shared core (stair, lobby) and of kitchens and toilets there is no balcony: those cells are
 * notches in the footprint (`voids`), open to the sky with no slab.
 *
 * The balcony is inside the buildable envelope (RAJUK 2008 §46(5)(gha): a balcony must not extend into the setback) and has no
 * columns at its tip: it cantilevers from the beam on the old front line (structure/cantilever.ts). Its open edges are railings.
 * A plan whose front row is one flat gets one balcony the full width of the building (a verandah).
 */

import type { Bay, CellRect, PlanDefinition, RoomDef } from "./types";

/** Suffix of a variant id: "pn-2b" with a front balcony is "pn-2b+v". */
export const VERANDAH_SUFFIX = "+v";

/** Depth of the balcony bay, centre-line to centre-line, mm. A 1.30 m bay leaves 1.1 m clear inside the railing. */
export const VERANDAH_BAY: Bay = { min: 1250, pref: 1300, max: 1500 };

export const isVerandahId = (id: string) => id.endsWith(VERANDAH_SUFFIX);
export const baseIdOf = (id: string) => (isVerandahId(id) ? id.slice(0, -VERANDAH_SUFFIX.length) : id);

/** A stretch of the front row: cells x0..x1 that belong to one flat (unit set) or to the core (unit null). */
interface FrontRun {
  x0: number;
  x1: number;
  unit: string | null;
}

function frontOwners(plan: PlanDefinition): Array<RoomDef | null> {
  const owner: Array<RoomDef | null> = Array(plan.baysX.length).fill(null);
  for (const r of plan.rooms) for (const [x0, y0, x1] of r.cells) if (y0 === 0) for (let x = x0; x <= x1; x++) owner[x] = r;
  return owner;
}

/** The front row split into runs of cells that belong to the same flat or to the core. */
export function frontRuns(plan: PlanDefinition): FrontRun[] {
  const owner = frontOwners(plan);
  const runs: FrontRun[] = [];
  owner.forEach((r, x) => {
    const unit = r?.unit ?? null;
    const last = runs[runs.length - 1];
    if (last && last.unit === unit) last.x1 = x;
    else runs.push({ x0: x, x1: x, unit });
  });
  return runs;
}

/** The dwelling that owns the whole front row (y = 0), or null when the front row is shared with a core or another dwelling. */
export function frontUnit(plan: PlanDefinition): string | null {
  const runs = frontRuns(plan);
  return runs.length === 1 ? runs[0].unit : null;
}

const shift = (c: CellRect): CellRect => [c[0], c[1] + 1, c[2], c[3] + 1];

function cellCount(r: RoomDef): number {
  return r.cells.reduce((a, [x0, y0, x1, y1]) => a + (x1 - x0 + 1) * (y1 - y0 + 1), 0);
}

/** The plan with front balconies, or null when no flat has a living, dining or bedroom on the front. */
export function withFrontVerandah(plan: PlanDefinition): PlanDefinition | null {
  const owner = frontOwners(plan);
  const runs = frontRuns(plan);
  const balconies: RoomDef[] = [];
  const doors: PlanDefinition["doors"] = [];
  const voids: CellRect[] = [];
  const perUnit = new Map<string, number>();
  const unitsInRuns = new Set(runs.filter((r) => r.unit).map((r) => r.unit));

  for (const run of runs) {
    const rooms = new Set<RoomDef>();
    for (let x = run.x0; x <= run.x1; x++) if (owner[x]) rooms.add(owner[x]!);
    const biggest = (kinds: string[]) => [...rooms].filter((r) => kinds.includes(r.kind)).sort((a, b) => cellCount(b) - cellCount(a))[0];
    const living = biggest(["living"]) ?? biggest(["dining"]);
    const bedroom = biggest(["bedroom"]);
    if (!run.unit || (!living && !bedroom)) {
      voids.push([run.x0, 0, run.x1, 0]);
      continue;
    }
    const n = (perUnit.get(run.unit) ?? 0) + 1;
    perUnit.set(run.unit, n);
    const id = n === 1 ? `balcony-${run.unit}` : `balcony-${run.unit}${n}`;
    const flatLabel = unitsInRuns.size > 1 ? `${run.unit} ` : "";
    const flatLabelBn = unitsInRuns.size > 1 ? `${run.unit}-এর ` : "";
    balconies.push({
      id,
      kind: "balcony",
      unit: run.unit,
      name: { en: `${flatLabel}${runs.length === 1 ? "front verandah" : "front balcony"}`, bn: `${flatLabelBn}সামনের বারান্দা` },
      cells: [[run.x0, 0, run.x1, 0]],
    });
    if (living) doors.push({ between: [living.id, id] });
    if (bedroom) doors.push({ between: [bedroom.id, id] });
  }
  if (!balconies.length) return null;

  const full = runs.length === 1;
  const id = `${plan.id}${VERANDAH_SUFFIX}`;
  return {
    ...plan,
    id,
    name: { en: `${plan.name.en}, with front ${full ? "verandah" : "balconies"}`, bn: `${plan.name.bn}, সামনে ${full ? "বারান্দাসহ" : "বারান্দাসহ"}` },
    description: {
      en: `${plan.description.en} ${full ? "A verandah the full width of the building" : "A balcony for each flat"} is added on the road side, reached from the living room${balconies.some((b) => doors.some((d) => d.between[1] === b.id && /bed/.test(d.between[0]))) ? " and the bedroom" : ""}; it adds about ${(VERANDAH_BAY.pref / 1000).toFixed(1)} m of depth and cantilevers from the front beam line.`,
      bn: `${plan.description.bn} রাস্তার দিকে ${full ? "ভবনের পুরো প্রস্থজুড়ে একটি বারান্দা" : "প্রতিটি ফ্ল্যাটের জন্য একটি বারান্দা"} যোগ হয়েছে, বসার ঘর থেকে যাওয়া যায়; গভীরতা প্রায় ${(VERANDAH_BAY.pref / 1000).toFixed(1)} মিটার বাড়ে এবং সামনের বিম লাইন থেকে ক্যান্টিলিভার।`,
    },
    baysY: [VERANDAH_BAY, ...plan.baysY],
    // No columns on the front edge: the balcony is a cantilever off the old front beam line (structure/cantilever.ts).
    structuralY: plan.structuralY.map((i) => i + 1),
    cantileverFront: true,
    voids: [...(plan.voids ?? []).map(shift), ...voids],
    rooms: [...balconies, ...plan.rooms.map((r) => ({ ...r, cells: r.cells.map(shift) }))],
    doors: [...plan.doors, ...doors],
  };
}
