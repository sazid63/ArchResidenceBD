export type PhaseKind = "site" | "foundation" | "floor" | "roof" | "common";
export type PhaseStatus = "not_started" | "gathering_info" | "drafted" | "designed" | "stale";
export type CostType = "material" | "labour" | "machinery" | "subcontract";

export interface Phase {
  id: string;
  kind: PhaseKind;
  storeyIndex?: number;
  status: PhaseStatus;
}

/** Mock data mirrors spec/examples/two-storey-residential.json — one consistent story. */
export const project = {
  name: "Mirpur Duplex",
  address: "Mirpur, Dhaka",
  stories: 2,
  unitsPerFloor: 2,
  plotValue: "2",
  plotUnit: "katha",
  plotSqm: 133.78,
  updatedEn: "15 Oct 2026",
  updatedBn: "১৫ অক্টোবর ২০২৬",
};

export const phases: Phase[] = [
  { id: "site-excavation", kind: "site", status: "designed" },
  { id: "foundation", kind: "foundation", status: "designed" },
  { id: "floor-0", kind: "floor", storeyIndex: 0, status: "designed" },
  { id: "floor-1", kind: "floor", storeyIndex: 1, status: "designed" },
  { id: "roof-boundary", kind: "roof", status: "gathering_info" },
  { id: "common-services", kind: "common", status: "stale" },
];

export interface BoqLine {
  item: string;
  unit: string;
  qty: number;
  rate: number;
  cost: CostType;
  deviation?: boolean;
  /** The quantity before the last change - the live cost meter's "before" (W3.8). */
  qtyBefore?: number;
}

export interface BoqPhase {
  phaseId: string;
  lines: BoqLine[];
}

export const boq: BoqPhase[] = [
  {
    phaseId: "foundation",
    lines: [
      { item: "OPC cement, 50 kg bag", unit: "bag", qty: 120, qtyBefore: 110, rate: 640, cost: "material" },
      { item: "Rebar B500 (60 grade)", unit: "ton", qty: 1.8, qtyBefore: 1.62, rate: 92500, cost: "material" },
      { item: "Sylhet sand (FM 1.5)", unit: "m³", qty: 8, rate: 2600, cost: "material" },
      { item: "Stone chips (20 mm)", unit: "m³", qty: 6, rate: 3200, cost: "material" },
      { item: "Mason", unit: "day", qty: 24, rate: 900, cost: "labour" },
      { item: "Rod binder", unit: "day", qty: 18, rate: 850, cost: "labour" },
      { item: "Concrete mixer, 1 bag", unit: "day", qty: 6, rate: 1200, cost: "machinery" },
      { item: "Piling (per pile, incl. rig)", unit: "pile", qty: 4, rate: 28000, cost: "subcontract", deviation: true },
    ],
  },
  {
    phaseId: "floor-0",
    lines: [
      { item: "OPC cement, 50 kg bag", unit: "bag", qty: 90, qtyBefore: 84, rate: 640, cost: "material" },
      { item: "Rebar B500 (60 grade)", unit: "ton", qty: 1.2, rate: 92500, cost: "material" },
      { item: "Sylhet sand (FM 1.5)", unit: "m³", qty: 6, rate: 2600, cost: "material" },
      { item: "Stone chips (20 mm)", unit: "m³", qty: 5, rate: 3200, cost: "material" },
      { item: "Mason", unit: "day", qty: 30, rate: 900, cost: "labour" },
      { item: "Mixer operator", unit: "day", qty: 5, rate: 1100, cost: "machinery" },
    ],
  },
];

export interface DocItem {
  id: "drawings" | "bbs" | "reports" | "engineer-pack";
  sheets: number;
  status: "ready" | "draft";
}

export const documents: DocItem[] = [
  { id: "drawings", sheets: 8, status: "ready" },
  { id: "bbs", sheets: 3, status: "draft" },
  { id: "reports", sheets: 2, status: "ready" },
  { id: "engineer-pack", sheets: 1, status: "draft" },
];

export const designStats = {
  lastRun: "2 min 40 s",
  model: "archie-r1 (preview)",
  phaseDesigns: "4 / 6",
};

/** A reviewer's decision on one candidate clause (W4.7). */
export interface ImportReview {
  decision: "accepted" | "rejected";
  reviewedBy: string;
  reviewedAt: string;
  note: string;
}

/**
 * One candidate clause from a user's own PDF (W4.7).
 *
 * The shape is the core's candidate document: a number, the page it is on, the excerpt,
 * and the review - or `null`, which means nobody has looked at it yet. A candidate is
 * never law: it is waiting for a human.
 */
export interface ImportCandidate {
  id: string;
  number: string;
  page: number;
  excerpt: string;
  status: "candidate";
  /** The decision recorded on it \u2014 null when nobody has looked yet. */
  review: ImportReview | null;
}

export const importCandidates: ImportCandidate[] = [
  {
    id: "clause-3-15",
    number: "3.15",
    page: 12,
    excerpt: "3.15 The minimum height of a room shall be 2.75 m.",
    status: "candidate",
    review: null,
  },
  {
    id: "clause-3-16",
    number: "3.16",
    page: 12,
    excerpt: "3.16 The clear width of a door shall not be less than 0.90 m.",
    status: "candidate",
    review: {
      decision: "accepted",
      reviewedBy: "an engineer",
      reviewedAt: "2026-10-21",
      note: "matches the gazette page 12",
    },
  },
  {
    id: "clause-3-17",
    number: "3.17",
    page: 12,
    excerpt: "3.17 A flight of stairs shall not be steeper than 30 degrees.",
    status: "candidate",
    review: {
      decision: "rejected",
      reviewedBy: "an engineer",
      reviewedAt: "2026-10-21",
      note: "not a clause - it is a note under the table",
    },
  },
  {
    id: "clause-4-2",
    number: "4.2",
    page: 18,
    excerpt: "4.2 A building shall be set back from the front boundary by the amount stated in the schedule.",
    status: "candidate",
    review: null,
  },
];
