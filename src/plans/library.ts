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

// Bedroom and living bays are at least 3050 mm (inner) or 3100 mm (outer wall) so their net width reaches
// the BNBC 2020 minimum of 2.90 m (Part 3 Sec 1.14.2.2); the fitter widens them or rejects the plot.
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


// ---------------------------------------------------------------------------
// M2-3 additions. Defaults taken where the owner has not answered (to revisit):
//  - lift and duct stay one core bay in the X4 plans; the wide plans put a separate duct bay (kind "shaft") beside the stair
//  - toilets sit on outside walls (no light-shaft toilets yet), so plans that need shafts (3-4 flats per floor) wait for that answer
//  - the 1.35 m corridor spine is kept in the X4 plans; the wide plans use a horizontal 1.5 m corridor
// ---------------------------------------------------------------------------

const room = (id: string, kind: RoomDef["kind"], unit: string | undefined, en: string, bn: string, ...cells: RoomDef["cells"]): RoomDef => ({
  id,
  kind,
  ...(unit ? { unit } : {}),
  name: t(en, bn),
  cells,
});

/** Like p1-4b, but the fourth bedroom becomes a family lounge: three bedrooms. */
export const P1_3B: PlanDefinition = {
  ...P1_4B,
  id: "p1-3b",
  name: t("One flat per floor, 3 bedrooms", "প্রতি তলায় একটি ফ্ল্যাট, ৩ বেডরুম"),
  description: t(
    "Three bedrooms down the left wall and a family lounge at the back right; living room on the road side. For narrow, deep plots.",
    "বাম দেয়ালে তিনটি বেডরুম, পেছনে ডানে পারিবারিক বসার ঘর; রাস্তার দিকে বসার ঘর। সরু ও গভীর প্লটের জন্য।",
  ),
  bedroomsPerUnit: 3,
  rooms: P1_4B.rooms.map((r) =>
    r.id === "a-bed4" ? { ...r, id: "a-lounge", kind: "living" as const, name: t("Family lounge", "পারিবারিক বসার ঘর") } : r,
  ),
  doors: P1_4B.doors.map((d) => ({ ...d, between: d.between.map((x) => (x === "a-bed4" ? "a-lounge" : x)) as unknown as typeof d.between })),
};

// Five columns for the wide plans: bedroom edge, three inner bays, bedroom/service edge.
const X5: Bay[] = [bay(3300, 3600, 3900), bay(2700, 2900, 3000), bay(2700, 2900, 3000), bay(3050, 3100, 3300), bay(3100, 3300, 3600)];

