import { useMemo } from "react";
import { useI18n } from "../i18n";
import { planPours, POUR_ASSUMPTIONS, type PourRow } from "../structure/pourPlan";
import { concreteSteps } from "../structure/bbs";
import { fmtDec, fmtInt } from "../ui/format";
import { csvCell, downloadText } from "../ui/download";
import { Button, Callout, Card, EmptyState, PageHeader, Stat } from "../ui/kit";
import { DesignPending } from "./DesignPending";
import { useDesign } from "./useDesign";

function label(r: PourRow, storeys: number, bn: boolean): string {
  const n = (r.index ?? 0) + 1;
  const floor = bn ? `${n} তলা` : `storey ${n}`;
  if (r.kind === "foundation") return bn ? "ফাউন্ডেশন: ফুটিং, কলামের গোড়া, প্লিন্থ বিম, লিফট পিট" : "Foundation: footings, column stubs, plinth beams, lift pit";
  if (r.kind === "columns") return bn ? `কলাম, ${floor}` : `Columns, ${floor}`;
  if (r.kind === "core") return bn ? "লিফট শাফটের দেয়াল" : "Lift shaft walls";
  return r.index === storeys - 1 ? (bn ? "ছাদের বিম, স্ল্যাব ও সিঁড়ি" : "Roof beams, slab and stair") : bn ? `বিম, স্ল্যাব ও সিঁড়ি, ${floor}-এর উপরে` : `Beams, slab and stair above ${floor}`;
}

/** The pour order and its days, from the same concrete volumes as the BOQ. */
export function PourSequenceScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const d = useDesign();
  const plan = useMemo(() => (d.state === "ready" ? planPours(concreteSteps(d.data.structure, d.data.model)) : null), [d]);
  const title = bn ? "ঢালাইয়ের ক্রম" : "Pour sequence";
  const subtitle = bn ? "নকশাকৃত সদস্য থেকে ঢালাইয়ের ধাপ, আয়তন ও দিন" : "Pour steps, volumes and days from the designed members";

  if (d.state === "no_plan")
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>{bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন।" : "Enter the plot and pick a plan first."}</EmptyState>
      </div>
    );
  if (d.state === "running") return <DesignPending title={title} subtitle={subtitle} />;
  if (d.state === "error") return <DesignPending title={title} subtitle={subtitle} error={d.message} />;
  if (d.state === "no_fit" || !plan)
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>{d.state === "no_fit" ? (bn ? d.reasons.bn : d.reasons.en) : ""}</Callout>
      </div>
    );

  const storeys = d.data.model.storeys.length;
  const A = POUR_ASSUMPTIONS;
  const exportCsv = () => {
    const lines = ["step,pour,m3,work_days,start_day,end_day,wait_days"];
    plan.rows.forEach((r, i) => lines.push([i + 1, csvCell(label(r, storeys, false)), r.m3.toFixed(2), r.workDays, r.startDay, r.endDay, r.waitDays].join(",")));
    lines.push(`note,"Pour rate ${A.m3PerDay} m3 per day and waits are assumptions"`);
    downloadText(`${d.projectName || "project"}-pour-sequence.csv`, lines.join("\n"));
  };

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />
      <Callout tone="warn" title={bn ? "ধরে নেওয়া হিসাব" : "Assumed rates"}>
        {bn
          ? `ঢালাইয়ের হার দিনে ${A.m3PerDay} ঘনমিটার; অপেক্ষা: ফাউন্ডেশনের পর ${A.foundationCureDays} দিন, কলামের পর ${A.columnToSlabDays} দিন, স্ল্যাবের পর ${A.slabCureDays} দিন। এগুলো সাইটের সাধারণ অনুশীলন থেকে অনুমান, বিএনবিসির মান নয়; ঠিকাদারের সঙ্গে নিশ্চিত করুন। আয়তন বিওকিউ-র কংক্রিটের সমান।`
          : `Pour rate ${A.m3PerDay} m³ per day; waits: ${A.foundationCureDays} days after the foundation, ${A.columnToSlabDays} day after the columns, ${A.slabCureDays} days after each slab. These are site-practice assumptions, not BNBC figures: confirm with the contractor. Volumes add up to the BOQ concrete.`}
      </Callout>
      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "মোট কংক্রিট (ঘনমিটার)" : "Total concrete (m³)"} value={fmtDec(plan.totalM3, 1)} />
        <Stat label={bn ? "মোট দিন" : "Total days"} value={fmtInt(plan.totalDays)} />
        <Stat label={bn ? "ঢালাইয়ের ধাপ" : "Pours"} value={String(plan.rows.length)} />
      </div>
      <Card>
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{bn ? "ঢালাই" : "Pour"}</th>
              <th className="num">{bn ? "ঘনমিটার" : "m³"}</th>
              <th className="num">{bn ? "কাজের দিন" : "Work days"}</th>
              <th className="num">{bn ? "শুরু–শেষ দিন" : "Day"}</th>
              <th className="num">{bn ? "অপেক্ষা" : "Wait"}</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>{label(r, storeys, bn)}</td>
                <td className="num">{fmtDec(r.m3, 1)}</td>
                <td className="num">{r.workDays}</td>
                <td className="num">{r.startDay === r.endDay ? r.startDay : `${r.startDay}–${r.endDay}`}</td>
                <td className="num">{r.waitDays || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div style={{ marginTop: 16 }}>
        <Button variant="soft" onClick={exportCsv}>{bn ? "CSV ডাউনলোড" : "Download CSV"}</Button>
      </div>
    </div>
  );
}
