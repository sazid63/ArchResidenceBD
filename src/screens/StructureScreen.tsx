import { useMemo, useState, type ReactNode } from "react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import type { OccupancyGroup, SiteClass } from "../rules/bnbcStructure";
import { seismicPack } from "../rules/bnbcStructure";
import { analyzeStructure, type LevelResult, type MemberFailure } from "../structure/analyze";
import type { SeismicResult } from "../structure/seismic";
import type { CheckResult } from "../theme/tokens";
import { Callout, Card, EmptyState, PageHeader, ResultChip, Stat, Value, VerdictStrip } from "../ui/kit";

const SITE_CLASSES: SiteClass[] = ["SA", "SB", "SC", "SD", "SE"];

const MEMBER_LABEL: Record<MemberFailure["member"], { en: string; bn: string }> = {
  slab: { en: "Slab", bn: "স্ল্যাব" },
  beam: { en: "Beam", bn: "বিম" },
  column: { en: "Column", bn: "কলাম" },
  footing: { en: "Footing", bn: "ফুটিং" },
  seismic: { en: "Seismic", bn: "ভূমিকম্প" },
};

/** Demand / capacity as a percentage, never clamped (130 % stays 130 %). */
export function ratioText(u: number): string {
  return Number.isFinite(u) ? `${(u * 100).toFixed(1)}%` : "∞";
}

/** Within the limit, close to it (over 90 %), or over it. */
export function ratioResult(u: number): CheckResult {
  return u > 1 ? "fail" : u > 0.9 ? "warn" : "pass";
}

