import { useI18n } from "../i18n";
import { fmtDec, fmtInt } from "../ui/format";
import { csvCell, downloadText } from "../ui/download";
import { Button, Callout, Card, EmptyState, PageHeader, Stat } from "../ui/kit";
import { DesignPending } from "./DesignPending";
import { useDesign } from "./useDesign";

const FAMILIES = [
  { key: "footing", id: "formwork-footing", en: "Footings", bn: "ফুটিং" },
  { key: "column", id: "formwork-column", en: "Columns", bn: "কলাম" },
  { key: "beam", id: "formwork-beam", en: "Beams", bn: "বিম" },
  { key: "slab", id: "formwork-slab", en: "Slabs (soffit)", bn: "স্ল্যাব (নিচের তল)" },
  { key: "core", id: "formwork-core", en: "Lift shaft walls", bn: "লিফট শাফটের দেয়াল" },
] as const;

/**
 * Formwork quantities from the designed members (bar schedule `formworkM2`), priced from the rate card's SoR steel-form
 * rates. Same numbers as the BOQ: this screen reads the building model, not the 3D mesh.
 */
export function FormworkScaffoldScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const d = useDesign();
  const title = bn ? "ফর্মওয়ার্ক" : "Formwork";
  const subtitle = bn ? "কাঠামোর সদস্য থেকে ফর্মের সংস্পর্শ ক্ষেত্রফল ও খরচ" : "Form contact area and cost from the designed members";

  if (d.state === "no_plan")
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন।" : "Enter the plot and pick a plan first."}
        </EmptyState>
      </div>
    );
  if (d.state === "running") return <DesignPending title={title} subtitle={subtitle} />;
  if (d.state === "error") return <DesignPending title={title} subtitle={subtitle} error={d.message} />;
  if (d.state === "no_fit")
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>{bn ? d.reasons.bn : d.reasons.en}</Callout>
      </div>
    );

  const { bbs, boq } = d.data;
  const rows = FAMILIES.map((f) => {
    const area = bbs.totals.formworkM2[f.key];
    const line = boq.lines.find((l) => l.id === f.id);
    return { ...f, area, rate: line?.rateBdt ?? null, amount: line?.amountBdt ?? (area > 0 ? null : 0) };
  }).filter((r) => r.area > 0);
  const totalArea = rows.reduce((a, r) => a + r.area, 0);
  const totalAmount = rows.reduce((a, r) => a + (r.amount ?? 0), 0);

  const exportCsv = () => {
    const lines = [["family", "area_m2", "rate_bdt_per_m2", "amount_bdt"].join(",")];
    for (const r of rows) lines.push([csvCell(r.en), r.area.toFixed(2), r.rate ?? "", r.amount === null ? "" : r.amount.toFixed(0)].join(","));
    lines.push(["total", totalArea.toFixed(2), "", totalAmount.toFixed(0)].join(","));
    lines.push("note,Form contact areas from the bar schedule (simplified: no deductions at joints); rates are the PWD SoR 2022 steel-form items on the candidate rate card");
    downloadText(`${d.projectName || "project"}-formwork.csv`, lines.join("\n"));
  };

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />
      <Callout tone="warn" title={bn ? "প্রাথমিক পরিমাণ" : "Screening quantities"}>
        {bn
          ? "ফর্মের ক্ষেত্রফল সরল ধরা হয়েছে: সংযোগস্থলে কোনো বাদ নেই, স্ল্যাবের কিনারা ও সিঁড়ির ধাপ ধরা হয়নি। দর এসওআর ২০২২-এর স্টিল ফর্ম আইটেম (কার্ড এখনো ‘candidate’)। স্ক্যাফোল্ডের পরিমাণ এই সংস্করণে নেই।"
          : "Form areas are simplified: nothing is deducted where members meet, slab edges and stair steps are not counted. Rates are the SoR 2022 steel-form items (the card is still 'candidate'). Scaffold quantities are not computed in this version."}
      </Callout>
      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "মোট ফর্ম (মি²)" : "Total form area (m²)"} value={fmtInt(totalArea)} />
        <Stat label={bn ? "মোট খরচ (টাকা)" : "Total cost (BDT)"} value={fmtInt(totalAmount)} />
        <Stat label={bn ? "তলা" : "Storeys"} value={String(d.data.model.storeys.length)} />
      </div>
      <Card>
        <table className="data-table">
          <thead>
            <tr>
              <th>{bn ? "সদস্য" : "Member"}</th>
              <th className="num">{bn ? "ক্ষেত্রফল (মি²)" : "Area (m²)"}</th>
              <th className="num">{bn ? "দর (টাকা/মি²)" : "Rate (BDT/m²)"}</th>
              <th className="num">{bn ? "টাকা" : "Amount (BDT)"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{bn ? r.bn : r.en}</td>
                <td className="num">{fmtDec(r.area, 1)}</td>
                <td className="num">{r.rate === null ? "-" : fmtInt(r.rate)}</td>
                <td className="num">{r.amount === null ? "-" : fmtInt(r.amount)}</td>
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
