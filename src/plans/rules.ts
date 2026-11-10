/**
 * Dimensional rules the plan validator checks.
 *
 * SOURCE STATUS: values marked "cited" are transcribed from BNBC 2020 (S.R.O. 55-Law/2020, gazette
 * 11 Feb 2021) and mirrored in spec/rules/bnbc-2020.yaml, which holds the page citations; a test
 * keeps the two in step. Values marked "assumption" are working values the Code does not give (or
 * gives ambiguously, see the pack's `gaps`) and every issue they raise says so.
 */

import type { RoomKind } from "./types";

export interface RoomRule {
  /** Minimum net (inside the walls) floor area, m². */
  minAreaM2?: number;
  /** Minimum net width, mm (the shorter side of the room's main rectangle). */
  minWidthMm?: number;
  /** Where the room must get light and air from. */
  needs?: "exterior" | "exterior_or_shaft";
}

export type RuleBasis = "cited" | "assumption";

/** Where one room rule comes from: a BNBC clause, or an assumption. */
export interface RuleSource {
  status: RuleBasis;
  /** BNBC 2020 clause for cited rules. */
  clause?: string;
  note?: string;
}

export const RULES_SOURCE = {
  status: "assumption" as const,
  note: "Working value: BNBC 2020 gives no figure (or an ambiguous one) for this rule; see spec/rules/bnbc-2020.yaml gaps.",
};

const HABITABLE: RoomRule = { minAreaM2: 9.5, minWidthMm: 2900, needs: "exterior" };
const HABITABLE_SRC: RuleSource = { status: "cited", clause: "BNBC 2020 Part 3 Sec 1.14.2.2" };

export const ROOM_RULES: Partial<Record<RoomKind, RoomRule>> = {
  bedroom: HABITABLE,
  living: HABITABLE,
  // Assumption: BNBC does not say whether a separate dining room is "habitable" (pack gap-dining).
  dining: { minWidthMm: 2100 },
  kitchen: { minAreaM2: 4, minWidthMm: 1500, needs: "exterior_or_shaft" },
  // Owner-confirmed 2026-11-09. Table 3.1.10: the smallest bathroom row (water closet only). The plan data does not say which
  // fixtures a toilet holds, so the smallest cited row is the floor.
  toilet: { minAreaM2: 1.2, minWidthMm: 1000, needs: "exterior_or_shaft" },
  // Table 4.3.8 prints 36 (inches, confirmed by the owner) = 914.4 mm, shown as 915 mm. Residential corridor.
  corridor: { minWidthMm: 915 },
  lobby: { minWidthMm: 1200 },
  lift: { minWidthMm: 1500 },
  // Table 3.1.11, row "up to 3 storeys" (1.00 m); taller buildings need more, see SHAFT_TABLE.
  shaft: { minWidthMm: 1000 },
  // Assumption: BNBC 2020 gives no balcony size; 1.0 m clear depth and 3 m2 are working values (a person can stand and turn).
  balcony: { minAreaM2: 3, minWidthMm: 1000 },
};

/** Per-kind source of the minimum area/width. Kinds missing here are assumptions. */
export const ROOM_RULE_SOURCES: Partial<Record<RoomKind, RuleSource>> = {
  bedroom: HABITABLE_SRC,
  living: HABITABLE_SRC,
  kitchen: { status: "cited", clause: "BNBC 2020 Part 3 Sec 1.14.3.2" },
  toilet: { status: "cited", clause: "BNBC 2020 Part 3 Table 3.1.10 (smallest row)" },
  shaft: { status: "cited", clause: "BNBC 2020 Part 3 Table 3.1.11 (up to 3 storeys)" },
  corridor: { status: "cited", clause: "BNBC 2020 Table 4.3.8, A3 row (36 in)", note: "unit confirmed by owner" },
};

/** Basis of the room rule for a kind: cited when BNBC gives the figure, else assumption. */
export function roomRuleBasis(kind: RoomKind): RuleBasis {
  return ROOM_RULE_SOURCES[kind]?.status ?? "assumption";
}

/** Lighting and ventilation shaft by building height, BNBC 2020 Part 3 Table 3.1.11. */
export const SHAFT_TABLE: ReadonlyArray<{ maxStoreys: number; minNetAreaM2: number; minWidthMm: number }> = [
  { maxStoreys: 3, minNetAreaM2: 1.5, minWidthMm: 1000 },
  { maxStoreys: 4, minNetAreaM2: 3, minWidthMm: 1200 },
  { maxStoreys: 5, minNetAreaM2: 4, minWidthMm: 1500 },
  { maxStoreys: 6, minNetAreaM2: 5, minWidthMm: 2000 },
  { maxStoreys: Infinity, minNetAreaM2: 6.5, minWidthMm: 2500 },
];

/** Shaft minimum for a building of `storeys` storeys. */
export function shaftMinimum(storeys: number) {
  return SHAFT_TABLE.find((r) => storeys <= r.maxStoreys) ?? SHAFT_TABLE[SHAFT_TABLE.length - 1];
}

/** Lifts are required above six storeys or 20 m, BNBC 2020 Part 8 Sec 4.2.1.1. */
export function liftRequired(storeys: number, heightM: number): boolean {
  return storeys > 6 || heightM > 20;
}

/** Wall thickness on a grid line: 250 mm brick on the outside, 125 mm inside (Dhaka practice). */
export const WALL_MM = { exterior: 250, interior: 125 } as const;

/** Clear door widths by the kind of the room the door opens into (the larger wins). */
export const DOOR_MM: Partial<Record<RoomKind, number>> & { main: number; default: number } = {
  main: 1000,
  default: 900,
  toilet: 750,
  store: 750,
  lift: 900,
};

/** Wall needed on each side of a door opening (jambs), mm. */
export const DOOR_JAMB_MM = 150;

/** Longest beam span the screening checks accept between structural grid lines, mm. */
export const MAX_SPAN_MM = 6000;

/** Window widths by room kind, mm (capped by the wall it sits in). */
export const WINDOW_MM: Partial<Record<RoomKind, number>> = {
  bedroom: 1500,
  living: 1800,
  dining: 1200,
  kitchen: 1200,
  toilet: 600,
  stair: 1200,
};

/** Balcony railing: thickness drawn in plan and height. RAJUK 2008 §46(5)(gha) exempts front balconies only with a railing of at most 1,200 mm; 1,000 mm is the working height (assumption, to confirm). */
export const RAILING = { thicknessMm: 100, heightMm: 1000, maxHeightRajukMm: 1200 } as const;
