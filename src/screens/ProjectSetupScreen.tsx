import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n, fmtNum } from "../i18n";
import { Button, Card, PageHeader, Callout, ResultChip } from "../ui/kit";
import { rajukSetbacks } from "../rules/setbacks";
import { createNewProject, generateRandomBuildingProject } from "../engine/projectState";
import { useProject } from "../context/ProjectContext";
import { deriveGeometry } from "../plans/geometry";
import { renderPlanSvg } from "../plans/render";
import {
  FEET_TO_M,
  availableUnitCounts,
  mToMm,
  planChoices,
  plotProblems,
  rejectionText,
  summarisePlot,
  type PlotShape,
} from "../model/planChoices";

interface Props {
  onNavigate: (id: string) => void;
  onProjectCreated?: () => void;
}

type LengthUnit = "ft" | "m";
type RoadSide = PlotShape["roadSide"];

const toM = (v: number, u: LengthUnit) => (u === "ft" ? v * FEET_TO_M : v);
const fromM = (m: number, u: LengthUnit) => (u === "ft" ? m / FEET_TO_M : m);
const round1 = (v: number) => Math.round(v * 10) / 10;

const ROAD_SIDES: Array<{ id: RoadSide; en: string; bn: string }> = [
  { id: "south", en: "South", bn: "দক্ষিণ" },
  { id: "north", en: "North", bn: "উত্তর" },
  { id: "east", en: "East", bn: "পূর্ব" },
  { id: "west", en: "West", bn: "পশ্চিম" },
];

