import { useMemo } from "react";
import { useI18n } from "../i18n";
import { useProject } from "../context/ProjectContext";
import type { BuildingProject } from "../engine/projectState";
import { planChoices } from "../model/planChoices";
import { buildingForProject } from "../model/projectMesh";
import { fitPlan } from "../plans/fit";
import { getPlan } from "../plans/library";
import { renderPlanSvg } from "../plans/render";

/**
 * The floor plan the 3D model is built from, drawn from the building model itself. Renders nothing
 * until the project has a plot shape and plan (PlotShapeCallout asks for those).
 * With `switchable`, offers the other plans that fit the plot and a mirror toggle.
 */
export function PlanCard({ project, switchable, onChanged }: { project: BuildingProject; switchable?: boolean; onChanged?: () => void }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { saveProject } = useProject();
  const plot = project.plot;

  const key = JSON.stringify([plot, project.planId, project.mirror, project.stories]);
  const view = useMemo(() => {
    const built = buildingForProject(project);
    if (!built?.ok) return null;
    const model = built.model;
    const storey = model.storeys[model.storeys.length > 1 ? 1 : 0];
    return { model, svg: renderPlanSvg(storey.geometry, { lang }) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang]);

  const options = useMemo(
    () => (switchable && plot ? planChoices(plot.frontageM, plot.depthM, { unitsPerFloor: project.unitsPerFloor, mirror: !!project.mirror, storeys: project.stories }).filter((c) => c.fit.ok) : []),
    [switchable, plot, project.unitsPerFloor, project.mirror, project.stories],
  );

  if (!view || !project.planId) return null;
  const plan = getPlan(project.planId);
  if (!plan) return null;

  const update = (patch: Partial<BuildingProject>) => {
    saveProject({ ...project, ...patch, updatedAt: new Date().toISOString() });
    onChanged?.();
  };
  const w = (view.model.widthMm / 1000).toFixed(2);
  const d = (view.model.depthMm / 1000).toFixed(2);

  return (
    <div className="card row" style={{ gap: 12, alignItems: "flex-start", padding: 10, marginBottom: 12, flexWrap: "wrap" }}>
      <div className="plan-thumb" style={{ width: 200 }} dangerouslySetInnerHTML={{ __html: view.svg }} />
      <div className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
        <span className="faint" style={{ fontSize: 11 }}>{bn ? "ফ্লোর প্ল্যান → ৩D মডেল" : "Floor plan → 3D model"}</span>
        <strong style={{ fontSize: 13 }}>{plan.name[lang]}</strong>
        <span className="faint small">{plan.description[lang]}</span>
        <span className="faint small">
          {bn ? "ভবন" : "Building"} {w} × {d} m · {plan.id}
        </span>
        {switchable && options.length > 0 ? (
          <div className="row" style={{ gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 4 }}>
            <label htmlFor="plan-card-select" className="small">{bn ? "নকশা বদলান" : "Change plan"}</label>
            <select id="plan-card-select" className="input" style={{ maxWidth: 320 }} value={project.planId} onChange={(e) => update({ planId: e.target.value })}>
              {options.map((c) => (
                <option key={c.plan.id} value={c.plan.id}>{c.plan.name[lang]}</option>
              ))}
            </select>
            <label className="row" style={{ gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={!!project.mirror} onChange={(e) => {
                // Only offer a mirror the plan can still be fitted with (same envelope, so always true; kept explicit).
                const ok = plot ? fitPlan(plan, { widthMm: view.model.envelope.x1 - view.model.envelope.x0, depthMm: view.model.envelope.y1 - view.model.envelope.y0 }, { mirror: e.target.checked }).ok : false;
                if (ok) update({ mirror: e.target.checked });
              }} />
              <span className="small">{bn ? "ডান-বাম উল্টে দিন" : "Mirror left–right"}</span>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
