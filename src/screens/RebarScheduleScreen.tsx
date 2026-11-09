import { useMemo, useState } from "react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import { analyzeStructure } from "../structure/analyze";
import { buildBbs, type BbsFamily, type BbsResult } from "../structure/bbs";
import { bbsToCsv } from "../structure/bbsCsv";
import { STOCK_BARS } from "../structure/barSelect";
import { Button, Callout, Card, EmptyState, PageHeader, ResultChip, SegmentedControl, Stat } from "../ui/kit";

type Filter = "all" | BbsFamily;

const FAMILY_LABEL: Record<BbsFamily, { en: string; bn: string }> = {
  footing: { en: "Footings", bn: "ফুটিং" },
  column: { en: "Columns", bn: "কলাম" },
  beam: { en: "Beams", bn: "বিম" },
  slab: { en: "Slabs", bn: "স্ল্যাব" },
};

const SHAPE_NOTE: Record<string, { en: string; bn: string }> = {
  "00": { en: "straight", bn: "সোজা" },
  "11": { en: "one 90° bend", bn: "একটি ৯০° বাঁক" },
  "21": { en: "two 90° bends (U)", bn: "দুটি ৯০° বাঁক (U)" },
  "51": { en: "closed link, 135° hooks", bn: "বন্ধ স্টিরাপ, ১৩৫° হুক" },
};

const kg = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function levelsText(levels: number[]): string {
  if (levels.length <= 4) return levels.join(", ");
  const contiguous = levels.every((l, i) => i === 0 || l === levels[i - 1] + 1);
  return contiguous ? `${levels[0]}–${levels[levels.length - 1]}` : `${levels.slice(0, 4).join(", ")}…`;
}

