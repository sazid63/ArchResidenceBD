import { useState, useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, saveActiveProject, BuildingProject } from "../engine/projectState";
import { fmtNum, fmtBdt } from "../i18n";

export function FireSafetyScreen() {
  const { lang } = useI18n();
  const [project, setProject] = useState<BuildingProject | null>(null);
  const [customization, setCustomization] = useState<any>(null);

  useEffect(() => {
    const active = getActiveProject();
    if (active) {
      setProject(active);
      setCustomization(active.customization?.fireSafety || {
        enabled: false,
        stairWidthMm: 1000,
        corridorWidthMm: 1200,
        travelDistanceMaxM: 30,
        fireRatingHours: 2,
        sprinklerSystem: false,
        smokeDetector: true,
      });
    }
  }, []);

  const updateCustomization = (field: string, value: any) => {
    if (!project || !customization) return;
    const updated = { ...customization, [field]: value };
    setCustomization(updated);

    const updatedProject = {
      ...project,
      customization: {
        ...project.customization,
        fireSafety: updated,
      },
      updatedAt: new Date().toISOString(),
    };
    setProject(updatedProject);
    saveActiveProject(updatedProject);
  };

  if (!project || !customization) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "ফায়ার সেফটি" : "Fire Safety Settings"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  const sprinklerArea = customization.sprinklerSystem ? (project.plotSqm || 200) * project.stories : 0;
  const sprinklerCost = customization.sprinklerSystem ? Math.round(sprinklerArea * 450) : 0;

  const isCompliant = project.stories <= 3 || 
    (customization.stairWidthMm >= 1000 && 
     customization.corridorWidthMm >= 1200 && 
     customization.travelDistanceMaxM <= 30);

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "ফায়ার সেফটি সেটিংস" : "Fire Safety Settings"}
        subtitle={customization.enabled ? lang === "bn" ? "সক্রিয়" : "Enabled" : lang === "bn" ? "অসক্রিয়" : "Optional"}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      {/* Fire Safety Toggle */}
      <Card style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
          <label htmlFor="fs-enabled-checkbox" style={{ display: "flex", alignItems: "center", fontSize: "16px", fontWeight: 600 }}>
            <input id="fs-enabled-checkbox"
              type="checkbox"
              checked={customization.enabled}
              onChange={(e) => updateCustomization("enabled", e.target.checked)}
              style={{ marginRight: "12px", width: "20px", height: "20px" }}
            />
            {lang === "bn" ? "ফায়ার সেফটি বাধ্যতামূলক মান প্রয়োগ করুন" : "Apply Mandatory Fire Safety Standards"}
          </label>
        </div>
        <p style={{ fontSize: "14px", opacity: 0.8, lineHeight: "1.5" }}>
          {lang === "bn"
            ? "BNBC 2020 Part 4 অনুযায়ী ৬ তলার বেশি ভবনে ফায়ার সেফটি বাধ্যতামূলক। চালু করলে স্বয়ংক্রিয় স্প্রিংকলার, প্রশস্ত সিঁড়ি ও করিডোর বাধ্যতামূলক হবে।"
            : "Mandatory for buildings with 6+ stories per BNBC 2020 Part 4. Enables automatic sprinklers, wide stairs, and corridors."}
        </p>
      </Card>

      {customization.enabled && (
        <>
          {/* Egress Requirements */}
          <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            <Card style={{ flex: 1, minWidth: "300px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {lang === "bn" ? "সিঁড়ি প্রস্থ" : "Stair Width"}
              </h3>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                  {lang === "bn" ? "সর্বনিম্ন প্রস্থ (mm):" : "Minimum Width (mm)"}
                </label>
                <input
                  type="number"
                  min="800"
                  max="1500"
                  value={customization.stairWidthMm}
                  onChange={(e) => updateCustomization("stairWidthMm", parseInt(e.target.value))}
                  style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
                />
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                {lang === "bn" ? "BNBC সুপারিশ: ১০০০mm" : "BNBC Recommended: 1000mm"}
              </div>
            </Card>

            <Card style={{ flex: 1, minWidth: "300px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {lang === "bn" ? "করিডোর প্রস্থ" : "Corridor Width"}
              </h3>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                  {lang === "bn" ? "সর্বনিম্ন প্রস্থ (mm):" : "Minimum Width (mm)"}
                </label>
                <input
                  type="number"
                  min="900"
                  max="2000"
                  value={customization.corridorWidthMm}
                  onChange={(e) => updateCustomization("corridorWidthMm", parseInt(e.target.value))}
                  style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
                />
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                {lang === "bn" ? "BNBC সুপারিশ: ১২০০mm" : "BNBC Recommended: 1200mm"}
              </div>
            </Card>

            <Card style={{ flex: 1, minWidth: "300px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {lang === "bn" ? "সর্বোচ্চ ভ্রমণ দূরত্ব" : "Max Travel Distance"}
              </h3>
              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                  {lang === "bn" ? "সর্বোচ্চ দূরত্ব (m):" : "Maximum Distance (m)"}
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={customization.travelDistanceMaxM}
                  onChange={(e) => updateCustomization("travelDistanceMaxM", parseInt(e.target.value))}
                  style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
                />
              </div>
              <div style={{ fontSize: "12px", opacity: 0.7 }}>
                {lang === "bn" ? "BNBC সুপারিশ: ৩০m" : "BNBC Recommended: 30m"}
              </div>
            </Card>
          </div>

          {/* Fire Protection Systems */}
          <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            <Card style={{ flex: 1, minWidth: "300px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {lang === "bn" ? "স্প্রিংকলার সিস্টেম" : "Sprinkler System"}
              </h3>
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="fs-sprinkler-checkbox" style={{ display: "flex", alignItems: "center", fontSize: "14px" }}>
                  <input id="fs-sprinkler-checkbox"
                    type="checkbox"
                    checked={customization.sprinklerSystem}
                    onChange={(e) => updateCustomization("sprinklerSystem", e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  {lang === "bn" ? "স্বয়ংক্রিয় স্প্রিংকলার সিস্টেম" : "Automatic Sprinkler System"}
                </label>
              </div>
            </Card>

            <Card style={{ flex: 1, minWidth: "300px" }}>
              <h3 style={{ marginBottom: "12px" }}>
                {lang === "bn" ? "স্মোক ডিটেক্টর" : "Smoke Detector"}
              </h3>
              <div style={{ marginBottom: "16px" }}>
                <label htmlFor="fs-smoke-checkbox" style={{ display: "flex", alignItems: "center", fontSize: "14px" }}>
                  <input id="fs-smoke-checkbox"
                    type="checkbox"
                    checked={customization.smokeDetector}
                    onChange={(e) => updateCustomization("smokeDetector", e.target.checked)}
                    style={{ marginRight: "8px" }}
                  />
                  {lang === "bn" ? "স্মোক ডিটেক্টর" : "Smoke Detector"}
                </label>
              </div>
            </Card>
          </div>

          {/* Fire Safety Summary */}
          <Card>
            <h3 style={{ marginBottom: "12px" }}>
              {lang === "bn" ? "ফায়ার সেফটি সারসংক্ষেপ" : "Fire Safety Summary"}
            </h3>
            <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
              <Stat
                label={lang === "bn" ? "সিঁড়ি প্রস্থ" : "Stair Width"}
                value={customization.stairWidthMm + "mm"}
              />
              <Stat
                label={lang === "bn" ? "করিডোর প্রস্থ" : "Corridor Width"}
                value={customization.corridorWidthMm + "mm"}
              />
              <Stat
                label={lang === "bn" ? "ভ্রমণ দূরত্ব" : "Travel Distance"}
                value={customization.travelDistanceMaxM + "m"}
              />
              <Stat
                label={lang === "bn" ? "স্প্রিংকলার কভারেজ (m²)" : "Sprinkler Coverage (m²)"}
                value={fmtNum(sprinklerArea, lang)}
              />
              <Stat
                label={lang === "bn" ? "স্প্রিংকলার খরচ" : "Sprinkler Cost"}
                value={fmtBdt(sprinklerCost, lang)}
              />
            </div>
          </Card>
        </>
      )}

      {/* Fire Safety Status */}
      <Card>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "ফায়ার সেফটি স্ট্যাটাস" : "Fire Safety Status"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          <Badge tone={customization.enabled ? "sage" : "neutral"}>
            {lang === "bn" ? "ফায়ার সেফটি সক্রিয়" : "Fire Safety Active"}
          </Badge>
          <Badge tone={isCompliant ? "sage" : "blush"}>
            {lang === "bn" ? "ইগ্রেস সম্মতি" : "Egress Compliance"}
          </Badge>
          <Badge tone={customization.sprinklerSystem ? "sage" : "neutral"}>
            {lang === "bn" ? "স্প্রিংকলার" : "Sprinklers"}
          </Badge>
          <Badge tone={customization.smokeDetector ? "sage" : "neutral"}>
            {lang === "bn" ? "স্মোক ডিটেক্টর" : "Smoke Detection"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
