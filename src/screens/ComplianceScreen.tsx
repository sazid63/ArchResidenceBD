import { useEffect, useMemo, useState } from "react";
import verdictData from "../data/compliance/verdict-set.json";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader, Stat } from "../ui/kit";
import { useActiveProject } from "../context/ProjectContext";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import { runComplianceCheck, buildComplianceContext, type DeviationItem } from "../cad/codeCompliance";
import { DEFAULT_CONCRETE, DEFAULT_STEEL_EXPORT } from "../cad/structuralEngine";
import type { MeshDocument } from "../cad/mesh";
import { useAccessibilityReader } from "../hooks/useTextToSpeech";

export function ComplianceScreen() {
  const { t, lang } = useI18n();
  const project = useActiveProject();
  const [filter, setFilter] = useState<"all" | "passed" | "deviation">("all");
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [deviations, setDeviations] = useState<DeviationItem[]>([]);
  const [summary, setSummary] = useState<{ compliant: number; deviation: number; info: number }>({ compliant: 0, deviation: 0, info: 0 });
  const { readComplianceStatus, stop: stopReading, speaking } = useAccessibilityReader();

  // Memoize filtered deviations — depends on project being present, but hook must run unconditionally
  const filtered = useMemo(() => {
    if (!project) return [];
    if (filter === "passed") return deviations.filter((v) => v.pass);
    if (filter === "deviation") return deviations.filter((v) => !v.pass);
    return deviations;
  }, [deviations, filter, project]);

  // Load mesh + run compliance checks when project is available
  useEffect(() => {
    if (!project) return;
    try {
      const doc = generateBuildingMesh(project, "final", project.customization);
      setMesh(doc);
      const ctx = buildComplianceContext(
        {
          stories: project.stories,
          plotSqm: project.plotSqm,
          plotUnit: project.plotUnit,
          unitsPerFloor: project.unitsPerFloor,
          location: "dhaka",
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
      setSummary({ compliant: result.summary.compliant, deviation: result.summary.deviation, info: result.summary.info });
    } catch (e) {
      console.error("Compliance check failed:", e);
    }
  }, [project]);

  // Early return — all hooks above are now unconditional
  if (!project) {
    return (
      <div className="screen">
        <PageHeader title="Compliance Check" subtitle="No active project found" />
        <Card>Please create or load a project first.</Card>
      </div>
    );
  }

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
            <Button 
              variant="ghost" 
              onClick={() => {
                if (speaking) {
                  stopReading();
                } else {
                  deviations.forEach(item => {
                    readComplianceStatus(item.pass ? 'pass' : 'fail', `${item.title}. ${item.message}`);
                  });
                }
              }}
              style={{ padding: '4px 8px', fontSize: '11px' }}
              title={speaking ? (lang === 'bn' ? 'বন্ধ' : 'Stop') : (lang === 'bn' ? 'সব পড়ুন' : 'Read All')}
            >
              {speaking ? '🔇' : '🔊'} {speaking ? (lang === 'bn' ? 'বন্ধ' : 'Stop') : (lang === 'bn' ? 'সব পড়ুন' : 'Read All')}
            </Button>
          </div>
        }
      />

      <Callout title={`${lang === "bn" ? "প্রযোজ্য আইন" : "Applicable Standards"}: BNBC 2020 & RAJUK DAP 2022`}>
        <span>
          {lang === "bn"
            ? "বাংলাদেশ জাতীয় নির্মাণ বিধমালা ২০২০ এবং রাজউক ডেভেলপমেন্ট অ্যাপ্রুভাল প্ল্যান ২০২২ এর নিয়মাবলী অনুযাযয় পরীক্ষা করা হযেছ।"
            : "Evaluated against Bangladesh National Building Code 2020 and RAJUK Development Approval Plan 2022 for Residential occupancy."}
        </span>
      </Callout>

      <div className="row" style={{ gap: "16px", marginBottom: "16px" }}>
        <Stat label={lang === "bn" ? "মোট বিধি" : "Total Rules"} value={String(deviations.length)} />
        <Stat label={lang === "bn" ? "সম্মত" : "Compliant"} value={String(summary.compliant)} />
        <Stat label={lang === "bn" ? "অমিল" : "Deviations"} value={String(summary.deviation)} />
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
          const severityColor = item.severity === "critical" ? "blush" : item.severity === "major" ? "amber" : "neutral";
          return (
            <Card key={idx} className="stack">
              <div className="row-between">
                <div>
                  <h4 style={{ margin: "0 0 4px 0" }}>{item.title}</h4>
                  <span className="faint small font-mono">{item.clause} · {item.category}</span>
                </div>
                <div className="row" style={{ gap: "8px", alignItems: "center" }}>
                  <Badge tone={isPassed ? "sage" : severityColor}>
                    {isPassed ? "✓ PASS" : "⚠ FAIL"}
                  </Badge>
                  <Button
                    variant="ghost"
                    onClick={() => readComplianceStatus(isPassed ? 'pass' : 'fail', `${item.title}. ${item.message}`)}
                    title={lang === 'bn' ? 'পড়ে শোনান' : 'Read aloud'}
                    style={{ padding: '4px 8px', fontSize: '11px', minWidth: 'auto' }}
                  >
                    🔊
                  </Button>
                </div>
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
              deviations.map(d => `${d.pass ? "✓" : "✗"} [${d.severity.toUpperCase()}] ${d.ruleId}: ${d.message}`).join("\n");
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