/** One flat per floor, four bedrooms, horizontal corridor, for wide plots. */
export const P1_4B_WIDE: PlanDefinition = {
  id: "p1-4b-wide",
  name: t("One flat per floor, 4 bedrooms, wide plot", "প্রতি তলায় একটি ফ্ল্যাট, ৪ বেডরুম (চওড়া প্লট)"),
  description: t(
    "Bedrooms along the front and both side walls, a horizontal corridor behind them, dining and kitchen in the middle, stair and lift at the back.",
    "সামনে ও দুই পাশে বেডরুম, পেছনে লম্বা করিডোর, মাঝখানে খাবার ঘর ও রান্নাঘর, পেছনে সিঁড়ি ও লিফট। চওড়া প্লটের জন্য।",
  ),
  unitsPerFloor: 1,
  bedroomsPerUnit: 4,
  baysX: X5,
  baysY: [bay(3600, 3900, 4200), bay(1500, 1500, 1800), bay(3300, 3450, 3900), bay(2450, 2550, 3000)],
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4],
  rooms: [
    room("a-bed1", "bedroom", "A", "Master bedroom", "মাস্টার বেডরুম", [0, 0, 0, 0]),
    room("a-living", "living", "A", "Living room", "বসার ঘর", [1, 0, 2, 0]),
    room("a-bed2", "bedroom", "A", "Bedroom 2", "বেডরুম ২", [3, 0, 3, 0]),
    room("a-bed3", "bedroom", "A", "Bedroom 3", "বেডরুম ৩", [4, 0, 4, 0]),
    room("a-toilet1", "toilet", "A", "Toilet 1", "টয়লেট ১", [0, 1, 0, 1]),
    room("a-corridor", "corridor", "A", "Corridor", "করিডোর", [1, 1, 4, 1]),
    room("a-bed4", "bedroom", "A", "Bedroom 4", "বেডরুম ৪", [0, 2, 0, 2]),
    room("a-dining", "dining", "A", "Dining", "খাবার ঘর", [1, 2, 3, 2]),
    room("a-kitchen", "kitchen", "A", "Kitchen", "রান্নাঘর", [4, 2, 4, 2]),
    room("a-toilet2", "toilet", "A", "Toilet 2", "টয়লেট ২", [0, 3, 0, 3]),
    room("lift", "lift", undefined, "Lift", "লিফট", [1, 3, 1, 3]),
    room("lobby", "lobby", undefined, "Lift lobby", "লিফট লবি", [2, 3, 2, 3]),
    room("stair", "stair", undefined, "Stair", "সিঁড়ি", [3, 3, 4, 3]),
  ],
  doors: [
    { between: ["a-living", "a-bed1"] },
    { between: ["a-bed1", "a-toilet1"] },
    { between: ["a-corridor", "a-living"] },
    { between: ["a-corridor", "a-bed2"] },
    { between: ["a-corridor", "a-bed3"] },
    { between: ["a-corridor", "a-toilet1"] },
    { between: ["a-corridor", "a-dining"] },
    { between: ["a-dining", "a-bed4"] },
    { between: ["a-bed4", "a-toilet2"] },
    { between: ["a-dining", "a-kitchen"] },
    { between: ["a-dining", "lobby"], main: true },
    ...CORE_DOORS,
  ],
};

