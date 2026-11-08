/**
 * The plan library: original plans authored as grids (BUILD_PLAN.md §5.5). No plan here is traced
 * from a listing image. Every plan must pass the validator across its whole fit range
 * (src/plans/plans.test.ts sweeps it).
 *
 * Conventions: x runs across the frontage, left to right facing the plot from the road; y runs from
 * the road side (y = 0) to the back. Cells are [x0, y0, x1, y1] inclusive.
 */

import type { Bay, PlanDefinition, RoomDef, Text } from "./types";

const bay = (min: number, pref: number, max: number): Bay => ({ min, pref, max });
const t = (en: string, bn: string): Text => ({ en, bn });

// Shared column widths: bedroom column, corridor spine, two service/living columns.
const X4: Bay[] = [bay(3300, 3600, 3900), bay(1330, 1350, 1500), bay(2700, 3000, 3600), bay(2700, 3000, 3600)];

function core(y: number): RoomDef[] {
  return [
    { id: "lift", kind: "lift", name: t("Lift", "লিফট"), cells: [[0, y, 0, y]] },
    { id: "lobby", kind: "lobby", name: t("Lift lobby", "লিফট লবি"), cells: [[1, y, 1, y]] },
    { id: "stair", kind: "stair", name: t("Stair", "সিঁড়ি"), cells: [[2, y, 3, y]] },
  ];
}
const CORE_DOORS = [
  { between: ["lobby", "lift"] as const },
  { between: ["lobby", "stair"] as const },
];

/** One dwelling per floor, four bedrooms, core at the back. For narrow, deep plots (about 3.5–5 katha). */
export const P1_4B: PlanDefinition = {
  id: "p1-4b",
  name: t("One flat per floor, 4 bedrooms", "প্রতি তলায় একটি ফ্ল্যাট, ৪ বেডরুম"),
  description: t(
    "Living room on the road side, bedrooms down the left wall, kitchen and dining on the right, stair and lift at the back.",
    "রাস্তার দিকে বসার ঘর, বাম দেয়ালে বেডরুম, ডানে রান্নাঘর ও খাবার ঘর, পেছনে সিঁড়ি ও লিফট।",
  ),
  unitsPerFloor: 1,
  bedroomsPerUnit: 4,
  baysX: X4,
  baysY: [bay(3600, 4200, 4500), bay(1500, 1500, 1800), bay(3300, 3450, 3900), bay(1500, 1500, 1800), bay(3300, 3450, 3900), bay(2450, 2550, 3000)],
  structuralX: [0, 2, 3, 4],
  structuralY: [0, 1, 2, 4, 5, 6],
  rooms: [
    { id: "a-living", kind: "living", unit: "A", name: t("Living room", "বসার ঘর"), cells: [[1, 0, 3, 0]] },
    { id: "a-bed1", kind: "bedroom", unit: "A", name: t("Master bedroom", "মাস্টার বেডরুম"), cells: [[0, 0, 0, 0]] },
    { id: "a-toilet1", kind: "toilet", unit: "A", name: t("Master toilet", "মাস্টার টয়লেট"), cells: [[0, 1, 0, 1]] },
    { id: "a-corridor", kind: "corridor", unit: "A", name: t("Corridor", "করিডোর"), cells: [[1, 1, 1, 4]] },
    { id: "a-dining", kind: "dining", unit: "A", name: t("Dining", "খাবার ঘর"), cells: [[2, 1, 2, 2]] },
    { id: "a-kitchen", kind: "kitchen", unit: "A", name: t("Kitchen", "রান্নাঘর"), cells: [[3, 1, 3, 2]] },
    { id: "a-bed2", kind: "bedroom", unit: "A", name: t("Bedroom 2", "বেডরুম ২"), cells: [[0, 2, 0, 2]] },
    { id: "a-toilet2", kind: "toilet", unit: "A", name: t("Common toilet", "কমন টয়লেট"), cells: [[0, 3, 0, 3]] },
    { id: "a-bed3", kind: "bedroom", unit: "A", name: t("Bedroom 3", "বেডরুম ৩"), cells: [[0, 4, 0, 4]] },
    { id: "a-store", kind: "store", unit: "A", name: t("Store", "স্টোর"), cells: [[2, 3, 2, 3]] },
    { id: "a-toilet3", kind: "toilet", unit: "A", name: t("Toilet 3", "টয়লেট ৩"), cells: [[3, 3, 3, 3]] },
    { id: "a-bed4", kind: "bedroom", unit: "A", name: t("Bedroom 4", "বেডরুম ৪"), cells: [[2, 4, 3, 4]] },
    ...core(5),
  ],
  doors: [
    { between: ["a-living", "a-bed1"] },
    { between: ["a-bed1", "a-toilet1"] },
    { between: ["a-living", "a-corridor"] },
    { between: ["a-living", "a-dining"] },
    { between: ["a-dining", "a-kitchen"] },
    { between: ["a-corridor", "a-bed2"] },
    { between: ["a-corridor", "a-toilet2"] },
    { between: ["a-corridor", "a-bed3"] },
    { between: ["a-corridor", "a-store"] },
    { between: ["a-corridor", "a-bed4"] },
    { between: ["a-bed4", "a-toilet3"] },
    { between: ["a-corridor", "lobby"], main: true },
    ...CORE_DOORS,
  ],
};

