import { useMemo, useState } from "react";
import { saveFile } from "../platform/saveFile";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildSheets, buildPermitPackage, packageToZip, type Sheet } from "../drawings/permit";
import { sceneToDxf, sceneToSvg } from "../drawings/scene";
import { buildingForProject } from "../model/projectMesh";
import { renderPlanSvg } from "../plans/render";
import { analyzeStructure } from "../structure/analyze";
import { Button, Callout, Card, EmptyState, PageHeader } from "../ui/kit";

function save(name: string, data: BlobPart, type: string) {
  void saveFile(name, typeof data === "string" ? data : data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer), type);
}

/** Local calendar date (Dhaka is UTC+6, so the UTC date is a day behind in the early morning). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const slug = (s: string) => s.replace(/[^\w-]+/g, "_") || "project";

export function DrawingsScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();
  const [sheetId, setSheetId] = useState("site");
  const [busy, setBusy] = useState(false);

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const data = useMemo(() => {
    if (!project || !built || !built.ok) return null;
    const res = analyzeStructure(built.model);
    const date = today();
    return { model: built.model, res, sheets: buildSheets(built.model, res, project.name, date, lang), date };
  }, [project, built, lang]);

  const title = bn ? "ড্রয়িং ও পারমিট প্যাকেজ" : "Drawings and permit package";
  const subtitle = bn ? "মডেল থেকে সাইট প্ল্যান, প্ল্যান, সেকশন ও এলিভেশন" : "Site plan, floor plans, section and elevations from the model";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে ড্রয়িং দেখা যাবে।" : "Enter the plot and pick a plan, then the drawings appear here."}
        </EmptyState>
      </div>
    );
  }
  if (!built.ok || !data) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {built.ok ? "" : bn ? built.reasons.map((r) => r.message.bn).join(" ") : built.reasons.map((r) => r.message.en).join(" ")}
        </Callout>
      </div>
    );
  }

  const sheet: Sheet = data.sheets.find((s) => s.id === sheetId) ?? data.sheets[0];
  const planMatch = /^plan-(\d+)$/.exec(sheet.id);
  const svg = planMatch ? renderPlanSvg(data.model.storeys[Number(planMatch[1])].geometry, { lang }) : sceneToSvg(sheet.scene);
  const base = `${slug(project.name)}-${sheet.sheetNo}-${sheet.id}`;

  const downloadPackage = () => {
    setBusy(true);
    try {
      const files = buildPermitPackage(project, data.model, data.date, lang);
      save(`${slug(project.name)}-permit-package.zip`, new Uint8Array(packageToZip(files, data.date)), "application/zip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />

      <Callout tone="warn" title={bn ? "প্রাথমিক নকশা, নির্মাণ বা জমার জন্য নয়" : "Screening drawings, not for construction or submission"}>
        {bn
          ? "সেকশন ও এলিভেশন প্রাথমিক (জানালার সিল ৯০০ মিমি, উচ্চতা ১২০০ মিমি ধরা)। রাজউকে জমার আগে লাইসেন্সপ্রাপ্ত স্থপতি ও প্রকৌশলীর যাচাই ও স্বাক্ষর প্রয়োজন। ডিএক্সএফে লেখা কেবল ইংরেজিতে।"
          : "Section and elevations are schematic (window sill 900 mm, height 1200 mm assumed). Licensed architects and engineers must check and sign before anything goes to RAJUK. DXF text is English only."}
      </Callout>

      <Card className="stack" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="sheet-pick" style={{ fontWeight: 600 }}>{bn ? "শিট" : "Sheet"}</label>
          <select id="sheet-pick" value={sheet.id} onChange={(e) => setSheetId(e.target.value)} style={{ padding: "6px 10px" }}>
            {data.sheets.map((s) => (
              <option key={s.id} value={s.id}>{s.sheetNo} {s.title}</option>
            ))}
          </select>
          <Button variant="ghost" onClick={() => save(`${base}.svg`, svg, "image/svg+xml")}>{bn ? "এসভিজি ডাউনলোড" : "Download SVG"}</Button>
          <Button variant="ghost" onClick={() => save(`${base}.dxf`, sceneToDxf(buildSheets(data.model, data.res, project.name, data.date, "en").find((s) => s.id === sheet.id)!.scene), "application/dxf")}>
            {bn ? "ডিএক্সএফ ডাউনলোড" : "Download DXF"}
          </Button>
        </div>
        <div style={{ overflow: "auto", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }} aria-label={sheet.title} dangerouslySetInnerHTML={{ __html: svg }} />
      </Card>

      <Card className="stack" style={{ marginTop: 16 }}>
        <h2 className="section-title">{bn ? "পারমিট প্যাকেজ" : "Permit package"}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {bn
            ? "সব ড্রয়িং (এসভিজি ও ডিএক্সএফ), বিওকিউ, রিবার শিডিউল, কমপ্লায়েন্স রিপোর্ট ও অনুমানের তালিকা একটি জিপ ফাইলে।"
            : "All drawings (SVG and DXF), the BOQ, the bar schedule, the compliance report and the assumptions in one zip file."}
        </p>
        <div>
          <Button onClick={downloadPackage} disabled={busy}>{bn ? "প্যাকেজ ডাউনলোড (.zip)" : "Download package (.zip)"}</Button>
        </div>
      </Card>
    </div>
  );
}
