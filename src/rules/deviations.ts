/**
 * Deviation register: when a check fails, the owner can record that it is a known deviation with a
 * reason. A recorded deviation never turns a failure into a pass; it is only a dated, visible note
 * (plan 5.6). Pure helpers over the `Deviation` type from the project spec.
 */

import type { Deviation } from "../spec.gen";
import type { CheckValue } from "./check";
import type { ReportItem } from "./report";

const fmt = (v: CheckValue | null): string => (v ? `${v.value}${v.unit ? " " + v.unit : ""}` : "-");

/** Rules that are about structure get a higher tier; the rest of the plan and RAJUK items are approval risks. */
function tierFor(item: ReportItem): Deviation["riskTier"] {
  return item.id.startsWith("plan.span_too_long") ? "structural_attention" : "approval_risk";
}

export function ruleRefOf(item: ReportItem): string {
  return item.id;
}

/** True when this item already has a recorded deviation. */
export function isRecorded(deviations: Deviation[] | undefined, item: ReportItem): boolean {
  return !!deviations?.some((d) => d.ruleRef === ruleRefOf(item));
}

/** Add a deviation for a failing or warning item. Does nothing for other statuses or if already recorded. */
export function recordDeviation(deviations: Deviation[] | undefined, item: ReportItem, rationale: string, now: Date = new Date()): Deviation[] {
  const list = deviations ?? [];
  if ((item.status !== "fail" && item.status !== "warn") || isRecorded(list, item)) return list;
  const entry: Deviation = {
    id: `dev-${item.id}`,
    ruleRef: ruleRefOf(item),
    ruleTitle: item.title.en,
    expected: item.expected ? fmt(item.expected) : "-",
    actual: item.actual ? fmt(item.actual) : (item.note?.en ?? "-"),
    riskTier: tierFor(item),
    rationale: rationale.trim() || undefined,
    acknowledged: true,
    recordedAt: now.toISOString(),
  };
  return [...list, entry];
}

export function removeDeviation(deviations: Deviation[] | undefined, ruleRef: string): Deviation[] {
  return (deviations ?? []).filter((d) => d.ruleRef !== ruleRef);
}
