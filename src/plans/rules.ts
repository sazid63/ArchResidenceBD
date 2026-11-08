/**
 * Dimensional rules the plan validator checks.
 *
 * SOURCE STATUS: these are WORKING VALUES, not yet transcribed from BNBC 2020. Task T3.0 in
 * BUILD_PLAN.md sources them from the official documents; until then every issue they raise is
 * labelled as an assumption so nobody mistakes it for a code citation. The corridor width
 * (1.2 m) is the value the app's existing compliance rule (BNBC-002) already used.
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

export const RULES_SOURCE = {
  status: "assumption" as const,
  note: "Working value pending BNBC 2020 sourcing (BUILD_PLAN.md T3.0).",
};

export const ROOM_RULES: Partial<Record<RoomKind, RoomRule>> = {
  bedroom: { minAreaM2: 9.5, minWidthMm: 2400, needs: "exterior" },
  living: { minAreaM2: 9.5, minWidthMm: 2400, needs: "exterior" },
  dining: { minWidthMm: 2100 },
  kitchen: { minAreaM2: 4.5, minWidthMm: 1500, needs: "exterior_or_shaft" },
  toilet: { minAreaM2: 1.8, minWidthMm: 1000, needs: "exterior_or_shaft" },
  corridor: { minWidthMm: 1200 },
  lobby: { minWidthMm: 1200 },
  lift: { minWidthMm: 1500 },
  shaft: { minWidthMm: 900 },
};

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
