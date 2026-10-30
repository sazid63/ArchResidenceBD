import { useState, useMemo, useCallback } from "react";
import { fmtBdt, fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat, cx } from "../ui/kit";
import { useActiveProject } from "../context/ProjectContext";
import { generateBoqFromProject, exportBOQCSV } from "../cad/boqGenerator";
import { useAccessibilityReader } from "../hooks/useTextToSpeech";

const CATEGORY_TONE: Record<string, "sky" | "sage" | "amber" | "lavender" | "blush" | "neutral"> = {
  "Excavation & Site Works": "amber",
  "Concrete Works": "sky",
  "Masonry Works": "sage",
  "Reinforcement": "lavender",
  "Joinery": "blush",
  "Finishes": "neutral",
  "Plumbing & Sanitary": "sky",
  "Electrical": "amber",
  "Metal Works": "lavender",
  "Site Works": "sage",
  "Fire Protection": "blush",
  "Vertical Transportation": "amber",
  "Sustainability": "sage",
  "Temporary Works": "neutral",
};

export function BoqScreen() {
  const { lang } = useI18n();
  const project = useActiveProject();
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const { readBOQItem, stop: stopReading, speaking } = useAccessibilityReader();

  const boqData = useMemo(() => {
    if (!project) return null;
    return generateBoqFromProject(project);
  }, [project]);

  if (!project || !boqData) {
    return (
      <div className="screen">
        <PageHeader title="Bill of Quantities (BOQ)" subtitle="No active project found" />
        <div className="empty">
          <span className="empty-icon" aria-hidden="true">📊</span>
          <p className="empty-text">Please complete the phase interviews and design to calculate BOQ.</p>
        </div>
      </div>
    );
  }

  const filteredItems = activeCategory === "all"
    ? boqData.items
    : boqData.items.filter((item) => item.category === activeCategory);

  const allCategories = ["all", ...Object.keys(boqData.totals.totalsByCategory).sort()];

  const exportCsv = () => {
    const csvContent = exportBOQCSV(boqData);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_BOQ.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "প্রাক্কলন ও খরচের হিসাব (BOQ)" : "Bill of Quantities (BOQ)"}
        subtitle={`${project.name} · ${project.stories} ${lang === "bn" ? "তলা" : "Stories"} (${project.plotSize} ${project.plotUnit})`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary" onClick={exportCsv}>
              {lang === "bn" ? "CSV ডাউনলোড" : "Export BOQ (CSV)"}
            </Button>
          </div>
        }
      />

      {/* Top Cost Statistics */}
      <div className="row stats-row" style={{ marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat
          label={lang === "bn" ? "সর্বমোট আনুমানিক ব্যয়" : "Grand Total"}
          value={fmtBdt(boqData.totals.totalBDT, lang)}
        />
        <Stat
          label={lang === "bn" ? "সাবটোটাল" : "Subtotal"}
          value={fmtBdt(boqData.totals.subtotalBDT, lang)}
        />
        <Stat
          label={lang === "bn" ? "ভ্যাট" : `VAT (${boqData.totals.taxRate * 100}%)`}
          value={fmtBdt(boqData.totals.taxBDT, lang)}
        />
        <Stat
          label={lang === "bn" ? "মোট আইটেম" : "Total Items"}
          value={boqData.totals.totalItems.toString()}
        />
      </div>

      {/* Category Filter Tabs */}
      <div className="row-between" style={{ marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
        <div className="tabs" role="tablist" aria-label={lang === "bn" ? "বিওকিউ ক্যাটাগরি" : "BOQ Categories"}>
          {allCategories.map((cat) => (
            <button
              key={cat}
              role="tab"
              id={`boq-tab-${cat}`}
              aria-selected={activeCategory === cat}
              aria-controls={`boq-panel-${cat}`}
              tabIndex={activeCategory === cat ? 0 : -1}
              className={cx("tab", activeCategory === cat && "tab--active")}
              onClick={() => setActiveCategory(cat)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const idx = allCategories.indexOf(cat);
                  const next = e.key === "ArrowRight" ? (idx + 1) % allCategories.length : (idx - 1 + allCategories.length) % allCategories.length;
                  setActiveCategory(allCategories[next]);
                }
              }}
            >
              {cat === "all"
                ? lang === "bn"
                  ? "সকল ক্যাটাগরি"
                  : "All Categories"
                : cat}
            </button>
          ))}
        </div>
        <Button 
          variant="ghost" 
          onClick={() => {
            if (speaking) {
              stopReading();
            } else {
              filteredItems.forEach(item => {
                readBOQItem(item.description, fmtNum(item.quantity, lang), item.unit, fmtBdt(item.rateBDT, lang));
              });
            }
          }}
          className="btn-read-all"
          title={speaking ? (lang === 'bn' ? 'পড়া বন্ধ করুন' : 'Stop reading') : (lang === 'bn' ? 'সব পড়ে শোনান' : 'Read all')}
        >
          {speaking ? '🔇' : '🔊'} {speaking ? (lang === 'bn' ? 'বন্ধ' : 'Stop') : (lang === 'bn' ? 'সব পড়ুন' : 'Read All')}
        </Button>
      </div>

      {/* Tab Panels */}
      <div role="tabpanel" id={`boq-panel-${activeCategory}`} aria-labelledby={`boq-tab-${activeCategory}`} tabIndex={0}>

      {/* Category Subtotals */}
      {Object.keys(boqData.totals.totalsByCategory).length > 0 && (
        <Card className="stack" style={{ marginBottom: "16px" }}>
          <h3 style={{ marginBottom: "8px", fontSize: "14px", opacity: 0.7 }}>
            {lang === "bn" ? "ক্যাটাগরি অনুযায়ী সাবটোটাল" : "Totals by Category"}
          </h3>
          <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
            {Object.entries(boqData.totals.totalsByCategory).map(([cat, totals]) => (
              <Badge key={cat} tone={CATEGORY_TONE[cat] || "neutral"}>
                {cat}: {fmtBdt(totals.amount, lang)}
              </Badge>
            ))}
          </div>
        </Card>
      )}

      {/* BOQ Table */}
      <Card className="stack">
        <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
              <th scope="col" style={{ padding: "10px" }}>#</th>
              <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "বিবরণ" : "Description"}</th>
              <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ধরন" : "Category"}</th>
              <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "একক" : "Unit"}</th>
              <th scope="col" style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "পরিমাণ" : "Quantity"}</th>
              <th scope="col" style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "দর (BDT)" : "Rate (BDT)"}</th>
              <th scope="col" style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "মোট টাকা" : "Amount (BDT)"}</th>
              <th scope="col" style={{ padding: "10px", textAlign: "center" }}>{lang === "bn" ? "পড়ুন" : "Read"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => (
              <tr key={item.itemNo} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px", fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                  {item.itemNo}
                </td>
                <td style={{ padding: "10px" }}>
                  <strong>{item.description}</strong>
                  {item.assumptions && item.assumptions.length > 0 && (
                    <div className="faint small">{item.assumptions.join(" · ")}</div>
                  )}
                </td>
                <td style={{ padding: "10px" }}>
                  <Badge tone={CATEGORY_TONE[item.category] || "neutral"}>{item.category}</Badge>
                </td>
                <td style={{ padding: "10px" }}>{item.unit}</td>
                <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {fmtNum(item.quantity, lang)}
                </td>
                <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {fmtBdt(item.rateBDT, lang)}
                </td>
                <td
                  style={{
                    padding: "10px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  {fmtBdt(item.amountBDT, lang)}
                </td>
                <td style={{ padding: "10px", textAlign: "center" }}>
                  <Button
                    variant="ghost"
                    onClick={() => readBOQItem(item.description, fmtNum(item.quantity, lang), item.unit, fmtBdt(item.rateBDT, lang))}
                    title={lang === 'bn' ? 'পড়ে শোনান' : 'Read aloud'}
                    style={{ padding: '2px 6px', fontSize: '11px', minWidth: 'auto' }}
                  >
                    🔊
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
              <td colSpan={6} style={{ padding: "12px", textAlign: "right" }}>
                {lang === "bn" ? "মোট প্রাক্কলিত বাজেট:" : "Grand Total:"}
              </td>
              <td style={{ padding: "12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "16px" }}>
                {fmtBdt(boqData.totals.totalBDT, lang)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  </div>
);
}