/** Three-bedroom flats, one in front of the core and one behind it, horizontal corridors. For large plots. */
export const P2_3B_FB: PlanDefinition = {
  id: "p2-3b-fb",
  name: t("Two flats per floor, front and back, 3 bedrooms", "প্রতি তলায় দুটি ফ্ল্যাট (সামনে ও পেছনে), ৩ বেডরুম"),
  description: t(
    "Flat A faces the road and flat B the back; stair, lift and a duct sit in the band between them, so every bedroom has an outside wall.",
    "ফ্ল্যাট এ রাস্তার দিকে, ফ্ল্যাট বি পেছনে; মাঝের অংশে সিঁড়ি, লিফট ও ডাক্ট, তাই প্রতিটি বেডরুমের বাইরের দেয়াল আছে।",
  ),
  unitsPerFloor: 2,
  bedroomsPerUnit: 3,
  baysX: X5,
  baysY: [
    bay(3600, 3900, 4200),
    bay(1500, 1500, 1800),
    bay(3300, 3450, 3900),
    bay(2450, 2550, 3000),
    bay(3300, 3450, 3900),
    bay(1500, 1500, 1800),
    bay(3600, 3900, 4200),
  ],
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4, 5, 6, 7],
  rooms: [
    room("a-bed1", "bedroom", "A", "A master bedroom", "এ মাস্টার বেডরুম", [0, 0, 0, 0]),
    room("a-living", "living", "A", "A living room", "এ বসার ঘর", [1, 0, 3, 0]),
    room("a-bed2", "bedroom", "A", "A bedroom 2", "এ বেডরুম ২", [4, 0, 4, 0]),
    room("a-toilet1", "toilet", "A", "A toilet 1", "এ টয়লেট ১", [0, 1, 0, 1]),
    room("a-corridor", "corridor", "A", "A corridor", "এ করিডোর", [1, 1, 3, 1]),
    room("a-toilet2", "toilet", "A", "A toilet 2", "এ টয়লেট ২", [4, 1, 4, 1]),
    room("a-bed3", "bedroom", "A", "A bedroom 3", "এ বেডরুম ৩", [0, 2, 0, 2]),
    room("a-dining", "dining", "A", "A dining", "এ খাবার ঘর", [1, 2, 3, 2]),
    room("a-kitchen", "kitchen", "A", "A kitchen", "এ রান্নাঘর", [4, 2, 4, 2]),
    room("lift", "lift", undefined, "Lift", "লিফট", [0, 3, 0, 3]),
    room("lobby", "lobby", undefined, "Lift lobby", "লিফট লবি", [1, 3, 1, 3]),
    room("stair", "stair", undefined, "Stair", "সিঁড়ি", [2, 3, 3, 3]),
    room("duct", "shaft", undefined, "Service duct", "সার্ভিস ডাক্ট", [4, 3, 4, 3]),
    room("b-bed3", "bedroom", "B", "B bedroom 3", "বি বেডরুম ৩", [0, 4, 0, 4]),
    room("b-dining", "dining", "B", "B dining", "বি খাবার ঘর", [1, 4, 3, 4]),
    room("b-kitchen", "kitchen", "B", "B kitchen", "বি রান্নাঘর", [4, 4, 4, 4]),
    room("b-toilet1", "toilet", "B", "B toilet 1", "বি টয়লেট ১", [0, 5, 0, 5]),
    room("b-corridor", "corridor", "B", "B corridor", "বি করিডোর", [1, 5, 3, 5]),
    room("b-toilet2", "toilet", "B", "B toilet 2", "বি টয়লেট ২", [4, 5, 4, 5]),
    room("b-bed1", "bedroom", "B", "B master bedroom", "বি মাস্টার বেডরুম", [0, 6, 0, 6]),
    room("b-living", "living", "B", "B living room", "বি বসার ঘর", [1, 6, 3, 6]),
    room("b-bed2", "bedroom", "B", "B bedroom 2", "বি বেডরুম ২", [4, 6, 4, 6]),
  ],
  doors: [
    ...(["a", "b"] as const).flatMap((u) => [
      { between: [`${u}-living`, `${u}-bed1`] as const },
      { between: [`${u}-living`, `${u}-bed2`] as const },
      { between: [`${u}-bed1`, `${u}-toilet1`] as const },
      { between: [`${u}-bed2`, `${u}-toilet2`] as const },
      { between: [`${u}-corridor`, `${u}-living`] as const },
      { between: [`${u}-corridor`, `${u}-dining`] as const },
      { between: [`${u}-corridor`, `${u}-toilet1`] as const },
      { between: [`${u}-corridor`, `${u}-toilet2`] as const },
      { between: [`${u}-dining`, `${u}-bed3`] as const },
      { between: [`${u}-dining`, `${u}-kitchen`] as const },
      { between: [`${u}-dining`, "lobby"] as const, main: true },
    ]),
    { between: ["a-bed3", "a-toilet1"] },
    { between: ["b-bed3", "b-toilet1"] },
    ...CORE_DOORS,
  ],
};

// Left and right flats with the core in a central strip.
const XLR: Bay[] = [bay(3100, 3200, 3600), bay(3050, 3100, 3600), bay(2450, 2550, 2700), bay(3050, 3100, 3600), bay(3100, 3200, 3600)];
// Three-bedroom version: a wider outer column so the middle bedrooms reach 9.5 m².
const XLR3: Bay[] = [bay(3200, 3300, 3600), bay(3050, 3100, 3600), bay(2450, 2550, 2700), bay(3050, 3100, 3600), bay(3200, 3300, 3600)];

