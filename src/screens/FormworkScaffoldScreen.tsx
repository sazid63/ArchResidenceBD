import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { useActiveProject } from "../context/ProjectContext";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import { generateFormworkQuantities, generateScaffoldQuantities, generateFormworkScaffoldReport, exportFormworkCSV, exportScaffoldCSV } from "../cad/formworkScaffold";
import type { FormworkSummary, ScaffoldSummary, FormworkItem, ScaffoldItem } from "../cad/formworkScaffold";
import type { MeshDocument } from "../cad/mesh";
import { fmtBdt, fmtNum } from "../i18n";

interface TypeTotals {
  areaM2: number;
  shutteringM2: number;
}

interface ScaffoldTotals {
  areaM2: number;
  volumeM3: number;
}

export function FormworkScaffoldScreen() {
  const { t, lang } = useI18n();
  const project = useActiveProject();
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [formwork, setFormwork] = useState<FormworkSummary | null>(null);
  const [scaffold, setScaffold] = useState<ScaffoldSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"formwork" | "scaffold" | "report">("formwork");
  const [materialFilter, setMaterialFilter] = useState<string>("all");

  useEffect(() => {
    if (!project) {
      setError("No active project found");
      setLoading(false);
      return;
    }
    
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const meshDoc = generateBuildingMesh(project, "final", project.customization);
        setMesh(meshDoc);
        
        const formworkData = generateFormworkQuantities(meshDoc, project.id);
        const scaffoldData = generateScaffoldQuantities(meshDoc, project.id);
        
        setFormwork(formworkData);
        setScaffold(scaffoldData);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [project]);

  if (error) {
    return (
      <div className="screen">
        <PageHeader title={t("formworkTitle")} subtitle={t("formworkSubtitle")} />
        <Card>
          <p className="muted">{error}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <PageHeader title={t("formworkTitle")} subtitle={t("formworkSubtitle")} />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "ফর্মওয়ার্ক ও স্ক্যাফোল্ড গণনা হচ্ছে..." : "Calculating formwork & scaffold..."}
        </div>
      </div>
    );
  }

  const filteredFormworkItems = useMemo(() => 
    formwork?.items?.filter((item) => 
      materialFilter === "all" || item.material === materialFilter
    ) || [],
  [formwork?.items, materialFilter]
  );

  const uniqueMaterials = useMemo(() => 
    Array.from(new Set(formwork?.items?.map((item) => item.material) || [])),
  [formwork?.items]
  );

  const avgReuse = useMemo(() => {
    if (!formwork?.items?.length) return 0;
    return Math.round(formwork.items.reduce((sum: number, i: FormworkItem) => sum + i.reuseCount, 0) / formwork.items.length);
  }, [formwork?.items]);

  const maxLoadClass = useMemo(() => {
    if (!scaffold?.items) return "Light";
    if (scaffold.items.some((i: ScaffoldItem) => i.loadClass === "heavy")) return "Heavy";
    if (scaffold.items.some((i: ScaffoldItem) => i.loadClass === "medium")) return "Medium";
    return "Light";
  }, [scaffold?.items]);

  const formworkMaterialCost = useMemo(() => {
    if (!formwork?.byMaterial) return 0;
    return Object.entries(formwork.byMaterial).reduce(
      (sum: number, [mat, totals]: [string, TypeTotals]) => sum + totals.shutteringM2 * (mat === "aluminum" ? 8500 : mat === "steel" ? 3500 : mat === "plywood" ? 1200 : 850),
      0
    );
  }, [formwork?.byMaterial]);

  const totalEstimateCost = useMemo(() => {
    const formworkCost = formwork?.byMaterial 
      ? Object.entries(formwork.byMaterial).reduce(
        (sum: number, [mat, totals]: [string, TypeTotals]) => sum + totals.shutteringM2 * (mat === "aluminum" ? 8500 : mat === "steel" ? 3500 : mat === "plywood" ? 1200 : 850),
        0
      )
      : 0;
    const scaffoldCost = (scaffold?.totalScaffoldAreaM2 || 0) * 250;
    return formworkCost + scaffoldCost;
  }, [formwork?.byMaterial, scaffold?.totalScaffoldAreaM2]);

  return (
    <div className="screen">
      <PageHeader
        title={t("formworkTitle")}
        subtitle={t("formworkSubtitle")}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={() => {
              const report = generateFormworkScaffoldReport(mesh!, project!.name, project!.id);
              const blob = new Blob([report], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${project!.id}_formwork_scaffold_report.md`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              {lang === "bn" ? "রিপোর্ট ডাউনলোড" : "Download Report"}
            </Button>
            <Button variant="soft" onClick={() => {
              if (formwork && scaffold) {
                const csv = `${exportFormworkCSV(formwork)}\n\n---SCAFFOLD---\n${exportScaffoldCSV(scaffold)}`;
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${project!.id}_formwork_scaffold.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}>
              {lang === "bn" ? "CSV এক্সপোর্ট" : "Export CSV"}
            </Button>
          </div>
        }
      />

      {/* Tab Navigation */}
      <div className="row" style={{ gap: "8px", marginBottom: "16px", borderBottom: "1px solid var(--border)", paddingBottom: "8px" }}>
        <Button variant={activeTab === "formwork" ? "primary" : "soft"} onClick={() => setActiveTab("formwork")}>
          {lang === "bn" ? "ফর্মওয়ার্ক" : "Formwork"} ({formwork?.items?.length || 0})
        </Button>
        <Button variant={activeTab === "scaffold" ? "primary" : "soft"} onClick={() => setActiveTab("scaffold")}>
          {lang === "bn" ? "স্ক্যাফোল্ড" : "Scaffold"} ({scaffold?.items?.length || 0})
        </Button>
        <Button variant={activeTab === "report" ? "primary" : "soft"} onClick={() => setActiveTab("report")}>
          {lang === "bn" ? "সারসংক্ষেপ" : "Summary"}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat label={lang === "bn" ? "মোট ফর্মওয়ার্ক এলাকা" : "Total Formwork Area"} value={`${formwork?.totalFormworkAreaM2?.toLocaleString() || 0} m²`} />
        <Stat label={lang === "bn" ? "মোট শাটারিং (পুনর্ব্যবহার সহ)" : "Total Shuttering (with reuse)"} value={`${formwork?.totalShutteringM2?.toLocaleString() || 0} m²`} />
        <Stat label={lang === "bn" ? "মোট স্ক্যাফোল্ড এলাকা" : "Total Scaffold Area"} value={`${scaffold?.totalScaffoldAreaM2?.toLocaleString() || 0} m²`} />
        <Stat label={lang === "bn" ? "মোট স্ক্যাফোল্ড ভলিউম" : "Total Scaffold Volume"} value={`${scaffold?.totalScaffoldVolumeM3?.toLocaleString() || 0} m³`} />
      </div>

      {/* Formwork Tab */}
      {activeTab === "formwork" && (
        <div>
          {/* Material Filter */}
          <div className="row" style={{ gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <span style={{ alignSelf: "center", opacity: 0.7 }}>{lang === "bn" ? "উপাদান দিয়ে ফিল্টার:" : "Filter by material:"}</span>
            {["all", ...uniqueMaterials].map((mat) => (
              <Button
                key={mat}
                variant={materialFilter === mat ? "primary" : "soft"}
                onClick={() => setMaterialFilter(mat)}
                style={{ textTransform: "capitalize" }}
              >
                {mat}
              </Button>
            ))}
          </div>

          {/* Formwork by Type */}
          <Card className="stack" style={{ marginBottom: "16px" }}>
            <h3 style={{ marginBottom: "8px", fontSize: "14px", opacity: 0.7 }}>
              {lang === "bn" ? "ফর্মওয়ার্ক টাইপ অনুযায়ী" : "Formwork by Type"}
            </h3>
            <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
              {Object.entries(formwork?.byType || {}).map(([type, totals]: [string, TypeTotals]) => (
                <Badge key={type} tone="sky">
                  {type}: {totals.areaM2.toLocaleString()} m² (shuttering: {totals.shutteringM2.toLocaleString()} m²)
                </Badge>
              ))}
            </div>
          </Card>

          {/* Formwork by Material */}
          <Card className="stack" style={{ marginBottom: "16px" }}>
            <h3 style={{ marginBottom: "8px", fontSize: "14px", opacity: 0.7 }}>
              {lang === "bn" ? "উপাদান অনুযায়ী" : "By Material"}
            </h3>
            <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
              {Object.entries(formwork?.byMaterial || {}).map(([mat, totals]: [string, TypeTotals]) => (
                <Badge key={mat} tone="sage">
                  {mat}: {totals.areaM2.toLocaleString()} m² (shuttering: {totals.shutteringM2.toLocaleString()} m²)
                </Badge>
              ))}
            </div>
          </Card>

          {/* Formwork Items Table */}
          <Card className="stack">
            <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
                  <th scope="col" style={{ padding: "10px" }}>#</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলিমেন্ট" : "Element"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "টাইপ" : "Type"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলাকা (m²)" : "Area (m²)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "কংক্রিট (m³)" : "Concrete (m³)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "উপাদান" : "Material"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "পুনর্ব্যবহার" : "Reuses"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "শাটারিং (m²)" : "Shuttering (m²)"}</th>
                </tr>
              </thead>
              <tbody>
                {filteredFormworkItems.map((item, idx: number) => (
                  <tr key={item.elementId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{item.label}</strong>
                      <div className="faint small">{item.elementKind}</div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge tone="sky">{item.formworkType}</Badge>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(item.formworkAreaM2, lang)}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(item.concreteVolumeM3, lang)}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge tone="amber">{item.material}</Badge>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {item.reuseCount}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(item.totalShutteringM2, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "12px", textAlign: "right" }}>
                    {lang === "bn" ? "মোট:" : "Total:"}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(formwork?.totalFormworkAreaM2 || 0, lang)}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(formwork?.items?.reduce((sum: number, i: FormworkItem) => sum + i.concreteVolumeM3, 0) || 0, lang)}
                  </td>
                  <td colSpan={2} style={{ padding: "12px" }}></td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(formwork?.totalShutteringM2 || 0, lang)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      {/* Scaffold Tab */}
      {activeTab === "scaffold" && (
        <div>
          {/* Scaffold by Type */}
          <Card className="stack" style={{ marginBottom: "16px" }}>
            <h3 style={{ marginBottom: "8px", fontSize: "14px", opacity: 0.7 }}>
              {lang === "bn" ? "স্ক্যাফোল্ড টাইপ অনুযায়ী" : "Scaffold by Type"}
            </h3>
            <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
              {Object.entries(scaffold?.byType || {}).map(([type, totals]: [string, ScaffoldTotals]) => (
                <Badge key={type} tone="amber">
                  {type}: {totals.areaM2.toLocaleString()} m² ({totals.volumeM3.toLocaleString()} m³)
                </Badge>
              ))}
            </div>
          </Card>

          {/* Scaffold Items Table */}
          <Card className="stack">
            <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8 }}>
                  <th scope="col" style={{ padding: "10px" }}>#</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলিমেন্ট" : "Element"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "টাইপ" : "Type"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "এলাকা (m²)" : "Area (m²)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "উচ্চতা (m)" : "Height (m)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "ভলিউম (m³)" : "Volume (m³)"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "লোড ক্লাস" : "Load Class"}</th>
                  <th scope="col" style={{ padding: "10px" }}>{lang === "bn" ? "সময় (দিন)" : "Duration (days)"}</th>
                </tr>
              </thead>
              <tbody>
                {scaffold?.items?.map((item, idx: number) => (
                  <tr key={item.elementId} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)", opacity: 0.6 }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <strong>{item.label}</strong>
                      <div className="faint small">{item.elementKind}</div>
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge tone="amber">{item.scaffoldType}</Badge>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(item.areaM2, lang)}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {item.heightM}
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {fmtNum(item.areaM2 * item.heightM, lang)}
                    </td>
                    <td style={{ padding: "10px" }}>
                      <Badge tone={item.loadClass === "heavy" ? "blush" : item.loadClass === "medium" ? "amber" : "sage"}>
                        {item.loadClass}
                      </Badge>
                    </td>
                    <td style={{ padding: "10px", fontFamily: "var(--font-mono)" }}>
                      {item.durationDays}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                  <td colSpan={3} style={{ padding: "12px", textAlign: "right" }}>
                    {lang === "bn" ? "মোট:" : "Total:"}
                  </td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(scaffold?.totalScaffoldAreaM2 || 0, lang)}
                  </td>
                  <td style={{ padding: "12px" }}></td>
                  <td style={{ padding: "12px", fontFamily: "var(--font-mono)" }}>
                    {fmtNum(scaffold?.totalScaffoldVolumeM3 || 0, lang)}
                  </td>
                  <td colSpan={2} style={{ padding: "12px" }}></td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      {/* Report/Summary Tab */}
      {activeTab === "report" && (
        <Card className="stack">
          <h3 style={{ marginBottom: "12px" }}>{lang === "bn" ? "প্রকল্প সারসংক্ষেপ" : "Project Summary"}</h3>
          <div className="row" style={{ gap: "24px", flexWrap: "wrap" }}>
            <div className="stack" style={{ flex: 1, minWidth: "280px" }}>
              <h4>{lang === "bn" ? "ফর্মওয়ার্ক" : "Formwork"}</h4>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "মোট যোগাযোগ এলাকা:" : "Total contact area:"} <strong>{formwork?.totalFormworkAreaM2?.toLocaleString() || 0} m²</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "মোট শাটারিং:" : "Total shuttering:"} <strong>{formwork?.totalShutteringM2?.toLocaleString() || 0} m²</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "উপাদান সংখ্যা:" : "Materials used:"} <strong>{Object.keys(formwork?.byMaterial || {}).length}</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "পুনর্ব্যবহার স্তর:" : "Avg reuse:"} <strong>{formwork?.items && formwork.items.length > 0 ? Math.round(formwork.items.reduce((sum: number, i: FormworkItem) => sum + i.reuseCount, 0) / formwork.items.length) : 0}x</strong>
              </p>
            </div>
            <div className="stack" style={{ flex: 1, minWidth: "280px" }}>
              <h4>{lang === "bn" ? "স্ক্যাফোল্ড" : "Scaffold"}</h4>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "মোট এলাকা:" : "Total area:"} <strong>{scaffold?.totalScaffoldAreaM2?.toLocaleString() || 0} m²</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "মোট ভলিউম:" : "Total volume:"} <strong>{scaffold?.totalScaffoldVolumeM3?.toLocaleString() || 0} m³</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "টাইপ সংখ্যা:" : "Types used:"} <strong>{Object.keys(scaffold?.byType || {}).length}</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "গুরুতম লোড ক্লাস:" : "Max load class:"} <strong>{scaffold?.items?.some((i: ScaffoldItem) => i.loadClass === "heavy") ? "Heavy" : scaffold?.items?.some((i: ScaffoldItem) => i.loadClass === "medium") ? "Medium" : "Light"}</strong>
              </p>
            </div>
            <div className="stack" style={{ flex: 1, minWidth: "280px" }}>
              <h4>{lang === "bn" ? "অনুমানিত খরচ" : "Estimated Cost"}</h4>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "ফর্মওয়ার্ক উপাদান খরচ:" : "Formwork material:"} <strong>৳{Object.entries(formwork?.byMaterial || {}).reduce((sum: number, [mat, totals]: [string, TypeTotals]) => sum + totals.shutteringM2 * (mat === "aluminum" ? 8500 : mat === "steel" ? 3500 : mat === "plywood" ? 1200 : 850), 0).toLocaleString()}</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "স্ক্যাফোল্ড ভাড়া (সprecated):" : "Scaffold hire (est):"} <strong>৳{((scaffold?.totalScaffoldAreaM2 || 0) * 250).toLocaleString()}</strong>
              </p>
              <p className="small muted" style={{ margin: "4px 0" }}>
                {lang === "bn" ? "মোট অনুমানিত:" : "Total estimate:"} <strong>৳{(Object.entries(formwork?.byMaterial || {}).reduce((sum: number, [mat, totals]: [string, TypeTotals]) => sum + totals.shutteringM2 * (mat === "aluminum" ? 8500 : mat === "steel" ? 3500 : mat === "plywood" ? 1200 : 850), 0) + (scaffold?.totalScaffoldAreaM2 || 0) * 250).toLocaleString()}</strong>
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}