import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, type BuildingProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { MeshDocument, MeshObject } from "../cad/mesh";
import {
  CONCRETE_GRADES,
  STEEL_GRADES,
  type ConcreteSpec,
  type SteelSpec,
} from "../cad/structuralEngine";

interface GridConfig {
  colsX: number;
  colsY: number;
  colSize: number; // mm (square column)
  beamDepth: number; // mm
  beamWidth: number; // mm
}

interface SpanResult {
  spanX: number; // mm
  spanY: number; // mm;
  gridCount: number;
  totalColumns: number;
  beamVolumeM3: number;
  colVolumeM3: number;
  totalConcreteM3: number;
  totalSteelKg: number;
  efficiencyScore: number;
  notes: string[];
}

const STANDARD_GRID_CONFIGS: GridConfig[] = [
  { colsX: 3, colsY: 2, colSize: 250, beamDepth: 450, beamWidth: 250 },
  { colsX: 4, colsY: 3, colSize: 250, beamDepth: 500, beamWidth: 250 },
  { colsX: 4, colsY: 3, colSize: 300, beamDepth: 550, beamWidth: 300 },
  { colsX: 5, colsY: 3, colSize: 300, beamDepth: 600, beamWidth: 300 },
  { colsX: 5, colsY: 4, colSize: 350, beamDepth: 650, beamWidth: 350 },
];

const BNBC_MAX_SPAN_MM = 7500; // 7.5m absolute max for concrete beams per BNBC 2020
const BNBC_MAX_SPAN_LIVE_MM = 6000; // 6.0m for live load residential