/** Two 2-bedroom flats side by side, stair/lobby/lift in a central strip. For wide plots. */
export const P2_2B_LR: PlanDefinition = {
  id: "p2-2b-lr",
  name: t("Two flats per floor, left and right, 2 bedrooms", "প্রতি তলায় দুটি ফ্ল্যাট (বামে ও ডানে), ২ বেডরুম"),
  description: t(
    "Flat A on the left, flat B on the right, the stair, lobby and lift in a strip between them; each flat has living at the front and bedrooms on its outer wall.",
    "বামে ফ্ল্যাট এ, ডানে ফ্ল্যাট বি, মাঝখানের স্ট্রিপে সিঁড়ি, লবি ও লিফট; প্রতিটি ফ্ল্যাটে সামনে বসার ঘর ও বাইরের দেয়ালে বেডরুম।",
  ),
  unitsPerFloor: 2,
  bedroomsPerUnit: 2,
  baysX: XLR,
  baysY: [bay(3600, 3900, 4200), bay(1500, 1500, 1800), bay(2700, 3000, 3300), bay(2400, 2550, 3000)],
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4],
  rooms: [
    room("a-bed1", "bedroom", "A", "A master bedroom", "এ মাস্টার বেডরুম", [0, 0, 0, 0]),
    room("a-living", "living", "A", "A living room", "এ বসার ঘর", [1, 0, 1, 0]),
    room("a-toilet", "toilet", "A", "A toilet", "এ টয়লেট", [0, 1, 0, 1]),
    room("a-dining", "dining", "A", "A dining", "এ খাবার ঘর", [1, 1, 1, 2]),
    room("a-bed2", "bedroom", "A", "A bedroom 2", "এ বেডরুম ২", [0, 2, 0, 3]),
    room("a-kitchen", "kitchen", "A", "A kitchen", "এ রান্নাঘর", [1, 3, 1, 3]),
    room("stair", "stair", undefined, "Stair", "সিঁড়ি", [2, 0, 2, 1]),
    room("lobby", "lobby", undefined, "Lift lobby", "লিফট লবি", [2, 2, 2, 2]),
    room("lift", "lift", undefined, "Lift", "লিফট", [2, 3, 2, 3]),
    room("b-living", "living", "B", "B living room", "বি বসার ঘর", [3, 0, 3, 0]),
    room("b-bed1", "bedroom", "B", "B master bedroom", "বি মাস্টার বেডরুম", [4, 0, 4, 0]),
    room("b-dining", "dining", "B", "B dining", "বি খাবার ঘর", [3, 1, 3, 2]),
    room("b-toilet", "toilet", "B", "B toilet", "বি টয়লেট", [4, 1, 4, 1]),
    room("b-bed2", "bedroom", "B", "B bedroom 2", "বি বেডরুম ২", [4, 2, 4, 3]),
    room("b-kitchen", "kitchen", "B", "B kitchen", "বি রান্নাঘর", [3, 3, 3, 3]),
  ],
  doors: [
    ...(["a", "b"] as const).flatMap((u) => [
      { between: [`${u}-living`, `${u}-bed1`] as const },
      { between: [`${u}-living`, `${u}-dining`] as const },
      { between: [`${u}-bed1`, `${u}-toilet`] as const },
      { between: [`${u}-dining`, `${u}-toilet`] as const },
      { between: [`${u}-dining`, `${u}-bed2`] as const },
      { between: [`${u}-dining`, `${u}-kitchen`] as const },
      { between: [`${u}-dining`, "lobby"] as const, main: true },
    ]),
    { between: ["lobby", "lift"] },
    { between: ["lobby", "stair"] },
  ],
};

