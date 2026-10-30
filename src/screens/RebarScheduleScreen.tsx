import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, type BuildingProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import { generateRebarDetails, type BarBendingSchedule, type RebarDetail } from "../cad/rebarDetailer";
import type { MeshDocument, MeshObject } from "../cad/mesh";
import { fmtNum } from "../i18n";

const STEEL_COST_BDT_PER_KG = 95; // ~95,000 BDT/ton for Fe415

interface MemberSchedule {
  elementId: string;
  label: string;
  memberType: "column" | "beam" | "footing" | "slab";
  dimensions: { width: number; depth: number; length: number };
  count: number;
  bbs: BarBendingSchedule;
}

export function RebarScheduleScreen() {
  const { t, lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [members, setMembers] = useState<MemberSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<number | null>(null);
  const [filterType, setFilterType] = useState<string>("all");

  const concreteGrade = project?.customization?.concreteGrade ?? 25;
  const steelGrade = project?.customization?.steelGrade ?? 415;

  useEffect(() => {
    if (!project) {
      setError("No active project found");
      setLoading(false);
      return;
    }

    const loadData = () => {
      setLoading(true);
      setError(null);
      try {
        const meshDoc = generateBuildingMesh(project, "final", project.customization);
        setMesh(meshDoc);

        const memberSchedules: MemberSchedule[] = [];
        const custom = project.customization || {};

        // Columns
        const columns = meshDoc.objects.filter((o: MeshObject) => o.kind === "column");
        const colWidth = custom.columnWidthMm ?? 250;
        const colDepth = custom.columnDepthMm ?? 300;
        for (const col of columns) {
          const dx = col.bboxMaxMm[0] - col.bboxMinMm[0];
          const dy = col.bboxMaxMm[1] - col.bboxMinMm[1];
          const dz = col.bboxMaxMm[2] - col.bboxMinMm[2];
          const bbs = generateRebarDetails(project.id, "column", {
            width: dx || colWidth,
            depth: dy || colDepth,
            length: dz || 3000,
          }, { axialLoad: 500000 }, concreteGrade, steelGrade, 40);
          memberSchedules.push({
            elementId: col.id,
            label: col.label,
            memberType: "column",
            dimensions: { width: dx || colWidth, depth: dy || colDepth, length: dz || 3000 },
            count: 1,
            bbs,
          });
        }

        // Beams
        const beams = meshDoc.objects.filter((o: MeshObject) => o.kind === "beam");
        for (const beam of beams) {
          const dx = beam.bboxMaxMm[0] - beam.bboxMinMm[0];
          const dy = beam.bboxMaxMm[1] - beam.bboxMinMm[1];
          const dz = beam.bboxMaxMm[2] - beam.bboxMinMm[2];
          // Determine orientation: longest dimension is the length
          const dims = [dx, dy, dz].sort((a, b) => b - a);
          const bbs = generateRebarDetails(project.id, "beam", {
            width: dims[2] || 250,
            depth: dims[1] || 450,
            length: dims[0] || 4000,
          }, { moment: 25000000 }, concreteGrade, steelGrade, 40);
          memberSchedules.push({
            elementId: beam.id,
            label: beam.label,
            memberType: "beam",
            dimensions: { width: dims[2] || 250, depth: dims[1] || 450, length: dims[0] || 4000 },
            count: 1,
            bbs,
          });
        }

        // Footings
        const footings = meshDoc.objects.filter((o: MeshObject) => o.kind === "footing");
        for (const ftg of footings) {
          const dx = ftg.bboxMaxMm[0] - ftg.bboxMinMm[0];
          const dy = ftg.bboxMaxMm[1] - ftg.bboxMinMm[1];
          const dz = ftg.bboxMaxMm[2] - ftg.bboxMinMm[2];
          const bbs = generateRebarDetails(project.id, "footing", {
            width: dx || 1500,
            depth: dz || 500,
            length: dy || 1500,
          }, { axialLoad: 500000 }, concreteGrade, steelGrade, 75);
          memberSchedules.push({
            elementId: ftg.id,
            label: ftg.label,
            memberType: "footing",
            dimensions: { width: dx || 1500, depth: dz || 500, length: dy || 1500 },
            count: 1,
            bbs,
          });
        }

        // Slabs (aggregate per floor)
        const slabs = meshDoc.objects.filter((o: MeshObject) => o.kind === "slab");
        const slabGroups = new Map<number, MeshObject[]>();
        for (const slab of slabs) {
          const floor = Math.round(slab.bboxMinMm[2] / 3000);
          if (!slabGroups.has(floor)) slabGroups.set(floor, []);
          slabGroups.get(floor)!.push(slab);
        }
        for (const [floor, floorSlabs] of slabGroups.entries()) {
          const totalWidth = Math.max(...floorSlabs.map(s => s.bboxMaxMm[0] - s.bboxMinMm[0]));
          const totalDepth = Math.max(...floorSlabs.map(s => s.bboxMaxMm[1] - s.bboxMinMm[1]));
          const totalLength = Math.max(...floorSlabs.map(s => s.bboxMaxMm[0] - s.bboxMinMm[0]));
          const bbs = generateRebarDetails(project.id, "slab", {
            width: totalDepth || 6000,
            depth: 150,
            length: totalLength || 9000,
          }, {}, concreteGrade, steelGrade, 25);
          memberSchedules.push({
            elementId: `slab-floor-${floor}`,
            label: `${lang === "bn" ? "তলা" : "Floor"} ${floor + 1} ${lang === "bn" ? "স্ল্যাব" : "Slab"} (${floorSlabs.length} ${lang === "bn" ? "প্যানেল" : "panels"})`,
            memberType: "slab",
            dimensions: { width: totalDepth || 6000, depth: 150, length: totalLength || 9000 },
            count: floorSlabs.length,
            bbs,
          });
        }

        setMembers(memberSchedules);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [project, lang]);

  // Totals across all members
  const totals = useMemo(() => {
    let totalWeight = 0;
    let totalBars = 0;
    const byDiameter: Record<number, { count: number; weightKg: number }> = {};

    for (const m of members) {
      for (const item of m.bbs.items) {
        const memberWeight = item.weightKg * (item.shape === "link" || item.role === "mesh" ? 1 : m.count);
        // For mesh items, weight already accounts for count; for straight bars scale by member count
        const weight = item.role === "mesh" || item.role === "link" ? item.weightKg : item.weightKg * m.count;
        totalWeight += weight;
        totalBars += (item.role === "mesh" || item.role === "link" ? item.count : item.count * m.count);

        if (!byDiameter[item.diameterMm]) byDiameter[item.diameterMm] = { count: 0, weightKg: 0 };
        byDiameter[item.diameterMm].count += (item.role === "mesh" || item.role === "link" ? item.count : item.count * m.count);
        byDiameter[item.diameterMm].weightKg += weight;
      }
    }

    return {
      totalWeight: Math.round(totalWeight * 100) / 100,
      totalTons: Math.round(totalWeight / 1000 * 100) / 100,
      totalBars,
      byDiameter,
      estimatedCostBDT: Math.round(totalWeight * STEEL_COST_BDT_PER_KG),
    };
  }, [members]);

  if (!project) {
    return (
      <div className="screen">
        <PageHeader title={t("rebarTitle")} subtitle={t("rebarSubtitle")} />
        <Card>
          <p className="muted">{lang === "bn" ? "কোনো সক্রিয় প্রকল্প পাওয়া যায়নি" : "No active project found"}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <PageHeader title={t("rebarTitle")} subtitle={t("rebarSubtitle")} />
        <Card>
          <p className="muted">{error}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <PageHeader title={t("rebarTitle")} subtitle={t("rebarSubtitle")} />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "BBS গণনা হচ্ছে..." : "Calculating Bar Bending Schedule..."}
        </div>
      </div>
    );
  }

  const filteredMembers = members.filter((m) => filterType === "all" || m.memberType === filterType);
  const memberTypes = ["all", "column", "beam", "footing", "slab"];

  const handleDownloadCSV = () => {
    const header = "Member,Element,Mark,Role,Shape,Dia (mm),Cut Length (mm),Bends,Count,Weight (kg)";
    const rows: string[] = [];
    for (const m of filteredMembers) {
      for (const item of m.bbs.items) {
        const count = (item.role === "mesh" || item.role === "link") ? item.count : item.count * m.count;
        const weight = (item.role === "mesh" || item.role === "link") ? item.weightKg : Math.round(item.weightKg * m.count * 100) / 100;
        rows.push(`"${m.label}","${m.elementId}","${item.mark}","${item.role}","${item.shape}",${item.diameterMm},${item.cutLengthMm},"${item.bendAngles.join("/")}°",${count},${weight}`);
      }
    }
    const footer = `\n\nTotal Weight: ${totals.totalWeight} kg\nTotal Tons: ${totals.totalTons}\nEstimated Cost: BDT ${totals.estimatedCostBDT.toLocaleString()}`;
    const csv = [header, ...rows, footer].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_rebar_bbs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    let md = `# Bar Bending Schedule — ${project.name}\n\n`;
    md += `**Project ID:** ${project.id}\n`;
    md += `**Concrete:** M${concreteGrade} · **Steel:** Fe${steelGrade}\n`;
    md += `**Standard:** BNBC 2020 / ACI 318-19\n`;
    md += `**Generated:** ${new Date().toLocaleString("en-GB")}\n\n`;
    md += `## Totals\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Total Steel | ${totals.totalWeight.toLocaleString()} kg (${totals.totalTons} t) |\n`;
    md += `| Total Bars | ${totals.totalBars.toLocaleString()} |\n`;
    md += `| Estimated Cost | ৳${totals.estimatedCostBDT.toLocaleString()} |\n\n`;
    md += `### By Diameter\n\n| Dia (mm) | Count | Weight (kg) |\n|----------|-------|-------------|\n`;
    for (const [dia, totalsDia] of Object.entries(totals.byDiameter)) {
      md += `| ${dia} | ${totalsDia.count.toLocaleString()} | ${totalsDia.weightKg.toLocaleString()} |\n`;
    }
    md += `\n---\n\n## Member Details\n\n`;
    for (const m of filteredMembers) {
      md += `### ${m.label}\n`;
      md += `*${m.dimensions.width} × ${m.dimensions.depth} × ${m.dimensions.length} mm (×${m.count})*\n\n`;
      md += `| Mark | Role | Dia (mm) | Cut (mm) | Bends | Count | Weight (kg) |\n|------|------|----------|----------|-------|-------|-------------|\n`;
      for (const item of m.bbs.items) {
        md += `| ${item.mark} | ${item.role} | ${item.diameterMm} | ${item.cutLengthMm} | ${item.bendAngles.length ? item.bendAngles.join("°/") + "°" : "—"} | ${item.count} | ${item.weightKg} |\n`;
      }
      md += `\n`;
      if (m.bbs.assumptions.length > 0) {
        md += `Assumptions:\n`;
        for (const a of m.bbs.assumptions) {
          md += `- ${a.reason} (${a.codeRef})\n`;
        }
        md += `\n`;
      }
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_rebar_bbs.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader
        title={t("rebarTitle")}
        subtitle={t("rebarSubtitle")}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={handleDownloadCSV}>
              {lang === "bn" ? "CSV এক্সপোর্ট" : "Export CSV"}
            </Button>
            <Button variant="soft" onClick={handleDownloadMarkdown}>
              {lang === "bn" ? "রিপোর্ট ডাউনলোড" : "Download Report"}
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat label={lang === "bn" ? "মোট স্টিল" : "Total Steel"} value={`${totals.totalWeight.toLocaleString()} kg`} />
        <Stat label={lang === "bn" ? "টন" : "Tons"} value={`${totals.totalTons}`} />
        <Stat label={lang === "bn" ? "মোট রড" : "Total Bars"} value={totals.totalBars.toLocaleString()} />
        <Stat label={lang === "bn" ? "অনুমানিত খরচ" : "Est. Cost"} value={`৳${totals.estimatedCostBDT.toLocaleString()}`} />
      </div>

      {/* By Diameter */}
      <Card className="stack" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "8px", fontSize: "14px", opacity: 0.7 }}>
          {lang === "bn" ? "ডাইয়ামিটার অনুযায়ী" : "By Diameter"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          {Object.entries(totals.byDiameter).map(([dia, d]) => (
            <Badge key={dia} tone="lavender">
              {dia}mm: {d.count.toLocaleString()} {lang === "bn" ? "পিস" : "pcs"} · {d.weightKg.toLocaleString()} kg
            </Badge>
          ))}
        </div>
      </Card>

      {/* Filter */}
      <div className="row" style={{ gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {memberTypes.map((type) => (
          <Button
            key={type}
            variant={filterType === type ? "primary" : "soft"}
            onClick={() => setFilterType(type)}
            style={{ textTransform: "capitalize" }}
          >
            {type === "all"
              ? (lang === "bn" ? "সব" : "All")
              : `${type} (${members.filter((m) => m.memberType === type).length})`}
          </Button>
        ))}
      </div>

      {/* Member Cards */}
      <div className="stack" style={{ gap: "12px" }}>
        {filteredMembers.map((m, idx) => {
          const isSelected = selectedMember === idx;
          const memberWeight = m.bbs.items.reduce((sum, item) => {
            return sum + (item.role === "mesh" || item.role === "link" ? item.weightKg : item.weightKg * m.count);
          }, 0);
          return (
            <Card
              key={m.elementId}
              className="stack"
              style={{
                cursor: "pointer",
                border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border)",
              }}
              onClick={() => setSelectedMember(isSelected ? null : idx)}
            >
              <div className="row-between">
                <div>
                  <h4 style={{ margin: "0 0 4px 0" }}>{m.label}</h4>
                  <span className="faint small font-mono">
                    {m.dimensions.width} × {m.dimensions.depth} × {m.dimensions.length} mm
                    {m.count > 1 ? ` × ${m.count}` : ""}
                  </span>
                </div>
                <div className="row" style={{ gap: "8px" }}>
                  <Badge tone="sky">{m.memberType}</Badge>
                  <Badge tone="sage">{Math.round(memberWeight * 100) / 100} kg</Badge>
                </div>
              </div>

              {isSelected && (
                <div style={{ marginTop: "8px" }}>
                  <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8, fontSize: "12px" }}>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "মার্ক" : "Mark"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "ভূমিকা" : "Role"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "ডায়া" : "Dia"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "কাট (মিমি)" : "Cut (mm)"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "ব্যান্ড" : "Bends"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "সংখ্যার" : "Count"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "ওজন (কেজি)" : "Weight (kg)"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.bbs.items.map((item: RebarDetail) => (
                        <tr key={item.mark} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>{item.mark}</td>
                          <td style={{ padding: "8px" }}>
                            <Badge tone="neutral">{item.role}</Badge>
                          </td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            ⌀{item.diameterMm}
                          </td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            {item.cutLengthMm.toLocaleString()}
                          </td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            {item.bendAngles.length > 0 ? item.bendAngles.map((a) => `${a}°`).join(" ") : "—"}
                          </td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            {item.role === "mesh" || item.role === "link" ? item.count : `${item.count} × ${m.count}`}
                          </td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            {Math.round((item.role === "mesh" || item.role === "link" ? item.weightKg : item.weightKg * m.count) * 100) / 100}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {m.bbs.assumptions.length > 0 && (
                    <div style={{ marginTop: "8px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)", fontSize: "12px" }}>
                      <strong>{lang === "bn" ? "অনুমান:" : "Assumptions:"}</strong>
                      {m.bbs.assumptions.map((a, i) => (
                        <div key={i} className="small muted" style={{ marginTop: "4px" }}>
                          • {a.reason} <span className="font-mono">({a.codeRef})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}