export function ColumnGridOptimizerScreen() {
  const { t, lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigIdx, setSelectedConfigIdx] = useState<number>(1);

  const customization = project?.customization;
  const concreteGrade = customization?.concreteGrade ?? 25;
  const steelGrade = customization?.steelGrade ?? 415;

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
        const meshDoc = generateBuildingMesh(project, "final", customization);
        setMesh(meshDoc);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [project, customization]);

  const spanResults = useMemo(() => {
    if (!project || !mesh) return [];

    const results: SpanResult[] = [];
    const plotSqm = project.plotSqm || 200;
    const floorAreaPerFloor = plotSqm * 0.65; // 65% MGC

    // Building footprint dimensions from mesh
    const cols = mesh.objects.filter((o: MeshObject) => o.kind === "column");
    const beams = mesh.objects.filter((o: MeshObject) => o.kind === "beam");
    const slabs = mesh.objects.filter((o: MeshObject) => o.kind === "slab");
    const footings = mesh.objects.filter((o: MeshObject) => o.kind === "footing");

    for (let i = 0; i < STANDARD_GRID_CONFIGS.length; i++) {
      const config = STANDARD_GRID_CONFIGS[i];
      const notes: string[] = [];

      // Calculate spans
      const bldgMinX = Math.min(...cols.map(c => c.bboxMinMm[0]));
      const bldgMaxX = Math.max(...cols.map(c => c.bboxMaxMm[0]));
      const bldgMinY = Math.min(...cols.map(c => c.bboxMinMm[1]));
      const bldgMaxY = Math.max(...cols.map(c => c.bboxMaxMm[1]));

      const bldgWidth = bldgMaxX - bldgMinX;
      const bldgLength = bldgMaxY - bldgMinY;

      const spanX = bldgWidth / (config.colsX - 1);
      const spanY = bldgLength / (config.colsY - 1);

      // Check span compliance
      if (spanX > BNBC_MAX_SPAN_MM) {
        notes.push(`X-axis span ${Math.round(spanX / 1000)}m exceeds BNBC max 7.5m`);
      }
      if (spanY > BNBC_MAX_SPAN_MM) {
        notes.push(`Y-axis span ${Math.round(spanY / 1000)}m exceeds BNBC max 7.5m`);
      }

      // Calculate volumes
      const totalColumns = config.colsX * config.colsY;
      const colHeightMm = project.stories * 3000; // 3m per story
      const colVolume = totalColumns * Math.pow(config.colSize, 2) * colHeightMm / 1e9;

      // Beam volumes (grid lines)
      const beamLengthX = config.colsY * bldgLength; // number of X-direction beam lines × length
      const beamLengthY = config.colsX * bldgWidth; // number of Y-direction beam lines × width
      const totalBeamLength = beamLengthX + beamLengthY;
      const beamVolumePerFloor = totalBeamLength * config.beamDepth * config.beamWidth / 1e9;
      const beamVolume = beamVolumePerFloor * project.stories;

      // Slab volume
      const slabVolume = floorAreaPerFloor * 0.125 * project.stories; // 125mm slab

      // Total concrete
      const totalConcrete = colVolume + beamVolume + slabVolume;

      // Steel estimation (simplified: ~120 kg/m³ concrete for residential)
      const totalSteelKg = totalConcrete * 120;

      // Efficiency score: lower steel/concrete ratio = higher efficiency
      const efficiencyScore = Math.min(100, Math.max(0, 100 - (spanX + spanY) / 150));

      // Check slenderness of columns
      const colSlenderness = colHeightMm / config.colSize;
      if (colSlenderness > 15) {
        notes.push(`Column slenderness ratio ${Math.round(colSlenderness)} exceeds recommended 15`);
      }

      // Check beam-to-column ratio
      const beamColRatio = config.beamDepth / config.colSize;
      if (beamColRatio < 1.2) {
        notes.push(`Beam-to-column depth ratio ${beamColRatio.toFixed(1)} — consider deeper beams`);
      }

      results.push({
        spanX: Math.round(spanX),
        spanY: Math.round(spanY),
        gridCount: totalColumns,
        totalColumns,
        beamVolumeM3: Math.round(beamVolume * 100) / 100,
        colVolumeM3: Math.round(colVolume * 100) / 100,
        totalConcreteM3: Math.round(totalConcrete * 100) / 100,
        totalSteelKg: Math.round(totalSteelKg),
        efficiencyScore: Math.round(efficiencyScore),
        notes,
      });
    }

    return results;
  }, [mesh, project, customization]);

  // Compare with existing mesh
  const currentMeshStats = useMemo(() => {
    if (!mesh) return null;
    const cols = mesh.objects.filter((o: MeshObject) => o.kind === "column");
    const beams = mesh.objects.filter((o: MeshObject) => o.kind === "beam");
    const footings = mesh.objects.filter((o: MeshObject) => o.kind === "footing");

    const colCount = cols.length;
    const beamVol = beams.reduce((sum, b) => sum + b.volumeMm3, 0) / 1e9;
    const colVol = cols.reduce((sum, c) => sum + c.volumeMm3, 0) / 1e9;
    const footingVol = footings.reduce((sum, f) => sum + f.volumeMm3, 0) / 1e9;

    return {
      colCount,
      beamVol: Math.round(beamVol * 100) / 100,
      colVol: Math.round(colVol * 100) / 100,
      footingVol: Math.round(footingVol * 100) / 100,
      totalVol: Math.round((beamVol + colVol + footingVol) * 100) / 100,
    };
  }, [mesh]);

  const handleDownloadReport = () => {
    if (!project) return;

    let md = `# Column Grid Optimization Report — ${project.name}\n\n`;
    md += `**Project ID:** ${project.id}\n`;
    md += `**Location:** ${project.address || "Dhaka, Bangladesh"}\n`;
    md += `**Stories:** ${project.stories}\n`;
    md += `**Plot Area:** ${project.plotSqm} m²\n`;
    md += `**Concrete:** M${concreteGrade} · **Steel:** Fe${steelGrade}\n`;
    md += `**Generated:** ${new Date().toLocaleString("en-GB")}\n`;
    md += `**Standard:** BNBC 2020 Part 3 (Structural Design)\n\n`;

    md += `---\n\n## Current Grid Configuration (from Mesh)\n\n`;
    if (currentMeshStats) {
      md += `| Metric | Value |\n|--------|-------|\n`;
      md += `| Columns | ${currentMeshStats.colCount} |\n`;
      md += `| Column Volume | ${currentMeshStats.colVol} m³ |\n`;
      md += `| Beam Volume | ${currentMeshStats.beamVol} m³ |\n`;
      md += `| Footing Volume | ${currentMeshStats.footingVol} m³ |\n`;
      md += `| Total Concrete | ${currentMeshStats.totalVol} m³ |\n\n`;
    }

    md += `---\n\n## Grid Configuration Comparison\n\n`;
    md += `| Config | Grid | Col Size (mm) | Span X (mm) | Span Y (mm) | Col Volume (m³) | Beam Volume (m³) | Total Concrete (m³) | Est. Steel (kg) | Efficiency | Compliance |\n`;
    md += `|--------|------|---------------|-------------|-------------|-----------------|------------------|---------------------|-----------------|------------|------------|\n`;
    for (let i = 0; i < spanResults.length; i++) {
      const r = spanResults[i];
      const config = STANDARD_GRID_CONFIGS[i];
      const compliant = r.notes.every(n => !n.includes("exceeds"));
      md += `| ${i + 1} | ${config.colsX}×${config.colsY} | ${config.colSize} | ${Math.round(r.spanX)} | ${Math.round(r.spanY)} | ${r.colVolumeM3} | ${r.beamVolumeM3} | ${r.totalConcreteM3} | ${r.totalSteelKg} | ${r.efficiencyScore}/100 | ${compliant ? "✓" : "✗"} |\n`;
    }

    md += `\n---\n\n## Selected Configuration (${selectedConfigIdx + 1})\n\n`;
    const selected = spanResults[selectedConfigIdx];
    const selectedConfig = STANDARD_GRID_CONFIGS[selectedConfigIdx];
    if (selected) {
      md += `| Property | Value |\n|----------|-------|\n`;
      md += `| Grid Layout | ${selectedConfig.colsX}×${selectedConfig.colsY} |\n`;
      md += `| Total Columns | ${selected.totalColumns} |\n`;
      md += `| Span X | ${Math.round(selected.spanX / 1000)} m |\n`;
      md += `| Span Y | ${Math.round(selected.spanY / 1000)} m |\n`;
      md += `| Column Size | ${selectedConfig.colSize} mm |\n`;
      md += `| Beam Depth | ${selectedConfig.beamDepth} mm |\n`;
      md += `| Total Concrete | ${selected.totalConcreteM3} m³ |\n`;
      md += `| Estimated Steel | ${selected.totalSteelKg} kg |\n`;
      md += `| Efficiency Score | ${selected.efficiencyScore}/100 |\n\n`;

      if (selected.notes.length > 0) {
        md += `### Notes\n\n`;
        for (const n of selected.notes) {
          md += `- ${n}\n`;
        }
        md += `\n`;
      }
    }

    md += `---\n\n## Standards Reference\n\n`;
    md += `- BNBC 2020 Part 3: Maximum beam span for residential = 7.5m\n`;
    md += `- Column slenderness ratio limit = 15 (for short columns)\n`;
    md += `- Beam-to-column depth ratio ≥ 1.2 recommended\n`;
    md += `- Steel ratio = 120 kg/m³ (typical for residential RCC)\n`;
    md += `- Concrete cover = 40mm (exposure class moderate)\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_column_grid.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!project) {
    return (
      <div className="screen">
        <PageHeader
          title={t("columnGridTitle")}
          subtitle={t("columnGridSubtitle")}
        />
        <Card>
          <p className="muted">{lang === "bn" ? "কোনো সক্রিয় প্রকল্প পাওয়া যায়নি" : "No active project found"}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <PageHeader
          title={t("columnGridTitle")}
          subtitle={t("columnGridSubtitle")}
        />
        <Card>
          <p className="muted">{error}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <PageHeader
          title={t("columnGridTitle")}
          subtitle={t("columnGridSubtitle")}
        />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "কলাম গ্রিড অপ্টিমাইজ করা হচ্ছে..." : "Optimizing column grid..."}
        </div>
      </div>
    );
  }

  const selected = spanResults[selectedConfigIdx];
  const selectedConfig = STANDARD_GRID_CONFIGS[selectedConfigIdx];

  return (
    <div className="screen">
      <PageHeader
        title={t("columnGridTitle")}
        subtitle={t("columnGridSubtitle")}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={handleDownloadReport}>
              {lang === "bn" ? "রিপোর্ট ডাউনলোড" : "Download Report"}
            </Button>
          </div>
        }
      />

      {/* Current Mesh Stats */}
      {currentMeshStats && (
        <Card className="stack" style={{ marginBottom: "16px" }}>
          <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
            {lang === "bn" ? "বর্তমান গ্রিড (মেশ থেকে)" : "Current Grid (from Mesh)"}
          </h3>
          <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
            <Stat
              label={lang === "bn" ? "কলাম সংখ্যা" : "Column Count"}
              value={currentMeshStats.colCount.toString()}
            />
            <Stat
              label={lang === "bn" ? "কলাম আয়তন (m³)" : "Column Volume"}
              value={`${currentMeshStats.colVol} m³`}
            />
            <Stat
              label={lang === "bn" ? "বীম আয়তন (m³)" : "Beam Volume"}
              value={`${currentMeshStats.beamVol} m³`}
            />
            <Stat
              label={lang === "bn" ? "মোট গুটি (m³)" : "Total Concrete"}
              value={`${currentMeshStats.totalVol} m³`}
            />
          </div>
        </Card>
      )}

      {/* Grid Comparison */}
      <Card className="stack" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
          {lang === "bn" ? "গ্রিড কনফিগারেশন তুলনা" : "Grid Configuration Comparison"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          {spanResults.map((r, i) => {
            const config = STANDARD_GRID_CONFIGS[i];
            const compliant = r.notes.every((n) => !n.includes("exceeds"));
            const isSelected = selectedConfigIdx === i;
            return (
              <button
                key={i}
                type="button"
                className="chip"
                onClick={() => setSelectedConfigIdx(i)}
                style={{
                  cursor: "pointer",
                  padding: "12px",
                  fontSize: "12px",
                  borderColor: compliant ? "var(--tone-sage)" : "var(--tone-amber)",
                  borderWidth: isSelected ? "2px" : "1px",
                  background: isSelected ? "var(--surface-sunken)" : undefined,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                    {config.colsX}×{config.colsY} Grid
                  </div>
                  <Badge tone={compliant ? "sage" : "amber"}>
                    {r.totalConcreteM3} m³
                  </Badge>
                  <div className="small muted" style={{ marginTop: "4px" }}>
                    {r.efficiencyScore}/100 {lang === "bn" || "Efficiency"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected Configuration Details */}
      {selected && (
        <Card className="stack">
          <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
            {lang === "bn" ? "নির্বাচিত কনফিগারেশন" : "Selected Configuration"}
          </h3>

          <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
            <Stat
              label={lang === "bn" ? "স্প্যান X" : "Span X"}
              value={`${Math.round(selected.spanX / 1000)} m`}
            />
            <Stat
              label={lang === "bn" ? "স্প্যান Y" : "Span Y"}
              value={`${Math.round(selected.spanY / 1000)} m`}
            />
            <Stat
              label={lang === "bn" ? "মোট কলাম" : "Total Columns"}
              value={selected.totalColumns.toString()}
            />
            <Stat
              label={lang === "bn" ? "ইফিশিয়েন্সি" : "Efficiency"}
              value={`${selected.efficiencyScore}/100`}
            />
          </div>

          <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
            <Stat
              label={lang === "bn" ? "কলাম আয়তন" : "Column Volume"}
              value={`${selected.colVolumeM3} m³`}
            />
            <Stat
              label={lang === "bn" ? "বীম আয়তন" : "Beam Volume"}
              value={`${selected.beamVolumeM3} m³`}
            />
            <Stat
              label={lang === "bn" ? "মোট গুটি" : "Total Concrete"}
              value={`${selected.totalConcreteM3} m³`}
            />
            <Stat
              label={lang === "bn" ? "অনুমানিক ছলnm" : "Est. Steel"}
              value={`${selected.totalSteelKg} kg`}
            />
          </div>

          {selected.notes.length > 0 && (
            <div style={{ marginTop: "16px", padding: "12px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "13px" }}>
                {lang === "bn" ? " নোটসমূহ" : "Notes & Recommendations"}
              </h4>
              <ul style={{ margin: 0, paddingLeft: "16px", fontSize: "12px" }}>
                {selected.notes.map((note, i) => (
                  <li key={i} className="muted">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