/** Two dwellings per floor, one at the front and one at the back, two bedrooms each. About 4.5–6 katha. */
export const P2_2B_FB: PlanDefinition = {
  id: "p2-2b-fb",
  name: t("Two flats per floor, front and back, 2 bedrooms", "প্রতি তলায় দুটি ফ্ল্যাট (সামনে ও পেছনে), ২ বেডরুম"),
  description: t(
    "Flat A faces the road, flat B faces the back; the stair and lift sit between them so both flats get two outside walls.",
    "ফ্ল্যাট এ রাস্তার দিকে, ফ্ল্যাট বি পেছনের দিকে; মাঝখানে সিঁড়ি ও লিফট, তাই দুটি ফ্ল্যাটেই দুই দিকে খোলা দেয়াল।",
  ),
  unitsPerFloor: 2,
  bedroomsPerUnit: 2,
  baysX: X4,
  baysY: [
    bay(3600, 3900, 4200),
    bay(1500, 1500, 1800),
    bay(3300, 3450, 3900),
    bay(2450, 2550, 3000),
    bay(3300, 3450, 3900),
    bay(1500, 1500, 1800),
    bay(3600, 3900, 4200),
  ],
  structuralX: [0, 2, 3, 4],
  structuralY: [0, 1, 3, 4, 6, 7],
  rooms: [
    // Flat A (front)
    { id: "a-living", kind: "living", unit: "A", name: t("A living room", "এ বসার ঘর"), cells: [[1, 0, 3, 0]] },
    { id: "a-bed1", kind: "bedroom", unit: "A", name: t("A master bedroom", "এ মাস্টার বেডরুম"), cells: [[0, 0, 0, 0]] },
    { id: "a-toilet1", kind: "toilet", unit: "A", name: t("A master toilet", "এ মাস্টার টয়লেট"), cells: [[0, 1, 0, 1]] },
    { id: "a-corridor", kind: "corridor", unit: "A", name: t("A corridor", "এ করিডোর"), cells: [[1, 1, 1, 2]] },
    { id: "a-dining", kind: "dining", unit: "A", name: t("A dining", "এ খাবার ঘর"), cells: [[2, 1, 2, 2]] },
    { id: "a-toilet2", kind: "toilet", unit: "A", name: t("A common toilet", "এ কমন টয়লেট"), cells: [[3, 1, 3, 1]] },
    { id: "a-kitchen", kind: "kitchen", unit: "A", name: t("A kitchen", "এ রান্নাঘর"), cells: [[3, 2, 3, 2]] },
    { id: "a-bed2", kind: "bedroom", unit: "A", name: t("A bedroom 2", "এ বেডরুম ২"), cells: [[0, 2, 0, 2]] },
    ...core(3),
    // Flat B (back), the mirror image of A in depth
    { id: "b-bed2", kind: "bedroom", unit: "B", name: t("B bedroom 2", "বি বেডরুম ২"), cells: [[0, 4, 0, 4]] },
    { id: "b-corridor", kind: "corridor", unit: "B", name: t("B corridor", "বি করিডোর"), cells: [[1, 4, 1, 5]] },
    { id: "b-dining", kind: "dining", unit: "B", name: t("B dining", "বি খাবার ঘর"), cells: [[2, 4, 2, 5]] },
    { id: "b-kitchen", kind: "kitchen", unit: "B", name: t("B kitchen", "বি রান্নাঘর"), cells: [[3, 4, 3, 4]] },
    { id: "b-toilet2", kind: "toilet", unit: "B", name: t("B common toilet", "বি কমন টয়লেট"), cells: [[3, 5, 3, 5]] },
    { id: "b-toilet1", kind: "toilet", unit: "B", name: t("B master toilet", "বি মাস্টার টয়লেট"), cells: [[0, 5, 0, 5]] },
    { id: "b-bed1", kind: "bedroom", unit: "B", name: t("B master bedroom", "বি মাস্টার বেডরুম"), cells: [[0, 6, 0, 6]] },
    { id: "b-living", kind: "living", unit: "B", name: t("B living room", "বি বসার ঘর"), cells: [[1, 6, 3, 6]] },
  ],
  doors: [
    { between: ["a-living", "a-bed1"] },
    { between: ["a-bed1", "a-toilet1"] },
    { between: ["a-living", "a-corridor"] },
    { between: ["a-living", "a-dining"] },
    { between: ["a-dining", "a-toilet2"] },
    { between: ["a-dining", "a-kitchen"] },
    { between: ["a-corridor", "a-bed2"] },
    { between: ["a-corridor", "lobby"], main: true },
    ...CORE_DOORS,
    { between: ["b-corridor", "lobby"], main: true },
    { between: ["b-corridor", "b-bed2"] },
    { between: ["b-corridor", "b-living"] },
    { between: ["b-living", "b-dining"] },
    { between: ["b-dining", "b-kitchen"] },
    { between: ["b-dining", "b-toilet2"] },
    { between: ["b-living", "b-bed1"] },
    { between: ["b-bed1", "b-toilet1"] },
  ],
};

export const PLAN_LIBRARY: PlanDefinition[] = [P1_4B, P2_2B_FB];

export function getPlan(id: string): PlanDefinition | undefined {
  return PLAN_LIBRARY.find((p) => p.id === id);
}
