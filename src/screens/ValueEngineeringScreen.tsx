import { useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useProjectCustomization } from "../hooks/useProjectCustomization";
import { DEFAULT_VALUE_ENGINEERING } from "../types/customization";
import { fmtNum, fmtBdt } from "../i18n";
import type { ValueEngineeringSettings } from "../types/customization";

export function ValueEngineeringScreen() {
  const { lang } = useI18n();
  const { project, customization, updateCustomization, isLoading } = useProjectCustomization<ValueEngineeringSettings>(
    "valueEngineering",
    DEFAULT_VALUE_ENGINEERING,
  );

  if (isLoading || !project || !customization) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "মূল্য প্রকৌশল" : "Value Engineering"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  // Mock value engineering suggestions
  const suggestions = [
    {
      id: "prefab-walls",
      title: lang === "bn" ? "প্রি-ফ্যাব্রিকেট ওয়াল প্যানেল" : "Prefabricated Wall Panels",
      description: lang === "bn" 
        ? "ফ্যাক্টরিতে তৈরি ওয়াল প্যানেল দিয়ে নির্মাণ গতি ৩০% বাড়ানো যাবে"
        : "Factory-made wall panels can speed up construction by 30%",
      impact: { cost: -1200000, time: -15, quality: 1 },
      category: "structure",
      applicable: project.stories >= 4,
    },
    {
      id: "opt-foundations",
      title: lang === "bn" ? "অপটিমাইজড ফাউন্ডেশন" : "Optimized Foundation Design",
      description: lang === "bn"
        ? "সঠিক সয়েল টেস্টিং অনুযায়ী ফাউন্ডেশন সাইজ অপটিমাইজ করা হবে"
        : "Foundation sizing optimized based on actual soil test results",
      impact: { cost: -800000, time: -5, quality: 1 },
      category: "structure",
      applicable: project.plotSize > 3,
    },
    {
      id: "bulk-materials",
      title: lang === "bn" ? "বাল্ক ম্যাটেরিয়াল ক্রয়" : "Bulk Material Procurement",
      description: lang === "bn"
        ? "বাল্ক অর্ডারে সিমেন্ট, ইট, স্টিল কিনলে ৮-১২% সাশ্রয় হবে"
        : "8-12% savings on cement, bricks, and steel through bulk ordering",
      impact: { cost: -950000, time: 0, quality: 0 },
      category: "procurement",
      applicable: true,
    },
    {
      id: "modular-design",
      title: lang === "bn" ? "মডুলার ডিজাইন অ্যাডপশন" : "Modular Design Adoption",
      description: lang === "bn"
        ? "স্ট্যান্ডার্ডাইজড রুম সাইজ দিয়ে প্ল্যানিং করা হবে"
        : "Standardized room sizes to reduce cutting waste and improve efficiency",
      impact: { cost: -600000, time: -10, quality: 1 },
      category: "design",
      applicable: project.stories >= 2,
    },
  ];

  const filteredSuggestions = suggestions.filter(s => s.applicable);

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "মূল্য প্রকৌশল সেটিংস" : "Value Engineering Settings"}
        subtitle={customization.enabled ? lang === "bn" ? "সক্রিয়" : "Enabled" : lang === "bn" ? "অসক্রিয়" : "Optional"}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      {/* Value Engineering Toggle */}
      <Card style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: "16px" }}>
          <label style={{ display: "flex", alignItems: "center", fontSize: "16px", fontWeight: 600 }} htmlFor="ve-enabled-checkbox">
            <input
              id="ve-enabled-checkbox"
              type="checkbox"
              checked={customization.enabled}
              onChange={(e) => updateCustomization("enabled", e.target.checked)}
              style={{ marginRight: "12px", width: "20px", height: "20px" }}
            />
            {lang === "bn" ? "মূল্য প্রকৌশল সুবিধা সক্রিয় করুন" : "Enable Value Engineering Suggestions"}
          </label>
        </div>
        <p style={{ fontSize: "14px", opacity: 0.8, lineHeight: "1.5" }}>
          {lang === "bn"
            ? "মূল্য প্রকৌশল সাশ্রয়ে সাহায্য করে কোনো মান হ্রাস ছাড়াই খরচ কমানো যায়। এই বৈশিষ্ট্যটি ভবিষ্যতে পেইড সংস্করণে উন্নত করা হবে।"
            : "Value engineering helps reduce costs without compromising quality. This feature will be enhanced in future paid versions."}
        </p>
      </Card>

      {customization.enabled && (
        <>
          {/* Value Engineering Suggestions */}
          <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            {filteredSuggestions.map((suggestion) => (
              <Card key={suggestion.id} style={{ flex: 1, minWidth: "350px" }}>
                <h3 style={{ marginBottom: "8px", color: "var(--text-primary)" }}>
                  {suggestion.title}
                </h3>
                <p style={{ fontSize: "14px", opacity: 0.8, marginBottom: "16px" }}>
                  {suggestion.description}
                </p>
                
                <div className="row" style={{ gap: "8px", marginBottom: "16px" }}>
                  <Badge tone={suggestion.impact.cost < 0 ? "sage" : "amber"}>
                    {lang === "bn" ? "খরচ সাশ্রয়" : "Cost Impact"}
                    {suggestion.impact.cost < 0 && ` ${fmtBdt(Math.abs(suggestion.impact.cost), lang)}`}
                  </Badge>
                  <Badge tone={suggestion.impact.time < 0 ? "sage" : "neutral"}>
                    {lang === "bn" ? "সময় সাশ্রয়" : "Time Impact"}
                    {suggestion.impact.time < 0 && ` ${Math.abs(suggestion.impact.time)} দিন`}
                  </Badge>
                  <Badge tone={suggestion.impact.quality > 0 ? "sage" : "blush"}>
                    {lang === "bn" ? "মান" : "Quality"}
                    {suggestion.impact.quality > 0 && " ⬆"}
                    {suggestion.impact.quality < 0 && " ⬇"}
                  </Badge>
                </div>

                <div className="row" style={{ gap: "8px" }}>
                  <Button variant="soft" style={{ flex: 1 }}>
                    {lang === "bn" ? "বিস্তারিত" : "Details"}
                  </Button>
                  <Button variant="primary" style={{ flex: 1 }}>
                    {lang === "bn" ? "প্রয়োগ করুন" : "Apply"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {/* Total Savings Summary */}
          <Card style={{ marginBottom: "16px" }}>
            <h3 style={{ marginBottom: "12px" }}>
              {lang === "bn" ? "সাশ্রয় সারাংশ" : "Total Savings Summary"}
            </h3>
            <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
              <Stat
                label={lang === "bn" ? "সর্বোচ্চ সাশ্রয়" : "Max Savings"}
                value={fmtBdt(
                  filteredSuggestions.reduce((sum, s) => sum + Math.max(0, s.impact.cost), 0),
                  lang
                )}
              />
              <Stat
                label={lang === "bn" ? "সময় সাশ্রয়" : "Time Saved"}
                value={`${filteredSuggestions.reduce((sum, s) => sum + Math.max(0, -s.impact.time), 0)} ${lang === "bn" ? "দিন" : "days"}`}
              />
              <Stat
                label={lang === "bn" ? "মান উন্নতি" : "Quality Improvements"}
                value={filteredSuggestions.filter(s => s.impact.quality > 0).length.toString()}
              />
            </div>
          </Card>
        </>
      )}

      {/* Value Engineering Status */}
      <Card>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "মূল্য প্রকৌশল স্ট্যাটাস" : "Value Engineering Status"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          <Badge tone={customization.enabled ? "sage" : "neutral"}>
            {lang === "bn" ? "মূল্য প্রকৌশল" : "Value Engineering"}
          </Badge>
          <Badge tone="amber">
            {lang === "bn" ? "বিটা ফিচার" : "Beta Feature"}
          </Badge>
          <Badge tone="neutral">
            {lang === "bn" ? "স্টাব ইমপ্লিমেন্টেশন" : "Stub Implementation"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}