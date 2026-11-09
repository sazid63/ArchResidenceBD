/**
 * The compliance report behind the Compliance screen: RAJUK checks (src/rules/check.ts), plan-validator
 * issues, and fire and accessibility sections. Pure; the screen only renders it.
 *
 * Nothing is invented here: where the model or the pack cannot decide a rule it is reported as
 * "not_checked" with the reason (CLAUDE.md: cited values or "not checked").
 */

import { buildingForProject } from "../model/projectMesh";
import { liftRequired } from "../plans/rules";
import type { Issue, IssueCode } from "../plans/validate";
import type { BuildingProject } from "../engine/projectState";
import type { CheckResult as ResultKind } from "../theme/tokens";
import { check, type Bilingual, type CheckSource, type CheckValue } from "./check";

export type ReportSection = "rajuk" | "plan" | "fire" | "access";

export interface ReportItem {
  id: string;
  section: ReportSection;
  status: ResultKind;
  title: Bilingual;
  expected: CheckValue | null;
  actual: CheckValue | null;
  /** Human-readable citation, or null when the rule is a pure geometry fact. */
  citation: Bilingual | null;
  note?: Bilingual;
  /** For validator issues: cited BNBC figure, working assumption, or geometry fact. */
  basis?: Issue["basis"];
}

export interface ReportSummary {
  total: number;
  fail: number;
  warn: number;
  pass: number;
  notChecked: number;
}

export type Report =
  | { state: "no_plan" }
  | { state: "no_fit"; reasons: Bilingual }
  | { state: "ready"; items: ReportItem[]; summary: ReportSummary };

const ISSUE_TITLE: Record<IssueCode, Bilingual> = {
  definition: { en: "Plan definition", bn: "প্ল্যানের সংজ্ঞা" },
  room_too_small: { en: "Room area", bn: "কক্ষের ক্ষেত্রফল" },
  room_too_narrow: { en: "Room width", bn: "কক্ষের প্রস্থ" },
  no_daylight: { en: "Daylight", bn: "দিনের আলো" },
  no_ventilation: { en: "Ventilation", bn: "বায়ু চলাচল" },
  stair_too_small: { en: "Stair size", bn: "সিঁড়ির মাপ" },
  door_not_placeable: { en: "Door position", bn: "দরজার অবস্থান" },
  unreachable: { en: "Room access", bn: "কক্ষে প্রবেশপথ" },
  no_entrance: { en: "Dwelling entrance", bn: "ফ্ল্যাটের প্রবেশদ্বার" },
  unit_incomplete: { en: "Dwelling completeness", bn: "ফ্ল্যাটের সম্পূর্ণতা" },
  span_too_long: { en: "Structural span", bn: "কাঠামোর স্প্যান" },
};

const FIRE_CODES = new Set<IssueCode>(["stair_too_small", "no_entrance"]);

export function citationText(s: CheckSource): Bilingual {
  return {
    en: `RAJUK 2008 ${s.clause}, gazette p. ${s.gazettePage}`,
    bn: `রাজউক ২০০৮ ${s.clauseBn}, গেজেট পৃ. ${s.gazettePage}`,
  };
}

/** Short stable hash so two issues on the same room get different ids (deviations are keyed by id). */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function fromIssue(issue: Issue, section: ReportSection, floors: Set<"ground" | "typical">): ReportItem {
  const where = floors.size === 2 ? "" : floors.has("ground") ? " (ground floor)" : " (upper floors)";
  return {
    id: `plan.${issue.code}.${issue.roomId ?? "all"}.${hash(issue.message)}`,
    section,
    status: issue.severity === "error" ? "fail" : "warn",
    title: ISSUE_TITLE[issue.code],
    expected: null,
    actual: null,
    citation: issue.basis === "cited" ? { en: "BNBC 2020", bn: "বিএনবিসি ২০২০" } : null,
    note: { en: issue.message + where, bn: issue.message + where },
    basis: issue.basis,
  };
}

function summarise(items: ReportItem[]): ReportSummary {
  const n = (s: ResultKind) => items.filter((i) => i.status === s).length;
  return { total: items.length, fail: n("fail"), warn: n("warn"), pass: n("pass"), notChecked: n("not_checked") };
}

