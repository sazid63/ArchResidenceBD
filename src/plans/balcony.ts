/**
 * Front verandah (Phase B2, recessed balcony): a plan variant with one extra bay along the road side, holding a balcony the full
 * width of the building. The balcony is inside the buildable envelope (RAJUK 2008 §46(5)(gha): a balcony must not extend into the
 * setback). It is a normal room of the plan: a slab on the beams, a railing in place of an outside wall, and doors from the living
 * room and the first bedroom on the front. Only plans whose whole front row belongs to one dwelling can take one; plans with a core
 * or two dwellings on the front need the cantilever balcony (B2 phase 2).
 */

import type { Bay, CellRect, PlanDefinition, RoomDef } from "./types";

/** Suffix of a variant id: "pn-2b" with a front verandah is "pn-2b+v". */
export const VERANDAH_SUFFIX = "+v";

/** Depth of the verandah bay, centre-line to centre-line, mm. A 1.30 m bay leaves 1.1 m clear inside the railing. */
export const VERANDAH_BAY: Bay = { min: 1250, pref: 1300, max: 1500 };

export const isVerandahId = (id: string) => id.endsWith(VERANDAH_SUFFIX);
export const baseIdOf = (id: string) => (isVerandahId(id) ? id.slice(0, -VERANDAH_SUFFIX.length) : id);

/** The dwelling that owns the whole front row (y = 0), or null when the front row is shared with a core or another dwelling. */
export function frontUnit(plan: PlanDefinition): string | null {
  const nx = plan.baysX.length;
  const owner: Array<RoomDef | null> = Array(nx).fill(null);
  for (const r of plan.rooms) for (const [x0, y0, x1] of r.cells) if (y0 === 0) for (let x = x0; x <= x1; x++) owner[x] = r;
  const units = new Set(owner.map((r) => r?.unit ?? null));
  if (units.size !== 1) return null;
  const [u] = [...units];
  return u ?? null;
}

const shift = (c: CellRect): CellRect => [c[0], c[1] + 1, c[2], c[3] + 1];

/** The plan with a front verandah, or null when the plan cannot take one. */
export function withFrontVerandah(plan: PlanDefinition): PlanDefinition | null {
  const unit = frontUnit(plan);
  if (!unit) return null;
  const nx = plan.baysX.length;
  const front = plan.rooms.filter((r) => r.unit === unit && r.cells.some((c) => c[1] === 0));
  const living = front.filter((r) => r.kind === "living").sort((a, b) => cellCount(b) - cellCount(a))[0];
  if (!living) return null;
  const bedroom = front.filter((r) => r.kind === "bedroom").sort((a, b) => cellCount(b) - cellCount(a))[0];

  const id = `${plan.id}${VERANDAH_SUFFIX}`;
  const balcony: RoomDef = {
    id: "balcony",
    kind: "balcony",
    unit,
    name: { en: "Front verandah", bn: "সামনের বারান্দা" },
    cells: [[0, 0, nx - 1, 0]],
  };
  return {
    ...plan,
    id,
    name: { en: `${plan.name.en}, with front verandah`, bn: `${plan.name.bn}, সামনে বারান্দাসহ` },
    description: {
      en: `${plan.description.en} A verandah the full width of the building is added on the road side, reached from the living room${bedroom ? " and the master bedroom" : ""}; it adds about ${(VERANDAH_BAY.pref / 1000).toFixed(1)} m of depth.`,
      bn: `${plan.description.bn} রাস্তার দিকে ভবনের পুরো প্রস্থজুড়ে একটি বারান্দা যোগ হয়েছে, বসার ঘর${bedroom ? " ও মাস্টার বেডরুম" : ""} থেকে যাওয়া যায়; গভীরতা প্রায় ${(VERANDAH_BAY.pref / 1000).toFixed(1)} মিটার বাড়ে।`,
    },
    baysY: [VERANDAH_BAY, ...plan.baysY],
    structuralY: [0, ...plan.structuralY.map((i) => i + 1)],
    rooms: [balcony, ...plan.rooms.map((r) => ({ ...r, cells: r.cells.map(shift) }))],
    doors: [...plan.doors, { between: [living.id, balcony.id] }, ...(bedroom ? [{ between: [bedroom.id, balcony.id] as const }] : [])],
  };
}

function cellCount(r: RoomDef): number {
  return r.cells.reduce((a, [x0, y0, x1, y1]) => a + (x1 - x0 + 1) * (y1 - y0 + 1), 0);
}
