import { useEffect, useState } from "react";
import verdictData from "../data/compliance/verdict-set.json";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import { runComplianceCheck, buildComplianceContext, type DeviationItem } from "../cad/codeCompliance";
import { DEFAULT_CONCRETE, DEFAULT_STEEL_EXPORT } from "../cad/structuralEngine";

export function ComplianceScreen() {
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<"all" | "passed" | "deviation">("all");
  const [project] = useState(() => getActiveProject() || {
    id: "demo", name: "Demo Building", stories: 6, plotSqm: 234, plotUnit: "katha",
    unitsPerFloor: 2, location: "dhaka" as const, plotSize: 3.5, createdAt: "", updatedAt: "", phases: [], designStarted: true,
  });
  const [mesh, setMesh] = useState<any>(null);
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);
  const [summary, setSummary] = useState({ compliant: 0, deviation: 0, info: 0 });

  useEffect(() => {
    try {
      const doc = generateBuildingMesh(project, "final", {
        columnWidthMm: project.stories >= 6 ? 350 : 250,
        columnDepthMm: project.stories >= 6 ? 350 : 250,
        footingSizeMm: project.stories >= 6 ? 2000 : 1800,
        footingDepthMm: project.stories >= 6 ? 2000 : 1600,
        balconyDepthMm: 1200,
      });
      setMesh(doc);
      const ctx = buildComplianceContext(
        {
          stories: project.stories,
          plotSqm: project.plotSqm,
          plotUnit: project.plotUnit,
          unitsPerFloor: project.unitsPerFloor,
          location: project.location || "dhaka",
        },
        doc,
        {
          concreteGrade: DEFAULT_CONCRETE.fck,
          steelGrade: DEFAULT_STEEL_EXPORT.fy,
          brickStrength: 7.5, // typical brick masonry
        }
      );
      const result = runComplianceCheck(ctx);
      setDeviations(result.deviations);
      setSummary(result.summary);
    } catch (e) {
      console.error("Compliance check failed:", e);
    }
  }, [project]);

  const filtered = deviations.filter((v) => {
    if (filter === "passed") return v.pass;
    if (filter === "deviation") return !v.pass;
    return true;
  });

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "কোড কমপ্লায়েন্স চেকার" : "Code Compliance Checker"}
        subtitle={`${lang === "bn" ? "আর্চি কমপ্লায়েন্স এনজিন v2.4" : "ArchResidenceBD Compliance Engine v2.4"} · BNBC 2020 & RAJUK DAP 2022`}
        actions={
          <div className="row">
            <Button variant={filter === "all" ? "primary" : "soft"} onClick={() => setFilter("all")}>
              {lang === "bn" ? `সব (${filtered.length})` : `All (${filtered.length})`}
            </Button>
            <Button variant={filter === "deviation" ? "primary" : "soft"} onClick={() => setFilter("deviation")}>
              ⚠ {lang === "bn" ? "অমিল" : "Deviations"} ({summary.deviation})
            </Button>
            <Button variant={filter === "passed" ? "primary" : "soft"} onClick={() => setFilter("passed")}>
              ✓ {lang === "bn" ? "সম্মত" : "Compliant"} ({summary.compliant})
            </Button>
          </div>
        }
      />

      <Callout title={`${lang === "bn" ? "প্রযোজ্য আইন" : "Applicable Standards"}: BNBC 2020 & RAJUK DAP 2022`}>
        <span>
          {lang === "bn"
            ? "বাংলাদেশ জাতীয় নির্মাণ বিধমালা ২০২০ এবং রাজউক ডেভেলপমেন্ট অ্যাপ্রুভাল প্ল্যান ২০২২ এর নিয়মাবলী অনুযাযী পরীক্ষা করা হযেছ।"
            : "Evaluated against Bangladesh National Building Code 2020 and RAJUK Development Approval Plan 2022 for Residential occupancy."}
        </span>
      </Callout>

      <div className="row" style={{ gap: "16px", marginBottom: "16px" }}>
        <Stat label={lang === "bn" ? "মোট বিধি" : "Total Rules"} value={String(deviations.length)} />
        <Stat label={lang === "bn" ? "সম্মত" : "Compliant"} value={String(summary.compliant)} tone="sage" />
        <Stat label={lang === "bn" ? "অমিল" : "Deviations"} value={String(summary.deviation)} tone={summary.deviation > 0 ? "danger" : "sage"} />
        <Stat label={lang === "bn" ? "তথ্য" : "Info"} value={String(summary.info)} />
      </div>

      {/* Deviation Register */}
      <div className="stack" style={{ gap: "12px" }}>
        {filtered.length === 0 && (
          <Card>
            <p className="muted">{lang === "bn" ? "কোনো বিচ্যুতি নেই। সব বিধি সম্পূর্ণ সম্মত।" : "No deviations found. All rules pass."}</p>
          </Card>
        )}
        {filtered.map((item, idx) => {
          const isPassed = item.pass;
          const severityColor = item.severity === "critical" ? "danger" : item.severity === "major" ? "amber" : "neutral";
          return (
            <Card key={idx} className="stack">
              <div className="row-between">
                <div>
                  <h4 style={{ margin: "0 0 4px 0" }}>{item.title}</h4>
                  <span className="faint small font-mono">{item.clause} · {item.category}</span>
                </div>
                <Badge tone={isPassed ? "sage" : severityColor}>
                  {isPassed ? "✓ PASS" : "⚠ FAIL"}
                </Badge>
              </div>
              <p style={{ margin: "8px 0", fontSize: "14px", lineHeight: "1.5" }}>{item.message}</p>
              {!isPassed && item.recommendation && (
                <div style={{ padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)", fontSize: "13px" }}>
                  <strong>{lang === "bn" ? "সুপারিশ:" : "Recommendation:"}</strong> {item.recommendation}
                </div>
              )}
              {!isPassed && item.measured != null && item.required && (
                <div className="row" style={{ gap: "8px", marginTop: "4px" }}>
                  <span className="small muted">Measured: <strong>{item.measured}</strong> {item.required.replace("≤ ", "").replace("≥ ", "")}</span>
                  <span className="small muted">Required: <strong>{item.required}</strong></span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* RAJUK DAP 2008 Legacy Report */}
      <Card style={{ marginTop: "16px" }}>
        <h4>{lang === "bn" ? "RAJUK DAP 2008 বিস্তারিত প্রতিবেদন" : "RAJUK DAP 2008 Detailed Report"}</h4>
        <p className="small muted">
          {lang === "bn"
            ? "এই প্রতিবেদনটি RAJUK Mohanogor Imarat Nirman Bidhimala 2008 এর উপর ভিত্তি করে তৈরি। মূল বিচারের জন্য §2.4 দেখুন।"
            : "This report is based on RAJUK Dhaka Mohanogor Imarat Nirman Bidhimala 2008. See §2.4 for primary adjudication."}
        </p>
        <div className="row" style={{ gap: "12px" }}>
          <Stat label={lang === "bn" ? "সম্মত (RAJUK)" : "Compliant (RAJUK)"} value={String(verdictData.summary.compliant)} />
          <Stat label={lang === "bn" ? "অমিল (RAJUK)" : "Deviations (RAJUK)"} value={String(verdictData.summary.deviation)} />
          <Stat label={lang === "bn" ? "প্যাক গ্যাপ" : "Pack Gaps"} value={String(verdictData.unevaluated.length)} />
        </div>
        <Button
          variant="soft"
          style={{ marginTop: "8px" }}
          onClick={() => {
            const text = `${lang === "bn" ? "কোড কমপ্লায়েন্স প্রতিবেদন" : "Code Compliance Report"} — ${project.name}\nGenerated: ${new Date().toISOString()}\n\n` +
              deviations.map(d => `${d.pass ? "✓" : "✗"} [${d.severity.toUpperCase()}] ${d.id}: ${d.message}`).join("\n");
            const blob = new Blob([text], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${project.name.replace(/[^a-zA-Z0-9]/g, "_")}_compliance_report.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          📄 {lang === "bn" ? "রিপোর্ট ডাউনলোড (.txt)" : "Download Report (.txt)"}
        </Button>
      </Card>
    </div>
  );
}
