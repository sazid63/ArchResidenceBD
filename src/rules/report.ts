/**
 * The compliance report behind the Compliance screen: RAJUK checks (src/rules/check.ts), plan-validator
 * issues, and fire and accessibility sections. Pure; the screen only renders it.
 *
 * Nothing is invented here: where the model or the pack cannot decide a rule it is reported as
 * "not_checked" with the reason (CLAUDE.md: cited values or "not checked").
 */

import { buildingForProject } from "../model/projectMesh";
import { liftRequired } from "../plans/rules";
import { LIFT_ASSUMPTIONS, liftSpec } from "../model/lift";
import { PERSONS_PER_FLAT, evaluateEgress } from "./egress";
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
  window_area_low: { en: "Window area", bn: "জানালার ক্ষেত্রফল" },
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
  const whereBn = floors.size === 2 ? "" : floors.has("ground") ? " (নিচতলা)" : " (উপরের তলাগুলো)";
  return {
    id: `plan.${issue.code}.${issue.roomId ?? "all"}.${hash(issue.message)}`,
    section,
    status: issue.severity === "error" ? "fail" : "warn",
    title: ISSUE_TITLE[issue.code],
    expected: null,
    actual: null,
    citation: issue.basis === "cited" ? { en: "BNBC 2020", bn: "বিএনবিসি ২০২০" } : null,
    note: { en: issue.message + where, bn: issue.messageBn + whereBn },
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

  // Fire and egress (P2-4): what the plan geometry can decide, as class A3 (apartment houses), not sprinklered.
  const eg = evaluateEgress(model);
  const m = (v: number) => (v / 1000).toFixed(1);
  if (eg) {
    const L = eg.limits;
    const cite43 = { en: "BNBC 2020 Part 4 Table 4.3.8 (class A3, not sprinklered)", bn: "বিএনবিসি ২০২০ পার্ট ৪ সারণি ৪.৩.৮ (শ্রেণি এ৩, স্প্রিঙ্কলারবিহীন)" };
    const assume = { en: "Occupancy class A3 and no sprinklers are assumed.", bn: "ব্যবহার-শ্রেণী এ৩ ও স্প্রিঙ্কলারবিহীন ধরা হয়েছে।" };
    items.push({
      id: "fire.travel",
      section: "fire",
      status: eg.travelMm / 1000 <= L.travelPathM ? "pass" : "fail",
      title: { en: "Travel distance to the stair", bn: "সিঁড়ি পর্যন্ত চলাচলের দূরত্ব" },
      expected: { value: L.travelPathM, unit: "m" },
      actual: { value: Math.round((eg.travelMm / 1000) * 10) / 10, unit: "m" },
      citation: cite43,
      note: { en: `Longest walk from a room (${eg.travelFrom}) to the stair through the doors, measured between room centres and door centres. ${assume.en}`, bn: `কক্ষ (${eg.travelFrom}) থেকে দরজা দিয়ে সিঁড়ি পর্যন্ত দীর্ঘতম হাঁটা, কক্ষ ও দরজার কেন্দ্র ধরে মাপা। ${assume.bn}` },
    });
    if (eg.corridorMm !== null)
      items.push({
        id: "fire.corridor",
        section: "fire",
        status: eg.corridorMm >= L.corridorMinWidthMm ? "pass" : "fail",
        title: { en: "Corridor width", bn: "করিডোরের প্রস্থ" },
        expected: { value: L.corridorMinWidthMm, unit: "mm" },
        actual: { value: Math.round(eg.corridorMm), unit: "mm" },
        citation: cite43,
        note: { en: "The printed 36 is read as inches (915 mm); the owner confirmed, an engineer should confirm. Dead-end length (12.19 m) is not measured.", bn: "ছাপা ৩৬ ইঞ্চি ধরা হয়েছে (৯১৫ মিমি); মালিক নিশ্চিত করেছেন, প্রকৌশলীরও নিশ্চিত করা উচিত। ডেড-এন্ডের দৈর্ঘ্য (১২.১৯ মিটার) মাপা হয়নি।" },
      });
    items.push({
      id: "fire.stair-width",
      section: "fire",
      status: eg.stairFlightMm >= L.stairMinWidthMm ? "pass" : "fail",
      title: { en: "Stair flight width", bn: "সিঁড়ির ফ্লাইটের প্রস্থ" },
      expected: { value: L.stairMinWidthMm, unit: "mm" },
      actual: { value: eg.stairFlightMm, unit: "mm" },
      citation: { en: "BNBC 2020 Part 4 Table 4.3.6 (class A3)", bn: "বিএনবিসি ২০২০ পার্ট ৪ সারণি ৪.৩.৬ (শ্রেণি এ৩)" },
      note: { en: `The plan library draws 1000 mm flights; the table asks ${L.stairMinWidthMm} mm for class A3. A wider stair needs a deeper stair bay.`, bn: `প্ল্যান লাইব্রেরিতে ১০০০ মিমি ফ্লাইট আঁকা; সারণিতে এ৩ শ্রেণির জন্য ${L.stairMinWidthMm} মিমি। চওড়া সিঁড়িতে সিঁড়ি-অংশ আরও গভীর লাগে।` },
    });
    items.push({
      id: "fire.stair-capacity",
      section: "fire",
      status: eg.stairFlightMm >= eg.stairNeededMm ? "pass" : "fail",
      title: { en: "Stair capacity for one floor", bn: "এক তলার জন্য সিঁড়ির ধারণক্ষমতা" },
      expected: { value: eg.stairNeededMm, unit: "mm" },
      actual: { value: eg.stairFlightMm, unit: "mm" },
      citation: { en: "BNBC 2020 Part 4 Table 4.3.2 (stairways, not sprinklered)", bn: "বিএনবিসি ২০২০ পার্ট ৪ সারণি ৪.৩.২ (সিঁড়ি, স্প্রিঙ্কলারবিহীন)" },
      note: { en: `${eg.persons} people on a floor (${PERSONS_PER_FLAT} a flat, assumption) at ${L.stairMmPerOccupant} mm each.`, bn: `এক তলায় ${eg.persons} জন (প্রতি ফ্ল্যাটে ${PERSONS_PER_FLAT} জন, অনুমান), জনপ্রতি ${L.stairMmPerOccupant} মিমি।` },
    });
  }
  items.push({
    id: "fire.exits",
    section: "fire",
    status: model.input.storeys > 6 ? "not_checked" : "not_applicable",
    title: { en: "Second exit, refuge area and fire lift", bn: "দ্বিতীয় বহির্গমন, আশ্রয়-এলাকা ও ফায়ার লিফট" },
    expected: null,
    actual: null,
    citation: { en: "BNBC 2020 Part 4", bn: "বিএনবিসি ২০২০ পার্ট ৪" },
    note: model.input.storeys > 6
      ? { en: "Above six storeys these items matter; their clauses are not in the rule pack yet, so they are not evaluated. The stretcher lift above ten storeys is checked on the lift row.", bn: "ছয় তলার বেশিতে এগুলো প্রযোজ্য; এদের ধারা নিয়ম-প্যাকে এখনো নেই, তাই যাচাই হয়নি। দশ তলার বেশিতে স্ট্রেচার লিফট লিফটের সারিতে যাচাই হয়।" }
      : { en: "Not required for a building of six storeys or fewer in the clauses held by the app.", bn: "ছয় তলা বা কমের ভবনে অ্যাপে থাকা ধারা অনুযায়ী প্রযোজ্য নয়।" },
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
  const lift = liftSpec(model);
  if (lift) {
    const [cw, cd] = lift.cls.carMm;
    const [sw, sd] = lift.cls.shaftMm;
    const ok = lift.fitsShaft && lift.fitsOverhead && lift.enoughLifts;
    items.push({
      id: "access.lift-size",
      section: "access",
      status: ok ? "pass" : "fail",
      title: { en: "Lift size, pit and overrun", bn: "লিফটের মাপ, পিট ও ওভাররান" },
      expected: { value: `${lift.liftsNeeded} x ${lift.cls.kg} kg, shaft ${sw} x ${sd} mm, overhead ${LIFT_ASSUMPTIONS.overheadMm} mm`, unit: "" },
      actual: { value: `lift cell ${lift.netMm[0]} x ${lift.netMm[1]} mm holds ${lift.capacity} shaft(s), overhead ${Math.round(lift.overheadMm)} mm`, unit: "" },
      citation: lift.stretcher ? { en: "BNBC 2020 Part 8 Sec 4.2.1: stretcher platform 1275 x 2000 mm above ten storeys or 32 m", bn: "বিএনবিসি ২০২০ পার্ট ৮ ধারা ৪.২.১: দশ তলা বা ৩২ মিটারের বেশিতে স্ট্রেচার প্ল্যাটফর্ম ১২৭৫ x ২০০০ মিমি" } : null,
      note: {
        en: `${lift.flatsServed} flats on ${lift.floorsServed - 1} floors (${lift.persons} people at ${LIFT_ASSUMPTIONS.personsPerFlat} per flat) need ${lift.liftsNeeded} lift(s) at one per ${LIFT_ASSUMPTIONS.flatsPerLift} flats; a ${lift.cls.kg} kg car of ${cw} x ${cd} mm. Car and shaft sizes, pit ${lift.pitMm} mm and the overhead are assumptions (the pack has no passenger-lift tables): confirm with the supplier. The plan has one lift cell that holds ${lift.capacity} shaft(s) side by side${lift.enoughLifts ? "" : `, fewer than the ${lift.liftsNeeded} needed: a second lift cell must be added to the plan`}.`,
        bn: `${lift.flatsServed}টি ফ্ল্যাট (${lift.persons} জন, প্রতি ফ্ল্যাটে ${LIFT_ASSUMPTIONS.personsPerFlat} জন) ধরে ${lift.liftsNeeded}টি লিফট লাগে (প্রতি ${LIFT_ASSUMPTIONS.flatsPerLift} ফ্ল্যাটে একটি); ${lift.cls.kg} কেজির কার ${cw} x ${cd} মিমি। কার ও শাফটের মাপ, ${lift.pitMm} মিমি পিট ও ওভারহেড অনুমান (প্যাকে যাত্রীবাহী লিফটের সারণি নেই): সরবরাহকারীর সঙ্গে নিশ্চিত করুন। প্ল্যানে একটি লিফট ঘর আছে, যাতে পাশাপাশি ${lift.capacity}টি শাফট বসে${lift.enoughLifts ? "" : `, প্রয়োজন ${lift.liftsNeeded}টি: প্ল্যানে আরেকটি লিফট ঘর যোগ করতে হবে`}।`,
      },
    });
  }
  // Accessible route (BNBC 2020 Part 3 Appendix D, Table 3.D.1: apartments A3 with a lift, from the lift lobby to every housing unit).
  const citeD = { en: "BNBC 2020 Part 3 Appendix D, Table 3.D.1 and Sec D.4.1 (accessible route at least 1200 mm)", bn: "বিএনবিসি ২০২০ পার্ট ৩ পরিশিষ্ট ডি, সারণি ৩.ডি.১ ও ধারা ডি.৪.১ (প্রবেশগম্য পথ ন্যূনতম ১২০০ মিমি)" };
  const typicalGeo = model.storeys[Math.min(1, model.storeys.length - 1)].geometry;
  const routeWidths = typicalGeo.fitted.rooms
    .map((r, i) => (r.def.kind === "corridor" || r.def.kind === "lobby" ? typicalGeo.metrics[i].netWidthMm : null))
    .filter((v): v is number => v !== null);
  const entranceOpenings = typicalGeo.doors.filter((d) => d.main).map((d) => d.to - d.from);
  if (!hasLift) {
    items.push({
      id: "access.route-width",
      section: "access",
      status: "not_applicable",
      title: { en: "Accessible route width, lift lobby to flats", bn: "প্রবেশগম্য পথের প্রস্থ, লিফট লবি থেকে ফ্ল্যাট" },
      expected: null,
      actual: null,
      citation: citeD,
      note: { en: "Table 3.D.1 excludes apartments without a lift.", bn: "সারণি ৩.ডি.১ লিফটবিহীন অ্যাপার্টমেন্টকে বাদ দিয়েছে।" },
    });
  } else {
    if (routeWidths.length)
      items.push({
        id: "access.route-width",
        section: "access",
        status: Math.min(...routeWidths) >= 1200 ? "pass" : "fail",
        title: { en: "Accessible route width, lift lobby to flats", bn: "প্রবেশগম্য পথের প্রস্থ, লিফট লবি থেকে ফ্ল্যাট" },
        expected: { value: 1200, unit: "mm" },
        actual: { value: Math.round(Math.min(...routeWidths)), unit: "mm" },
        citation: citeD,
        note: { en: "Narrowest corridor or lobby on the typical floor, net of the walls. Turning space (1500 x 1500 mm) and the clear floor spaces at doors are not measured.", bn: "সাধারণ তলার সবচেয়ে সরু করিডোর বা লবি, দেয়াল বাদে। ঘোরার জায়গা (১৫০০ x ১৫০০ মিমি) ও দরজার সামনের খালি জায়গা মাপা হয়নি।" },
      });
    if (entranceOpenings.length) {
      const clear = Math.min(...entranceOpenings) - 50;
      items.push({
        id: "access.door",
        section: "access",
        status: clear >= 900 ? "pass" : "fail",
        title: { en: "Flat entrance door, clear width", bn: "ফ্ল্যাটের প্রবেশ দরজা, পরিষ্কার প্রস্থ" },
        expected: { value: 900, unit: "mm" },
        actual: { value: clear, unit: "mm" },
        citation: { en: "BNBC 2020 Part 3 Appendix D Sec D.8.2: 900 mm measured between the leaf open at 90 degrees and the opposite jamb", bn: "বিএনবিসি ২০২০ পার্ট ৩ পরিশিষ্ট ডি ধারা ডি.৮.২: ৯০° খোলা পাল্লা থেকে বিপরীত চৌকাঠ পর্যন্ত ন্যূনতম ৯০০ মিমি" },
        note: { en: "Clear width taken as the opening minus 50 mm for the open leaf (assumption).", bn: "খোলা পাল্লার জন্য ৫০ মিমি বাদ দিয়ে পরিষ্কার প্রস্থ ধরা হয়েছে (অনুমান)।" },
      });
    }
  }
  items.push({
    id: "access.route",
    section: "access",
    status: "not_checked",
    title: { en: "Accessible route from the footpath and parking, ramp and toilet", bn: "ফুটপাথ ও পার্কিং থেকে প্রবেশগম্য পথ, র‍্যাম্প ও শৌচাগার" },
    expected: null,
    actual: null,
    citation: { en: "BNBC 2020 Part 3 Appendix D, Table 3.D.1: footpath and parking to the lift, and one accessible toilet per housing unit", bn: "বিএনবিসি ২০২০ পার্ট ৩ পরিশিষ্ট ডি, সারণি ৩.ডি.১: ফুটপাথ ও পার্কিং থেকে লিফট এবং প্রতি ফ্ল্যাটে একটি প্রবেশগম্য শৌচাগার" },
    note: { en: "The site entrance level, ramps (1 in 12) and the toilet's wheelchair space are not in the plan data, so they are not checked.", bn: "সাইটের প্রবেশ স্তর, র‍্যাম্প (১:১২) ও শৌচাগারের হুইলচেয়ার জায়গা প্ল্যানের তথ্যে নেই, তাই যাচাই হয়নি।" },
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
