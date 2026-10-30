import { useEffect } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useProjectCustomization } from "../hooks/useProjectCustomization";
import { DEFAULT_ACCESSIBILITY } from "../types/customization";
import { fmtNum, fmtBdt } from "../i18n";
import type { AccessibilitySettings } from "../types/customization";

export function AccessibilityScreen() {
  const { lang } = useI18n();
  const { project, customization, updateCustomization, isLoading } = useProjectCustomization<AccessibilitySettings>(
    "accessibility",
    DEFAULT_ACCESSIBILITY,
  );

  if (isLoading || !project || !customization) {
    return (
      <div className="screen">
        <PageHeader title={lang === "bn" ? "অ্যাক্সেসিবিলিটি সেটিংস" : "Accessibility Settings"} subtitle="Loading..." />
        <Card>Loading project...</Card>
      </div>
    );
  }

  const elevatorCost = customization.elevatorRequired ? 450000 : 0;
  const rampLength = project.stories > 1 ? (project.stories * 3) : 3;
  const rampConcrete = rampLength * customization.rampWidthMm * 0.15 / 1000000;

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "অ্যাক্সেসিবিলিটি সেটিংস" : "Accessibility Settings"}
        subtitle={`Applied by default — changes affect 3D model and BOQ`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="primary">
              {lang === "bn" ? "সংরক্ষণ করা হয়েছে" : "Saved"}
            </Button>
          </div>
        }
      />

      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "স্লোপ ও র্যাম্প" : "Ramps & Slopes"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }} htmlFor="ramp-slope-input">
              {lang === "bn" ? "সরলরেখা ঢাল (%) :" : "Maximum Ramp Slope (%)"}
            </label>
            <input
              type="number"
              min="5"
              max="20"
              value={customization.rampSlope}
              onChange={(e) => updateCustomization("rampSlope", parseInt(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              id="ramp-slope-input"
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }} htmlFor="ramp-width-input">
              {lang === "bn" ? "র্যাম্প প্রস্থ (mm) :" : "Ramp Width (mm)"}
            </label>
            <input
              type="number"
              min="900"
              max="1500"
              value={customization.rampWidthMm}
              onChange={(e) => updateCustomization("rampWidthMm", parseInt(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              id="ramp-width-input"
            />
          </div>
        </Card>

        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "দরবازه ও পথ" : "Doors & Paths"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }} htmlFor="door-width-input">
              {lang === "bn" ? "দরবازه ক্লিয়ার প্রস্থ (mm) :" : "Door Clear Width (mm)"}
            </label>
            <input
              type="number"
              min="800"
              max="1200"
              value={customization.doorClearWidthMm}
              onChange={(e) => updateCustomization("doorClearWidthMm", parseInt(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              id="door-width-input"
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "4px", fontSize: "14px" }} htmlFor="tactile-width-input">
              {lang === "bn" ? "ট্যাকটাইল পথ প্রস্থ (mm) :" : "Tactile Path Width (mm)"}
            </label>
            <input
              type="number"
              min="300"
              max="600"
              value={customization.tactilePathWidthMm}
              onChange={(e) => updateCustomization("tactilePathWidthMm", parseInt(e.target.value))}
              style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              id="tactile-width-input"
            />
          </div>
        </Card>
      </div>

      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "লিফট সেটিংস" : "Elevator Settings"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="elevator-required-checkbox" style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>
              <input
                id="elevator-required-checkbox"
                type="checkbox"
                checked={customization.elevatorRequired}
                onChange={(e) => updateCustomization("elevatorRequired", e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              {lang === "bn" ? "লিফট প্রয়োজনীয়" : "Elevator Required"}
            </label>
            <p style={{ fontSize: "12px", opacity: 0.7, marginTop: "4px" }}>
              {lang === "bn" 
                ? "BNBC 2020 অনুযায়ী ৪ তলার বেশি ভবনে লিফট বাধ্যতামূলক"
                : "Mandatory for buildings with 4+ stories per BNBC 2020"}
            </p>
          </div>
          {customization.elevatorRequired && (
            <div style={{ opacity: 0.8 }}>
              <Stat
                label={lang === "bn" ? "লিফট খরচ" : "Elevator Cost"}
                value={fmtBdt(elevatorCost, lang)}
              />
              <div style={{ fontSize: "12px", marginTop: "4px", opacity: 0.7 }}>
                {lang === "bn" ? "৮ জন ধারণক্ষমতা, গিয়ারলেস ট্র্যাকশন" : "8-person capacity, gearless traction"}
              </div>
            </div>
          )}
        </Card>

        <Card style={{ flex: 1, minWidth: "300px" }}>
          <h3 style={{ marginBottom: "12px" }}>
            {lang === "bn" ? "ওসি ও বিশেষ সুবিধা" : "WC & Special Features"}
          </h3>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "8px", fontSize: "14px" }} htmlFor="wc-clear-width-input">
              {lang === "bn" ? "ওসি ক্লিয়ারেন্স (mm) :" : "WC Clearance (mm)"}
            </label>
            <div className="row" style={{ gap: "8px" }}>
              <input
                id="wc-clear-width-input"
                type="number"
                min="1200"
                max="2000"
                value={customization.wcClearMm[0]}
                onChange={(e) => updateCustomization("wcClearMm", [parseInt(e.target.value), customization.wcClearMm[1]])}
                style={{ flex: 1, padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              />
              <span style={{ display: "flex", alignItems: "center" }}>×</span>
              <input
                type="number"
                id="wc-clear-depth-input"
                min="1200"
                max="2000"
                value={customization.wcClearMm[1]}
                onChange={(e) => updateCustomization("wcClearMm", [customization.wcClearMm[0], parseInt(e.target.value)])}
                style={{ flex: 1, padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              />
            </div>
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label htmlFor="braille-signage-checkbox" style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>
              <input
                id="braille-signage-checkbox"
                type="checkbox"
                checked={customization.brailleSignage}
                onChange={(e) => updateCustomization("brailleSignage", e.target.checked)}
                style={{ marginRight: "8px" }}
              />
              {lang === "bn" ? "ব্রেইল সাইনেজ" : "Braille Signage"}
            </label>
          </div>
        </Card>
      </div>

      {/* Cost Impact Summary */}
      <Card style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "খরচ প্রভাব" : "Cost Impact"}
        </h3>
        <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
          <Stat
            label={lang === "bn" ? "লিফট খরচ" : "Elevator Cost"}
            value={fmtBdt(elevatorCost, lang)}
          />
          <Stat
            label={lang === "bn" ? "র্যাম্প কংক্রিট (m³)" : "Ramp Concrete (m³)"}
            value={fmtNum(rampConcrete, lang)}
          />
          <Stat
            label={lang === "bn" ? "গ্র্যাব রেল হাইট" : "Grab Rail Height"}
            value={`${customization.grabRailHeightMm}mm`}
          />
        </div>
      </Card>

      {/* Accessibility Status */}
      <Card>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "অ্যাক্সেসিবিলিটি স্ট্যাটাস" : "Accessibility Status"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          <Badge tone="sage">
            {lang === "bn" ? "র্যাম্প সক্রিয়" : "Ramp Active"}
          </Badge>
          <Badge tone="sage">
            {lang === "bn" ? "ট্যাকটাইল পথ" : "Tactile Path"}
          </Badge>
          <Badge tone={customization.elevatorRequired ? "sage" : "neutral"}>
            {lang === "bn" ? "লিফট সক্রিয়" : "Elevator Optional"}
          </Badge>
          <Badge tone="sage">
            {lang === "bn" ? "ব্রেইল সাইনেজ" : "Braille Signage"}
          </Badge>
        </div>
      </Card>
    </div>
  );
}