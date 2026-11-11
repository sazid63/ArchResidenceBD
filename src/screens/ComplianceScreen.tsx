import { useMemo, useState } from "react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { isRecorded, recordDeviation, removeDeviation } from "../rules/deviations";
import { RoomTable } from "./RoomTable";
import { buildReport, filterItems, type ReportItem, type ReportSection, type ReportTab } from "../rules/report";
import { Button, Callout, Card, EmptyState, PageHeader, ResultChip, SegmentedControl, Value, VerdictStrip } from "../ui/kit";

const SECTIONS: Array<{ id: ReportSection; en: string; bn: string }> = [
  { id: "rajuk", en: "RAJUK 2008: plot and building", bn: "রাজউক ২০০৮: জমি ও ভবন" },
  { id: "plan", en: "Plan: rooms, light and access", bn: "প্ল্যান: কক্ষ, আলো ও প্রবেশপথ" },
  { id: "fire", en: "Fire and egress", bn: "অগ্নি নিরাপত্তা ও বহির্গমন" },
  { id: "access", en: "Accessibility", bn: "প্রবেশগম্যতা" },
];

/** Failures first, then warnings, then what is not checked, then passes. */
const SEVERITY: Record<string, number> = { fail: 0, warn: 1, not_checked: 2, not_applicable: 3, pass: 4 };