export function ProjectSetupScreen({ onNavigate, onProjectCreated }: Props) {
  const { t, lang } = useI18n();
  const bn = lang === "bn";
  const { saveProject } = useProject();

  const [name, setName] = useState("Dhanmondi Residential Building");
  const [stories, setStories] = useState(6);
  const [unit, setUnit] = useState<LengthUnit>("ft");
  const [frontage, setFrontage] = useState(40);
  const [depth, setDepth] = useState(65);
  const [roadWidth, setRoadWidth] = useState(20);
  const [roadSide, setRoadSide] = useState<RoadSide>("south");
  const [corner, setCorner] = useState(false);
  const [mirror, setMirror] = useState(false);
  const unitCounts = useMemo(() => availableUnitCounts(), []);
  const [unitsPerFloor, setUnitsPerFloor] = useState(unitCounts[0]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [location, setLocation] = useState("Dhaka (RAJUK)");
  const [error, setError] = useState<string | null>(null);

  const frontageM = toM(frontage, unit);
  const depthM = toM(depth, unit);
  const roadWidthM = toM(roadWidth, unit);
  const problems = plotProblems({ frontageM, depthM, roadWidthM });
  const summary = problems.includes("frontage") || problems.includes("depth") ? null : summarisePlot(frontageM, depthM);

  const choices = useMemo(
    () => (summary ? planChoices(frontageM, depthM, { unitsPerFloor, mirror, storeys: stories, roadWidthM: problems.includes("roadWidth") ? undefined : roadWidthM }) : []),
    [summary, frontageM, depthM, unitsPerFloor, mirror, stories, roadWidthM, problems],
  );
  const previews = useMemo(() => {
    const out: Record<string, string> = {};
    for (const c of choices) if (c.fit.ok) out[c.plan.id] = renderPlanSvg(deriveGeometry(c.fit.fitted), { lang });
    return out;
  }, [choices, lang]);

  // The selected plan must still fit; otherwise fall back to the first one that does.
  useEffect(() => {
    setPlanId((current) => {
      const fits = choices.filter((c) => c.fit.ok);
      if (current && fits.some((c) => c.plan.id === current)) return current;
      // Prefer a plan that keeps to the ground-coverage limit (the list is already sorted that way).
      return fits[0]?.plan.id ?? null;
    });
  }, [choices]);

  const changeUnit = (next: LengthUnit) => {
    if (next === unit) return;
    setFrontage(round1(fromM(frontageM, next)));
    setDepth(round1(fromM(depthM, next)));
    setRoadWidth(round1(fromM(roadWidthM, next)));
    setUnit(next);
  };

  const create = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!name.trim()) return setError(bn ? "প্রকল্পের নাম লিখুন।" : "Please enter a project name.");
    if (stories < 1 || stories > 30) return setError(bn ? "তলা ১–৩০ এর মধ্যে হতে হবে।" : "Stories must be between 1 and 30.");
    if (problems.length || !summary) return setError(bn ? "প্লটের সামনের দিক, গভীরতা ও রাস্তার প্রস্থ দিন।" : "Enter the plot frontage, depth and road width.");
    if (!planId) return setError(bn ? "এই প্লটে কোনো নকশা বসে না — মাপ বাড়ান বা ইউনিট সংখ্যা বদলান।" : "No plan fits this plot. Change the size or the number of flats per floor.");

    const project = createNewProject({
      name: name.trim(),
      stories,
      plotSize: summary.katha,
      plotUnit: "katha",
      unitsPerFloor,
      address: location,
      plot: {
        frontageM: Math.round(frontageM * 100) / 100,
        depthM: Math.round(depthM * 100) / 100,
        roadWidthM: Math.round(roadWidthM * 100) / 100,
        roadSide,
        ...(corner ? { cornerPlot: true } : {}),
      },
      planId,
      mirror,
    });
    saveProject(project);
    onProjectCreated?.();
    onNavigate(`phase:${project.phases[0].id}`);
  }, [name, stories, problems, summary, planId, unitsPerFloor, location, frontageM, depthM, roadWidthM, roadSide, corner, mirror, bn, onProjectCreated, onNavigate, saveProject]);

  const unitLabel = unit === "ft" ? (bn ? "ফুট" : "ft") : bn ? "মিটার" : "m";
  const fitCount = choices.filter((c) => c.fit.ok).length;
  const sbM = (() => {
    const sb = rajukSetbacks((mToMm(frontageM) * mToMm(depthM)) / 1e6, stories).setbacksMm;
    return { front: sb.front / 1000, rear: sb.rear / 1000, side: sb.left / 1000 };
  })();
  const chosen = choices.find((c) => c.plan.id === planId);

  const lengthField = (id: string, label: string, value: number, set: (n: number) => void) => (
    <div className="field" style={{ flex: 1, minWidth: 120 }}>
      <label className="field-label" htmlFor={id}>{label}</label>
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <input id={id} type="number" step="0.5" min={0.5} className="input" style={{ width: 96 }} value={value} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) set(Math.min(Math.max(n, 0), 2000)); }} />
        <span className="faint small">{unitLabel}</span>
      </div>
    </div>
  );

  return (
    <div className="screen">
      <PageHeader
        title={bn ? "নতুন আবাসিক ভবন প্রকল্প" : "Start New Residential Project"}
        subtitle={bn ? "আপনার প্লটের মাপে নকশা বসিয়ে ভবন তৈরি হবে" : "The building is fitted to your plot's real size and shape"}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              const project = generateRandomBuildingProject();
              saveProject(project);
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
          <h3>{bn ? "১. প্লট ও ভবন" : "1. Plot and Building"}</h3>

          <div className="field">
            <label className="field-label" htmlFor="project-name-input">{t("setupNameLabel")}</label>
            <input id="project-name-input" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="field">
            <label className="field-label" htmlFor="project-stories-input">{bn ? "তলা সংখ্যা" : "Number of Stories"}</label>
            <div className="row" style={{ gap: 8 }}>
              <input id="project-stories-input" type="number" min={1} max={30} className="input" style={{ width: 110 }} value={stories} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) setStories(Math.min(Math.max(Math.round(n), 1), 30)); }} />
              {[2, 4, 6, 8].map((s) => (
                <Button key={s} variant={stories === s ? "primary" : "soft"} onClick={() => setStories(s)}>{s}</Button>
              ))}
            </div>
          </div>

          <div className="field">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span className="field-label">{bn ? "প্লটের মাপ" : "Plot size"}</span>
              <div className="row" style={{ gap: 4 }} role="group" aria-label={bn ? "দৈর্ঘ্যের একক" : "Length unit"}>
                <Button variant={unit === "ft" ? "primary" : "soft"} onClick={() => changeUnit("ft")}>{bn ? "ফুট" : "ft"}</Button>
                <Button variant={unit === "m" ? "primary" : "soft"} onClick={() => changeUnit("m")}>{bn ? "মিটার" : "m"}</Button>
              </div>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              {lengthField("plot-frontage-input", bn ? "রাস্তার দিকের মাপ" : "Frontage (along the road)", frontage, setFrontage)}
              {lengthField("plot-depth-input", bn ? "গভীরতা" : "Depth", depth, setDepth)}
              {lengthField("plot-road-input", bn ? "রাস্তার প্রস্থ" : "Road width", roadWidth, setRoadWidth)}
            </div>
            <span className="faint small">
              {summary
                ? `≈ ${fmtNum(summary.katha, lang)} ${bn ? "কাঠা" : "katha"} · ${fmtNum(summary.areaSqm, lang)} m² · ${fmtNum(summary.sqft, lang)} ${bn ? "বর্গফুট" : "sq ft"}`
                : bn ? "মাপগুলো দিন" : "Enter the three sizes"}
            </span>
          </div>

          <div className="row" style={{ gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div className="field">
              <label className="field-label" htmlFor="plot-roadside-select">{bn ? "রাস্তা কোন দিকে" : "Road is on the"}</label>
              <select id="plot-roadside-select" className="input" value={roadSide} onChange={(e) => setRoadSide(e.target.value as RoadSide)}>
                {ROAD_SIDES.map((s) => <option key={s.id} value={s.id}>{bn ? s.bn : s.en}</option>)}
              </select>
            </div>
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={corner} onChange={(e) => setCorner(e.target.checked)} />
              <span>{bn ? "কর্নার প্লট" : "Corner plot"}</span>
            </label>
          </div>

          <div className="field">
            <label className="field-label">{bn ? "প্রতি তলায় ফ্ল্যাট" : "Flats per floor"}</label>
            <div className="row" style={{ gap: 6 }}>
              {unitCounts.map((u) => (
                <Button key={u} variant={unitsPerFloor === u ? "primary" : "soft"} onClick={() => setUnitsPerFloor(u)}>
                  {fmtNum(u, lang)}
                </Button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label" htmlFor="project-location-select">{bn ? "অবস্থান ও কর্তৃপক্ষ" : "Location & Authority"}</label>
            <select id="project-location-select" className="input" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="Dhaka (RAJUK)">Dhaka (RAJUK)</option>
            </select>
          </div>
        </Card>

        <Card className="stack">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <h3>{bn ? "২. নকশা বাছুন" : "2. Choose a Plan"}</h3>
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
              <span className="small">{bn ? "ডান-বাম উল্টে দিন" : "Mirror left–right"}</span>
            </label>
          </div>
          <p className="muted small" style={{ margin: 0 }}>
            {summary
              ? bn
                ? `${fmtNum(fitCount, lang)}টি নকশা এই প্লটে বসে। সেটব্যাক রাজউক ২০০৮ অনুযায়ী: সামনে ${fmtNum(sbM.front, lang)} মি, পেছনে ${fmtNum(sbM.rear, lang)} মি, পাশে ${fmtNum(sbM.side, lang)} মি।`
                : `${fitCount} of ${choices.length} plans fit this plot. RAJUK 2008 setbacks for this plot: ${sbM.front} m front, ${sbM.rear} m rear, ${sbM.side} m sides.`
              : bn ? "প্লটের মাপ দিলে নকশা দেখা যাবে।" : "Enter the plot size to see which plans fit."}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {choices.map((c) => {
              const ok = c.fit.ok;
              const selected = ok && planId === c.plan.id;
              return (
                <button
                  key={c.plan.id}
                  type="button"
                  disabled={!ok}
                  aria-pressed={selected}
                  onClick={() => setPlanId(c.plan.id)}
                  className="card"
                  data-plan-id={c.plan.id}
                  style={{
                    textAlign: "left",
                    padding: 8,
                    cursor: ok ? "pointer" : "not-allowed",
                    opacity: ok ? 1 : 0.7,
                    border: selected ? "2px solid var(--tone-brand)" : "1px solid var(--border)",
                    background: "var(--surface)",
                    color: "inherit",
                  }}
                >
                  {ok ? (
                    <div className="plan-thumb" dangerouslySetInnerHTML={{ __html: previews[c.plan.id] }} />
                  ) : (
                    <div className="faint small" style={{ minHeight: 80, display: "flex", alignItems: "center" }}>
                      {rejectionText(c.fit.ok ? [] : c.fit.reasons, lang)}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{c.plan.name[lang]}</div>
                  <div className="faint" style={{ fontSize: 11 }}>
                    {fmtNum(c.plan.unitsPerFloor, lang)} × {fmtNum(c.plan.bedroomsPerUnit, lang)} {bn ? "বেডরুম" : "bed"}
                  </div>
                  {c.coverage?.status === "fail" ? (
                    <div style={{ marginTop: 4 }}>
                      <ResultChip result="fail" lang={lang}>{bn ? "ভূমি আচ্ছাদন সীমা ছাড়ায়" : "over the coverage limit"}</ResultChip>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>

          {chosen?.coverage?.status === "fail" ? (
            <Callout tone="bad" title={bn ? "এই নকশা ভূমি আচ্ছাদনের সীমা ছাড়ায়" : "This plan exceeds the ground-coverage limit"}>
              {bn
                ? `নকশাটি প্লটের ${fmtNum(chosen.coverage.actualPercent ?? 0, lang)}% ঢাকে; রাজউকের সীমা ${fmtNum(chosen.coverage.maxPercent ?? 0, lang)}%। কমপ্লায়েন্স স্ক্রিনে এটি অনুত্তীর্ণ দেখাবে। সীমার মধ্যে থাকা নকশা বা কম তলা বেছে নিন।`
                : `It covers ${chosen.coverage.actualPercent}% of the plot; RAJUK allows ${chosen.coverage.maxPercent}%. The Compliance screen will show a fail. Pick a plan that keeps within the limit, or a smaller one.`}
            </Callout>
          ) : null}

          <Callout title={bn ? "নকশা কীভাবে বসে" : "How the plan is fitted"}>
            {bn
              ? "প্লটের মাপ বদলালে ঘরের মাপও বদলায়, তবে প্রতিটি ঘর তার নির্ধারিত সীমার মধ্যে থাকে। কলাম ও বিম নকশার গ্রিড লাইনেই বসে।"
              : "When the plot changes, the rooms resize inside fixed limits. Columns and beams sit on the plan's own grid lines."}
          </Callout>

          <h4 style={{ margin: "8px 0 0" }}>{bn ? "পর্যায়ক্রম" : "Phases"}</h4>
          <p className="muted small" style={{ margin: 0 }}>
            {bn
              ? `${fmtNum(stories, lang)} তলা ভবন: সাইট ও খনন, ফাউন্ডেশন, নিচতলা (পার্কিং), ${fmtNum(Math.max(0, stories - 1), lang)}টি তলা, ছাদ, ইউটিলিটি।`
              : `${stories}-storey building: site & excavation, foundation, ground floor (parking), ${Math.max(0, stories - 1)} floors, rooftop, utilities.`}
          </p>

          {error ? <div role="alert" style={{ color: "var(--bad-ink)", fontSize: 13 }}>⚠ {error}</div> : null}

          <Button variant="primary" style={{ marginTop: 8, width: "100%", padding: 12 }} onClick={create} disabled={!planId}>
            {bn ? "প্রকল্প তৈরি করে শুরু করুন ➔" : "Create Project & Start Planning ➔"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
