import { useState, useMemo } from "react";
import { fmtBdt, fmtNum, useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, calculateDynamicBoq, BuildingProject } from "../engine/projectState";

const COST_TONE: Record<string, "sky" | "sage" | "amber" | "lavender" | "blush"> = {
  material: "sky",
  labour: "sage",
  machinery: "amber",
  subcontract: "lavender",
  other: "blush",
};

export function BoqScreen() {
  const { lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const boqData = useMemo(() => {
    if (!project) return null;
    return calculateDynamicBoq(project);
  }, [project]);

  if (!project || !boqData) {
    return (
      <div className="screen">
        <PageHeader title="Bill of Quantities (BOQ)" subtitle="No active project found" />
        <Card>
          <p className="muted">Please complete the phase interviews and design to calculate BOQ.</p>
        </Card>
      </div>
    );
  }

  const filteredLines = boqData.lines.filter((line) => {
    if (activeFilter === "all") return true;
    return line.costType === activeFilter;
  });

  const exportCsv = () => {
    const headers = ["Item", "Category", "Unit", "Quantity", "Rate (BDT)", "Total Amount (BDT)"];
    const rows = boqData.lines.map((l) => [
      `"${l.label.en}"`,
      l.costType,
      l.unit,
      l.quantity,
      l.rateBdt,
      l.amountBdt,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_PWD_BOQ.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "প্রাক্কলন ও খরচের হিসাব (BOQ)" : "Bill of Quantities (BOQ)"}
        subtitle={`${project.name} · ${project.stories} ${lang === "bn" ? "তলা" : "Stories"} (${project.plotSize} ${project.plotUnit}) · PWD Rates Schedule`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary" onClick={exportCsv}>
              {lang === "bn" ? "এক্সেল / CSV ডাউনলোড" : "Export BOQ (CSV / Excel)"}
            </Button>
          </div>
        }
      />

      {/* Top Cost Statistics */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat
          label={lang === "bn" ? "সর্বমোট আনুমানিক ব্যয়" : "Total Estimated Budget"}
          value={fmtBdt(boqData.totals.amountBdt, lang)}
        />
        <Stat
          label={lang === "bn" ? "উপকরণ ব্যয় (Materials)" : "Materials Subtotal"}
          value={fmtBdt(boqData.subtotals.byCostType["material"] || 0, lang)}
        />
        <Stat
          label={lang === "bn" ? "শ্রমিক মজুরি (Labour)" : "Labour Subtotal"}
          value={fmtBdt(boqData.subtotals.byCostType["labour"] || 0, lang)}
        />
        <Stat
          label={lang === "bn" ? "যন্ত্রপাতি ভাড়া (Machinery)" : "Equipment & Plant"}
          value={fmtBdt(boqData.subtotals.byCostType["machinery"] || 0, lang)}
        />
      </div>

      {/* Filter Tabs */}
      <div className="row" style={{ gap: "8px", marginBottom: "14px" }}>
        {["all", "material", "labour", "machinery"].map((filter) => (
          <Button
            key={filter}
            variant={activeFilter === filter ? "primary" : "soft"}
            onClick={() => setActiveFilter(filter)}
          >
            {filter === "all"
              ? lang === "bn"
                ? "সকল আইটেম"
                : "All Items"
              : filter === "material"
                ? lang === "bn"
                  ? "নির্মাণ সামগ্রী"
                  : "Materials"
                : filter === "labour"
                  ? lang === "bn"
                    ? "শ্রমিক মজুরি"
                    : "Labour"
                  : lang === "bn"
                    ? "যন্ত্রপাতি"
                    : "Machinery"}
          </Button>
        ))}
      </div>

      {/* BOQ Table */}
      <Card className="stack">
        <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
              <th style={{ padding: "10px" }}>{lang === "bn" ? "বিবরণ" : "Work Item Description"}</th>
              <th style={{ padding: "10px" }}>{lang === "bn" ? "ধরন" : "Category"}</th>
              <th style={{ padding: "10px" }}>{lang === "bn" ? "একক" : "Unit"}</th>
              <th style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "পরিমাণ" : "Quantity"}</th>
              <th style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "দর (BDT)" : "Rate (BDT)"}</th>
              <th style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "মোট টাকা" : "Amount (BDT)"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.map((line) => (
              <tr key={line.key} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "10px" }}>
                  <strong>{lang === "bn" ? line.label.bn : line.label.en}</strong>
                  <div className="faint small">{line.provenance}</div>
                </td>
                <td style={{ padding: "10px" }}>
                  <Badge tone={COST_TONE[line.costType] || "neutral"}>{line.costType}</Badge>
                </td>
                <td style={{ padding: "10px" }}>{line.unit}</td>
                <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {fmtNum(line.quantity, lang)}
                </td>
                <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {fmtBdt(line.rateBdt, lang)}
                </td>
                <td
                  style={{
                    padding: "10px",
                    textAlign: "right",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  {fmtBdt(line.amountBdt, lang)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
              <td colSpan={5} style={{ padding: "12px", textAlign: "right" }}>
                {lang === "bn" ? "মোট প্রাক্কলিত বাজেট:" : "Total Estimated Budget:"}
              </td>
              <td style={{ padding: "12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: "16px" }}>
                {fmtBdt(boqData.totals.amountBdt, lang)}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}
