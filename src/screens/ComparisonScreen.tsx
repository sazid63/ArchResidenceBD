import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { type BuildingProject } from "../engine/projectState";
import { fmtNum, fmtBdt } from "../i18n";
import { useActiveProject } from "../context/ProjectContext";

export function ComparisonScreen() {
  const { lang } = useI18n();
  const activeProject = useActiveProject();
  const [project, setProject] = useState<BuildingProject | null>(activeProject);
  const [allProjects, setAllProjects] = useState<BuildingProject[]>([]);
  const [selectedProject1, setSelectedProject1] = useState<BuildingProject | null>(null);
  const [selectedProject2, setSelectedProject2] = useState<BuildingProject | null>(null);
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [viewerMode, setViewerMode] = useState<"split" | "project1" | "project2">("split");

  useEffect(() => {
    if (activeProject) setProject(activeProject);
  }, [activeProject]);

  const getProjectMetrics = (proj: BuildingProject) => {
    const areaPerUnit = (proj.plotSqm * 0.7) / (proj.unitsPerFloor * proj.stories);
    const costPerUnit = 150000 * proj.stories; // Rough estimate
    const far = (proj.plotSqm * 0.7 * proj.stories) / proj.plotSqm;
    
    return {
      areaPerUnit: Math.round(areaPerUnit * 100) / 100,
      costPerUnit: costPerUnit,
      far: Math.round(far * 10) / 10,
      complianceScore: Math.floor(Math.random() * 20) + 80, // Mock score
      structuralEfficiency: Math.floor(Math.random() * 15) + 75, // Mock score
    };
  };

  const metrics1 = selectedProject1 ? getProjectMetrics(selectedProject1) : null;
  const metrics2 = selectedProject2 ? getProjectMetrics(selectedProject2) : null;

  const comparisonData = [
    {
      label: lang === "bn" ? "প্লট আকার" : "Plot Size",
      unit: "katha",
      value1: selectedProject1?.plotSize || 0,
      value2: selectedProject2?.plotSize || 0,
      better: "higher",
    },
    {
      label: lang === "bn" ? "তলা সংখ্যা" : "Stories",
      unit: "তলা",
      value1: selectedProject1?.stories || 0,
      value2: selectedProject2?.stories || 0,
      better: "higher",
    },
    {
      label: lang === "bn" ? "ইউনিট প্রতি এলাকা (m²)" : "Area per Unit (m²)",
      unit: "m²",
      value1: metrics1?.areaPerUnit || 0,
      value2: metrics2?.areaPerUnit || 0,
      better: "higher",
    },
    {
      label: lang === "bn" ? "ইউনিট প্রতি খরচ (BDT)" : "Cost per Unit (BDT)",
      unit: "BDT",
      value1: metrics1?.costPerUnit || 0,
      value2: metrics2?.costPerUnit || 0,
      better: "lower",
    },
    {
      label: lang === "bn" ? "FAR (ফ্লোর এরিয়া রেশিও)" : "FAR",
      unit: "",
      value1: metrics1?.far || 0,
      value2: metrics2?.far || 0,
      better: "balanced",
    },
    {
      label: lang === "bn" ? "সম্মতি স্কোর" : "Compliance Score",
      unit: "%",
      value1: metrics1?.complianceScore || 0,
      value2: metrics2?.complianceScore || 0,
      better: "higher",
    },
  ];

  if (!project) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "ডিজাইন তুলনা" : "Design Comparison"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "ডিজাইন তুলনা" : "Design Comparison"}
        subtitle="2 প্রকল্পের তুলনা করুন"
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      {/* Project Selection */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "প্রকল্প 1" : "Project 1"}
          </h3>
           <label htmlFor="compare-project-1" className="visually-hidden">
             {lang === "bn" ? "প্রথম প্রকল্প নির্বাচন করুন" : "Select first project"}
           </label>
          <select
            value={selectedProject1?.id || ""}
             id="compare-project-1"
            onChange={(e) => {
              const proj = allProjects.find(p => p.id === e.target.value);
              setSelectedProject1(proj || null);
            }}
            style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
          >
            <option value="">{lang === "bn" ? "প্রকল্ব নির্বাচন করুন" : "Select Project"}</option>
            {allProjects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name} ({proj.stories} {lang === "bn" ? "তলা" : "stories"})
              </option>
            ))}
          </select>
          {selectedProject1 && (
            <div style={{ marginTop: "12px", fontSize: "14px" }}>
              <div>{selectedProject1.name}</div>
              <div style={{ opacity: 0.7 }}>
                {selectedProject1.plotSize} katha · {selectedProject1.stories} {lang === "bn" ? "তলা" : "stories"}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "প্রকল্প 2" : "Project 2"}
          </h3>
           <label htmlFor="compare-project-2" className="visually-hidden">
             {lang === "bn" ? "দ্বিতীয় প্রকল্প নির্বাচন করুন" : "Select second project"}
           </label>
          <select
            value={selectedProject2?.id || ""}
             id="compare-project-2"
            onChange={(e) => {
              const proj = allProjects.find(p => p.id === e.target.value);
              setSelectedProject2(proj || null);
            }}
            style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
          >
            <option value="">{lang === "bn" ? "প্রকল্ব নির্বাচন করুন" : "Select Project"}</option>
            {allProjects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.name} ({proj.stories} {lang === "bn" ? "তলা" : "stories"})
              </option>
            ))}
          </select>
          {selectedProject2 && (
            <div style={{ marginTop: "12px", fontSize: "14px" }}>
              <div>{selectedProject2.name}</div>
              <div style={{ opacity: 0.7 }}>
                {selectedProject2.plotSize} katha · {selectedProject2.stories} {lang === "bn" ? "তলা" : "stories"}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Viewer Mode Toggle */}
      {selectedProject1 && selectedProject2 && (
        <Card style={{ marginBottom: "16px" }}>
          <div className="row" style={{ gap: "8px", alignItems: "center" }}>
            <Button
              variant={viewerMode === "split" ? "primary" : "soft"}
              onClick={() => setViewerMode("split")}
            >
              {lang === "bn" ? "স্প্লিট ভিউ" : "Split View"}
            </Button>
            <Button
              variant={viewerMode === "project1" ? "primary" : "soft"}
              onClick={() => setViewerMode("project1")}
            >
              {selectedProject1.name}
            </Button>
            <Button
              variant={viewerMode === "project2" ? "primary" : "soft"}
              onClick={() => setViewerMode("project2")}
            >
              {selectedProject2.name}
            </Button>
          </div>
        </Card>
      )}

      {/* 3D Viewer Area */}
      <Card style={{ marginBottom: "16px", minHeight: "400px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", opacity: 0.6 }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏗️</div>
          <h3>{lang === "bn" ? "৩D ভিউয়ার" : "3D Viewer"}</h3>
          <p style={{ fontSize: "14px" }}>
            {lang === "bn" 
              ? "এখানে প্রকল্পের 3D মডেল দেখানো হবে"
              : "Project 3D models would be displayed here"}
          </p>
          {selectedProject1 && selectedProject2 && viewerMode === "split" && (
            <div style={{ marginTop: "16px", fontSize: "12px", opacity: 0.7 }}>
              {lang === "bn" 
                ? "বাম: {selectedProject1.name} · ডান: {selectedProject2.name}"
                : "Left: {selectedProject1.name} · Right: {selectedProject2.name}"}
            </div>
          )}
        </div>
      </Card>

      {/* Floor Selector */}
      {selectedProject1 && selectedProject2 && (
        <Card style={{ marginBottom: "16px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "তলা নির্বাচন" : "Floor Selection"}
          </h3>
          <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
            {Array.from({ length: Math.max(selectedProject1.stories, selectedProject2.stories) }, (_, i) => (
              <Button
                key={i + 1}
                variant={activeFloor === i + 1 ? "primary" : "soft"}
                onClick={() => setActiveFloor(i + 1)}
              >
                {lang === "bn" ? `${i + 1}তলা` : `Floor ${i + 1}`}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Comparison Metrics */}
      {selectedProject1 && selectedProject2 && (
        <Card style={{ marginBottom: "16px" }}>
          <h3 style={{ marginBottom: "16px" }}>
            {lang === "bn" ? "মেট্রিক্স তুলনা" : "Metrics Comparison"}
          </h3>
          <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
                <th scope="col" style={{ padding: "12px" }}>{lang === "bn" ? "মেট্রিক্স" : "Metric"}</th>
                <th scope="col" style={{ padding: "12px" }}>{selectedProject1.name}</th>
                <th scope="col" style={{ padding: "12px" }}>{selectedProject2.name}</th>
                <th scope="col" style={{ padding: "12px", textAlign: "center" }}>{lang === "bn" ? "ব্যাখ্যা" : "Analysis"}</th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((metric, index) => {
                const diff = metric.value1 - metric.value2;
                const isBetter = metric.better === "higher" ? diff > 0 : metric.better === "lower" ? diff < 0 : Math.abs(diff) < 2;
                const betterProject = isBetter ? 1 : diff === 0 ? 0 : 2;
                
                return (
                  <tr key={index} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "12px", fontWeight: 500 }}>
                      {metric.label}
                    </td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(metric.value1, lang)} {metric.unit}
                    </td>
                    <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(metric.value2, lang)} {metric.unit}
                    </td>
                    <td style={{ padding: "12px", textAlign: "center" }}>
                      {diff === 0 ? (
                        <Badge tone="neutral">Equal</Badge>
                      ) : betterProject === 1 ? (
                        <Badge tone="sage">{selectedProject1.name} ↑</Badge>
                      ) : (
                        <Badge tone="sage">{selectedProject2.name} ↑</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Summary */}
      {selectedProject1 && selectedProject2 && metrics1 && metrics2 && (
        <Card>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "সারাংশ" : "Summary"}
          </h3>
          <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
            <Stat
              label={lang === "bn" ? "মোট এলাকা (m²)" : "Total Area (m²)"}
              value={`${fmtNum((selectedProject1.plotSqm * 0.7 * selectedProject1.stories) + (selectedProject2.plotSqm * 0.7 * selectedProject2.stories), lang)}`}
            />
            <Stat
              label={lang === "bn" ? "গড় খরচ (BDT)" : "Avg Cost (BDT)"}
              value={fmtBdt(((metrics1.costPerUnit * selectedProject1.unitsPerFloor * selectedProject1.stories) + (metrics2.costPerUnit * selectedProject2.unitsPerFloor * selectedProject2.stories)) / 2, lang)}
            />
            <Stat
              label={lang === "bn" ? "সম্মতি স্কোর" : "Compliance Score"}
              value={`${metrics1.complianceScore}% vs ${metrics2.complianceScore}%`}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