export function ComplianceScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project, saveProject } = useProject();
  const [tab, setTab] = useState<ReportTab>("all");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const report = useMemo(() => (project ? buildReport(project) : null), [project]);

  if (!project || !report || report.state === "no_plan") {
    return (
      <div className="screen">
        <PageHeader title={bn ? "বিধিমালা যাচাই" : "Compliance"} subtitle={bn ? "রাজউক ২০০৮ ও বিএনবিসি ২০২০" : "RAJUK 2008 and BNBC 2020"} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে যাচাই দেখা যাবে।" : "Enter the plot and pick a plan, then the checks appear here."}
        </EmptyState>
      </div>
    );
  }

  if (report.state === "no_fit") {
    return (
      <div className="screen">
        <PageHeader title={bn ? "বিধিমালা যাচাই" : "Compliance"} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {bn ? report.reasons.bn : report.reasons.en}
        </Callout>
      </div>
    );
  }

  const { items, summary } = report;
  const shown = filterItems(items, tab);
  const deviations = project.deviations ?? [];
  // A deviation whose rule no longer fails (the plot or plan changed) is shown as resolved, not silently kept.
  const failingIds = new Set(items.filter((i) => i.status === "fail" || i.status === "warn").map((i) => i.id));

  const onRecord = (item: ReportItem) => {
    saveProject({ ...project, deviations: recordDeviation(project.deviations, item, reason), updatedAt: new Date().toISOString() });
    setReasonFor(null);
    setReason("");
  };
  const onRemove = (ruleRef: string) =>
    saveProject({ ...project, deviations: removeDeviation(project.deviations, ruleRef), updatedAt: new Date().toISOString() });

  const tabs: Array<{ value: ReportTab; label: string }> = [
    { value: "all", label: `${bn ? "সব" : "All"} (${items.length})` },
    { value: "fails", label: `${bn ? "অনুত্তীর্ণ" : "Fails"} (${summary.fail + summary.warn})` },
    { value: "passes", label: `${bn ? "উত্তীর্ণ" : "Passes"} (${summary.pass})` },
    { value: "not_checked", label: `${bn ? "যাচাই হয়নি" : "Not checked"} (${summary.notChecked})` },
  ];

  return (
    <div className="screen">
      <PageHeader
        title={bn ? "বিধিমালা যাচাই" : "Compliance"}
        subtitle={bn ? "রাজউক ২০০৮ (পর্যালোচিত) ও বিএনবিসি ২০২০ অনুযায়ী" : "Against RAJUK 2008 (reviewed) and BNBC 2020"}
      />

      <Callout title={bn ? "যা যাচাই হয়নি তা দেখানো হয়" : "What is not checked is shown, not hidden"}>
        {bn
          ? "যে নিয়মের মান মডেল বা নিয়ম-প্যাক থেকে নিশ্চিতভাবে পাওয়া যায় না, সেটি “যাচাই হয়নি” দেখানো হয়, কখনো অনুমানে উত্তীর্ণ ধরা হয় না। ডিএপি (ভূমি-ব্যবহার) এখনো যাচাই হয় না।"
          : "A rule the model or the pack cannot decide is shown as Not checked and never assumed to pass. DAP land-use is not checked yet."}
      </Callout>

      <VerdictStrip
        aria-label={bn ? "ফলাফলের সারসংক্ষেপ" : "Result summary"}
        items={[
          { tone: summary.fail > 0 ? "bad" : "ok", value: summary.fail, label: bn ? "অনুত্তীর্ণ" : summary.fail === 1 ? "fail" : "fails" },
          { tone: summary.warn > 0 ? "warn" : "ok", value: summary.warn, label: bn ? "সতর্কতা" : summary.warn === 1 ? "warning" : "warnings" },
          { tone: "ok", value: summary.pass, label: bn ? "উত্তীর্ণ" : summary.pass === 1 ? "pass" : "passes" },
          { value: summary.notChecked, label: bn ? "যাচাই হয়নি" : "not checked" },
        ]}
      />

      <SegmentedControl<ReportTab> aria-label={bn ? "ফলাফল ফিল্টার" : "Filter results"} options={tabs} value={tab} onChange={setTab} />

      {SECTIONS.map((sec) => {
        const rows = shown.filter((i) => i.section === sec.id).sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status]); // failures first inside every section
        if (!rows.length) return null;
        return (
          <section key={sec.id} className="stack" style={{ marginTop: 20, gap: 12 }} aria-label={bn ? sec.bn : sec.en}>
            <h2 className="section-title">{bn ? sec.bn : sec.en}</h2>
            {rows.map((item) => (
              <Card key={item.id} className="stack">
                <div className="row-between">
                  <h3 className="card-title">{bn ? item.title.bn : item.title.en}</h3>
                  <ResultChip result={item.status} lang={lang} />
                </div>
                {item.expected || item.actual ? (
                  <div className="row" style={{ gap: 24 }}>
                    {item.expected ? (
                      <span className="small muted">
                        {bn ? "প্রয়োজন" : "Required"}: <strong><Value unit={item.expected.unit}>{item.expected.value}</Value></strong>
                      </span>
                    ) : null}
                    {item.actual ? (
                      <span className="small muted">
                        {bn ? "আছে" : "Actual"}: <strong><Value unit={item.actual.unit}>{item.actual.value}</Value></strong>
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {item.note ? <p className="small muted" style={{ margin: 0 }}>{bn ? item.note.bn : item.note.en}</p> : null}
                <div className="row-between">
                  <span className="faint small font-mono">
                    {item.citation ? (bn ? item.citation.bn : item.citation.en) : bn ? "জ্যামিতিক তথ্য" : "Geometry fact"}
                    {item.basis === "assumption" ? (bn ? " · অনুমান" : " · assumption") : ""}
                  </span>
                  {isRecorded(project.deviations, item) ? (
                    <span className="small muted">{bn ? "বিচ্যুতি নথিভুক্ত" : "Deviation recorded"}</span>
                  ) : (item.status === "fail" || item.status === "warn") ? (
                    <Button variant="ghost" onClick={() => { setReasonFor(item.id); setReason(""); }}>
                      {bn ? "বিচ্যুতি হিসেবে নথিভুক্ত করুন" : "Record as deviation"}
                    </Button>
                  ) : null}
                </div>
                {reasonFor === item.id ? (
                  <div className="row" style={{ gap: 8 }}>
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={bn ? "কারণ (ঐচ্ছিক)" : "Reason (optional)"}
                      aria-label={bn ? "বিচ্যুতির কারণ" : "Deviation reason"}
                    />
                    <Button variant="primary" onClick={() => onRecord(item)}>{bn ? "সংরক্ষণ" : "Save"}</Button>
                    <Button variant="ghost" onClick={() => setReasonFor(null)}>{bn ? "বাতিল" : "Cancel"}</Button>
                  </div>
                ) : null}
              </Card>
            ))}
          </section>
        );
      })}

      {shown.length === 0 ? (
        <Card><p className="muted">{bn ? "এই ট্যাবে কিছু নেই।" : "Nothing in this tab."}</p></Card>
      ) : null}

      <RoomTable project={project} />

      <section className="stack" style={{ marginTop: 28, gap: 12 }} aria-label={bn ? "বিচ্যুতি তালিকা" : "Deviation register"}>
        <h2 className="section-title">{bn ? "বিচ্যুতি তালিকা" : "Deviation register"}</h2>
        <p className="small muted" style={{ margin: 0 }}>
          {bn ? "নথিভুক্ত বিচ্যুতি একটি তারিখসহ নোট মাত্র; এতে অনুত্তীর্ণ ফলাফল উত্তীর্ণ হয়ে যায় না।" : "A recorded deviation is a dated note. It does not turn a failure into a pass."}
        </p>
        {deviations.length === 0 ? (
          <Card><p className="muted">{bn ? "কোনো বিচ্যুতি নথিভুক্ত নেই।" : "No deviations recorded."}</p></Card>
        ) : (
          deviations.map((d) => (
            <Card key={d.id} className="stack">
              <div className="row-between">
                <h3 className="card-title">{d.ruleTitle ?? d.ruleRef}</h3>
                <Button variant="ghost" onClick={() => onRemove(d.ruleRef)}>{bn ? "সরান" : "Remove"}</Button>
              </div>
              <div className="small muted">{bn ? "প্রয়োজন" : "Required"}: {d.expected} · {bn ? "আছে" : "Actual"}: {d.actual}</div>
              {d.rationale ? <p className="small" style={{ margin: 0 }}>{d.rationale}</p> : null}
              <span className="faint small font-mono">
                {d.recordedAt.slice(0, 10)} · {d.ruleRef}
                {failingIds.has(d.ruleRef) ? "" : bn ? " · এখন আর অনুত্তীর্ণ নয়" : " · no longer failing"}
              </span>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
