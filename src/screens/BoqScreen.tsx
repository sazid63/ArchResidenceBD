import { useMemo } from "react";
import { saveFile } from "../platform/saveFile";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import { BOQ_ASSUMPTIONS, boqToCsv, buildBoq, type Boq, type BoqCategory } from "../quantities/takeoff";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { Button, Callout, Card, EmptyState, PageHeader, Stat } from "../ui/kit";

const CATEGORY_LABEL: Record<BoqCategory, { en: string; bn: string }> = {
  concrete: { en: "Concrete", bn: "কংক্রিট" },
  formwork: { en: "Formwork", bn: "ফর্মওয়ার্ক" },
  steel: { en: "Reinforcement", bn: "রড" },
  masonry: { en: "Masonry", bn: "গাঁথুনি" },
  finishes: { en: "Finishes", bn: "ফিনিশ" },
};

const UNIT_LABEL: Record<string, { en: string; bn: string }> = {
  m3: { en: "m³", bn: "ঘনমি" },
  m2: { en: "m²", bn: "বর্গমি" },
  bag: { en: "bag", bn: "ব্যাগ" },
  cft: { en: "cft", bn: "ঘনফুট" },
  ton: { en: "ton", bn: "টন" },
  kg: { en: "kg", bn: "কেজি" },
  each: { en: "nos", bn: "টি" },
};

const num = (n: number, d = 0) => n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

function download(name: string, text: string) {
  void saveFile(name, text, "text/csv;charset=utf-8");
}

export function BoqScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const boq = useMemo<Boq | null>(() => {
    if (!built || !built.ok) return null;
    return buildBoq(built.model, buildBbs(analyzeStructure(built.model), built.model));
  }, [built]);

  const title = bn ? "বিল অব কোয়ান্টিটিজ" : "Bill of quantities";
  const subtitle = bn ? "মডেল ও রিবার শিডিউল থেকে পরিমাণ, রেট কার্ড থেকে দাম" : "Quantities from the model and the bar schedule, prices from the rate card";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে বিওকিউ দেখা যাবে।" : "Enter the plot and pick a plan, then the bill appears here."}
        </EmptyState>
      </div>
    );
  }
  if (!built.ok || !boq) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {built.ok ? "" : bn ? built.reasons.map((r) => r.message.bn).join(" ") : built.reasons.map((r) => r.message.en).join(" ")}
        </Callout>
      </div>
    );
  }

  const u = (unit: string) => (UNIT_LABEL[unit] ? (bn ? UNIT_LABEL[unit].bn : UNIT_LABEL[unit].en) : unit);
  const c = boq.card;
  const crore = boq.totalBdt / 1e7;
  const csvName = `${project.name.replace(/[^\w-]+/g, "_") || "project"}-boq.csv`;

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />

      <Callout tone="warn" title={bn ? "রেট কার্ড এখনো যাচাই হয়নি, মোট একটি নিম্নসীমা" : "Rate card not yet verified; the total is a lower bound"}>
        {bn
          ? `দাম "${c.source.name}" থেকে (অবস্থা: ${c.status}, কার্যকর ${c.effectiveFrom}, তথ্য ${c.asOf ?? "—"})। কংক্রিট, গাঁথুনি ও প্লাস্টারের শ্রম, যন্ত্র, সার্ভিস, দরজা-জানালা, টাইলস ও রং ধরা হয়নি।`
          : `Prices are from "${c.source.name}" (status ${c.status}, effective ${c.effectiveFrom}, as of ${c.asOf ?? "n/a"}). Labour for concrete, brickwork and plaster, machinery, services, joinery, tiles and paint, are not in the total.`}
      </Callout>

      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "মোট (টাকা, কোটি)" : "Priced total (BDT crore)"} value={crore.toFixed(2)} />
        <Stat label={bn ? "কংক্রিট (ঘনমি)" : "Concrete (m³)"} value={num(boq.quantities.concreteM3, 1)} />
        <Stat label={bn ? "রড (টন)" : "Steel (t)"} value={(boq.quantities.steelKg / 1000).toFixed(2)} />
        <Stat label={bn ? "ইট (টি)" : "Bricks (nos)"} value={num(boq.quantities.brickCount)} />
        <Stat label={bn ? "প্লাস্টার (বর্গমি)" : "Plaster (m²)"} value={num(boq.quantities.plasterM2)} />
      </div>

      <Card className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="section-title">{bn ? "আইটেম" : "Items"}</h2>
          <Button variant="ghost" onClick={() => download(csvName, boqToCsv(boq))}>{bn ? "সিএসভি ডাউনলোড" : "Download CSV"}</Button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "বিভাগ" : "Group"}</th>
                <th>{bn ? "বিবরণ" : "Description"}</th>
                <th>{bn ? "একক" : "Unit"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "পরিমাণ" : "Quantity"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "দর (৳)" : "Rate (৳)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "টাকা (৳)" : "Amount (৳)"}</th>
              </tr>
            </thead>
            <tbody>
              {boq.lines.map((l) => (
                <tr key={l.id}>
                  <td>{bn ? CATEGORY_LABEL[l.category].bn : CATEGORY_LABEL[l.category].en}</td>
                  <td>
                    {bn ? l.description.bn : l.description.en}
                    <div className="muted" style={{ fontSize: 12 }}>{bn ? l.basis.bn : l.basis.en}</div>
                  </td>
                  <td>{u(l.unit)}</td>
                  <td style={{ textAlign: "right" }}>{num(l.quantity, l.quantity < 100 ? 2 : 0)}</td>
                  <td style={{ textAlign: "right" }}>{l.rateBdt === null ? <span className="faint">–</span> : num(l.rateBdt)}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.amountBdt !== null ? num(l.amountBdt) : l.rateKey ? (bn ? "কার্ডে দাম নেই" : "no rate in card") : <span className="muted">{bn ? "পরিমাণ মাত্র" : "quantity only"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}><strong>{bn ? "দামসহ আইটেমের মোট" : "Total of priced items"}</strong></td>
                <td style={{ textAlign: "right" }}><strong>{num(boq.totalBdt)}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="stack" style={{ marginTop: 16 }}>
        <h2 className="section-title">{bn ? "ধরে নেওয়া বিষয়" : "Assumptions"}</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {BOQ_ASSUMPTIONS.map((a) => <li key={a.id}>{bn ? a.bn : a.en}</li>)}
        </ul>
      </Card>
    </div>
  );
}