export function buildReport(project: BuildingProject): Report {
  if (!project.plot || !project.planId) return { state: "no_plan" };
  const built = buildingForProject(project);
  if (!built) return { state: "no_plan" };
  if (!built.ok) {
    return { state: "no_fit", reasons: { en: built.reasons.map((r) => r.message.en).join(" "), bn: built.reasons.map((r) => r.message.bn).join(" ") } };
  }
  const model = built.model;
  const items: ReportItem[] = [];

  // RAJUK 2008: setbacks, FAR, coverage, parking.
  for (const r of check(model, { roadWidthM: project.plot.roadWidthM })) {
    items.push({
      id: r.ruleId,
      section: "rajuk",
      status: r.status,
      title: r.title,
      expected: r.expected,
      actual: r.actual,
      citation: citationText(r.source),
      note: r.note,
    });
  }

  // Plan validator: one entry per distinct issue, noting which floors it appears on.
  const seen = new Map<string, { issue: Issue; floors: Set<"ground" | "typical"> }>();
  for (const st of model.storeys) {
    for (const issue of st.issues) {
      const key = `${issue.code}|${issue.roomId ?? ""}|${issue.message}`;
      const hit = seen.get(key) ?? { issue, floors: new Set<"ground" | "typical">() };
      hit.floors.add(st.use);
      seen.set(key, hit);
    }
  }
  for (const { issue, floors } of seen.values()) {
    items.push(fromIssue(issue, FIRE_CODES.has(issue.code) ? "fire" : "plan", floors));
  }
  if (!seen.size) {
    items.push({
      id: "plan.validator",
      section: "plan",
      status: "pass",
      title: { en: "Plan checks (rooms, daylight, access)", bn: "প্ল্যান যাচাই (কক্ষ, আলো, প্রবেশপথ)" },
      expected: null,
      actual: null,
      citation: { en: "BNBC 2020 Part 3", bn: "বিএনবিসি ২০২০ পার্ট ৩" },
    });
  }

  // Fire: only what the model can decide; the rest is reported honestly as not checked.
  items.push({
    id: "fire.egress",
    section: "fire",
    status: "not_checked",
    title: { en: "Travel distance and number of exits", bn: "চলাচলের দূরত্ব ও বহির্গমন পথের সংখ্যা" },
    expected: null,
    actual: null,
    citation: { en: "BNBC 2020 Part 4 Table 4.3.8", bn: "বিএনবিসি ২০২০ পার্ট ৪ সারণি ৪.৩.৮" },
    note: { en: "The occupancy class used by the egress table is not set, so exit rules are not evaluated.", bn: "বহির্গমন সারণির জন্য ভবনের ব্যবহার-শ্রেণী ঠিক করা হয়নি, তাই বহির্গমনের বিধি যাচাই হয়নি।" },
  });

  // Accessibility: lift where required; other items not checked.
  const heightM = (model.input.storeys * model.input.floorToFloorMm) / 1000;
  const needLift = liftRequired(model.input.storeys, heightM);
  const hasLift = model.roof.liftRoom !== null;
  items.push({
    id: "access.lift",
    section: "access",
    status: !needLift ? "not_applicable" : hasLift ? "pass" : "fail",
    title: { en: "Lift", bn: "লিফট" },
    expected: { value: needLift ? "required" : "not required", unit: "" },
    actual: { value: hasLift ? "provided" : "none", unit: "" },
    citation: { en: "BNBC 2020 Part 8 Sec 4.2.1.1", bn: "বিএনবিসি ২০২০ পার্ট ৮ ধারা ৪.২.১.১" },
    note: { en: "Required above six storeys or 20 m.", bn: "ছয় তলার বেশি বা ২০ মিটারের বেশি উচ্চতায় বাধ্যতামূলক।" },
  });
  items.push({
    id: "access.route",
    section: "access",
    status: "not_checked",
    title: { en: "Accessible route, ramp and toilet", bn: "প্রবেশগম্য পথ, র‍্যাম্প ও শৌচাগার" },
    expected: null,
    actual: null,
    citation: null,
    note: { en: "No cited figure is in the rule packs yet.", bn: "নিয়ম-প্যাকে এখনো এর কোনো সূত্রসহ মান নেই।" },
  });

  return { state: "ready", items, summary: summarise(items) };
}

export type ReportTab = "all" | "fails" | "passes" | "not_checked";

/** Tabs: Fails also holds warnings (they need attention); Passes holds only passes; not-applicable shows under All. */
export function filterItems(items: ReportItem[], tab: ReportTab): ReportItem[] {
  switch (tab) {
    case "fails":
      return items.filter((i) => i.status === "fail" || i.status === "warn");
    case "passes":
      return items.filter((i) => i.status === "pass");
    case "not_checked":
      return items.filter((i) => i.status === "not_checked");
    default:
      return items;
  }
}