/** Two 3-bedroom flats side by side with a central core strip and a duct. For wide, deep plots. */
export const P2_3B_LR: PlanDefinition = {
  id: "p2-3b-lr",
  name: t("Two flats per floor, left and right, 3 bedrooms", "প্রতি তলায় দুটি ফ্ল্যাট (বামে ও ডানে), ৩ বেডরুম"),
  description: t(
    "Like the 2-bedroom side-by-side plan with a third bedroom on each outer wall and a long dining hall linking the rooms; a separate duct sits at the back of the core strip.",
    "২ বেডরুমের পাশাপাশি প্ল্যানের মতো, তবে প্রতিটি বাইরের দেয়ালে তৃতীয় বেডরুম ও ঘরগুলোকে যুক্ত করা লম্বা খাবার হল; কোরের পেছনে আলাদা ডাক্ট।",
  ),
  unitsPerFloor: 2,
  bedroomsPerUnit: 3,
  baysX: XLR3,
  baysY: [bay(3600, 3900, 4200), bay(1500, 1500, 1800), bay(3400, 3500, 3800), bay(3400, 3500, 3800), bay(2400, 2550, 3000)],
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4, 5],
  rooms: [
    room("a-bed1", "bedroom", "A", "A master bedroom", "এ মাস্টার বেডরুম", [0, 0, 0, 0]),
    room("a-living", "living", "A", "A living room", "এ বসার ঘর", [1, 0, 1, 0]),
    room("a-toilet1", "toilet", "A", "A toilet 1", "এ টয়লেট ১", [0, 1, 0, 1]),
    room("a-dining", "dining", "A", "A dining hall", "এ খাবার হল", [1, 1, 1, 3]),
    room("a-bed2", "bedroom", "A", "A bedroom 2", "এ বেডরুম ২", [0, 2, 0, 2]),
    room("a-bed3", "bedroom", "A", "A bedroom 3", "এ বেডরুম ৩", [0, 3, 0, 3]),
    room("a-toilet2", "toilet", "A", "A toilet 2", "এ টয়লেট ২", [0, 4, 0, 4]),
    room("a-kitchen", "kitchen", "A", "A kitchen", "এ রান্নাঘর", [1, 4, 1, 4]),
    room("stair", "stair", undefined, "Stair", "সিঁড়ি", [2, 0, 2, 1]),
    room("lobby", "lobby", undefined, "Lift lobby", "লিফট লবি", [2, 2, 2, 2]),
    room("lift", "lift", undefined, "Lift", "লিফট", [2, 3, 2, 3]),
    room("duct", "shaft", undefined, "Service duct", "সার্ভিস ডাক্ট", [2, 4, 2, 4]),
    room("b-living", "living", "B", "B living room", "বি বসার ঘর", [3, 0, 3, 0]),
    room("b-bed1", "bedroom", "B", "B master bedroom", "বি মাস্টার বেডরুম", [4, 0, 4, 0]),
    room("b-dining", "dining", "B", "B dining hall", "বি খাবার হল", [3, 1, 3, 3]),
    room("b-toilet1", "toilet", "B", "B toilet 1", "বি টয়লেট ১", [4, 1, 4, 1]),
    room("b-bed2", "bedroom", "B", "B bedroom 2", "বি বেডরুম ২", [4, 2, 4, 2]),
    room("b-bed3", "bedroom", "B", "B bedroom 3", "বি বেডরুম ৩", [4, 3, 4, 3]),
    room("b-toilet2", "toilet", "B", "B toilet 2", "বি টয়লেট ২", [4, 4, 4, 4]),
    room("b-kitchen", "kitchen", "B", "B kitchen", "বি রান্নাঘর", [3, 4, 3, 4]),
  ],
  doors: [
    ...(["a", "b"] as const).flatMap((u) => [
      { between: [`${u}-living`, `${u}-bed1`] as const },
      { between: [`${u}-living`, `${u}-dining`] as const },
      { between: [`${u}-bed1`, `${u}-toilet1`] as const },
      { between: [`${u}-dining`, `${u}-toilet1`] as const },
      { between: [`${u}-dining`, `${u}-bed2`] as const },
      { between: [`${u}-dining`, `${u}-bed3`] as const },
      { between: [`${u}-bed3`, `${u}-toilet2`] as const },
      { between: [`${u}-dining`, `${u}-kitchen`] as const },
      { between: [`${u}-dining`, "lobby"] as const, main: true },
    ]),
    { between: ["lobby", "lift"] },
    { between: ["lobby", "stair"] },
  ],
};

// ---------------------------------------------------------------------------
// M2-3, three and four flats per floor. The light-shaft question was settled by default (owner rule: pick
// defaults and keep building): the flats sit on the four corners of a central core strip, so every bedroom,
// living room, kitchen and toilet has an outside wall and no toilet or kitchen needs a shaft. The strip holds,
// front to back: stair, a long lobby every entrance opens onto, the lift, and a service duct (kind "shaft",
// sized for a building of up to six storeys, BNBC 2020 Part 3 Table 3.1.11).
// ---------------------------------------------------------------------------

// Five columns: outer, inner, core strip, inner, outer. The core bay is at least 2650 mm so the stair is 2.15 m wide net.
const X4F: Bay[] = [bay(3100, 3200, 3600), bay(3050, 3100, 3600), bay(2650, 2800, 3000), bay(3050, 3100, 3600), bay(3100, 3200, 3600)];

type Tmpl = { id: string; kind: RoomDef["kind"]; en: string; bn: string; cells: RoomDef["cells"][number] };
type Corner = { unit: string; bn: string; flipX: boolean; flipY: boolean };