const toneFill = (u: number) => (u > 1 ? "var(--bad-soft)" : u > 0.9 ? "var(--warn-soft)" : "var(--ok-soft)");
const toneStroke = (u: number) => (u > 1 ? "var(--bad)" : u > 0.9 ? "var(--warn)" : "var(--ok)");

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table">
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PlanGrid({ level, widthMm, depthMm, columnsAt, bn }: { level: LevelResult; widthMm: number; depthMm: number; columnsAt: Array<{ id: string; x: number; y: number; util: number }>; bn: boolean }) {
  const pad = 400;
  const w = widthMm + pad * 2;
  const h = depthMm + pad * 2;
  const fs = Math.max(w, h) / 55;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={bn ? "কাঠামোর গ্রিড: স্ল্যাব, বিম ও কলাম" : "Structural grid: slabs, beams and columns"} style={{ width: "100%", maxHeight: 480, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 8 }}>
      <g transform={`translate(${pad},${pad})`}>
        {level.panels.map((p) => (
          <g key={`${p.px}-${p.py}`}>
            <rect x={p.x0} y={p.y0} width={p.x1 - p.x0} height={p.y1 - p.y0} fill={toneFill(p.result.util)} stroke="var(--line)" strokeWidth={fs / 8} />
            <text x={(p.x0 + p.x1) / 2} y={(p.y0 + p.y1) / 2} fontSize={fs} textAnchor="middle" fill="var(--ink-soft)">{`S${p.px + 1}-${p.py + 1} ${p.result.thicknessMm}`}</text>
          </g>
        ))}
        {level.beamLines.map((b) =>
          b.result.spans.map((s, i) => {
            const a = b.stations[i];
            const z = b.stations[i + 1];
            const x1 = b.orientation === "h" ? a : b.at;
            const y1 = b.orientation === "h" ? b.at : a;
            const x2 = b.orientation === "h" ? z : b.at;
            const y2 = b.orientation === "h" ? b.at : z;
            return <line key={`${b.orientation}${b.at}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={toneStroke(s.util)} strokeWidth={fs / 3} />;
          }),
        )}
        {columnsAt.map((c) => (
          <g key={c.id}>
            <rect x={c.x - fs} y={c.y - fs} width={fs * 2} height={fs * 2} fill="var(--ink)" stroke={toneStroke(c.util)} strokeWidth={fs / 3} />
            <text x={c.x + fs * 1.4} y={c.y - fs * 0.8} fontSize={fs * 0.9} fill="var(--ink-soft)">{c.id}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

function SeismicTable({ s, dir, bn }: { s: SeismicResult; dir: "x" | "y"; bn: boolean }) {
  return (
    <Table
      head={[bn ? `তলা (${dir})` : `Storey (${dir})`, bn ? "তলার শিয়ার (কিনি)" : "Storey shear (kN)", bn ? "নকশা ড্রিফট (মিমি)" : "Design drift (mm)", bn ? "সীমা (মিমি)" : "Limit (mm)", bn ? "ড্রিফট অনুপাত" : "Drift ratio", bn ? "স্থিতিশীলতা অনুপাত" : "Stability ratio"]}
      rows={s.storeys.map((q) => [q.storey, q.shearKn.toFixed(0), q.designDriftMm.toFixed(1), q.limitMm.toFixed(0), ratioText(q.util), ratioText(q.thetaUtil)])}
    />
  );
}

export function StructureScreen() {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project, spec } = useProject();
  const [siteClass, setSiteClass] = useState<SiteClass>("SD");
  const [systemId, setSystemId] = useState("special-rc-mrf");
  // The soil report's allowable bearing, when the project basics have it; otherwise the screening default.
  const [bearing, setBearing] = useState(spec?.site.soil.sbcKpa ?? 150);
  const [levelIdx, setLevelIdx] = useState(0);
  const [storeyIdx, setStoreyIdx] = useState(0);
  const group: OccupancyGroup = "I_II";

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const result = useMemo(
    () => (built && built.ok ? analyzeStructure(built.model, { siteClass, systemId, allowableBearingKpa: bearing, group }) : null),
    [built, siteClass, systemId, bearing],
  );

  const title = bn ? "কাঠামো" : "Structure";
  const subtitle = bn ? "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়" : "Screening, not final design";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে কাঠামো যাচাই দেখা যাবে।" : "Enter the plot and pick a plan, then the structural screening appears here."}
        </EmptyState>
      </div>
    );
  }
  if (!built.ok || !result) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={project.name} />
        <Callout tone="bad" title={bn ? "প্ল্যানটি এই জমিতে আঁটে না" : "The plan does not fit this plot"}>
          {built.ok ? "" : bn ? built.reasons.map((r) => r.message.bn).join(" ") : built.reasons.map((r) => r.message.en).join(" ")}
        </Callout>
      </div>
    );
  }

  const model = built.model;
  const fr = result.frame;
  const level = result.levels[Math.min(levelIdx, result.levels.length - 1)];
  const sIdx = Math.min(storeyIdx, model.storeys.length - 1);
  const failures = result.failures;
  const sys = seismicPack().systems.rows;
  const columnsAt = fr.columns.map((c) => ({ id: c.id, x: c.xMm, y: c.yMm, util: c.storeys[Math.min(levelIdx, c.storeys.length - 1)].util }));

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} />

      <Callout tone="warn" title={bn ? "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়" : "Screening, not final design"}>
        {bn
          ? "লাইসেন্সপ্রাপ্ত কাঠামো প্রকৌশলীকে নকশা করে স্বাক্ষর করতে হবে। এখানে টর্শন, বায়ু, গতিশীল বিশ্লেষণ ও মাটির পরীক্ষা বিবেচনা করা হয়নি। অনুপাত ১০০%-এর বেশি হলে সেটি অনুত্তীর্ণ; কখনো ১০০%-এ আটকে দেওয়া হয় না।"
          : "A licensed structural engineer must design and sign the structure. Torsion, wind, dynamic analysis and soil tests are not considered here. A ratio over 100 % is a failure and is never clamped to 100 %."}
      </Callout>

      <VerdictStrip
        aria-label={bn ? "ফলাফল" : "Result"}
        items={[
          { tone: result.util > 1 ? "bad" : result.util > 0.9 ? "warn" : "ok", value: ratioText(result.util), label: bn ? "সর্বোচ্চ অনুপাত (সীমা ১০০%)" : "worst ratio (limit 100%)" },
          { tone: failures.length > 0 ? "bad" : "ok", value: failures.length, label: bn ? "সদস্য সীমা ছাড়িয়েছে" : failures.length === 1 ? "member over its limit" : "members over their limit" },
        ]}
      />

      <div className="row" style={{ gap: 16, margin: "16px 0", flexWrap: "wrap" }}>
        <Stat label={bn ? "পর্যায়কাল (সেকেন্ড)" : "Period (s)"} value={fr.seismicX.periodS.toFixed(2)} />
        <Stat label={bn ? "বেস শিয়ার (কিনি)" : "Base shear (kN)"} value={fr.seismicX.baseShearKn.toFixed(0)} />
        <Stat label={bn ? "ভূকম্পন ডিজাইন ক্যাটাগরি" : "Seismic design category"} value={fr.seismicX.category} />
      </div>

      <section className="stack" style={{ gap: 12 }} aria-label={bn ? "ইনপুট" : "Inputs"}>
        <h3 style={{ margin: 0 }}>{bn ? "ইনপুট (অনুমান)" : "Inputs (assumptions)"}</h3>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small muted">{bn ? "সাইট ক্লাস (ঢাকা, Z = ০.২০)" : "Site class (Dhaka, Z = 0.20)"}</span>
            <select className="input" value={siteClass} onChange={(e) => setSiteClass(e.target.value as SiteClass)}>
              {SITE_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small muted">{bn ? "কাঠামো পদ্ধতি (সারণি ৬.২.১৯)" : "Structural system (Table 6.2.19)"}</span>
            <select className="input" value={systemId} onChange={(e) => setSystemId(e.target.value)}>
              {sys.map((s) => <option key={s.id} value={s.id}>{`${s.label} (R ${s.r})`}</option>)}
            </select>
          </label>
          <label className="stack" style={{ gap: 4 }}>
            <span className="small muted">{bn ? "অনুমোদিত মাটির ধারণক্ষমতা (কিপাস্কাল)" : "Allowable soil bearing (kPa)"}</span>
            <input className="input" type="number" min={50} max={600} step={10} value={bearing} onChange={(e) => setBearing(Math.max(50, Number(e.target.value) || 150))} />
          </label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {bn
            ? "সাইট ক্লাস, কাঠামো পদ্ধতি ও মাটির ধারণক্ষমতা জমি থেকে জানা যায় না; মাটি পরীক্ষার ফলাফল দিয়ে এগুলো বদলান। অনুমোদিত ঝুঁকি শ্রেণি II (ফ্ল্যাট), I = ১.০০।"
            : "Site class, system and soil bearing are not known from the plot; replace them with the soil report. Occupancy category II (flats), I = 1.00."}
        </p>
      </section>

      <section className="stack" style={{ marginTop: 20, gap: 12 }} aria-label={bn ? "অনুত্তীর্ণ সদস্য" : "Failures"}>
        <h3 style={{ margin: 0 }}>{bn ? "আগে অনুত্তীর্ণগুলো" : "Failures first"}</h3>
        {failures.length === 0 ? (
          <Card><p className="muted" style={{ margin: 0 }}>{bn ? "কোনো সদস্য সীমা ছাড়ায়নি (প্রাথমিক যাচাইয়ে)।" : "No member exceeds its limit in this screening."}</p></Card>
        ) : (
          failures.slice(0, 20).map((f, i) => (
            <Card key={`${f.id}-${i}`} className="stack">
              <div className="row-between">
                <h4 style={{ margin: 0 }}>{`${bn ? MEMBER_LABEL[f.member].bn : MEMBER_LABEL[f.member].en} ${f.id}`}</h4>
                <ResultChip result="fail" lang={lang}>{ratioText(f.util)}</ResultChip>
              </div>
              <span className="small muted">{(bn ? "নিয়ন্ত্রক: " : "Governs: ") + f.governs}{f.level >= 0 ? (bn ? ` · স্তর ${f.level}` : ` · level ${f.level}`) : ""}</span>
            </Card>
          ))
        )}
        {failures.length > 20 ? <p className="small muted">{(bn ? "আরও " : "and ") + (failures.length - 20) + (bn ? "টি" : " more")}</p> : null}
        {failures.some((f) => f.member === "seismic") ? (
          <Callout title={bn ? "ভূমিকম্প ড্রিফট বা স্থিতিশীলতা" : "Seismic drift or stability"}>
            {bn ? "সবচেয়ে বড় কলাম নিয়েও সীমা পার হলে শিয়ার ওয়াল বা গভীরতর বিম লাগবে; এই যাচাই সেগুলো বসায় না।" : "When the largest stock column still exceeds the limit, the building needs shear walls or deeper beams; this screening does not add them."}
          </Callout>
        ) : null}
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "গ্রিড" : "Grid"}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{bn ? "গ্রিড, স্ল্যাব ও বিম" : "Grid, slabs and beams"}</h3>
          <label className="row" style={{ gap: 8 }}>
            <span className="small muted">{bn ? "স্তর (তলার উপরের স্ল্যাব)" : "Level (slab above storey)"}</span>
            <select className="input" value={level.index} onChange={(e) => setLevelIdx(Number(e.target.value))}>
              {result.levels.map((l) => <option key={l.index} value={l.index}>{`${l.index}${l.kind === "roof" ? (bn ? " (ছাদ)" : " (roof)") : ""}`}</option>)}
            </select>
          </label>
        </div>
        <PlanGrid level={level} widthMm={model.widthMm} depthMm={model.depthMm} columnsAt={columnsAt} bn={bn} />
        <p className="small muted" style={{ margin: 0 }}>{bn ? "রং: সবুজ ≤ ৯০%, হলুদ ৯০–১০০%, লাল > ১০০%। স্ল্যাবের লেবেলে পুরুত্ব (মিমি)।" : "Colour: green up to 90 %, amber 90–100 %, red over 100 %. Slab labels show the thickness in mm."}</p>

        <h4 style={{ margin: "8px 0 0" }}>{bn ? "স্ল্যাব" : "Slabs"}</h4>
        <Table
          head={[bn ? "স্ল্যাব" : "Slab", bn ? "ধরন" : "Type", bn ? "কেস" : "Case", bn ? "পুরুত্ব (মিমি)" : "Thickness (mm)", bn ? "ধনাত্মক ও ঋণাত্মক মোমেন্ট (কিনিমি/মি)" : "+M / −M (kN·m/m)", bn ? "অনুপাত" : "Ratio", bn ? "নিয়ন্ত্রক" : "Governs"]}
          rows={level.panels.map((p) => [
            `S${p.px + 1}-${p.py + 1}`,
            p.result.type === "two-way" ? (bn ? "দ্বিমুখী" : "two-way") : bn ? "একমুখী" : "one-way",
            p.result.caseNo || "–",
            p.result.thicknessMm,
            `${Math.max(p.result.short.posKnM, p.result.long?.posKnM ?? 0).toFixed(1)} / ${Math.max(p.result.short.negKnM, p.result.long?.negKnM ?? 0).toFixed(1)}`,
            <ResultChip key="r" result={ratioResult(p.result.util)} lang={lang}>{ratioText(p.result.util)}</ResultChip>,
            p.result.governs,
          ])}
        />

        <h4 style={{ margin: "8px 0 0" }}>{bn ? "বিম লাইন" : "Beam lines"}</h4>
        <Table
          head={[bn ? "লাইন" : "Line", bn ? "স্প্যান" : "Spans", bn ? "সেকশন (মিমি)" : "Section (mm)", bn ? "সর্বোচ্চ ঋণাত্মক / ধনাত্মক মোমেন্ট (কিনিমি)" : "Max −M / +M (kN·m)", bn ? "অনুপাত" : "Ratio", bn ? "নিয়ন্ত্রক" : "Governs"]}
          rows={level.beamLines.map((b) => {
            const worst = b.result.spans.reduce((a, c) => (c.util > a.util ? c : a));
            return [
              `${b.orientation === "h" ? "y" : "x"} = ${(b.at / 1000).toFixed(2)} m`,
              b.result.spans.length,
              `${b.result.section.bMm} × ${b.result.section.hMm}`,
              `${Math.max(...b.result.spans.map((s) => Math.max(s.mNegLeftKnM, s.mNegRightKnM))).toFixed(0)} / ${Math.max(...b.result.spans.map((s) => s.mPosKnM)).toFixed(0)}`,
              <ResultChip key="r" result={ratioResult(b.result.util)} lang={lang}>{ratioText(b.result.util)}</ResultChip>,
              worst.governs,
            ];
          })}
        />
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "কলাম ও ফুটিং" : "Columns and footings"}>
        <div className="row-between">
          <h3 style={{ margin: 0 }}>{bn ? "কলাম ও ফুটিং" : "Columns and footings"}</h3>
          <label className="row" style={{ gap: 8 }}>
            <span className="small muted">{bn ? "তলা" : "Storey"}</span>
            <select className="input" value={sIdx} onChange={(e) => setStoreyIdx(Number(e.target.value))}>
              {model.storeys.map((_, i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </label>
        </div>
        <Table
          head={[bn ? "কলাম" : "Column", bn ? "অবস্থান" : "Position", bn ? "সেকশন (মিমি)" : "Section (mm)", bn ? "রড অনুপাত" : "Steel", bn ? "লোড Pu (কিনি)" : "Pu (kN)", bn ? "অনুপাত" : "Ratio", bn ? "নিয়ন্ত্রক" : "Governs", bn ? "ফুটিং (মিমি)" : "Footing (mm)"]}
          rows={fr.columns.map((c) => {
            const st = c.storeys[sIdx];
            return [
              c.id,
              c.position,
              `${st.section.bx} × ${st.section.by}`,
              `${(st.rho * 100).toFixed(2)}%`,
              st.puKn.toFixed(0),
              <ResultChip key="r" result={ratioResult(st.util)} lang={lang}>{ratioText(st.util)}</ResultChip>,
              st.governs,
              sIdx === 0 ? `${c.footing.sideMm} × ${c.footing.depthMm} (${ratioText(c.footing.util)})` : "–",
            ];
          })}
        />
        <p className="small muted" style={{ margin: 0 }}>
          {bn ? "ফুটিং কেবল নিচের তলায় (তলা ০) দেখানো হয়।" : "Footings are shown for storey 0 only."}
          {fr.converged ? "" : bn ? " সাইজিং লুপ সীমায় পৌঁছেছে।" : " The sizing loop reached its iteration limit."}
        </p>
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "ভূমিকম্প" : "Seismic"}>
        <h3 style={{ margin: 0 }}>{bn ? "ভূমিকম্প (সমতুল্য স্থির পদ্ধতি)" : "Earthquake (equivalent static)"}</h3>
        <div className="row" style={{ gap: 16, flexWrap: "wrap" }}>
          <Stat label="Z" value={fr.seismicX.z.toFixed(2)} />
          <Stat label="I" value={fr.seismicX.importance.toFixed(2)} />
          <Stat label="R / Cd" value={`${fr.seismicX.system.r} / ${fr.seismicX.system.cd}`} />
          <Stat label="Cs" value={fr.seismicX.cs.toFixed(2)} />
          <Stat label="Sa" value={fr.seismicX.sa.toFixed(4)} />
          <Stat label={bn ? "ওজন (কিনি)" : "Weight (kN)"} value={fr.seismicX.weightKn.toFixed(0)} />
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          <Value unit=" m">{fr.seismicX.heightM.toFixed(1)}</Value>
          {" · "}
          {fr.seismicX.permitted ? (bn ? "এই ক্যাটাগরিতে পদ্ধতিটি অনুমোদিত" : "System permitted in this category") : bn ? "এই ক্যাটাগরিতে পদ্ধতিটি অনুমোদিত নয়" : "System not permitted in this category"}
          {fr.seismicX.staticApplicable ? "" : bn ? " · স্থির পদ্ধতি প্রযোজ্য নয়, গতিশীল বিশ্লেষণ লাগবে" : " · static procedure not applicable, dynamic analysis needed"}
        </p>
        <SeismicTable s={fr.seismicX} dir="x" bn={bn} />
        <SeismicTable s={fr.seismicY} dir="y" bn={bn} />
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 8 }} aria-label={bn ? "অনুমান" : "Assumptions"}>
        <h3 style={{ margin: 0 }}>{bn ? "অনুমান" : "Assumptions"}</h3>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          {result.assumptions.map((a) => <li key={a.id}>{bn ? a.bn : a.en}</li>)}
        </ul>
      </section>
    </div>
  );
}
