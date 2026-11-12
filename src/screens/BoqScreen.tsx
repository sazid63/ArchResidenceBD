import { useMemo } from "react";
import { saveFile } from "../platform/saveFile";
import { useProject } from "../context/ProjectContext";
import { useDesignAsync } from "../design/useDesignAsync";
import { DesignPending } from "./DesignPending";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import { BOQ_ASSUMPTIONS, boqToCsv, buildBoq, type Boq, type BoqCategory } from "../quantities/takeoff";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs } from "../structure/bbs";
import { SUPPORTED_MAX_STOREYS, structureSupported } from "../structure/analyze";
import { Button, Callout, Card, EmptyState, PageHeader, Stat } from "../ui/kit";

const CATEGORY_LABEL: Record<BoqCategory, { en: string; bn: string }> = {
  concrete: { en: "Concrete", bn: "কংক্রিট" },
  formwork: { en: "Formwork", bn: "ফর্মওয়ার্ক" },
  steel: { en: "Reinforcement", bn: "রড" },
  masonry: { en: "Masonry", bn: "গাঁথুনি" },
  finishes: { en: "Finishes", bn: "ফিনিশ" },
  earthwork: { en: "Earthwork", bn: "মাটির কাজ" },
  fittings: { en: "Doors, windows and lift", bn: "দরজা, জানালা ও লিফট" },
  services: { en: "Services (electrical, plumbing)", bn: "সার্ভিস (বৈদ্যুতিক, প্লাম্বিং)" },
  labour: { en: "Labour and machines", bn: "শ্রম ও যন্ত্র" },
};

const UNIT_LABEL: Record<string, { en: string; bn: string }> = {
  m3: { en: "m³", bn: "ঘনমি" },
  m2: { en: "m²", bn: "বর্গমি" },
  bag: { en: "bag", bn: "ব্যাগ" },
  cft: { en: "cft", bn: "ঘনফুট" },
  ton: { en: "ton", bn: "টন" },
  kg: { en: "kg", bn: "কেজি" },
  each: { en: "nos", bn: "টি" },
  nr: { en: "nos", bn: "টি" },
  m: { en: "m", bn: "মি" },
  day: { en: "day", bn: "দিন" },
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
  const pending = useDesignAsync(built && built.ok ? built.model : null);
  const boq: Boq | null = pending.status === "ready" ? pending.result.boq : null;

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
  if (built.ok && (pending.status === "running" || pending.status === "idle")) return <DesignPending title={title} subtitle={project.name} />;
  if (pending.status === "error") return <DesignPending title={title} subtitle={project.name} error={pending.message} />;
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

      {built.ok && !structureSupported(built.model.storeys.length) && (
        <Callout tone="bad" title={bn ? `${SUPPORTED_MAX_STOREYS} তলার বেশি: কাঠামো নকশা করা হয়নি` : `Not designed above ${SUPPORTED_MAX_STOREYS} storeys`}>
          {bn ? "এই সংখ্যাগুলো কেবল আনুমানিক: এই ভবনের কাঠামো (কোর শিয়ার ওয়াল সহ) এই সংস্করণে নকশা করা হয় না। কাঠামো প্রকৌশলীর নকশা দরকার।" : "These quantities are indicative only: the structure of this building (with core shear walls) is not designed in this version. A structural engineer's design is needed."}
        </Callout>
      )}
      <Callout tone="warn" title={bn ? "রেট কার্ড এখনো যাচাই হয়নি, মোট একটি নিম্নসীমা" : "Rate card not yet verified; the total is a lower bound"}>
        {bn
          ? `দাম "${c.source.name}" থেকে (অবস্থা: ${c.status}, কার্যকর ${c.effectiveFrom}, তথ্য ${c.asOf ?? "—"})। ওয়েব থেকে নেওয়া দর রেট কার্ডে ASSUMPTION চিহ্নিত। এখনও ধরা হয়নি: বারান্দার রেলিং, সেপটিক ট্যাংক ও সোক ওয়েল, পানির ট্যাংক ও পাম্প, ড্রেনেজ। বৈদ্যুতিক ও প্লাম্বিং প্রতি বর্গফুটের আনুমানিক হারে।`
          : `Prices are from "${c.source.name}" (status ${c.status}, effective ${c.effectiveFrom}, as of ${c.asOf ?? "n/a"}), plus web-sourced rates marked ASSUMPTION in the rate card. Not in the total yet: septic tank and soak well, water tanks and pump, and drainage. Balcony railing is priced per running metre as an assumption. Electrical and plumbing use benchmark rates per sq ft.`}
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