/** A flat template drawn in the front-left corner, placed in another corner by flipping its cells. */
function flatRooms(tmpl: Tmpl[], c: Corner, nx: number, ny: number): RoomDef[] {
  const fx = (x: number) => (c.flipX ? nx - 1 - x : x);
  const fy = (y: number) => (c.flipY ? ny - 1 - y : y);
  return tmpl.map((r) => {
    const [x0, y0, x1, y1] = r.cells;
    const cell = [Math.min(fx(x0), fx(x1)), Math.min(fy(y0), fy(y1)), Math.max(fx(x0), fx(x1)), Math.max(fy(y0), fy(y1))] as const;
    return room(`${c.unit.toLowerCase()}-${r.id}`, r.kind, c.unit, `${c.unit} ${r.en}`, `${c.bn} ${r.bn}`, cell);
  });
}

/** Doors of one flat: living and bedroom, living and hall, bedroom and toilet, hall to toilet, bedroom 2, kitchen and the entrance onto the lobby. */
function flatDoors(unit: string, hasBed2: boolean): DoorsOf {
  const u = unit.toLowerCase();
  return [
    { between: [`${u}-living`, `${u}-bed1`] },
    { between: [`${u}-living`, `${u}-dining`] },
    { between: [`${u}-bed1`, `${u}-toilet`] },
    { between: [`${u}-dining`, `${u}-toilet`] },
    ...(hasBed2 ? [{ between: [`${u}-dining`, `${u}-bed2`] as const }] : []),
    { between: [`${u}-dining`, `${u}-kitchen`] },
    { between: [`${u}-dining`, "lobby"], main: true },
  ];
}
type DoorsOf = PlanDefinition["doors"];

const CORNERS: Corner[] = [
  { unit: "A", bn: "এ", flipX: false, flipY: false },
  { unit: "B", bn: "বি", flipX: true, flipY: false },
  { unit: "C", bn: "সি", flipX: false, flipY: true },
  { unit: "D", bn: "ডি", flipX: true, flipY: true },
];

// Eight rows, front to back: living/bedroom, toilet, bedroom, kitchen, then the mirror image for the back flats.
const Y4F2: Bay[] = [
  bay(3600, 3900, 4200),
  bay(1500, 1800, 2100),
  bay(3400, 3500, 3800),
  bay(2300, 2400, 2700),
  bay(2300, 2400, 2700),
  bay(3400, 3500, 3800),
  bay(1500, 1800, 2100),
  bay(3600, 3900, 4200),
];

/** A two-bedroom flat in the front-left corner of the 5 x 8 grid: bedroom 1 and living on the front, toilet, bedroom 2 and kitchen down the left wall, a hall between. */
const FLAT_2B: Tmpl[] = [
  { id: "bed1", kind: "bedroom", en: "master bedroom", bn: "মাস্টার বেডরুম", cells: [0, 0, 0, 0] },
  { id: "living", kind: "living", en: "living room", bn: "বসার ঘর", cells: [1, 0, 1, 0] },
  { id: "toilet", kind: "toilet", en: "toilet", bn: "টয়লেট", cells: [0, 1, 0, 1] },
  { id: "dining", kind: "dining", en: "dining hall", bn: "খাবার হল", cells: [1, 1, 1, 3] },
  { id: "bed2", kind: "bedroom", en: "bedroom 2", bn: "বেডরুম ২", cells: [0, 2, 0, 2] },
  { id: "kitchen", kind: "kitchen", en: "kitchen", bn: "রান্নাঘর", cells: [0, 3, 0, 3] },
];

/** Stair, a three-cell lobby, lift and duct down the middle column of the 8-row plans. */
const STRIP_8: RoomDef[] = [
  room("stair", "stair", undefined, "Stair", "সিঁড়ি", [2, 0, 2, 1]),
  room("lobby", "lobby", undefined, "Lobby", "লবি", [2, 2, 2, 4]),
  room("lift", "lift", undefined, "Lift", "লিফট", [2, 5, 2, 5]),
  room("duct", "shaft", undefined, "Service duct", "সার্ভিস ডাক্ট", [2, 6, 2, 7]),
];
const STRIP_DOORS: DoorsOf = [{ between: ["lobby", "stair"] }, { between: ["lobby", "lift"] }];