export function RebarScheduleScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();
  const [filter, setFilter] = useState<Filter>("all");

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const data = useMemo<{ bbs: BbsResult; assumptions: Array<{ id: string; en: string; bn: string }>; ok: boolean } | null>(() => {
    if (!built || !built.ok) return null;
    const res = analyzeStructure(built.model);
    return { bbs: buildBbs(res, built.model), assumptions: res.assumptions, ok: res.ok };
  }, [built]);

  const title = bn ? "রিবার শিডিউল" : "Rebar schedule";
  const subtitle = bn ? "কাঠামোর ফলাফল থেকে বার বেন্ডিং শিডিউল" : "Bar bending schedule from the structural results";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে রিবার শিডিউল দেখা যাবে।" : "Enter the plot and pick a plan, then the schedule appears here."}
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

  const { bbs } = data;
  const rows = filter === "all" ? bbs.rows : bbs.rows.filter((r) => r.family === filter);
  const issues = [...bbs.issues].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "fail" ? -1 : 1));
  const tabs: Array<{ value: Filter; label: string }> = [
    { value: "all", label: `${bn ? "সব" : "All"} (${bbs.rows.length})` },
    ...(["footing", "column", "beam", "slab"] as BbsFamily[]).map((f) => ({ value: f as Filter, label: `${bn ? FAMILY_LABEL[f].bn : FAMILY_LABEL[f].en} (${bbs.rows.filter((r) => r.family === f).length})` })),
  ];

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />

      <Callout tone="warn" title={bn ? "প্রাথমিক রড বিন্যাস, চূড়ান্ত নকশা নয়" : "Screening-level detailing, not final design"}>
        {bn
          ? "রডের ব্যাস কেবল মজুদ মাপ (৮, ১০, ১২, ১৬, ২০, ২২, ২৫, ২৮, ৩২ মিমি)। বিমের নিচের রড কাটা হয়নি, ক্রসটাই ও কোণার রড ধরা হয়নি। দৈর্ঘ্য বিএনবিসি ধারা ৮.১ ও ৮.২ থেকে।"
          : "Bars are stock diameters only (8, 10, 12, 16, 20, 22, 25, 28, 32 mm). Bottom beam bars are not curtailed; crossties and corner bars are not scheduled. Hook, development and lap lengths follow BNBC Sec 8.1 and 8.2."}
      </Callout>

      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "মোট রড (কেজি)" : "Total steel (kg)"} value={kg(bbs.totals.weightKg)} />
        <Stat label={bn ? "মোট রড (টন)" : "Total steel (t)"} value={(bbs.totals.weightKg / 1000).toFixed(2)} />
        <Stat label={bn ? "কংক্রিটের প্রতি ঘনমিটারে (কেজি)" : "Steel per m³ concrete (kg)"} value={bbs.totals.kgPerM3.toFixed(0)} />
        <Stat label={bn ? "শিডিউলের সারি" : "Schedule rows"} value={String(bbs.rows.length)} />
        <Stat label={bn ? "সমস্যা" : "Issues"} value={String(issues.length)} />
      </div>

      <section className="stack" style={{ gap: 12 }} aria-label={bn ? "সমস্যা" : "Issues"}>
        <h3 style={{ margin: 0 }}>{bn ? "আগে সমস্যাগুলো" : "Issues first"}</h3>
        {issues.length === 0 ? (
          <Card><p className="muted" style={{ margin: 0 }}>{bn ? "কোনো সমস্যা নেই: সব রড বসে এবং অ্যাঙ্কর হয়।" : "No issues: every bar fits and anchors."}</p></Card>
        ) : (
          issues.slice(0, 12).map((i) => (
            <Card key={i.en} className="stack">
              <div className="row-between">
                <h4 style={{ margin: 0 }}>{bn ? i.bn : i.en}</h4>
                <ResultChip result={i.severity === "fail" ? "fail" : "warn"} lang={lang} />
              </div>
              <span className="small muted">{(bn ? "স্তর/তলা: " : "Levels or storeys: ") + levelsText([...i.levels].sort((a, b) => a - b))}</span>
            </Card>
          ))
        )}
        {issues.length > 12 ? <p className="small muted">{(bn ? "আরও " : "and ") + (issues.length - 12) + (bn ? "টি" : " more")}</p> : null}
        {issues.some((i) => i.severity === "warn") ? (
          <Callout title={bn ? "হুকের দৈর্ঘ্য কলামে আঁটে না" : "Hooks longer than the column"}>
            {bn
              ? "প্রান্তের কলামে হুকের প্রয়োজনীয় দৈর্ঘ্য (ধারা ৮.২.৬.২) কলামের গভীরতার চেয়ে বেশি। ধারা ৮.২.৬.৩-এর ০.৭/০.৮ গুণক প্রয়োগ হয়নি; ছোট ব্যাসের রড বা বড় কলাম এটি সমাধান করে।"
              : "At exterior columns the hook development length (Sec 8.2.6.2) is longer than the column. The 0.7 and 0.8 factors of Sec 8.2.6.3 are not applied; smaller bars or a deeper column cure it."}
          </Callout>
        ) : null}
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "মোট" : "Totals"}>
        <h3 style={{ margin: 0 }}>{bn ? "ব্যাস অনুযায়ী মোট" : "Totals by diameter"}</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "ব্যাস (মিমি)" : "Diameter (mm)"}</th>
                <th>{bn ? "দৈর্ঘ্য (মি)" : "Length (m)"}</th>
                <th>{bn ? "ওজন (কেজি)" : "Weight (kg)"}</th>
              </tr>
            </thead>
            <tbody>
              {STOCK_BARS.map((d) => {
                const t = bbs.totals.byDia.find((x) => x.diaMm === d);
                return t ? (
                  <tr key={d}>
                    <td>{d}</td>
                    <td>{t.lengthM.toFixed(0)}</td>
                    <td>{kg(t.weightKg)}</td>
                  </tr>
                ) : null;
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {bbs.totals.byFamily.map((f) => `${bn ? FAMILY_LABEL[f.family].bn : FAMILY_LABEL[f.family].en}: ${kg(f.weightKg)} kg`).join(" · ")}
        </p>
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "বার বেন্ডিং শিডিউল" : "Bar bending schedule"}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{bn ? "বার বেন্ডিং শিডিউল" : "Bar bending schedule"}</h3>
          <Button variant="ghost" onClick={() => download(`${project.name.replace(/[^\w-]+/g, "_") || "project"}-bbs.csv`, bbsToCsv(bbs.rows))}>
            {bn ? "CSV ডাউনলোড" : "Download CSV"}
          </Button>
        </div>
        <SegmentedControl<Filter> aria-label={bn ? "সদস্যের ধরন" : "Member type"} options={tabs} value={filter} onChange={setFilter} />
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "মার্ক" : "Mark"}</th>
                <th>{bn ? "বিবরণ" : "Description"}</th>
                <th>{bn ? "ব্যাস" : "Dia"}</th>
                <th>{bn ? "আকৃতি" : "Shape"}</th>
                <th>{bn ? "মাপ A / B / C (মিমি)" : "A / B / C (mm)"}</th>
                <th>{bn ? "কাটা দৈর্ঘ্য (মিমি)" : "Cut length (mm)"}</th>
                <th>{bn ? "রড/সদস্য" : "Bars each"}</th>
                <th>{bn ? "সদস্য" : "Members"}</th>
                <th>{bn ? "মোট রড" : "Total bars"}</th>
                <th>{bn ? "দৈর্ঘ্য (মি)" : "Length (m)"}</th>
                <th>{bn ? "ওজন (কেজি)" : "Weight (kg)"}</th>
                <th>{bn ? "স্তর" : "Levels"}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.mark}>
                  <td>{r.mark}</td>
                  <td>{bn ? r.description.bn : r.description.en}</td>
                  <td>{r.diaMm}</td>
                  <td title={bn ? SHAPE_NOTE[r.shape].bn : SHAPE_NOTE[r.shape].en}>{r.shape}</td>
                  <td>{r.dimsMm.join(" / ")}</td>
                  <td>{r.cutLengthMm}</td>
                  <td>{r.barsPerMember}</td>
                  <td>{r.members}</td>
                  <td>{r.totalBars}</td>
                  <td>{r.totalLengthM.toFixed(1)}</td>
                  <td>{r.weightKg.toFixed(0)}</td>
                  <td>{levelsText(r.levels)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {bn
            ? "আকৃতি কোড বিএস ৮৬৬৬ রীতি অনুযায়ী: ০০ সোজা, ১১ একটি ৯০° বাঁক, ২১ দুটি ৯০° বাঁক, ৫১ বন্ধ স্টিরাপ ১৩৫° হুকসহ। কাটা দৈর্ঘ্যে বাঁকের বিয়োজন ধরা আছে।"
            : "Shape codes follow the BS 8666 convention: 00 straight, 11 one 90° bend, 21 two 90° bends, 51 closed link with 135° hooks. Cut lengths include the bend deductions."}
        </p>
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 8 }} aria-label={bn ? "অনুমান" : "Assumptions"}>
        <h3 style={{ margin: 0 }}>{bn ? "অনুমান" : "Assumptions"}</h3>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {data.assumptions.map((a) => <li key={a.id}>{bn ? a.bn : a.en}</li>)}
        </ul>
      </section>
    </div>
  );
}
