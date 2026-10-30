import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import { generatePourSequence, generatePourSequenceReport, exportPourSequenceCSV, PourSequence, PourStep } from "../cad/pourSequence";
import type { MeshDocument } from "../cad/mesh";
import { fmtBdt, fmtNum } from "../i18n";

export function PourSequenceScreen() {
  const { t, lang } = useI18n();
  const [project] = useState(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [sequence, setSequence] = useState<PourSequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "phases" | "critical">("schedule");
  const [filterPhase, setFilterPhase] = useState<string>("all");

  useEffect(() => {
    if (!project) {
      setError("No active project found");
      setLoading(false);
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const meshDoc = generateBuildingMesh(project, "final", project.customization);
        setMesh(meshDoc);
        
        const sequenceData = generatePourSequence(meshDoc, project);
        setSequence(sequenceData);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [project]);

  if (!project) {
    return (
      <div className="screen">
        <PageHeader title={t("pourSequenceTitle")} subtitle={t("pourSequenceSubtitle")} />
        <Card>
          <p className="muted">{lang === "bn" ? "কোনো সক্রিয় প্রকল্প পাওয়া যায়নি" : "No active project found"}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <PageHeader title={t("pourSequenceTitle")} subtitle={t("pourSequenceSubtitle")} />
        <Card>
          <p className="muted">{error}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <PageHeader title={t("pourSequenceTitle")} subtitle={t("pourSequenceSubtitle")} />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "পার্সিকোয়েন্স গণনা হচ্ছে..." : "Calculating pour sequence..."}
        </div>
      </div>
    );
  }

  const phases = sequence?.phases || [];
  const steps = sequence?.steps || [];

  const filteredSteps = steps.filter((step: PourStep) => 
    filterPhase === "all" || step.pourType === filterPhase
  );

  const uniquePourTypes = Array.from(new Set(steps.map((s: PourStep) => s.pourType)));

  return (
    <div className="screen">
      <PageHeader
        title={t("pourSequenceTitle")}
        subtitle={t("pourSequenceSubtitle")}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={() => {
              const report = generatePourSequenceReport(sequence!, project);
              const blob = new Blob([report], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.id}_pour_sequence_report.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              {lang === "bn" ? "রিপোর্ট ডাউনলোড" : "Download Report"}
            </Button>
            <Button variant="soft" onClick={() => {
              const csv = exportPourSequenceCSV(sequence!);
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project.id}_pour_sequence.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              {lang === "bn" ? "CSV এক্সপোর্ট" : "Export CSV"}
            </Button>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="row" style={{ gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        <Button variant={activeTab === "schedule" ? "primary" : "soft"} onClick={() => setActiveTab("schedule")}>
          {lang === "bn" ? "পার্সিকোয়েন্স" : "Schedule"} ({steps.length})
        </Button>
        <Button variant={activeTab === "phases" ? "primary" : "soft"} onClick={() => setActiveTab("phases")}>
          {lang === "bn" ? "ফেজ" : "Phases"} ({phases.length})
        </Button>
        <Button variant={activeTab === "critical" ? "primary" : "soft"} onClick={() => setActiveTab("critical")}>
          {lang === "bn" ? "ক্রিটিক্যাল পাথ" : "Critical Path"}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat label={lang === "bn" ? "মোট ভলিউম" : "Total Volume"} value={`${sequence?.totalVolumeM3?.toLocaleString() || 0} m³`} />
        <Stat label={lang === "bn" ? "মোট ধাপ" : "Total Steps"} value={String(sequence?.totalSteps || 0)} />
        <Stat label={lang === "bn" ? "মেয়াদ" : "Duration"} value={`${sequence?.totalDurationDays || 0} days`} />
        <Stat label={lang === "bn" ? "মান-ঘন্টা" : "Man-Hours"} value={`${sequence?.totalManHours?.toLocaleString() || 0} hrs`} />
        <Stat label={lang === "bn" ? "অনুমানিত খরচ" : "Est. Cost"} value={sequence?.estimatedCostBDT ? `৳${sequence.estimatedCostBDT.toLocaleString()}` : "—"} />
      </div>

      {/* Schedule Tab */}
      {activeTab === "schedule" && (
        <div>
          {/* Phase Filter */}
          <div className="row" style={{ gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ alignSelf: "center", opacity: 0.7 }}>{lang === "bn" ? "ফেজ দিয়ে ফিল্টার:" : "Filter by phase:"}</span>
            {["all", ...uniquePourTypes].map((pt) => (
              <Button
                key={pt}
                variant={filterPhase === pt ? "primary" : "soft"}
                onClick={() => setFilterPhase(pt)}
                style={{ textTransform: "capitalize" }}
              >
                {pt}
              </Button>
            ))}
          </div>

          {/* Pour Schedule Table */}
          <Card className="stack">
            <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
                  <th scope="col" style={{ padding: "10px" }}>#</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলিমেন্ট" : "Element"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "টাইপ" : "Type"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ভলিউম (m³)" : "Volume (m³)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলাকা (m²)" : "Area (m²)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ঘন্টা" : "Hours"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ক্রু" : "Crew"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "পাম্প" : "Pump"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "শুরু" : "Start"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "শেষ" : "End"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ক্যুরিং" : "Cure (days)"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredSteps.map((step: PourStep) => (
                  <tr key={step.elementId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                      {step.step}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{step.label}</strong>
                      <div className="faint small">{step.elementKind}</div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge tone="sky">{step.pourType}</Badge>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(step.volumeM3, lang)}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(step.areaM2, lang)}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {step.estimatedHours} ({step.setupHours}+{step.pourHours}+{step.finishHours})
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {step.crewSize}
                    </td>
                    <td style={{ padding: "10px" }}>
                      {step.requiresPump ? <Badge tone="blush">✓</Badge> : <Badge tone="sage">✗</Badge>}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                      {new Date(step.startTime).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit' })}
                      <br/>{new Date(step.startTime).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)", fontSize: "11px" }}>
                      {new Date(step.endTime).toLocaleDateString("en-GB", { day: '2-digit', month: '2-digit' })}
                      <br/>{new Date(step.endTime).toLocaleTimeString("en-GB", { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {step.curingDays} ({step.curingMethod})
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "12px", textAlign: "right" }}>
                    {lang === "bn" ? "মোট:" : "Total:"}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(sequence?.totalVolumeM3 || 0, lang)}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(steps.reduce((sum: number, s: PourStep) => sum + s.areaM2, 0), lang)}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {steps.reduce((sum: number, s: PourStep) => sum + s.estimatedHours, 0)}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {steps.reduce((sum: number, s: PourStep) => sum + s.crewSize, 0)}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {steps.filter((s: PourStep) => s.requiresPump).length} / {steps.length}
                  </td>
                  <td colSpan={3} style={{ padding: "12px" }}></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      {/* Phases Tab */}
      {activeTab === "phases" && (
        <div className="stack" style={{ gap: "16px" }}>
          {phases.map((phase) => (
            <Card key={phase.phaseId} className="stack">
              <div className="row-between" style={{ marginBottom: "8px" }}>
                <div>
                  <h3 style={{ margin: "0 0 4px 0" }}>{phase.name}</h3>
                  <span className="faint small">{phase.description}</span>
                </div>
                <Badge tone="primary">Phase {phase.order}</Badge>
              </div>
              <div className="row" style={{ gap: "16px", marginBottom: "8px", flexWrap: "wrap" }}>
                <Stat label={lang === "bn" ? "ভলিউম" : "Volume"} value={`${phase.totalVolumeM3.toLocaleString()} m³`} />
                <Stat label={lang === "bn" ? "ধাপ" : "Steps"} value={String(phase.steps.length)} />
                <Stat label={lang === "bn" ? "মেয়াদ" : "Duration"} value={`${phase.durationDays} days`} />
                <Stat label={lang === "bn" ? "শুরু" : "Start"} value={new Date(phase.startDate).toLocaleDateString("en-GB")} />
                <Stat label={lang === "bn" ? "শেষ" : "End"} value={new Date(phase.endDate).toLocaleDateString("en-GB")} />
              </div>
              <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                {phase.steps.map((stepIdx: number) => {
                  const step = steps[stepIdx];
                  if (!step) return null;
                  return (
                    <Badge key={step.elementId} tone={step.requiresPump ? "amber" : "sage"}>
                      {step.step}. {step.label} ({fmtNum(step.volumeM3, lang)} m³)
                    </Badge>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Critical Path Tab */}
      {activeTab === "critical" && (
        <Card className="stack">
          <h3 style={{ marginBottom: "12px" }}>{lang === "bn" ? "ক্রিটিক্যাল পাথ এনালাইসিস" : "Critical Path Analysis"}</h3>
          <p className="small muted" style={{ marginBottom: "16px" }}>
            {lang === "bn" ? "সবচেয়ে বড় ভলিউম এবং পাম্পের প্রযোজ্যতার উপর ভিত্তি করে শনাক্ত করা হয়েছে।" : "Identified by largest volumes and pump requirements."}
          </p>
          <div className="stack" style={{ gap: "12px" }}>
            {steps
              .filter((s: PourStep) => s.volumeM3 > 2 || s.requiresPump)
              .sort((a: PourStep, b: PourStep) => b.volumeM3 - a.volumeM3)
              .slice(0, 10)
              .map((step: PourStep, idx: number) => (
                <Card key={step.elementId} className="stack" style={{ borderLeft: "4px solid var(--primary)" }}>
                  <div className="row-between">
                    <div>
                      <strong>{idx + 1}. {step.label}</strong>
                      <div className="faint small">{step.elementKind} · Step {step.step} · {step.pourType}</div>
                    </div>
                    <div className="row" style={{ gap: "12px" }}>
                      <Badge tone="blush">{fmtNum(step.volumeM3, lang)} m³</Badge>
                      <Badge tone={step.requiresPump ? "amber" : "sage"}>
                        {step.requiresPump ? "Pump Required" : "No Pump"}
                      </Badge>
                      <Badge tone="sky">{step.crewSize} crew</Badge>
                    </div>
                  </div>
                  <div className="row" style={{ gap: "16px", fontSize: "13px", opacity: 0.8, flexWrap: "wrap" }}>
                    <span>Setup: {step.setupHours}h | Pour: {step.pourHours}h | Finish: {step.finishHours}h</span>
                    <span>Start: {new Date(step.startTime).toLocaleDateString("en-GB")}</span>
                    <span>Cure: {step.curingDays}d ({step.curingMethod})</span>
                    {step.dependencies.length > 0 && (
                      <span>Depends on: {step.dependencies.map(d => d + 1).join(", ")}</span>
                    )}
                  </div>
                </Card>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}