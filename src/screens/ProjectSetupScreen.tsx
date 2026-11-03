import { useEffect, useState } from "react";
import { useI18n, fmtNum } from "../i18n";
import { Button, Card, PageHeader, Callout } from "../ui/kit";
import { createNewProject, generateRandomBuildingProject, plotToSqm } from "../engine/projectState";
import { availableTemplates, chooseTemplate } from "../data/floorplanSelection";
import { categoryForUnits, getTemplate, type FloorPlanTemplate } from "../data/floorplanLibrary";
import { FloorplanPreview } from "../components/FloorplanPreview";

interface Props {
  onNavigate: (id: string) => void;
  onProjectCreated?: () => void;
}

export function ProjectSetupScreen({ onNavigate, onProjectCreated }: Props) {
  const { t, lang } = useI18n();
  const bn = lang === "bn";

  const [name, setName] = useState("Dhanmondi Residential Building");
  const [stories, setStories] = useState(6);
  const [plotSize, setPlotSize] = useState(3.5);
  const [plotUnit, setPlotUnit] = useState<"katha" | "decimal" | "sqft" | "sqm">("katha");
  const [unitsPerFloor, setUnitsPerFloor] = useState(2);
  const [location, setLocation] = useState("Dhaka (RAJUK)");
  const [error, setError] = useState<string | null>(null);
  /** null = no manual choice; a random drawing from the matching category is used at creation. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const sqm = Math.round(plotToSqm(plotSize, plotUnit) * 100) / 100;
  const available: FloorPlanTemplate[] = availableTemplates(unitsPerFloor);
  const selected = getTemplate(selectedId);

  // A manual pick only survives while it belongs to the current unit category.
  useEffect(() => {
    setSelectedId((current) => {
      const template = getTemplate(current);
      return template && categoryForUnits(template.unitsPerFloor) === categoryForUnits(unitsPerFloor) ? current : null;
    });
  }, [unitsPerFloor]);

  const create = () => {
    if (!name.trim()) return setError(bn ? "প্রকল্পের নাম লিখুন।" : "Please enter a project name.");
    if (stories < 1 || stories > 30) return setError(bn ? "তলা ১–৩০ এর মধ্যে হতে হবে।" : "Stories must be between 1 and 30.");
    if (plotSize <= 0) return setError(bn ? "জমির পরিমাণ দিন।" : "Please enter a valid plot size.");

    const project = createNewProject({
      name: name.trim(),
      stories,
      plotSize,
      plotUnit,
      unitsPerFloor,
      address: location,
      floorplanId: selectedId ?? undefined, // undefined → random pick from the category
    });
    onProjectCreated?.();
    onNavigate(`phase:${project.phases[0].id}`);
  };

  const randomize = () => {
    const { template } = chooseTemplate(unitsPerFloor);
    if (template) setSelectedId(template.id);
  };

  return (
    <div className="screen">
      <PageHeader
        title={bn ? "নতুন আবাসিক ভবন প্রকল্প" : "Start New Residential Project"}
        subtitle={bn ? "নির্বাচিত ২D ফ্লোর প্ল্যান থেকেই ৩D মডেল তৈরি হবে" : "The selected 2D floor plan is what the 3D model is built from"}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              generateRandomBuildingProject();
              onProjectCreated?.();
              onNavigate("design:final");
            }}
          >
            🎲 {bn ? "র্যান্ডম ভবন" : "Generate Random Building"}
          </Button>
        }
      />

      <div className="grid-2">
        <Card className="stack">
          <h3>{bn ? "১. ভবনের তথ্য" : "1. Building Specifications"}</h3>

          <div className="field">
            <label className="field-label" htmlFor="project-name-input">{t("setupNameLabel")}</label>
            <input id="project-name-input" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="project-stories-input">
              {bn ? "তলা সংখ্যা" : "Number of Stories"}
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="project-stories-input"
                type="number"
                min={1}
                max={30}
                className="input"
                style={{ width: 110 }}
                value={stories}
                onChange={(e) => setStories(Number(e.target.value) || 1)}
              />
              {[2, 4, 6, 8].map((s) => (
                <Button key={s} variant={stories === s ? "primary" : "soft"} onClick={() => setStories(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="project-plot-size-input">
              {bn ? "জমির পরিমাণ" : "Plot Size & Unit"}
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id="project-plot-size-input"
                type="number"
                step="0.1"
                min={0.1}
                className="input"
                style={{ width: 110 }}
                value={plotSize}
                onChange={(e) => setPlotSize(Number(e.target.value) || 1)}
              />
              <select
                className="input"
                style={{ width: 150 }}
                value={plotUnit}
                aria-label={bn ? "জমির একক" : "Plot unit"}
                onChange={(e) => setPlotUnit(e.target.value as "katha" | "decimal" | "sqft" | "sqm")}
              >
                <option value="katha">কাঠা (Katha)</option>
                <option value="decimal">শতক (Decimal)</option>
                <option value="sqft">বর্গফুট (Sq.ft)</option>
                <option value="sqm">বর্গমিটার (Sq.m)</option>
              </select>
            </div>
            <span className="faint small">≈ {sqm} m² ({Math.round(sqm * 10.7639)} sq.ft)</span>
          </div>

          <div className="field">
            <label className="field-label">{bn ? "প্রতি তলায় ইউনিট" : "Units Per Floor"}</label>
            <div className="row" style={{ gap: 6 }}>
              {[1, 2, 3, 4].map((u) => (
                <Button key={u} variant={unitsPerFloor === u ? "primary" : "soft"} onClick={() => setUnitsPerFloor(u)}>
                  {u} {bn ? "ইউনিট" : u === 1 ? "Single Unit" : "Units"}
                </Button>
              ))}
            </div>
            <span className="faint small">
              {available.length} {bn ? "টি যাচাইকৃত ২D নকশা" : "verified 2D designs in this category"}
            </span>
          </div>

          <div className="field">
            <label className="field-label">{bn ? "ফ্লোরপ্ল্যান টেমপ্লেট" : "Floorplan Template"}</label>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Button variant={showGallery ? "primary" : "soft"} onClick={() => setShowGallery(!showGallery)}>
                {showGallery ? (bn ? "গ্যালারি লুকান" : "Hide Gallery") : (bn ? "গ্যালারি" : "Show Gallery")}
              </Button>
              <Button variant="soft" onClick={randomize} disabled={available.length === 0}>
                🎲 {bn ? "একটি বাছুন" : "Pick one for me"}
              </Button>
              {selectedId ? (
                <Button variant="ghost" onClick={() => setSelectedId(null)}>
                  {bn ? "স্বয়ংক্রিয়" : "Back to automatic"}
                </Button>
              ) : null}
            </div>

            {selected ? (
              <div className="card" style={{ padding: 8 }}>
                <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <FloorplanPreview plan={selected} size={220} />
                  <div className="stack" style={{ flex: 1, minWidth: 190 }}>
                    <h4 style={{ margin: 0, fontSize: 14 }}>{selected.title}</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>{selected.description}</p>
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      {selected.features.slice(0, 4).map((f, i) => (
                        <span key={i} className="badge" style={{ fontSize: 10 }}>{f}</span>
                      ))}
                    </div>
                    <span className="faint small">
                      {selected.id} · {selected.category} · 3D {selected.presetId}
                      {selected.plotSizeRange ? ` · ${selected.plotSizeRange}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card" style={{ padding: 10, borderStyle: "dashed" }}>
                <strong style={{ fontSize: 13 }}>{bn ? "স্বয়ংক্রিয় নির্বাচন" : "Automatic selection"}</strong>
                <p className="faint small" style={{ margin: "4px 0 0" }}>
                  {bn
                    ? `প্রকল্প তৈরির সময় ${unitsPerFloor}-ইউনিট ক্যাটাগরি থেকে একটি নকশা র্যান্ডমভাবে নেওয়া হবে।`
                    : `A design will be picked at random from the ${unitsPerFloor}-unit category when the project is created.`}
                </p>
              </div>
            )}

            {showGallery && available.length > 0 && (
              <div
                onClick={() => setShowGallery(false)}
                style={{
                  position: "fixed",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                  zIndex: 1000,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 20,
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="card"
                  style={{ width: "90%", maxWidth: 900, maxHeight: "80vh", overflow: "auto", padding: 16 }}
                >
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                    <h3>{bn ? "ফ্লোরপ্ল্যান গ্যালারি" : "Floorplan Gallery"}</h3>
                    <Button variant="ghost" onClick={() => setShowGallery(false)}>✕</Button>
                  </div>
                  <p className="faint small">
                    {bn
                      ? "একটি নকশা বেছে নিন — একই ইউনিট সংখ্যার সব তলায় এটিই ব্যবহৃত হবে।"
                      : "Pick one drawing — every floor with this unit count will use it."}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                    {available.map((plan) => (
                      <div
                        key={plan.id}
                        className="card"
                        style={{
                          cursor: "pointer",
                          padding: 6,
                          border: selectedId === plan.id ? "2px solid var(--tone-brand)" : "1px solid var(--border)",
                        }}
                        onClick={() => {
                          setSelectedId(plan.id);
                          setShowGallery(false);
                        }}
                      >
                        <FloorplanPreview plan={plan} size={190} />
                        <div style={{ fontSize: 12, textAlign: "center", marginTop: 6 }}>{plan.title}</div>
                        <div className="faint" style={{ fontSize: 10, textAlign: "center" }}>{plan.id}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor="project-location-select">
              {bn ? "অবস্থান ও কর্তৃপক্ষ" : "Location & Authority"}
            </label>
            <select id="project-location-select" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="Dhaka (RAJUK)">Dhaka (RAJUK)</option>
              <option value="Chittagong (CDA)">Chittagong (CDA)</option>
              <option value="Sylhet (SCC)">Sylhet (SCC)</option>
              <option value="Pourashava / District">Pourashava / Municipality</option>
            </select>
          </div>
        </Card>

        <Card className="stack">
          <h3>{bn ? "২. পর্যায়ক্রম" : "2. Generated Phase Breakdown"}</h3>
          <p className="muted small">
            {bn ? `${stories} তলা ভবনের ধাপগুলো:` : `Your ${stories}-storey structure will be planned in these phases:`}
          </p>
          <div className="stack" style={{ gap: 6 }}>
            {[
              bn ? "সাইট ও খনন" : "Site & Excavation",
              bn ? "ফাউন্ডেশন ও ফুটিং" : "Foundation & Footings",
              bn ? "নিচতলা (পার্কিং ও প্রবেশ)" : "Ground Floor (Parking & Entry)",
              ...Array.from({ length: Math.max(0, stories - 1) }).map(
                (_, i) => (bn ? `${fmtNum(i + 1, lang)}ম তলা` : `Floor ${i + 1}`) + ` · ${unitsPerFloor} ${bn ? "ইউনিট" : "units"}`,
              ),
              bn ? "ছাদ ও সীমানা প্রাচীর" : "Rooftop & Boundary",
              bn ? "ইউটিলিটি ও সেবা" : "Utilities & Common Services",
            ].map((label, i) => (
              <div key={i} className="row" style={{ padding: "6px 10px", background: "var(--surface-sunken)", borderRadius: 6 }}>
                <span style={{ fontWeight: 600, width: 22 }}>{i + 1}.</span>
                <span className="grow">{label}</span>
              </div>
            ))}
          </div>

          <Callout title={bn ? "টেমপ্লেট ওয়ার্কফ্লো" : "Template workflow"}>
            {bn
              ? "একই ইউনিট সংখ্যার সব তলা একই ২D নকশা ব্যবহার করে, এবং সেই নকশা থেকেই ৩D মডেল তৈরি হয়।"
              : "Floors with the same unit count share one 2D drawing, and that drawing is what generates the 3D model."}
          </Callout>

          {error ? <div style={{ color: "var(--tone-blush, #ef4444)", fontSize: 13 }}>⚠ {error}</div> : null}

          <Button variant="primary" style={{ marginTop: 12, width: "100%", padding: 12 }} onClick={create}>
            {bn ? "প্রকল্প তৈরি করে শুরু করুন ➔" : "Create Project & Start Planning ➔"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
