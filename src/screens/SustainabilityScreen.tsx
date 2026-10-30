import { useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useProjectCustomization } from "../hooks/useProjectCustomization";
import { DEFAULT_SUSTAINABILITY_DHAKA } from "../types/customization";
import { fmtNum, fmtBdt } from "../i18n";
import type { SustainabilitySettings } from "../types/customization";

export function SustainabilityScreen() {
  const { lang } = useI18n();
  const { project, customization, updateCustomization, isLoading } = useProjectCustomization<SustainabilitySettings>(
    "sustainability",
    DEFAULT_SUSTAINABILITY_DHAKA,
  );

  if (isLoading || !project || !customization) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "টেকসই নকশা সেটিংস" : "Sustainability Settings"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  // Dhaka-specific calculations
  const roofArea = (project.plotSqm || 200) * 0.7;
  const tankSizeM3 = Math.round((roofArea * customization.annualRainfallMm / 1000 * customization.tankEfficiency) * 10) / 10;
  const tankCost = tankSizeM3 > 5 ? Math.round(tankSizeM3 * 8500) : 0;
  const annualSavings = tankSizeM3 > 5 ? Math.round(tankSizeM3 * 8500 * 0.15) : 0; // 15% water savings

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "টেকসই নকশা সেটিংস" : "Sustainability Settings"}
        subtitle={`Dhaka climate optimized (${customization.annualRainfallMm}mm annual rainfall)`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      {/* Rainwater Harvesting */}
      <Card style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "বৃষ্টি জল সংগ্রহ" : "Rainwater Harvesting"}
        </h3>
        <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "250px" }}>
            <label htmlFor="sus-annual-rainfall" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "বার্ষিক বৃষ্টিপাত (mm) :" : "Annual Rainfall (mm)"}
            </label>
            <input id="sus-annual-rainfall"
              type="number"
              min="1500"
              max="3000"
              value={customization.annualRainfallMm}
              onChange={(e) => updateCustomization("annualRainfallMm", parseInt(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: "250px" }}>
            <label htmlFor="sus-tank-efficiency" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "ট্যাঙ্ক দক্ষতা (%):" : "Tank Efficiency (%)"}
            </label>
            <input id="sus-tank-efficiency"
              type="number"
              min="60"
              max="95"
              step="5"
              value={customization.tankEfficiency * 100}
              onChange={(e) => updateCustomization("tankEfficiency", parseInt(e.target.value) / 100)}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
        </div>
        <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
          <Stat
            label={lang === "bn" ? "ট্যাঙ্ক ধারণক্ষমতা (m³)" : "Tank Capacity (m³)"}
            value={fmtNum(tankSizeM3, lang)}
          />
          <Stat
            label={lang === "bn" ? "বিনিয়োগ খরচ" : "Investment Cost"}
            value={fmtBdt(tankCost, lang)}
          />
          <Stat
            label={lang === "bn" ? "বছরে সঞ্চয়" : "Annual Savings"}
            value={fmtBdt(annualSavings, lang)}
          />
        </div>
      </Card>

      {/* Building Envelope */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "ছাদ ইনসুলেশন" : "Roof Insulation"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="sus-roof-uvalue" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "U-Value (W/m²K):" : "U-Value (W/m²K)"}
            </label>
            <input id="sus-roof-uvalue"
              type="number"
              min="0.3"
              max="2.0"
              step="0.1"
              value={customization.roofUValue}
              onChange={(e) => updateCustomization("roofUValue", parseFloat(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
          <div style={{ fontSize: "12px", opacity: 0.7 }}>
            {lang === "bn" 
              ? "কম U-Value = ভাল ইনসুলেশন = কম শীতলীকরণ খরচ"
              : "Lower U-Value = Better insulation = Lower cooling costs"}
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "দেয়াল ইনসুলেশন" : "Wall Insulation"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="sus-wall-uvalue" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "U-Value (W/m²K):" : "U-Value (W/m²K)"}
            </label>
            <input id="sus-wall-uvalue"
              type="number"
              min="0.5"
              max="2.5"
              step="0.1"
              value={customization.wallUValue}
              onChange={(e) => updateCustomization("wallUValue", parseFloat(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "জানালা ইনসুলেশন" : "Window Insulation"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="sus-window-uvalue" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "U-Value (W/m²K):" : "U-Value (W/m²K)"}
            </label>
            <input id="sus-window-uvalue"
              type="number"
              min="1.5"
              max="6.0"
              step="0.5"
              value={customization.windowUValue}
              onChange={(e) => updateCustomization("windowUValue", parseFloat(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
        </Card>
      </div>

      {/* Daylight & Ventilation */}
      <Card style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "দিবালোক ও বায়ুচলাচল" : "Daylight & Ventilation"}
        </h3>
        <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "250px" }}>
            <label htmlFor="sus-window-to-floor-ratio" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "জানালা-তলা অনুপাত (min):" : "Window-to-Floor Ratio (min)"}
            </label>
            <input id="sus-window-to-floor-ratio"
              type="number"
              min="0.10"
              max="0.30"
              step="0.01"
              value={customization.windowToFloorRatioMin}
              onChange={(e) => updateCustomization("windowToFloorRatioMin", parseFloat(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: "250px" }}>
            <label htmlFor="sus-daylight-factor" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
              {lang === "bn" ? "দিবালোক ফ্যাক্টর (%):" : "Daylight Factor Target (%)"}
            </label>
            <input id="sus-daylight-factor"
              type="number"
              min="1.0"
              max="5.0"
              step="0.5"
              value={customization.daylightFactorTarget}
              onChange={(e) => updateCustomization("daylightFactorTarget", parseFloat(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
            />
          </div>
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7 }}>
          {lang === "bn"
            ? "BNBC 2020 §4.4: প্রতি কক্ষে অন্তত ১৫% জানালা থাকা আবশ্যক"
            : "BNBC 2020 §4.4: Minimum 15% window area per room required"}
        </div>
      </Card>

      {/* Cooling Load */}
      <Card style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "শীতলীকরণ লোড" : "Cooling Load Factor"}
        </h3>
        <div style={{ marginBottom: "16px" }}>
          <label htmlFor="sus-cooling-load" style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
            {lang === "bn" ? "ফ্যাক্টর (W/m²):" : "Factor (W/m²)"}
          </label>
          <input id="sus-cooling-load"
            type="number"
            min="8"
            max="20"
            step="1"
            value={customization.coolingLoadFactor}
            onChange={(e) => updateCustomization("coolingLoadFactor", parseInt(e.target.value))}
            style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
          />
        </div>
        <div style={{ fontSize: "12px", opacity: 0.7 }}>
          {lang === "bn"
            ? "ডাকার গড় তাপমাত্রা ৩০°C, আর্দ্রতা ৭৫%"
            : "Dhaka average: 30°C temperature, 75% humidity"}
        </div>
      </Card>

      {/* Sustainability Summary */}
      <Card>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "টেকসই প্রভাব" : "Sustainability Impact"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          <Badge tone={tankCost > 0 ? "sage" : "neutral"}>
            {lang === "bn" ? "জল সংরক্ষণ" : "Water Conservation"}
          </Badge>
          <Badge tone="sage">
            {lang === "bn" ? "শক্তি দক্ষতা" : "Energy Efficiency"}
          </Badge>
          <Badge tone="sage">
            {lang === "bn" ? "দিবালোক অ্যাক্সেস" : "Daylight Access"}
          </Badge>
          <Badge tone={tankCost > 0 ? "amber" : "neutral"}>
            {lang === "bn" ? "কার্বন ফুটপ্রিন্ট" : "Carbon Footprint"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}
