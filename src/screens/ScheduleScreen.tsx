import { useMemo } from "react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import { openingSchedule, scheduleToCsv, type ScheduleKind } from "../model/schedules";
import { downloadText } from "../ui/download";
import { Button, Callout, Card, EmptyState, PageHeader, Stat } from "../ui/kit";

const KIND: Record<ScheduleKind, { en: string; bn: string }> = {
  door: { en: "Door", bn: "দরজা" },
  window: { en: "Window", bn: "জানালা" },
  vent: { en: "Ventilator", bn: "ভেন্টিলেটর" },
};

/** Door and window schedule from the building model: the same openings the plans, 3D model and drawings show. */
export function ScheduleScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();
  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const rows = useMemo(() => (built && built.ok ? openingSchedule(built.model) : []), [built]);

  const title = bn ? "দরজা-জানালার তালিকা" : "Door and window schedule";
  const subtitle = bn ? "নকশায় আঁকা প্রতিটি খোলা জায়গার মাপ ও সংখ্যা" : "Size and count of every opening drawn in the plans";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে তালিকা দেখা যাবে।" : "Enter the plot and pick a plan, then the schedule appears here."}
        </EmptyState>
      </div>
    );
  }
  if (!built.ok) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {bn ? built.reasons.map((r) => r.message.bn).join(" ") : built.reasons.map((r) => r.message.en).join(" ")}
        </Callout>
      </div>
    );
  }

  const storeys = built.model.storeys.length;
  const count = (k: ScheduleKind) => rows.filter((r) => r.kind === k).reduce((a, r) => a + r.total, 0);
  const typeLabel = (r: (typeof rows)[number]) => (r.kind === "door" && r.main ? (bn ? "প্রবেশ দরজা" : "Entrance door") : bn ? KIND[r.kind].bn : KIND[r.kind].en);
  const storeyHead = (i: number) => (i === 0 ? (bn ? "নিচতলা" : "Ground") : `${bn ? "তলা" : "Fl."} ${i}`);

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />
      <Callout tone="warn" title={bn ? "মাপ ধরে নেওয়া" : "Sizes are assumptions"}>
        {bn
          ? "দরজার উচ্চতা ২১০০ মিমি, জানালার সিল ৯০০ ও উচ্চতা ১২০০ মিমি, টয়লেটের ভেন্টিলেটর সিল ১৮০০ ও উচ্চতা ৬০০ মিমি: এগুলো ৩ডি মডেলের ধরে নেওয়া মান, বিএনবিসির নির্দিষ্ট মান নয়। প্রস্থ প্ল্যান থেকে আসে। কাঠ, গ্লাস ও হার্ডওয়্যার বিওকিউতে নেই।"
          : "Door height 2100 mm, window sill 900 and height 1200 mm, toilet ventilator sill 1800 and height 600 mm are the 3D model's assumed values, not code figures. Widths come from the plan. Timber, glass and hardware are not in the BOQ."}
      </Callout>
      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "দরজা" : "Doors"} value={String(count("door"))} />
        <Stat label={bn ? "জানালা" : "Windows"} value={String(count("window"))} />
        <Stat label={bn ? "ভেন্টিলেটর" : "Ventilators"} value={String(count("vent"))} />
      </div>
      <Card className="stack">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h2 className="section-title">{bn ? "তালিকা" : "Schedule"}</h2>
          <Button variant="ghost" onClick={() => downloadText(`${project.name.replace(/[^\w-]+/g, "_") || "project"}-openings.csv`, scheduleToCsv(rows))}>
            {bn ? "সিএসভি ডাউনলোড" : "Download CSV"}
          </Button>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "চিহ্ন" : "Mark"}</th>
                <th>{bn ? "ধরন" : "Type"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "প্রস্থ (মিমি)" : "Width (mm)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "উচ্চতা (মিমি)" : "Height (mm)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "সিল (মিমি)" : "Sill (mm)"}</th>
                {Array.from({ length: storeys }, (_, i) => (
                  <th key={i} style={{ textAlign: "right" }}>{storeyHead(i)}</th>
                ))}
                <th style={{ textAlign: "right" }}>{bn ? "মোট" : "Total"}</th>
                <th>{bn ? "কোন ঘর" : "Rooms"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mark}>
                  <td><strong>{r.mark}</strong></td>
                  <td>{typeLabel(r)}</td>
                  <td style={{ textAlign: "right" }}>{r.widthMm}</td>
                  <td style={{ textAlign: "right" }}>{r.heightMm}</td>
                  <td style={{ textAlign: "right" }}>{r.sillMm}</td>
                  {r.perStorey.map((c, i) => (
                    <td key={i} style={{ textAlign: "right" }}>{c || <span className="faint">–</span>}</td>
                  ))}
                  <td style={{ textAlign: "right" }}><strong>{r.total}</strong></td>
                  <td>{(bn ? r.rooms.bn : r.rooms.en).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
