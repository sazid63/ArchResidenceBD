import { useMemo } from "react";
import { useProject } from "../context/ProjectContext";
import { useI18n } from "../i18n";
import { buildingForProject } from "../model/projectMesh";
import { MAX_SPAN_MM } from "../plans/rules";
import { analyzeStructure } from "../structure/analyze";
import { Button, Callout, EmptyState, PageHeader, Stat, VerdictStrip } from "../ui/kit";

const m2 = (mm: number) => (mm / 1000).toFixed(2);

/** Positions of the structural lines along one axis, and the clear spans between neighbours. */
export function lineSpans(lines: number[], structural: number[]) {
  const pos = structural.map((i) => lines[i]);
  return pos.map((p, i) => ({ at: p, span: i === 0 ? null : p - pos[i - 1] }));
}

/**
 * The column grid of the chosen plan, and what the structure needs on it. The grid comes from the plan
 * (columns and beams sit on its structural lines), the sizes from the Structure screen's analysis: nothing here is a
 * separate estimate. Replaces the v2 "grid optimiser", which compared invented grids with an invented score.
 */
export function ColumnGridOptimizerScreen({ onNavigate }: { onNavigate?: (id: string) => void }) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const { project } = useProject();

  const built = useMemo(() => (project && project.plot && project.planId ? buildingForProject(project) : null), [project]);
  const data = useMemo(() => {
    if (!built || !built.ok) return null;
    const model = built.model;
    const fitted = model.storeys[0].geometry.fitted;
    const result = analyzeStructure(model);
    return { model, fitted, result, xs: lineSpans(fitted.xLines, fitted.structuralX), ys: lineSpans(fitted.yLines, fitted.structuralY) };
  }, [built]);

  const title = bn ? "কলাম গ্রিড" : "Column grid";
  const subtitle = bn ? "নকশার আসল কাঠামোগত গ্রিড ও তার উপর কলামের মাপ" : "The plan's structural grid and the column sizes it needs";

  if (!project || !built) {
    return (
      <div className="screen">
        <PageHeader title={title} subtitle={subtitle} />
        <EmptyState title={bn ? "এখনো কোনো প্ল্যান বাছাই হয়নি" : "No plan chosen yet"}>
          {bn ? "জমির মাপ দিয়ে একটি প্ল্যান বাছাই করুন, তারপর এখানে গ্রিড দেখা যাবে।" : "Enter the plot and pick a plan, then its column grid appears here."}
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

  const { model, result, xs, ys } = data;
  const columns = result.frame.columns;
  const spansX = xs.map((l) => l.span).filter((s): s is number => s !== null);
  const spansY = ys.map((l) => l.span).filter((s): s is number => s !== null);
  const longest = Math.max(...spansX, ...spansY);
  const sizeAt = (c: (typeof columns)[number], k: number) => {
    const s = c.storeys[Math.min(k, c.storeys.length - 1)].section;
    return `${s.bx} × ${s.by}`;
  };
  const top = columns[0] ? columns[0].storeys.length - 1 : 0;
  const biggest = columns.reduce((m, c) => Math.max(m, c.storeys[0].section.bx * c.storeys[0].section.by), 0);
  const csv = () => {
    const rows = [["column", "x_mm", "y_mm", "ground_mm", "top_mm", "max_ratio", "footing_mm"], ...columns.map((c) => [c.id, c.xMm, c.yMm, sizeAt(c, 0), sizeAt(c, top), Math.max(...c.storeys.map((s) => s.util)).toFixed(3), c.footing.sideMm])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/[^\w-]+/g, "_") || "project"}-columns.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader title={title} subtitle={subtitle} actions={<Button variant="ghost" onClick={csv}>{bn ? "সিএসভি ডাউনলোড" : "Download CSV"}</Button>} />

      <Callout title={bn ? "গ্রিড নকশা থেকে আসে" : "The grid comes from the plan"}>
        {bn
          ? "কলাম ও বিম নকশার কাঠামোগত লাইনেই বসে, তাই গ্রিড বদলাতে নকশা বদলাতে হয়। কলামের মাপ স্ট্রাকচার স্ক্রিনের বিশ্লেষণ থেকে; এটি প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়।"
          : "Columns and beams sit on the plan's own structural lines, so changing the grid means changing the plan. Column sizes are from the Structure screen's analysis: screening, not final design."}
      </Callout>

      <VerdictStrip
        aria-label={bn ? "গ্রিডের সারসংক্ষেপ" : "Grid summary"}
        items={[
          { tone: longest > MAX_SPAN_MM ? "bad" : "ok", value: `${m2(longest)} m`, label: bn ? `দীর্ঘতম স্প্যান (সীমা ${m2(MAX_SPAN_MM)} মি)` : `longest span (limit ${m2(MAX_SPAN_MM)} m)` },
          { tone: result.failures.length > 0 ? "bad" : "ok", value: result.failures.length, label: bn ? "সদস্য সীমা ছাড়িয়েছে" : result.failures.length === 1 ? "member over its limit" : "members over their limit" },
        ]}
      />

      <div className="row" style={{ gap: 16, margin: "0 0 16px", flexWrap: "wrap" }}>
        <Stat label={bn ? "কলাম (প্রতি তলায়)" : "Columns per storey"} value={String(columns.length)} />
        <Stat label={bn ? "গ্রিড (X × Y লাইন)" : "Grid (X × Y lines)"} value={`${xs.length} × ${ys.length}`} />
        <Stat label={bn ? "বৃহত্তম কলাম (মিমি)" : "Largest column (mm)"} value={`${Math.round(Math.sqrt(biggest))} sq`} />
        <Stat label={bn ? "তলা" : "Storeys"} value={String(model.storeys.length)} />
      </div>

      <section className="stack" style={{ gap: 12 }} aria-label={bn ? "গ্রিড লাইন" : "Grid lines"}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>{bn ? "গ্রিড লাইন ও স্প্যান" : "Grid lines and spans"}</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "লাইন" : "Line"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "অবস্থান (মি)" : "Position (m)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "আগের লাইন থেকে স্প্যান (মি)" : "Span from previous (m)"}</th>
              </tr>
            </thead>
            <tbody>
              {[["X", xs], ["Y", ys]].flatMap(([axis, lines]) =>
                (lines as typeof xs).map((l, i) => (
                  <tr key={`${axis}${i}`}>
                    <td>{`${axis}${i + 1}`}</td>
                    <td style={{ textAlign: "right" }}>{m2(l.at)}</td>
                    <td style={{ textAlign: "right" }}>{l.span === null ? "-" : m2(l.span)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="stack" style={{ marginTop: 24, gap: 12 }} aria-label={bn ? "কলাম" : "Columns"}>
        <h2 style={{ margin: 0, fontSize: "var(--fs-lg)" }}>{bn ? "কলামের মাপ" : "Column sizes"}</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{bn ? "কলাম" : "Column"}</th>
                <th style={{ textAlign: "right" }}>X, Y (m)</th>
                <th style={{ textAlign: "right" }}>{bn ? "নিচতলা (মিমি)" : "Ground (mm)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "উপরের তলা (মিমি)" : "Top storey (mm)"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "সর্বোচ্চ অনুপাত" : "Max ratio"}</th>
                <th style={{ textAlign: "right" }}>{bn ? "ফুটিং (মিমি)" : "Footing (mm)"}</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => {
                const u = Math.max(...c.storeys.map((s) => s.util));
                return (
                  <tr key={c.id}>
                    <td>{c.id}</td>
                    <td style={{ textAlign: "right" }}>{m2(c.xMm)}, {m2(c.yMm)}</td>
                    <td style={{ textAlign: "right" }}>{sizeAt(c, 0)}</td>
                    <td style={{ textAlign: "right" }}>{sizeAt(c, top)}</td>
                    <td style={{ textAlign: "right" }}>{(u * 100).toFixed(1)}%</td>
                    <td style={{ textAlign: "right" }}>{(() => { const fo = result.foundation.footings.find((f) => f.columnIds.includes(c.id)); return fo && fo.kind !== "isolated" ? fo.id : c.footing.sideMm; })()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {onNavigate ? (
          <div>
            <Button variant="soft" onClick={() => onNavigate("structure")}>{bn ? "স্ট্রাকচার স্ক্রিন খুলুন" : "Open the Structure screen"}</Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
