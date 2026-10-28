import type { CostType, PhaseKind, PhaseStatus } from "../data/mock";

/** Tone palette shared by all UI kit components (see kit.css). */
export type Tone =
  | "neutral"
  | "primary"
  | "sky"
  | "sage"
  | "lavender"
  | "amber"
  | "blush"
  | "mint";

/** Meaning-coded colors: one per phase kind. */
export const phaseTone: Record<PhaseKind, Tone> = {
  site: "amber",
  foundation: "mint",
  floor: "sky",
  roof: "blush",
  common: "lavender",
};

export type StatusTone = Tone | "faint";

/** Status colors: not-started → faint, gathering → sky, drafted → lavender, designed → sage, stale → amber. */
export const statusTone: Record<PhaseStatus, StatusTone> = {
  not_started: "faint",
  gathering_info: "sky",
  drafted: "lavender",
  designed: "sage",
  stale: "amber",
};

/** Cost-type colors for BOQ lines. */
export const costTone: Record<CostType, Tone> = {
  material: "sage",
  labour: "sky",
  machinery: "amber",
  subcontract: "lavender",
};
