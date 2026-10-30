import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, type BuildingProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { MeshDocument } from "../cad/mesh";

interface RoomSpec {
  id: string;
  nameEn: string;
  nameBn: string;
  kind: string;
  minAreaM2: number;
  maxAreaM2: number;
  minWidthMm: number;
  minLengthMm?: number;
  maxLengthMm?: number;
  count: number;
  totalAreaM2: number;
}

interface UnitConfig {
  id: string;
  label: string;
  rooms: RoomSpec[];
  totalAreaM2: number;
  totalUnits: number;
}

interface OptimizationResult {
  unitType: string;
  unitCount: number;
  unitAreaM2: number;
  totalAreaM2: number;
  compliance: {
    name: string;
    passed: boolean;
    detail: string;
  }[];
  issues: string[];
}

// BNBC 2020 minimum room sizes (in sqm) per residential requirements
const BNBC_MIN_ROOM_SIZES: Record<string, { min: number; labelEn: string; labelBn: string }> = {
  living: { min: 12.0, labelEn: "Living Room", labelBn: "গড় ঘর" },
  bedroom: { min: 9.0, labelEn: "Bedroom", labelBn: "শোবার ঘর" },
  master_bedroom: { min: 12.0, labelEn: "Master Bedroom", labelBn: "মাস্টার বেডরুম" },
  kitchen: { min: 5.0, labelEn: "Kitchen", labelBn: "রান্নাঘর" },
  dining: { min: 8.0, labelEn: "Dining Room", labelBn: "ডিনিং ঘর" },
  bathroom: { min: 3.5, labelEn: "Bathroom", labelBn: "স্নানাগার" },
  balcony: { min: 3.0, labelEn: "Balcony", labelBn: "জানালা টেরrace" },
  corridor: { min: 1.5, labelEn: "Corridor", labelBn: "গলিয়াঢ়" },
  stair: { min: 2.5, labelEn: "Stairwell", labelBn: " স্তরাঙ্গ" },
};

