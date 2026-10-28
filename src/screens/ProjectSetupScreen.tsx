import { useState } from "react";
import { useI18n, fmtNum } from "../i18n";
import { Button, Card, PageHeader, Callout } from "../ui/kit";
import { createNewProject, generateRandomBuildingProject, plotToSqm } from "../engine/projectState";

interface Props {
  onNavigate: (id: string) => void;
  onProjectCreated?: () => void;
}

export function ProjectSetupScreen({ onNavigate, onProjectCreated }: Props) {
  const { t, lang } = useI18n();

  const [name, setName] = useState("Dhanmondi Residential Building");
  const [stories, setStories] = useState<number>(6);
  const [plotSize, setPlotSize] = useState<number>(3.5);
  const [plotUnit, setPlotUnit] = useState<"katha" | "decimal" | "sqft" | "sqm">("katha");
  const [unitsPerFloor, setUnitsPerFloor] = useState<number>(2);
  const [location, setLocation] = useState("Dhaka (RAJUK)");
  const [error, setError] = useState<string | null>(null);

  const calculatedSqm = Math.round(plotToSqm(plotSize, plotUnit) * 100) / 100;
  const calculatedSqft = Math.round(calculatedSqm * 10.7639);

  const handleCreate = () => {
    if (!name.trim()) {
      setError(lang === "bn" ? "অনুগ্রহ করে প্রকল্পের নাম লিখুন।" : "Please enter a project name.");
      return;
    }
    if (stories < 1 || stories > 30) {
      setError(lang === "bn" ? "তলা সংখ্যা ১ থেকে ৩০ এর মধ্যে হতে হবে।" : "Stories must be between 1 and 30.");
      return;
    }
    if (plotSize <= 0) {
      setError(lang === "bn" ? "জমির পরিমাণ সঠিকভাবে দিন।" : "Please enter a valid plot size.");
      return;
    }

    const project = createNewProject({
      name: name.trim(),
      stories,
      plotSize,
      plotUnit,
      unitsPerFloor,
      address: location,
    });

    onProjectCreated?.();
    // Navigate straight to the first phase interview
    onNavigate(`phase:${project.phases[0].id}`);
  };

  const handleRandomGenerate = () => {
    generateRandomBuildingProject();
    onProjectCreated?.();
    onNavigate("design:final");
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "নতুন আবাসিক ভবন প্রকল্প শুরু করুন" : "Start New Residential Project"}
        subtitle={
          lang === "bn"
            ? "ভবনের মৌলিক তথ্য দিন — লোকাল এআই স্বয়ংক্রিয়ভাবে পর্যায়ক্রম তৈরি করবে"
            : "Enter basic building specifications — the AI will structure the construction phases"
        }
        actions={
          <Button
            variant="primary"
            style={{ background: "var(--tone-brand, #3b82f6)", display: "flex", alignItems: "center", gap: "6px" }}
            onClick={handleRandomGenerate}
          >
            🎲 {lang === "bn" ? "র্যান্ডম ভবন তৈরি করুন" : "Generate Random Building"}
          </Button>
        }
      />

      <div className="grid-2">
        {/* Left Column: Form Inputs */}
        <Card className="stack">
          <h3>{lang === "bn" ? "১. ভবনের তথ্য" : "1. Building Specifications"}</h3>

          {/* Project Name */}
          <div className="field">
            <label className="field-label">{t("setupNameLabel")}</label>
            <input
              className="input"
              value={name}
              placeholder="e.g. Uttara Sector 3 Residence"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Number of Stories */}
          <div className="field">
            <label className="field-label">
              {lang === "bn" ? "তলা সংখ্যা (Stories / Floors)" : "Number of Stories"}
            </label>
            <div className="row" style={{ gap: "8px" }}>
              <input
                type="number"
                min={1}
                max={30}
                className="input"
                style={{ width: "120px" }}
                value={stories}
                onChange={(e) => setStories(Number(e.target.value) || 1)}
              />
              <div className="row" style={{ gap: "6px" }}>
                {[2, 4, 6, 8].map((s) => (
                  <Button
                    key={s}
                    variant={stories === s ? "primary" : "soft"}
                    onClick={() => setStories(s)}
                  >
                    {s} {lang === "bn" ? "তলা" : s === 2 ? "Stories (Duplex)" : "Stories"}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Plot Size & Unit */}
          <div className="field">
            <label className="field-label">
              {lang === "bn" ? "জমির পরিমাণ ও একক" : "Plot Size & Unit"}
            </label>
            <div className="row" style={{ gap: "8px" }}>
              <input
                type="number"
                step="0.1"
                min={0.1}
                className="input"
                style={{ width: "120px" }}
                value={plotSize}
                onChange={(e) => setPlotSize(Number(e.target.value) || 1)}
              />
              <select
                className="input"
                style={{ width: "140px" }}
                value={plotUnit}
                onChange={(e) => setPlotUnit(e.target.value as "katha" | "decimal" | "sqft" | "sqm")}
              >
                <option value="katha">কাঠা (Katha)</option>
                <option value="decimal">শতক / ডেসিমাল (Decimal)</option>
                <option value="sqft">বর্গফুট (Sq.ft)</option>
                <option value="sqm">বর্গমিটার (Sq.m)</option>
              </select>
            </div>
            <div className="row" style={{ gap: "6px", marginTop: "6px" }}>
              {[2, 3, 4, 5].map((k) => (
                <Button
                  key={k}
                  variant={plotSize === k && plotUnit === "katha" ? "primary" : "ghost"}
                  onClick={() => {
                    setPlotSize(k);
                    setPlotUnit("katha");
                  }}
                >
                  {k} {lang === "bn" ? "কাঠা" : "Katha"}
                </Button>
              ))}
            </div>
            <span className="faint small" style={{ marginTop: "4px" }}>
              ≈ {calculatedSqm} m² ({calculatedSqft} sq.ft)
            </span>
          </div>

          {/* Units Per Floor */}
          <div className="field">
            <label className="field-label">
              {lang === "bn" ? "প্রতি তলায় ফ্ল্যাট / ইউনিট সংখ্যা" : "Units Per Floor"}
            </label>
            <div className="row" style={{ gap: "6px" }}>
              {[1, 2, 3, 4].map((u) => (
                <Button
                  key={u}
                  variant={unitsPerFloor === u ? "primary" : "soft"}
                  onClick={() => setUnitsPerFloor(u)}
                >
                  {u} {lang === "bn" ? "ইউনিট" : u === 1 ? "Single Unit" : "Units"}
                </Button>
              ))}
            </div>
          </div>

          {/* Location */}
          <div className="field">
            <label className="field-label">
              {lang === "bn" ? "অবস্থান ও অনুমোদনকারী কর্তৃপক্ষ" : "Location & Authority"}
            </label>
            <select
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="Dhaka (RAJUK)">Dhaka (RAJUK — রাজউক বিধিমালা ২০০৮ / বিএনবিসি ২০২০)</option>
              <option value="Chittagong (CDA)">Chittagong (CDA — চট্টগ্রাম উন্নয়ন কর্তৃপক্ষ)</option>
              <option value="Sylhet (SCC)">Sylhet (SCC — সিলেট সিটি কর্পোরেশন / জোন ৩)</option>
              <option value="Pourashava / District">Pourashava / Municipality (পৌরসভা বিধিমালা)</option>
            </select>
          </div>
        </Card>

        {/* Right Column: Dynamic Phase Preview */}
        <Card className="stack">
          <h3>
            {lang === "bn" ? "২. পর্যায়ক্রমিক প্রিভিউ" : "2. Generated Phase Breakdown"}
          </h3>
          <p className="muted small">
            {lang === "bn"
              ? `আপনার ${stories} তলা ভবনের জন্য নিচের পর্যায়গুলো তৈরি হবে:`
              : `Your ${stories}-storey structure will be partitioned into the following sequential planning phases:`}
          </p>

          <div className="stack" style={{ gap: "6px" }}>
            <div className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
              <span style={{ fontWeight: 600, width: "24px" }}>1.</span>
              <span className="grow">{lang === "bn" ? "সাইট ও খনন (Site & Excavation)" : "Site & Excavation"}</span>
              <span className="faint small">Depth ~1.8m</span>
            </div>
            <div className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
              <span style={{ fontWeight: 600, width: "24px" }}>2.</span>
              <span className="grow">{lang === "bn" ? "ফাউন্ডেশন ও ফুটিং (Foundation & Piles)" : "Foundation & Footings"}</span>
              <span className="faint small">{stories >= 6 ? "Bored Piles" : "Isolated Footings"}</span>
            </div>
            <div className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
              <span style={{ fontWeight: 600, width: "24px" }}>3.</span>
              <span className="grow">{lang === "bn" ? "নিচতলা পার্কিং (Ground Floor)" : "Ground Floor (Parking & Entry)"}</span>
              <span className="faint small">{unitsPerFloor} cars+</span>
            </div>

            {Array.from({ length: stories - 1 }).map((_, i) => (
              <div
                key={i}
                className="row"
                style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}
              >
                <span style={{ fontWeight: 600, width: "24px" }}>{i + 4}.</span>
                <span className="grow">
                  {lang === "bn" ? `${fmtNum(i + 1, lang)}ম তলা` : `Floor ${i + 1}`} ({unitsPerFloor} {lang === "bn" ? "ইউনিট" : "Units"})
                </span>
                <span className="faint small">RCC Slab 125mm</span>
              </div>
            ))}

            <div className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
              <span style={{ fontWeight: 600, width: "24px" }}>{stories + 3}.</span>
              <span className="grow">{lang === "bn" ? "ছাদ ও সীমানা প্রাচীর (Rooftop & Boundary)" : "Rooftop & Boundary"}</span>
              <span className="faint small">Parapet + Tank</span>
            </div>

            <div className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: "6px" }}>
              <span style={{ fontWeight: 600, width: "24px" }}>{stories + 4}.</span>
              <span className="grow">{lang === "bn" ? "ইউটিলিটি ও সাধারণ সেবা (Utilities & Services)" : "Utilities & Common Services"}</span>
              <span className="faint small">Septic + Pump</span>
            </div>
          </div>

          <Callout title={lang === "bn" ? "এআই সহায়ক" : "AI Workflow"}>
            <span>
              {lang === "bn"
                ? "প্রতিটি পর্যায়ে এআই ইঞ্জিনিয়ার আপনাকে নির্দেশনা দেবে ও পরিমাপ হিসাব করবে। সব পর্যায় শেষ হলে সম্পূর্ণ ৩D মডেল ও BOQ তৈরি হবে।"
                : "The civil AI copilot will guide you through each phase and calculate engineering parameters. Once all phases are approved, 3D CAD and BOQ will be rendered."}
            </span>
          </Callout>

          {error ? (
            <div style={{ color: "var(--tone-blush, #ef4444)", fontSize: "13px" }}>
              ⚠ {error}
            </div>
          ) : null}

          <Button
            variant="primary"
            style={{ marginTop: "12px", width: "100%", padding: "12px", fontSize: "15px" }}
            onClick={handleCreate}
          >
            {lang === "bn" ? "পরিকল্পনা শুরু করুন (Create Project & Start) ➔" : "Create Project & Start Planning ➔"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
