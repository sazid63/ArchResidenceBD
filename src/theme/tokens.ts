/** Tone palette shared by all UI kit components (see kit.css and tokens.css). */
export type Tone =
  | "neutral"
  | "primary"
  | "sky"
  | "sage"
  | "lavender"
  | "amber"
  | "blush"
  | "mint";

/** Construction phase kinds used for colour coding. */
export type PhaseKind = "site" | "foundation" | "floor" | "roof" | "common";

/** Design status of a phase (spec/schemas/building-spec.schema.json Phase.status). */
export type PhaseStatus = "not_started" | "gathering_info" | "drafted" | "designed" | "stale";

/** BOQ cost categories. */
export type CostType = "material" | "labour" | "machinery" | "subcontract";

/** Outcome of one check (compliance rule, structural member, plan validation). */
export type CheckResult = "pass" | "fail" | "warn" | "not_checked" | "not_applicable";

/** Meaning-coded colours: one per phase kind (matches the --phase-* tokens). */
export const phaseTone: Record<PhaseKind, Tone> = {
  site: "amber",
  foundation: "neutral",
  floor: "primary",
  roof: "amber",
  common: "mint",
};

export type StatusTone = Tone | "faint";

/** Status colours: not started → faint, gathering → sky, drafted → lavender, designed → sage, stale → amber. */
export const statusTone: Record<PhaseStatus, StatusTone> = {
  not_started: "faint",
  gathering_info: "sky",
  drafted: "lavender",
  designed: "sage",
  stale: "amber",
};

/** Cost-type colours for BOQ lines. */
export const costTone: Record<CostType, Tone> = {
  material: "sage",
  labour: "sky",
  machinery: "amber",
  subcontract: "lavender",
};
