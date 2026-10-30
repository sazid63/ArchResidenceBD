import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useProjectCustomization } from "../hooks/useProjectCustomization";
import { DEFAULT_CONSTRUCTION_MGMT } from "../types/customization";
import { fmtNum, fmtBdt } from "../i18n";
import type { ConstructionMgmtSettings } from "../types/customization";

export function ConstructionScreen() {
  const { lang } = useI18n();
  const { project, customization, updateCustomization, isLoading } = useProjectCustomization<ConstructionMgmtSettings>(
    "constructionMgmt",
    DEFAULT_CONSTRUCTION_MGMT,
  );
  const [activeTab, setActiveTab] = useState<"gantt" | "materials" | "quality">("gantt");

  if (isLoading || !project || !customization) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "নির্মাণ ব্যবস্থাপনা" : "Construction Management"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  // Mock construction phases based on stories
  const phases = [
    { id: "site", name: lang === "bn" ? "সাইট প্রস্তুতি" : "Site Preparation", duration: 15, critical: true },
    { id: "foundation", name: lang === "bn" ? "ফাউন্ডেশন" : "Foundation", duration: 30, critical: true },
    { id: "ground", name: lang === "bn" ? "গ্রাউন্ড ফ্লোর" : "Ground Floor", duration: 45, critical: true },
    ...Array.from({ length: project.stories - 1 }, (_, i) => ({
      id: `floor-${i + 1}`,
      name: lang === "bn" ? `${i + 2}য় তলা` : `Floor ${i + 2}`,
      duration: 40,
      critical: true,
    })),
    { id: "roof", name: lang === "bn" ? "ছাদ" : "Roof", duration: 20, critical: true },
    { id: "finishes", name: lang === "bn" ? "শেষ কাজ" : "Finishes", duration: 60, critical: false },
  ];

  // Calculate critical path
  const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);
  const criticalPathDuration = phases.filter(p => p.critical).reduce((sum, p) => sum + p.duration, 0);

  // Mock material schedule
  const materialSchedule = [
    { phase: "site", item: "Earthwork", unit: "m³", quantity: 500, weekly: [100, 200, 200] },
    { phase: "foundation", item: "Concrete M25", unit: "m³", quantity: 120, weekly: [40, 40, 40] },
    { phase: "foundation", item: "Steel Rebar", unit: "ton", quantity: 15, weekly: [5, 5, 5] },
    { phase: "ground", item: "Bricks", unit: "thousand", quantity: 80, weekly: [20, 30, 30] },
    { phase: "ground", item: "Cement", unit: "bag", quantity: 2000, weekly: [500, 750, 750] },
  ];

  // Mock quality checklist
  const qualityChecklist = [
    { phase: "site", item: "Soil Test Report", required: true, status: "completed" },
    { phase: "site", item: "Excavation Level Check", required: true, status: "pending" },
    { phase: "foundation", item: "Concrete Pour Permission", required: true, status: "pending" },
    { phase: "foundation", item: "Rebar Placement Check", required: true, status: "pending" },
    { phase: "ground", item: "Brick Work Alignment", required: true, status: "pending" },
    { phase: "ground", item: "Plumbing Rough-in", required: false, status: "pending" },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "sage";
      case "in_progress": return "amber";
      case "pending": return "blush";
      default: return "neutral";
    }
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "নির্মাণ ব্যবস্থাপনা" : "Construction Management"}
        subtitle={customization.enabled ? lang === "bn" ? "সক্রিয়" : "Enabled" : lang === "bn" ? "অসক্রিয়" : "Optional"}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      {/* Construction Management Toggle */}
      <Card style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", fontSize: "16px", fontWeight: 600 }} htmlFor="construction-enabled-checkbox">
            <input
              id="construction-enabled-checkbox"
              type="checkbox"
              checked={customization.enabled}
              onChange={(e) => updateCustomization("enabled", e.target.checked)}
              style={{ marginRight: "12px", width: "20px", height: "20px" }}
            />
            {lang === "bn" ? "নির্মাণ ব্যবস্থাপনা সুবিধা সক্রিয় করুন" : "Enable Construction Management Features"}
          </label>
        </div>
        <p style={{ fontSize: "14px", opacity: 0.8, lineHeight: "1.5" }}>
          {lang === "bn"
            ? "এই বৈশিষ্ট্যটি ভবিষ্যতে পেইড সংস্করণে উন্নত করা হবে। বর্তমানে শুধুমাত্র স্ট্যাটিক গ্যান্ট চার্ট এবং ম্যাটেরিয়াল শিডিউল দেখানো হচ্ছে।"
            : "This feature will be enhanced in future paid versions. Currently showing static Gantt chart and material schedule only."}
        </p>
      </Card>

      {customization.enabled && (
        <>
          {/* Tab Navigation */}
          <div className="row" style={{ gap: "8px", marginBottom: "14px" }} role="tablist">
            <Button
              variant={activeTab === "gantt" ? "primary" : "soft"}
              onClick={() => setActiveTab("gantt")}
              role="tab"
              aria-selected={activeTab === "gantt"}
            >
              {lang === "bn" ? "গ্যান্ট চার্ট" : "Gantt Chart"}
            </Button>
            <Button
              variant={activeTab === "materials" ? "primary" : "soft"}
              onClick={() => setActiveTab("materials")}
              role="tab"
              aria-selected={activeTab === "materials"}
            >
              {lang === "bn" ? "ম্যাটেরিয়াল শিডিউল" : "Material Schedule"}
            </Button>
            <Button
              variant={activeTab === "quality" ? "primary" : "soft"}
              onClick={() => setActiveTab("quality")}
              role="tab"
              aria-selected={activeTab === "quality"}
            >
              {lang === "bn" ? "গুণমান চেকলিস্ট" : "Quality Checklist"}
            </Button>
          </div>

          {/* Gantt Chart Tab */}
          {activeTab === "gantt" && (
            <Card style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "16px" }}>
                {lang === "bn" ? "নির্মাণ সময়সূচি" : "Construction Schedule"}
              </h3>
              
              {/* Project Summary */}
              <div className="row" style={{ gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
                <Stat
                  label={lang === "bn" ? "মোট সময়কাল" : "Total Duration"}
                  value={`${totalDuration} ${lang === "bn" ? "দিন" : "days"}`}
                />
                <Stat
                  label={lang === "bn" ? "ক্রিটিকাল পাথ" : "Critical Path"}
                  value={`${criticalPathDuration} ${lang === "bn" ? "দিন" : "days"}`}
                />
                <Stat
                  label={lang === "bn" ? "ফেজ সংখ্যা" : "Total Phases"}
                  value={phases.length.toString()}
                />
              </div>

              {/* Gantt Chart (Static SVG) */}
              <div style={{ overflowX: "auto", marginBottom: "20px" }}>
                <svg width={Math.max(800, phases.length * 120)} height={300} style={{ minWidth: "800px" }} role="img" aria-label={lang === "bn" ? "নির্মাণ গ্যান্ট চার্ট" : "Construction Gantt chart"}>
                  {/* Grid lines */}
                  {Array.from({ length: Math.ceil(totalDuration / 30) + 1 }, (_, i) => (
                    <line
                      key={i}
                      x1={50 + i * 150}
                      y1={40}
                      x2={50 + i * 150}
                      y2={250}
                      stroke="var(--border)"
                      strokeDasharray="2,2"
                    />
                  ))}
                  
                  {/* Phase bars */}
                  {phases.map((phase, index) => {
                    const startX = 50;
                    let currentX = startX;
                    const prevPhases = phases.slice(0, index);
                    prevPhases.forEach(p => {
                      currentX += p.duration * 2 + 20;
                    });
                    
                    return (
                      <g key={phase.id}>
                        <text
                          x={currentX - 10}
                          y={30}
                          textAnchor="end"
                          fontSize="12"
                          fill="var(--text-secondary)"
                        >
                          {phase.name}
                        </text>
                        <rect
                          x={currentX}
                          y={50}
                          width={phase.duration * 2}
                          height={30}
                          fill={phase.critical ? "var(--amber)" : "var(--sage)"}
                          rx="4"
                          opacity={0.8}
                        />
                        <text
                          x={currentX + phase.duration}
                          y={70}
                          textAnchor="middle"
                          fontSize="12"
                          fill="white"
                          fontWeight="500"
                        >
                          {phase.duration}d
                        </text>
                        {phase.critical && (
                          <text
                            x={currentX + phase.duration * 2 + 5}
                            y={65}
                            fontSize="10"
                            fill="var(--amber)"
                            fontWeight="600"
                          >
                            ⚡
                          </text>
                        )}
                      </g>
                    );
                  })}
                  
                  {/* Timeline labels */}
                  {Array.from({ length: Math.ceil(totalDuration / 30) + 1 }, (_, i) => (
                    <text
                      key={i}
                      x={50 + i * 150}
                      y={280}
                      textAnchor="middle"
                      fontSize="11"
                      fill="var(--text-secondary)"
                    >
                      Week {i + 1}
                    </text>
                  ))}
                </svg>
              </div>

              {/* Phase List */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px" }}>
                {phases.map((phase) => (
                  <div key={phase.id} style={{ padding: "12px", border: "1px solid var(--border)", borderRadius: "6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{phase.name}</h4>
                      <Badge tone={phase.critical ? "amber" : "neutral"}>
                        {phase.critical ? lang === "bn" ? "ক্রিটিকাল" : "Critical" : lang === "bn" ? "নরমাল" : "Normal"}
                      </Badge>
                    </div>
                    <div style={{ fontSize: "12px", opacity: 0.7 }}>
                      {lang === "bn" ? "সময়কাল:" : "Duration:"} {phase.duration} {lang === "bn" ? "দিন" : "days"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Material Schedule Tab */}
          {activeTab === "materials" && (
            <Card style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "16px" }}>
                {lang === "bn" ? "ম্যাটেরিয়াল ডেলিভারি শিডিউল" : "Material Delivery Schedule"}
              </h3>
              
              <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
                    <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ফেজ" : "Phase"}</th>
                    <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "আইটেম" : "Item"}</th>
                    <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "একক" : "Unit"}</th>
                    <th scope="col" style={{ padding: "10px", textAlign: "right" }}>{lang === "bn" ? "পরিমাণ" : "Quantity"}</th>
                    <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "সাপ্লাই শিডিউল" : "Supply Schedule"}</th>
                  </tr>
                </thead>
                <tbody>
                  {materialSchedule.map((item, index) => (
                    <tr key={index} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "10px" }}>
                        <Badge tone="sage">{item.phase}</Badge>
                      </td>
                      <td style={{ padding: "10px", fontWeight: 500 }}>{item.item}</td>
                      <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>{item.unit}</td>
                      <td style={{ padding: "10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>
                        {fmtNum(item.quantity, lang)}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div className="row" style={{ gap: "4px" }}>
                          {item.weekly.map((qty, weekIndex) => (
                            <div key={weekIndex} style={{
                              padding: "4px 8px",
                              background: qty > 0 ? "var(--sage-soft)" : "var(--line)",
                              borderRadius: "4px",
                              fontSize: "11px",
                              minWidth: "40px",
                              textAlign: "center"
                            }}>
                              W{weekIndex + 1}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Quality Checklist Tab */}
          {activeTab === "quality" && (
            <Card style={{ marginBottom: "16px" }}>
              <h3 style={{ marginBottom: "16px" }}>
                {lang === "bn" ? "গুণমান চেকলিস্ট" : "Quality Control Checklist"}
              </h3>
              
              <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
                {qualityChecklist.map((item, index) => (
                  <div key={index} style={{
                    flex: 1,
                    minWidth: "300px",
                    padding: "16px",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    background: item.required ? "var(--sage-soft)" : "transparent"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
                          {item.item}
                          {!item.required && (
                            <span style={{ fontSize: "11px", opacity: 0.7, marginLeft: "8px" }}>
                              ({lang === "bn" ? "ঐচ্ছিক" : "Optional"})
                            </span>
                          )}
                        </h4>
                        <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "2px" }}>
                          {item.phase}
                        </div>
                      </div>
                      <Badge tone={getStatusColor(item.status)}>
                        {lang === "bn" 
                          ? item.status === "completed" ? "সম্পন্ন" :
                            item.status === "in_progress" ? "চলছে" : "অপেক্ষমান"
                          : item.status.charAt(0).toUpperCase() + item.status.slice(1)
                        }
                      </Badge>
                    </div>
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                      <Button variant="soft">
                        {lang === "bn" ? "ডিটেইলস" : "Details"}
                      </Button>
                      <Button variant="primary" disabled={item.status === "completed"}>
                        {lang === "bn" ? "চেক করুন" : "Check"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {/* Construction Status */}
      <Card>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "নির্মাণ ব্যবস্থাপনা স্ট্যাটাস" : "Construction Management Status"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          <Badge tone={customization.enabled ? "sage" : "neutral"}>
            {lang === "bn" ? "নির্মাণ ব্যবস্থাপনা" : "Construction Management"}
          </Badge>
          <Badge tone="amber">
            {lang === "bn" ? "বিটা ফিচার" : "Beta Feature"}
          </Badge>
          <Badge tone="neutral">
            {lang === "bn" ? "স্ট্যাটিক গ্যান্ট" : "Static Gantt Only"}
          </Badge>
          <Badge tone="neutral">
            {lang === "bn" ? "নো এক্সপোর্ট" : "No Export"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}