/** Four two-bedroom flats, one in each corner of a central core strip. For large plots (about 7 katha and up). */
export const P4_2B: PlanDefinition = {
  id: "p4-2b",
  name: t("Four flats per floor, 2 bedrooms", "প্রতি তলায় চারটি ফ্ল্যাট, ২ বেডরুম"),
  description: t(
    "A flat in each corner of the plot around a central core strip (stair, lobby, lift, duct); every bedroom, living room, kitchen and toilet has an outside wall, so no light shafts are needed.",
    "প্লটের চার কোণে চারটি ফ্ল্যাট, মাঝখানে কোর স্ট্রিপ (সিঁড়ি, লবি, লিফট, ডাক্ট); প্রতিটি বেডরুম, বসার ঘর, রান্নাঘর ও টয়লেটের বাইরের দেয়াল আছে, তাই আলাদা লাইট শ্যাফট লাগে না।",
  ),
  unitsPerFloor: 4,
  bedroomsPerUnit: 2,
  baysX: X4F,
  baysY: Y4F2,
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  rooms: [...CORNERS.flatMap((c) => flatRooms(FLAT_2B, c, 5, 8)), ...STRIP_8],
  doors: [...CORNERS.flatMap((c) => flatDoors(c.unit, true)), ...STRIP_DOORS],
};

/** The big flat B of the three-flat plan: the whole right half of the plot, entered from the lobby. */
const BIG_FLAT: RoomDef[] = [
  room("b-living", "living", "B", "B living room", "বি বসার ঘর", [3, 0, 3, 0]),
  room("b-bed1", "bedroom", "B", "B master bedroom", "বি মাস্টার বেডরুম", [4, 0, 4, 0]),
  room("b-toilet", "toilet", "B", "B toilet 1", "বি টয়লেট ১", [4, 1, 4, 1]),
  room("b-dining", "dining", "B", "B dining hall", "বি খাবার হল", [3, 1, 3, 6]),
  room("b-bed2", "bedroom", "B", "B bedroom 2", "বি বেডরুম ২", [4, 2, 4, 2]),
  room("b-kitchen", "kitchen", "B", "B kitchen", "বি রান্নাঘর", [4, 3, 4, 3]),
  room("b-store", "store", "B", "B store", "বি স্টোর", [4, 4, 4, 4]),
  room("b-bed3", "bedroom", "B", "B bedroom 3", "বি বেডরুম ৩", [4, 5, 4, 5]),
  room("b-toilet2", "toilet", "B", "B toilet 2", "বি টয়লেট ২", [4, 6, 4, 6]),
  room("b-lounge", "living", "B", "B family lounge", "বি পারিবারিক বসার ঘর", [3, 7, 3, 7]),
  room("b-bed4", "bedroom", "B", "B bedroom 4", "বি বেডরুম ৪", [4, 7, 4, 7]),
];

/** Two 2-bedroom flats on the left (front and back) and one large flat down the whole right side. */
export const P3_2B: PlanDefinition = {
  id: "p3-2b",
  name: t("Three flats per floor (two 2-bedroom, one large)", "প্রতি তলায় তিনটি ফ্ল্যাট (দুটি ২ বেডরুম, একটি বড়)"),
  description: t(
    "Like the four-flat plan, but the two right-hand flats are one large flat with four bedrooms; the other two flats have two bedrooms each. Same central core strip, no light shafts.",
    "চার ফ্ল্যাটের প্ল্যানের মতো, তবে ডানের দুটি ফ্ল্যাট মিলে চার বেডরুমের একটি বড় ফ্ল্যাট; বাকি দুটিতে দুটি করে বেডরুম। একই কোর স্ট্রিপ, লাইট শ্যাফট নেই।",
  ),
  unitsPerFloor: 3,
  bedroomsPerUnit: 2,
  baysX: X4F,
  baysY: Y4F2,
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  rooms: [...CORNERS.filter((c) => !c.flipX).flatMap((c) => flatRooms(FLAT_2B, c, 5, 8)), ...BIG_FLAT, ...STRIP_8],
  doors: [
    ...CORNERS.filter((c) => !c.flipX).flatMap((c) => flatDoors(c.unit, true)),
    { between: ["b-living", "b-bed1"] },
    { between: ["b-living", "b-dining"] },
    { between: ["b-bed1", "b-toilet"] },
    { between: ["b-dining", "b-toilet"] },
    { between: ["b-dining", "b-bed2"] },
    { between: ["b-dining", "b-kitchen"] },
    { between: ["b-dining", "b-store"] },
    { between: ["b-dining", "b-bed3"] },
    { between: ["b-bed3", "b-toilet2"] },
    { between: ["b-dining", "b-toilet2"] },
    { between: ["b-dining", "b-lounge"] },
    { between: ["b-lounge", "b-bed4"] },
    { between: ["b-bed4", "b-toilet2"] },
    { between: ["b-dining", "lobby"], main: true },
    ...STRIP_DOORS,
  ],
};

