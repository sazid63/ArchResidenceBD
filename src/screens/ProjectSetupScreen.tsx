import { useState, useEffect } from "react";
import { useI18n, fmtNum } from "../i18n";
import { Button, Card, PageHeader, Callout } from "../ui/kit";
import { createNewProject, generateRandomBuildingProject, plotToSqm } from "../engine/projectState";
import { getFloorPlansByUnits, getRandomFloorPlan, FloorPlanImage } from "../data/bangladeshFloorplans";
import { FloorplanPreview } from "../components/FloorplanPreview";

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
  const [selectedFloorplan, setSelectedFloorplan] = useState<FloorPlanImage | null>(null);
  const [showFloorplanGallery, setShowFloorplanGallery] = useState(false);

  const calculatedSqm = Math.round(plotToSqm(plotSize, plotUnit) * 100) / 100;
  const calculatedSqft = Math.round(calculatedSqm * 10.7639);

  // Auto-select random floorplan when unitsPerFloor changes
  useEffect(() => {
    const plan = getRandomFloorPlan(unitsPerFloor);
    setSelectedFloorplan(plan);
  }, [unitsPerFloor]);

  const availableFloorplans = getFloorPlansByUnits(unitsPerFloor);

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
            <label className="field-label" htmlFor="project-name-input">
              {t("setupNameLabel")}
            </label>
            <input
              id="project-name-input"
              className="input"
              value={name}
              placeholder="e.g. Uttara Sector 3 Residence"
              onChange={(e) => setName(e.target.value)}
              aria-required="true"
            />
          </div>

          {/* Number of Stories */}
          <div className="field">
            <label className="field-label" htmlFor="project-stories-input">
              {lang === "bn" ? "তলা সংখ্যা (Stories / Floors)" : "Number of Stories"}
            </label>
            <div className="row" style={{ gap: "8px" }}>
              <input
                id="project-stories-input"
                type="number"
                min={1}
                max={30}
                className="input"
                style={{ width: "120px" }}
                value={stories}
                onChange={(e) => setStories(Number(e.target.value) || 1)}
                aria-required="true"
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
            <label className="field-label" htmlFor="project-plot-size-input">
              {lang === "bn" ? "জমির পরিমাণ ও একক" : "Plot Size & Unit"}
            </label>
            <div className="row" style={{ gap: "8px" }}>
              <input
                id="project-plot-size-input"
                type="number"
                step="0.1"
                min={0.1}
                className="input"
                style={{ width: "120px" }}
                value={plotSize}
                onChange={(e) => setPlotSize(Number(e.target.value) || 1)}
                aria-required="true"
              />
              <select
                id="project-plot-unit-select"
                className="input"
                style={{ width: "140px" }}
                value={plotUnit}
                onChange={(e) => setPlotUnit(e.target.value as "katha" | "decimal" | "sqft" | "sqm")}
                aria-label={lang === "bn" ? "জমির একক" : "Plot unit"}
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

          {/* Units Per Floor with Floorplan Gallery */}
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

          {/* Floorplan Gallery - Show 2D floorplan images for the selected unit count */}
          <div className="field">
            <label className="field-label">
              {lang === "bn" ? "ফ্লোরপ্ল্যান বিন্যাস (২D চিত্র সহ)" : "Floorplan Layout (with 2D Preview)"}
            </label>
            <div style={{ marginBottom: "8px" }}>
              <Button
                variant={showFloorplanGallery ? "primary" : "soft"}
                onClick={() => setShowFloorplanGallery(!showFloorplanGallery)}
              >
                {showFloorplanGallery
                  ? (lang === "bn" ? "গ্যালারি লুকান" : "Hide Gallery")
                  : (lang === "bn" ? "ফ্লোরপ্ল্যান গ্যালারি দেখুন" : "Show Floorplan Gallery")}
              </Button>
              <span className="faint small" style={{ marginLeft: "8px" }}>
                {availableFloorplans.length} {lang === "bn" ? "ডিজাইন উপলব্ধ" : "designs available"}
              </span>
            </div>

            {/* Selected Floorplan Preview */}
            {selectedFloorplan && (
              <div className="card" style={{ marginBottom: "12px", padding: "8px" }}>
                <div className="row" style={{ gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <FloorplanPreview plan={selectedFloorplan} size={240} />
                  <div className="stack" style={{ flex: 1, minWidth: "200px" }}>
                    <h4 style={{ margin: 0, fontSize: "14px" }}>
                      {selectedFloorplan?.titleBn || selectedFloorplan?.title || ""}
                    </h4>
                    <p style={{ margin: "4px 0", fontSize: "12px", color: "var(--muted)" }}>
                      {selectedFloorplan?.descriptionBn || selectedFloorplan?.description || ""}
                    </p>
                    <div className="row" style={{ gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                      {selectedFloorplan?.features?.slice(0, 5).map((f: string, i: number) => (
                        <span key={i} className="badge" style={{ fontSize: "10px" }}>
                          {f}
                        </span>
                      ))}
                    </div>
                    <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                      {lang === "bn" ? "প্লট সাইজ" : "Plot Size"}: {selectedFloorplan?.plotSizeRange || ""} |
                      {lang === "bn" ? "উপযোগী" : "Suitable for"}: {selectedFloorplan?.suitableFor || ""}
                    </p>
                  </div>
                  <Button
                    variant="soft"
                    onClick={() => {
                      const plan = getRandomFloorPlan(unitsPerFloor);
                      setSelectedFloorplan(plan);
                    }}
                  >
                    🎲 {lang === "bn" ? "র‍্যান্ডম বদলান" : "Randomize"}
                  </Button>
                </div>
              </div>
            )}

            {/* Full Gallery Modal */}
            {showFloorplanGallery && availableFloorplans.length > 0 && (
              <div
                className="modal-overlay"
                onClick={() => setShowFloorplanGallery(false)}
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 1000,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                  overflow: "auto",
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="card"
                  style={{
                    width: "90%",
                    maxWidth: "900px",
                    maxHeight: "80vh",
                    overflow: "auto",
                    padding: "16px",
                  }}
                >
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: "12px" }}>
                    <h3>{lang === "bn" ? "ফ্লোরপ্ল্যান গ্যালারি" : "Floorplan Gallery"}</h3>
                    <Button variant="ghost" onClick={() => setShowFloorplanGallery(false)}>
                      ✕ {lang === "bn" ? "বন্ধ" : "Close"}
                    </Button>
                  </div>
                  <p className="faint small" style={{ marginBottom: "12px" }}>
                    {lang === "bn"
                      ? `${availableFloorplans.length}টি ডিজাইন। ক্লিক করে বেছে নিন।`
                      : `${availableFloorplans.length} designs. Click to select.`}
                  </p>
                  <div
                    className="grid-3"
                    style={{
                      gap: "12px",
                      gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    }}
                  >
                    {availableFloorplans.map((plan) => (
                      <div
                        key={plan.id}
                        className="card"
                        style={{
                          cursor: "pointer",
                          border: selectedFloorplan?.id === plan.id ? "2px solid var(--tone-brand)" : "1px solid var(--border)",
                          transition: "border 0.2s",
                        }}
                        onClick={() => {
                          setSelectedFloorplan(plan);
                          setShowFloorplanGallery(false);
                        }}
                      >
                        <FloorplanPreview plan={plan} size={200} />
                        <h5 style={{ margin: "8px 0 4px", fontSize: "12px", textAlign: "center" }}>
                          {lang === "bn" ? selectedFloorplan?.titleBn : plan.title}
                        </h5>
                        <p style={{ fontSize: "10px", color: "var(--muted)", textAlign: "center" }}>
                          {selectedFloorplan?.plotSizeRange} · {selectedFloorplan?.features.slice(0, 2).join(", ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Location */}
          <div className="field">
            <label className="field-label" htmlFor="project-location-select">
              {lang === "bn" ? "অবস্থান ও অনুমোদনকারী কর্তৃপক্ষ" : "Location & Authority"}
            </label>
            <select
              id="project-location-select"
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