// Standard flat types in Bangladesh
const UNIT_CONFIGS: UnitConfig[] = [
  {
    id: "studio",
    label: "Studio Apartment",
    rooms: [
      { id: "living", nameEn: "Living", nameBn: "গড় ঘর", kind: "living", minAreaM2: 12, maxAreaM2: 20, minWidthMm: 3000, minLengthMm: 4000, count: 1, totalAreaM2: 15 },
      { id: "kitchen", nameEn: "Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", minAreaM2: 5, maxAreaM2: 8, minWidthMm: 2000, minLengthMm: 2500, count: 1, totalAreaM2: 6 },
      { id: "bath", nameEn: "Bathroom", nameBn: "স্নানাগার", kind: "bathroom", minAreaM2: 3.5, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
      { id: "balcony", nameEn: "Balcony", nameBn: "জানালা টেরrace", kind: "balcony", minAreaM2: 3, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
    ],
    totalAreaM2: 29,
    totalUnits: 0,
  },
  {
    id: "1bed",
    label: "1-Bedroom (1BHK)",
    rooms: [
      { id: "living", nameEn: "Living", nameBn: "গড় ঘর", kind: "living", minAreaM2: 12, maxAreaM2: 18, minWidthMm: 3000, minLengthMm: 4000, count: 1, totalAreaM2: 15 },
      { id: "bedroom", nameEn: "Bedroom", nameBn: "শোবার ঘর", kind: "bedroom", minAreaM2: 9, maxAreaM2: 14, minWidthMm: 3000, maxLengthMm: 4000, count: 1, totalAreaM2: 12 },
      { id: "kitchen", nameEn: "Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", minAreaM2: 5, maxAreaM2: 8, minWidthMm: 2000, minLengthMm: 2500, count: 1, totalAreaM2: 6 },
      { id: "bath", nameEn: "Bathroom", nameBn: "স্নানাগার", kind: "bathroom", minAreaM2: 3.5, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
      { id: "balcony", nameEn: "Balcony", nameBn: "জানালা টেরrace", kind: "balcony", minAreaM2: 3, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
    ],
    totalAreaM2: 41,
    totalUnits: 0,
  },
  {
    id: "2bed",
    label: "2-Bedroom (2BHK)",
    rooms: [
      { id: "living", nameEn: "Living", nameBn: "গড় ঘর", kind: "living", minAreaM2: 15, maxAreaM2: 20, minWidthMm: 3500, minLengthMm: 4500, count: 1, totalAreaM2: 18 },
      { id: "bedroom", nameEn: "Bedroom", nameBn: "শোবার ঘর", kind: "bedroom", minAreaM2: 9, maxAreaM2: 12, minWidthMm: 3000, maxLengthMm: 4000, count: 1, totalAreaM2: 10 },
      { id: "master_bedroom", nameEn: "Master Bedroom", nameBn: "মাস্টার বেডরুম", kind: "master_bedroom", minAreaM2: 12, maxAreaM2: 16, minWidthMm: 3500, maxLengthMm: 4500, count: 1, totalAreaM2: 14 },
      { id: "kitchen", nameEn: "Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", minAreaM2: 5, maxAreaM2: 8, minWidthMm: 2000, minLengthMm: 2500, count: 1, totalAreaM2: 6 },
      { id: "dining", nameEn: "Dining", nameBn: "ডিনিং ঘর", kind: "dining", minAreaM2: 8, maxAreaM2: 12, minWidthMm: 2500, maxLengthMm: 3500, count: 1, totalAreaM2: 10 },
      { id: "bath", nameEn: "Bathroom", nameBn: "স্নানাগার", kind: "bathroom", minAreaM2: 3.5, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
      { id: "balcony", nameEn: "Balcony", nameBn: "জানালা টেরrace", kind: "balcony", minAreaM2: 3, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
    ],
    totalAreaM2: 66,
    totalUnits: 0,
  },
  {
    id: "3bed",
    label: "3-Bedroom (3BHK)",
    rooms: [
      { id: "living", nameEn: "Living", nameBn: "গড় ঘর", kind: "living", minAreaM2: 18, maxAreaM2: 25, minWidthMm: 4000, minLengthMm: 5500, count: 1, totalAreaM2: 22 },
      { id: "bedroom", nameEn: "Bedroom", nameBn: "শোবার ঘর", kind: "bedroom", minAreaM2: 9, maxAreaM2: 12, minWidthMm: 3000, maxLengthMm: 4000, count: 1, totalAreaM2: 10 },
      { id: "master_bedroom", nameEn: "Master Bedroom", nameBn: "মাস্টার বেডরুম", kind: "master_bedroom", minAreaM2: 12, maxAreaM2: 16, minWidthMm: 3500, maxLengthMm: 4500, count: 1, totalAreaM2: 14 },
      { id: "kitchen", nameEn: "Kitchen", nameBn: "রান্নাঘর", kind: "kitchen", minAreaM2: 5, maxAreaM2: 8, minWidthMm: 2000, minLengthMm: 2500, count: 1, totalAreaM2: 6 },
      { id: "dining", nameEn: "Dining", nameBn: "ডিনিং ঘর", kind: "dining", minAreaM2: 8, maxAreaM2: 12, minWidthMm: 2500, maxLengthMm: 3500, count: 1, totalAreaM2: 10 },
      { id: "bath", nameEn: "Bathroom", nameBn: "স্নানাগার", kind: "bathroom", minAreaM2: 3.5, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
      { id: "balcony", nameEn: "Balcony", nameBn: "জানালা টেরrace", kind: "balcony", minAreaM2: 3, maxAreaM2: 5, minWidthMm: 1500, minLengthMm: 2000, count: 1, totalAreaM2: 4 },
    ],
    totalAreaM2: 70,
    totalUnits: 0,
  },
];

// Standard room labels to match mesh roomKind
const ROOM_KIND_MAP: Record<string, string> = {
  "living": "living",
  "bedroom": "bedroom",
  "kitchen": "kitchen",
  "bath": "bathroom",
  "dining": "dining",
  "balcony": "balcony",
  "corridor": "corridor",
  "stair": "stair",
  "master": "master_bedroom",
};

export function UnitMixOptimizerScreen() {
  const { t, lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUnitConfig, setSelectedUnitConfig] = useState<string>("2bed");
  const [unitMix, setUnitMix] = useState<Record<string, number>>({ studio: 0, "1bed": 0, "2bed": 0, "3bed": 0 });

  const customization = project?.customization;
  const floorAreaPerFloor = (project?.plotSqm || 200) * 0.65; // 65% MGC
  const totalFloorArea = floorAreaPerFloor * (project?.stories || 1);

  const [results, setResults] = useState<OptimizationResult[]>([]);

  useEffect(() => {
    if (!project) {
      setError("No active project found");
      setLoading(false);
      return;
    }

    try {
      const meshDoc = generateBuildingMesh(project, "final", customization);
      setMesh(meshDoc);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [project, customization]);

  const optimizeMix = useMemo(() => {
    if (!project) return [];

    const config = UNIT_CONFIGS.find(c => c.id === selectedUnitConfig);
    if (!config) return [];

    const results: OptimizationResult[] = [];

    // Try each unit type and optimize the mix
    for (const unitConfig of UNIT_CONFIGS) {
      const unitArea = unitConfig.totalAreaM2 * 1.15; // 15% circulation/common area factor
      const unitsPerFloor = Math.floor(floorAreaPerFloor / unitArea);
      const totalUnits = unitsPerFloor * (project.stories || 1);

      if (totalUnits === 0) continue;

      const compliance: OptimizationResult["compliance"] = [];
      const issues: string[] = [];

      // Check each room against BNBC minimum sizes
      for (const room of unitConfig.rooms) {
        const spec = BNBC_MIN_ROOM_SIZES[room.kind];
        if (spec) {
          const passed = room.totalAreaM2 >= spec.min;
          if (!passed) {
            issues.push(
              lang === "bn"
                ? `${spec.labelBn} কমপক্ষে ${spec.min} মি² প্রয়োজন, আছে ${room.totalAreaM2} মি²`
                : `${spec.labelEn} needs minimum ${spec.min} m², has ${room.totalAreaM2} m²`
            );
          }
          compliance.push({
            name: spec.labelEn,
            passed,
            detail: `${room.totalAreaM2} m² (min: ${spec.min} m²)`,
          });
        }
      }

      // Check overall unit efficiency
      const buildingEfficiency = (unitConfig.totalAreaM2 * totalUnits) / totalFloorArea;
      const passedEfficiency = buildingEfficiency >= 0.45; // 45% efficiency threshold
      compliance.push({
        name: lang === "bn" ? "ইফিশিয়েন্সি" : "Efficiency",
        passed: passedEfficiency,
        detail: `${Math.round(buildingEfficiency * 100)}% (${Math.round(unitConfig.totalAreaM2 * totalUnits)} m² / ${Math.round(totalFloorArea)} m²)`,
      });

      if (buildingEfficiency < 0.45) {
        issues.push(
          lang === "bn"
            ? `ইফিশিয়েন্সি কম: ${Math.round(buildingEfficiency * 100)}%`
            : `Low efficiency: ${Math.round(buildingEfficiency * 100)}%`
        );
      }

      results.push({
        unitType: unitConfig.label,
        unitCount: totalUnits,
        unitAreaM2: Math.round(unitArea * 10) / 10,
        totalAreaM2: Math.round(unitConfig.totalAreaM2 * totalUnits * 10) / 10,
        compliance,
        issues,
      });
    }

    return results;
  }, [selectedUnitConfig, project, floorAreaPerFloor, totalFloorArea, lang]);

  const totalUnits = results.reduce((sum, r) => sum + r.unitCount, 0);
  const totalArea = results.reduce((sum, r) => sum + r.totalAreaM2, 0);

  const handleDownloadReport = () => {
    let md = `# Unit Mix Optimization Report — ${project?.name || "N/A"}\n\n`;
    md += `**Project ID:** ${project?.id || "N/A"}\n`;
    md += `**Location:** ${project?.address || "Dhaka, Bangladesh"}\n`;
    md += `**Stories:** ${project?.stories || 1}\n`;
    md += `**Plot Area:** ${project?.plotSqm || 0} m²\n`;
    md += `**Floor Area Per Floor:** ${Math.round(floorAreaPerFloor)} m²\n`;
    md += `**Total Floor Area:** ${Math.round(totalFloorArea)} m²\n`;
    md += `**Generated:** ${new Date().toLocaleString("en-GB")}\n`;
    md += `**Standard:** BNBC 2020 Residential Room Sizes\n\n`;

    md += `---\n\n## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Total Units | ${totalUnits} |\n`;
    md += `| Total Unit Area | ${Math.round(totalArea)} m² |\n`;
    md += `| Building Efficiency | ${Math.round((totalArea / totalFloorArea) * 100)}% |\n\n`;

    md += `---\n\n## Unit Mix Breakdown\n\n`;
    md += `| Unit Type | Count | Unit Area (m²) | Total Area (m²) | Compliance | Issues |\n`;
    md += `|-----------|-------|-----------------|-----------------|:---:|------|\n`;
    for (const r of results) {
      const allPass = r.compliance.every(c => c.passed);
      md += `| ${r.unitType} | ${r.unitCount} | ${r.unitAreaM2} | ${r.totalAreaM2} | ${allPass ? "✓" : "✗"} | ${r.issues.length} |\n`;
    }

    md += `\n---\n\n## Detailed Compliance\n\n`;
    for (const r of results) {
      md += `### ${r.unitType} (${r.unitCount} units)\n\n`;
      md += `| Room | Min (m²) | Actual (m²) | Status |\n|------|----------|-------------|--------|\n`;
      for (const c of r.compliance) {
        const spec = BNBC_MIN_ROOM_SIZES[c.name.toLowerCase().replace(/ /g, "_")] || BNBC_MIN_ROOM_SIZES[c.name.toLowerCase()];
        const minSize = spec ? spec.min : "?";
        md += `| ${c.name} | ${minSize} | ${c.detail.split(" (")[0]} | ${c.passed ? "✓ Pass" : "✗ Fail"} |\n`;
      }
      if (r.issues.length > 0) {
        md += `\n**Issues:**\n`;
        for (const issue of r.issues) {
          md += `- ${issue}\n`;
        }
      }
      md += `\n`;
    }

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.id || "project"}_unit_mix.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!project) {
    return (
      <div className="screen">
        <PageHeader
          title={t("unitMixTitle")}
          subtitle={t("unitMixSubtitle")}
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
          title={t("unitMixTitle")}
          subtitle={t("unitMixSubtitle")}
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
          title={t("unitMixTitle")}
          subtitle={t("unitMixSubtitle")}
        />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "ইউনিট মিক্স অপ্টিমাইজ করা হচ্ছে..." : "Optimizing unit mix..."}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <PageHeader
        title={t("unitMixTitle")}
        subtitle={t("unitMixSubtitle")}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Button variant="soft" onClick={handleDownloadReport}>
              {lang === "bn" ? "রিপোর্ট ডাউনলোড" : "Download Report"}
            </Button>
          </div>
        }
      />

      {/* Summary Stats */}
      <div className="row" style={{ gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <Stat
          label={lang === "bn" ? "মোট ইউনিট" : "Total Units"}
          value={totalUnits.toString()}
        />
        <Stat
          label={lang === "bn" ? "ইউনিট ক্ষেত্রফল" : "Unit Area"}
          value={`${Math.round(totalArea)} m²`}
        />
        <Stat
          label={lang === "bn" ? "ইফিশিয়েন্সি" : "Efficiency"}
          value={`${Math.round((totalArea / totalFloorArea) * 100)}%`}
        />
        <Stat
          label={lang === "bn" ? "ফ্লোর আরিয়া/তলা" : "Floor Area/Floor"}
          value={`${Math.round(floorAreaPerFloor)} m²`}
        />
      </div>

      {/* Unit Mix Configuration */}
      <Card className="stack" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
          {lang === "bn" ? "ইউনিট কনফিগারেশন" : "Unit Configuration"}
        </h3>
        <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
          {UNIT_CONFIGS.map((config) => (
            <div key={config.id} style={{ flex: 1, minWidth: "200px" }}>
              <label htmlFor={`unitmix-${config.id}`} style={{ display: "block", marginBottom: "4px", fontSize: "14px" }}>
                {config.label}
              </label>
              <input
                id={`unitmix-${config.id}`}
                type="number"
                min="0"
                max="20"
                value={unitMix[config.id] || 0}
                onChange={(e) => setUnitMix({ ...unitMix, [config.id]: parseInt(e.target.value) || 0 })}
                style={{ width: "100%", padding: "8px", border: "1px solid var(--border)", borderRadius: "4px" }}
              />
            </div>
          ))}
        </div>
      </Card>

      {/* Optimization Results */}
      <Card className="stack" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
          {t("unitMixOptimization")}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          {UNIT_CONFIGS.map((config) => {
            const result = results.find(r => r.unitType === config.label);
            const allPass = result?.compliance.every(c => c.passed) ?? true;
            return (
              <button
                key={config.id}
                type="button"
                className="chip"
                onClick={() => setSelectedUnitConfig(config.id)}
                style={{
                  cursor: "pointer",
                  padding: "8px 12px",
                  fontSize: "12px",
                  borderColor: allPass ? "var(--tone-sage)" : "var(--tone-amber)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span>{config.label}</span>
                  <Badge tone={allPass ? "sage" : "amber"}>
                    {result?.unitCount || 0} Units
                  </Badge>
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Detailed Results for Selected Config */}
      {results.find(r => r.unitType === UNIT_CONFIGS.find(c => c.id === selectedUnitConfig)?.label) && (
        <div className="stack" style={{ gap: "12px" }}>
          {(() => {
            const selected = UNIT_CONFIGS.find(c => c.id === selectedUnitConfig);
            const result = results.find(r => r.unitType === selected?.label);
            if (!result || !selected) return null;

            return (
              <>
                {/* Room Details */}
                <Card>
                  <h4 style={{ margin: "0 0 8px 0" }}>{result.unitType} — {result.unitCount} Units</h4>
                  <div className="row" style={{ gap: "16px", flexWrap: "wrap" }}>
                    <Stat
                      label={lang === "bn" ? "ইউনিট আরিয়া" : "Unit Area"}
                      value={`${result.unitAreaM2} m²`}
                    />
                    <Stat
                      label={lang === "bn" ? "মোট আরিয়া" : "Total Area"}
                      value={`${result.totalAreaM2} m²`}
                    />
                  </div>

                  <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
                    {selected.rooms.map((room) => {
                      const spec = BNBC_MIN_ROOM_SIZES[room.kind];
                      const passed = spec ? room.totalAreaM2 >= spec.min : true;
                      return (
                        <div
                          key={room.id}
                          style={{
                            flex: 1,
                            minWidth: "200px",
                            padding: "12px",
                            border: `1px solid ${passed ? "var(--tone-sage)" : "var(--tone-amber)"}`,
                            borderRadius: "var(--r-sm)",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                            <strong>{room.nameEn}</strong>
                            <Badge tone={passed ? "sage" : "amber"}>
                              {passed ? "✓" : "✗"}
                            </Badge>
                          </div>
                          <div className="small muted">
                            {room.totalAreaM2} m² {spec ? `(min: ${spec.min} m²)` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {result.issues.length > 0 && (
                    <div style={{ marginTop: "12px", padding: "8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)", fontSize: "12px" }}>
                      <strong style={{ color: "var(--tone-amber)" }}>
                        {lang === "bn" ? " সমস্যা:" : "Issues:"}
                      </strong>
                      <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}>
                        {result.issues.map((issue, i) => (
                          <li key={i} className="small muted">
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