// Six rows for the one-bedroom plan: bedroom/living, toilet, kitchen, then the mirror image.
const Y4F1: Bay[] = [
  bay(4200, 4300, 4500),
  bay(1500, 1800, 2100),
  bay(2500, 2700, 3000),
  bay(2500, 2700, 3000),
  bay(1500, 1800, 2100),
  bay(4200, 4300, 4500),
];

/** A one-bedroom flat in the front-left corner of the 5 x 6 grid. */
const FLAT_1B: Tmpl[] = [
  { id: "bed1", kind: "bedroom", en: "bedroom", bn: "বেডরুম", cells: [0, 0, 0, 0] },
  { id: "living", kind: "living", en: "living room", bn: "বসার ঘর", cells: [1, 0, 1, 0] },
  { id: "toilet", kind: "toilet", en: "toilet", bn: "টয়লেট", cells: [0, 1, 0, 1] },
  { id: "dining", kind: "dining", en: "dining hall", bn: "খাবার হল", cells: [1, 1, 1, 2] },
  { id: "kitchen", kind: "kitchen", en: "kitchen", bn: "রান্নাঘর", cells: [0, 2, 0, 2] },
];

/** Four one-bedroom flats around a central core strip; the stair needs the long front and back bays. */
export const P4_1B: PlanDefinition = {
  id: "p4-1b",
  name: t("Four flats per floor, 1 bedroom", "প্রতি তলায় চারটি ফ্ল্যাট, ১ বেডরুম"),
  description: t(
    "Four compact one-bedroom flats in the corners of the plot around a central core strip (stair in front, long lobby, lift behind); every habitable room, kitchen and toilet has an outside wall.",
    "প্লটের চার কোণে চারটি ছোট ১ বেডরুমের ফ্ল্যাট, মাঝখানে কোর স্ট্রিপ (সামনে সিঁড়ি, লম্বা লবি, পেছনে লিফট); প্রতিটি ঘর, রান্নাঘর ও টয়লেটের বাইরের দেয়াল আছে।",
  ),
  unitsPerFloor: 4,
  bedroomsPerUnit: 1,
  baysX: X4F,
  baysY: Y4F1,
  structuralX: [0, 1, 2, 3, 4, 5],
  structuralY: [0, 1, 2, 3, 4, 5, 6],
  rooms: [
    ...CORNERS.flatMap((c) => flatRooms(FLAT_1B, c, 5, 6)),
    room("stair", "stair", undefined, "Stair", "সিঁড়ি", [2, 0, 2, 0]),
    room("lobby", "lobby", undefined, "Lobby", "লবি", [2, 1, 2, 4]),
    room("lift", "lift", undefined, "Lift", "লিফট", [2, 5, 2, 5]),
  ],
  doors: [...CORNERS.flatMap((c) => flatDoors(c.unit, false)), ...STRIP_DOORS],
};

export const PLAN_LIBRARY: PlanDefinition[] = [P1_4B, P1_3B, P1_4B_WIDE, P2_2B_FB, P2_2B_LR, P2_3B_LR, P2_3B_FB, P3_2B, P4_2B, P4_1B];

export function getPlan(id: string): PlanDefinition | undefined {
  return PLAN_LIBRARY.find((p) => p.id === id);
}
