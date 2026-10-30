import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, type BuildingProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { MeshDocument, MeshObject } from "../cad/mesh";
import { fmtNum } from "../i18n";

interface RoomDaylightData {
  roomId: string;
  roomName: string;
  roomKind: string;
  floorAreaM2: number;
  windowAreaM2: number;
  daylightFactor: number;
  meetsTarget: boolean;
  perforationRatio: number;
  recommendations: string[];
}

interface FloorDaylightSummary {
  floorNum: number;
  floorName: string;
  avgDaylightFactor: number;
  roomsMeetingTarget: number;
  totalRooms: number;
  totalWindowAreaM2: number;
  totalFloorAreaM2: number;
}

export function DaylightAnalysisScreen() {
  const { t, lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [roomData, setRoomData] = useState<RoomDaylightData[]>([]);
  const [floorSummaries, setFloorSummaries] = useState<FloorDaylightSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);

  const customization = project?.customization;
  const daylightFactorTarget = customization?.sustainability?.daylightFactorTarget ?? 2.0;
  const windowToFloorRatioMin = customization?.sustainability?.windowToFloorRatioMin ?? 0.15;

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

        // Group objects by floor and room
        const roomGroups = new Map<string, MeshObject[]>();
        const floorRooms = new Map<number, string[]>();

        for (const obj of meshDoc.objects) {
          // Extract floor from Z coordinate
          const floorNum = obj.kind === "footing" ? -1 : Math.floor(obj.bboxMinMm[2] / 3000);
          
          // Group by room label (from partition walls)
          const roomKey = `${floorNum}-${obj.label}`;
          if (!roomGroups.has(roomKey)) {
            roomGroups.set(roomKey, []);
            if (!floorRooms.has(floorNum)) {
              floorRooms.set(floorNum, []);
            }
            floorRooms.get(floorNum)!.push(roomKey);
          }
          roomGroups.get(roomKey)!.push(obj);
        }

        // Calculate daylight metrics for each room
        const roomDaylightData: RoomDaylightData[] = [];

        for (const [roomKey, objects] of roomGroups.entries()) {
          const [floorStr, ...nameParts] = roomKey.split("-");
          const floorNum = parseInt(floorStr);
          const roomName = nameParts.join("-") || `Room ${roomKey}`;
          
          // Calculate floor area (from slab objects)
          const slabs = objects.filter(o => o.kind === "slab");
          let floorAreaM2 = 0;
          for (const slab of slabs) {
            const dx = (slab.bboxMaxMm[0] - slab.bboxMinMm[0]) / 1000;
            const dy = (slab.bboxMaxMm[1] - slab.bboxMinMm[1]) / 1000;
            floorAreaM2 += dx * dy;
          }

          // Calculate window area (from window objects)
          const windows = objects.filter(o => o.kind === "window" || o.kind === "door");
          let windowAreaM2 = 0;
          for (const win of windows) {
            const dx = (win.bboxMaxMm[0] - win.bboxMinMm[0]) / 1000;
            const dz = (win.bboxMaxMm[2] - win.bboxMinMm[2]) / 1000;
            windowAreaM2 += dx * dz;
          }

          // Calculate perforation ratio (window area / floor area)
          const perforationRatio = floorAreaM2 > 0 ? windowAreaM2 / floorAreaM2 : 0;

          // Simplified daylight factor calculation
          // DF ≈ (window area / floor area) × transmittance × angle factor
          // Using BNBC 2020 simplified method with 0.6 transmittance factor
          const transmittance = 0.6; // Typical for clear glass
          const angleFactor = 0.8; // Approximate for Dhaka latitude
          const daylightFactor = perforationRatio * transmittance * angleFactor * 100; // as percentage

          const meetsTarget = daylightFactor >= daylightFactorTarget;

          // Generate recommendations
          const recommendations: string[] = [];
          if (!meetsTarget) {
            recommendations.push(
              lang === "bn"
                ? `দেয়ালের ক্ষেত্রফল ${Math.round((daylightFactorTarget - daylightFactor) * 10)}% বৃদ্ধি করুন`
                : `Increase window area by ${Math.round((daylightFactorTarget - daylightFactor) * 10)}%`
            );
          }
          if (perforationRatio < windowToFloorRatioMin) {
            recommendations.push(
              lang === "bn"
                ? `BNBC ২০২০ §৪.৪ অনুযায়ী ন্যূনতম ${Math.round(windowToFloorRatioMin * 100)}% জানালার প্রয়োজন`
                : `BNBC 2020 §4.4 requires minimum ${Math.round(windowToFloorRatioMin * 100)}% window area`
            );
          }
          if (daylightFactor > daylightFactorTarget * 1.5) {
            recommendations.push(
              lang === "bn"
                ? "অতিরিক্ত দিবালোক — শেডিং ডিভাইস বিবেচনা করুন"
                : "Excessive daylight — consider shading devices"
            );
          }

          roomDaylightData.push({
            roomId: roomKey,
            roomName,
            roomKind: objects[0]?.kind || "room",
            floorAreaM2: Math.round(floorAreaM2 * 100) / 100,
            windowAreaM2: Math.round(windowAreaM2 * 100) / 100,
            daylightFactor: Math.round(daylightFactor * 10) / 10,
            meetsTarget,
            perforationRatio: Math.round(perforationRatio * 1000) / 1000,
            recommendations,
          });
        }

        // Sort by floor and then by room name
        roomDaylightData.sort((a, b) => {
          const floorA = parseInt(a.roomId.split("-")[0]);
          const floorB = parseInt(b.roomId.split("-")[0]);
          return floorA - floorB || a.roomName.localeCompare(b.roomName);
        });

        setRoomData(roomDaylightData);

        // Calculate floor summaries
        const summaries: FloorDaylightSummary[] = [];
        for (const [floorNum, roomKeys] of floorRooms.entries()) {
          const floorRoomsData = roomDaylightData.filter(r => {
            const rFloor = parseInt(r.roomId.split("-")[0]);
            return rFloor === floorNum;
          });

          if (floorRoomsData.length === 0) continue;

          const avgDF = floorRoomsData.reduce((sum, r) => sum + r.daylightFactor, 0) / floorRoomsData.length;
          const roomsMeeting = floorRoomsData.filter(r => r.meetsTarget).length;
          const totalWinArea = floorRoomsData.reduce((sum, r) => sum + r.windowAreaM2, 0);
          const totalFloorArea = floorRoomsData.reduce((sum, r) => sum + r.floorAreaM2, 0);

          summaries.push({
            floorNum,
            floorName: floorNum === -1 ? (lang === "bn" ? "ফাউন্ডেশন" : "Foundation") : floorNum === 0 ? (lang === "bn" ? "নিচতলা" : "Ground Floor") : `${lang === "bn" ? "তল" : "Floor"} ${floorNum}`,
            avgDaylightFactor: Math.round(avgDF * 10) / 10,
            roomsMeetingTarget: roomsMeeting,
            totalRooms: floorRoomsData.length,
            totalWindowAreaM2: Math.round(totalWinArea * 100) / 100,
            totalFloorAreaM2: Math.round(totalFloorArea * 100) / 100,
          });
        }

        summaries.sort((a, b) => a.floorNum - b.floorNum);
        setFloorSummaries(summaries);

      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [project, customization, daylightFactorTarget, windowToFloorRatioMin, lang]);

  if (!project) {
    return (
      <div className="screen">
        <PageHeader
          title={lang === "bn" ? "দিবালোক বিশ্লেষণ" : "Daylight Analysis"}
          subtitle={lang === "bn" ? "BNBC 2020 §4.4 অনুযায়ী দিবালোক প্রবেশাধিকার মূল্যায়ন" : "Daylight access evaluation per BNBC 2020 §4.4"}
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
          title={lang === "bn" ? "দিবালোক বিশ্লেষণ" : "Daylight Analysis"}
          subtitle={lang === "bn" ? "BNBC 2020 §4.4 অনুযায়ী দিবালোক প্রবেশাধিকার মূল্যায়ন" : "Daylight access evaluation per BNBC 2020 §4.4"}
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
          title={lang === "bn" ? "দিবালোক বিশ্লেষণ" : "Daylight Analysis"}
          subtitle={lang === "bn" ? "দিনের আলোর গণনা হচ্ছে..." : "Calculating daylight factors..."}
        />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "দিনের আলোর গণনা হচ্ছে..." : "Calculating daylight factors..."}
        </div>
      </div>
    );
  }

  const totalRooms = roomData.length;
  const roomsMeetingTarget = roomData.filter(r => r.meetsTarget).length;
  const complianceRate = totalRooms > 0 ? Math.round((roomsMeetingTarget / totalRooms) * 100) : 0;
  const avgDaylightFactor = totalRooms > 0 ? Math.round((roomData.reduce((sum, r) => sum + r.daylightFactor, 0) / totalRooms) * 10) / 10 : 0;

  const filteredRooms = selectedFloor !== null
    ? roomData.filter(r => parseInt(r.roomId.split("-")[0]) === selectedFloor)
    : roomData;

  const handleDownloadReport = () => {
    let md = `# Daylight Analysis Report — ${project.name}\n\n`;
    md += `**Project ID:** ${project.id}\n`;
    md += `**Location:** ${project.address || "Dhaka, Bangladesh"}\n`;
    md += `**Stories:** ${project.stories}\n`;
    md += `**Generated:** ${new Date().toLocaleString("en-GB")}\n`;
    md += `**Standard:** BNBC 2020 §4.4 (Daylight & Ventilation)\n\n`;

    md += `---\n\n## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Target Daylight Factor | ${daylightFactorTarget}% |\n`;
    md += `| Minimum Window Ratio | ${Math.round(windowToFloorRatioMin * 100)}% |\n`;
    md += `| Total Rooms Analyzed | ${totalRooms} |\n`;
    md += `| Rooms Meeting Target | ${roomsMeetingTarget} (${complianceRate}%) |\n`;
    md += `| Average Daylight Factor | ${avgDaylightFactor}% |\n\n`;

    md += `---\n\n## Floor-by-Floor Summary\n\n`;
    md += `| Floor | Avg DF (%) | Rooms Meeting | Total Rooms | Compliance |\n`;
    md += `|-------|------------|---------------|-------------|------------|\n`;
    for (const fs of floorSummaries) {
      const floorCompliance = Math.round((fs.roomsMeetingTarget / fs.totalRooms) * 100);
      md += `| ${fs.floorName} | ${fs.avgDaylightFactor} | ${fs.roomsMeetingTarget}/${fs.totalRooms} | ${fs.totalRooms} | ${floorCompliance}% |\n`;
    }

    md += `\n---\n\n## Room-by-Room Analysis\n\n`;
    md += `| Room | Floor Area (m²) | Window Area (m²) | Perforation Ratio | Daylight Factor (%) | Status |\n`;
    md += `|------|-----------------|------------------|-------------------|---------------------|--------|\n`;
    for (const r of roomData) {
      const status = r.meetsTarget ? "✓ Pass" : "✗ Fail";
      md += `| ${r.roomName} | ${r.floorAreaM2} | ${r.windowAreaM2} | ${Math.round(r.perforationRatio * 100)}% | ${r.daylightFactor}% | ${status} |\n`;
    }

    md += `\n---\n\n## Recommendations\n\n`;
    const roomsWithIssues = roomData.filter(r => r.recommendations.length > 0);
    if (roomsWithIssues.length > 0) {
      for (const r of roomsWithIssues) {
        md += `### ${r.roomName}\n`;
        for (const rec of r.recommendations) {
          md += `- ${rec}\n`;
        }
        md += `\n`;
      }
    } else {
      md += `All rooms meet BNBC 2020 daylight requirements.\n`;
    }

    md += `\n---\n\n## Notes\n`;
    md += `- Daylight factor calculated using BNBC 2020 simplified method\n`;
    md += `- Transmittance factor: 0.6 (clear glass)\n`;
    md += `- Angle factor: 0.8 (Dhaka latitude ~23.7°N)\n`;
    md += `- Target daylight factor: ${daylightFactorTarget}% (residential spaces)\n`;
    md += `- Minimum window-to-floor ratio: ${Math.round(windowToFloorRatioMin * 100)}%\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_daylight_analysis.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? "দিবালোক বিশ্লেষণ" : "Daylight Analysis"}
        subtitle={lang === "bn" ? `BNBC 2020 §4.4 — লক্ষ্য: ${daylightFactorTarget}% DF, ${Math.round(windowToFloorRatioMin * 100)}% উইন্ডো রেশিও` : `BNBC 2020 §4.4 — Target: ${daylightFactorTarget}% DF, ${Math.round(windowToFloorRatioMin * 100)}% window ratio`}
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
          label={lang === "bn" ? "মোট রুম" : "Total Rooms"}
          value={totalRooms.toString()}
        />
        <Stat
          label={lang === "bn" ? "লক্ষ্য পূরণ করেছে" : "Meeting Target"}
          value={`${roomsMeetingTarget} (${complianceRate}%)`}
        />
        <Stat
          label={lang === "bn" ? "গড় ডে-লাইট ফ্যাক্টর" : "Avg Daylight Factor"}
          value={`${avgDaylightFactor}%`}
        />
        <Stat
          label={lang === "bn" ? "তলা" : "Floors"}
          value={floorSummaries.length.toString()}
        />
      </div>

      {/* Floor Summaries */}
      <Card className="stack" style={{ marginBottom: "16px" }}>
        <h3 style={{ marginBottom: "12px", fontSize: "14px", opacity: 0.7 }}>
          {lang === "bn" ? "তলা অনুযায়ী সারসংক্ষেপ" : "Floor-by-Floor Summary"}
        </h3>
        <div className="row" style={{ gap: "12px", flexWrap: "wrap" }}>
          {floorSummaries.map((fs) => (
            <button
              key={fs.floorNum}
              type="button"
              className="chip"
              onClick={() => setSelectedFloor(selectedFloor === fs.floorNum ? null : fs.floorNum)}
              style={{ cursor: "pointer", padding: "8px 12px", fontSize: "12px" }}
            >
              {fs.floorName}: {fs.avgDaylightFactor}% DF · {fs.roomsMeetingTarget}/{fs.totalRooms} ✓
            </button>
          ))}
        </div>
      </Card>

      {/* Filter by Floor */}
      {floorSummaries.length > 1 && (
        <div className="row" style={{ gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          <Button
            variant={selectedFloor === null ? "primary" : "soft"}
            onClick={() => setSelectedFloor(null)}
          >
            {lang === "bn" ? "সব তলা" : "All Floors"}
          </Button>
          {floorSummaries.map((fs) => (
            <Button
              key={fs.floorNum}
              variant={selectedFloor === fs.floorNum ? "primary" : "soft"}
              onClick={() => setSelectedFloor(fs.floorNum)}
            >
              {fs.floorName}
            </Button>
          ))}
        </div>
      )}

      {/* Room Details */}
      <div className="stack" style={{ gap: "12px" }}>
        {filteredRooms.map((room) => (
          <Card
            key={room.roomId}
            className="stack"
            style={{
              border: room.meetsTarget
                ? "1px solid var(--tone-sage, #10b981)"
                : "1px solid var(--tone-amber, #f59e0b)",
            }}
          >
            <div className="row-between">
              <div>
                <h4 style={{ margin: "0 0 4px 0" }}>{room.roomName}</h4>
                <span className="faint small font-mono">
                  {room.floorAreaM2} m² · {room.windowAreaM2} m² windows
                </span>
              </div>
              <div className="row" style={{ gap: "8px" }}>
                <Badge tone={room.meetsTarget ? "sage" : "amber"}>
                  {room.daylightFactor}% DF
                </Badge>
                <Badge tone="neutral">
                  {Math.round(room.perforationRatio * 100)}% perf
                </Badge>
              </div>
            </div>

            {room.recommendations.length > 0 && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "8px",
                  background: room.meetsTarget
                    ? "var(--surface-sunken)"
                    : "var(--surface-2)",
                  borderRadius: "var(--r-sm)",
                  fontSize: "12px",
                }}
              >
                <strong style={{ color: room.meetsTarget ? "var(--tone-sage)" : "var(--tone-amber)" }}>
                  {lang === "bn" ? "সুপারিশ:" : "Recommendations:"}
                </strong>
                <ul style={{ margin: "4px 0 0 0", paddingLeft: "16px" }}>
                  {room.recommendations.map((rec, i) => (
                    <li key={i} className="small muted">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}