import { useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { Button, Callout } from "../ui/kit";
import { useProject } from "../context/ProjectContext";
import type { BuildingProject } from "../engine/projectState";
import { FEET_TO_M, planChoices, plotProblems, rejectionText } from "../model/planChoices";
import { buildingForProject } from "../model/projectMesh";

/**
 * Shown on screens that draw the building. A save made before the plot shape was recorded gets a
 * short form (never a guess); a project whose plan no longer fits its plot gets the reason.
 */
export function PlotShapeCallout({ project }: { project: BuildingProject }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { saveProject } = useProject();
  const [frontage, setFrontage] = useState("");
  const [depth, setDepth] = useState("");
  const [road, setRoad] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);

  const built = buildingForProject(project);
  const frontageM = Number(frontage) * FEET_TO_M;
  const depthM = Number(depth) * FEET_TO_M;
  const roadM = Number(road) * FEET_TO_M;
  const ready = plotProblems({ frontageM, depthM, roadWidthM: roadM }).length === 0;
  const fitting = useMemo(
    () => (ready ? planChoices(frontageM, depthM, { unitsPerFloor: project.unitsPerFloor }).filter((c) => c.fit.ok) : []),
    [ready, frontageM, depthM, project.unitsPerFloor],
  );
  const chosen = fitting.find((c) => c.plan.id === planId)?.plan.id ?? fitting[0]?.plan.id ?? null;

  if (built?.ok) return null;
  if (built && !built.ok)
    return (
      <Callout tone="bad" title={bn ? "নকশা এই প্লটে বসছে না" : "The plan no longer fits this plot"}>
        {rejectionText(built.reasons, lang)}
      </Callout>
    );

  const save = () => {
    if (!chosen) return;
    saveProject({
      ...project,
      plot: {
        frontageM: Math.round(frontageM * 100) / 100,
        depthM: Math.round(depthM * 100) / 100,
        roadWidthM: Math.round(roadM * 100) / 100,
        roadSide: "south",
      },
      planId: chosen,
      updatedAt: new Date().toISOString(),
    });
  };

  const field = (id: string, label: string, value: string, set: (v: string) => void) => (
    <label htmlFor={id} className="field" style={{ minWidth: 110 }}>
      <span className="field-label">{label}</span>
      <input id={id} className="input" type="number" min={1} step="0.5" style={{ width: 100 }} value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <Callout tone="warn" title={bn ? "প্লটের আকার দেওয়া হয়নি" : "This project has no plot shape yet"}>
      <p style={{ margin: "0 0 8px" }}>
        {bn
          ? "এই প্রকল্পে প্লটের সামনের দিক, গভীরতা ও রাস্তার প্রস্থ সংরক্ষিত নেই, তাই মডেল আনুমানিক। মাপগুলো (ফুটে) দিন, ভবন সেই মাপে তৈরি হবে।"
          : "This project was saved without the plot's frontage, depth and road width, so the model below is an estimate. Enter them (in feet) and the building is fitted to your plot."}
      </p>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        {field("fix-frontage", bn ? "রাস্তার দিকের মাপ (ফুট)" : "Frontage (ft)", frontage, setFrontage)}
        {field("fix-depth", bn ? "গভীরতা (ফুট)" : "Depth (ft)", depth, setDepth)}
        {field("fix-road", bn ? "রাস্তার প্রস্থ (ফুট)" : "Road width (ft)", road, setRoad)}
        {fitting.length > 0 ? (
          <label htmlFor="fix-plan" className="field">
            <span className="field-label">{bn ? "নকশা" : "Plan"}</span>
            <select id="fix-plan" className="input" value={chosen ?? ""} onChange={(e) => setPlanId(e.target.value)}>
              {fitting.map((c) => <option key={c.plan.id} value={c.plan.id}>{c.plan.name[lang]}</option>)}
            </select>
          </label>
        ) : null}
        <Button variant="primary" onClick={save} disabled={!chosen}>
          {bn ? "প্লটে বসান" : "Fit to plot"}
        </Button>
      </div>
      {ready && fitting.length === 0 ? (
        <p className="small" style={{ margin: "8px 0 0" }}>
          {bn ? "এই মাপে কোনো নকশা বসে না। মাপ বাড়ান বা নতুন প্রকল্প শুরু করুন।" : "No plan fits these sizes. Check the numbers or start a new project."}
        </p>
      ) : null}
    </Callout>
  );
}
