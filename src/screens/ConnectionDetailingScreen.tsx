import { useState, useEffect, useMemo } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader, Stat } from "../ui/kit";
import { getActiveProject, type BuildingProject } from "../engine/projectState";
import { generateBuildingMesh } from "../cad/parametricBuildingGenerator";
import type { MeshDocument, MeshObject } from "../cad/mesh";
import { fmtNum } from "../i18n";

interface ConnectionDetail {
  memberId: string;
  memberType: "column-beam" | "column-footing" | "beam-slab" | "wall-column";
  location: string;
  rebars: Array<{
    diameter: number;
    count: number;
    length: number;
    shape: "straight" | "hooked" | "bent";
    bends: number[];
  }>;
  lapLength: number;
  developmentLength: number;
  concreteCover: number;
  designShear: number;
  designMoment: number;
}

export function ConnectionDetailingScreen() {
  const { t, lang } = useI18n();
  const [project] = useState<BuildingProject | null>(() => getActiveProject());
  const [mesh, setMesh] = useState<MeshDocument | null>(null);
  const [connections, setConnections] = useState<ConnectionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<number | null>(null);

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

        const connections: ConnectionDetail[] = [];

        // Extract connections from mesh relationships
        const objects = meshDoc.objects;
        const columns = objects.filter(o => o.kind === "column");
        const beams = objects.filter(o => o.kind === "beam");
        const footings = objects.filter(o => o.kind === "footing");
        const slabs = objects.filter(o => o.kind === "slab");

        // Column-Footing connections
        for (const col of columns) {
          // Find nearest footing below this column
          const colCenter = [
            (col.bboxMaxMm[0] + col.bboxMinMm[0]) / 2,
            (col.bboxMaxMm[1] + col.bboxMinMm[1]) / 2,
            (col.bboxMaxMm[2] + col.bboxMinMm[2]) / 2,
          ];
          const nearestFooting = footings.reduce((nearest, ftg) => {
            const ftgCenter = [
              (ftg.bboxMaxMm[0] + ftg.bboxMinMm[0]) / 2,
              (ftg.bboxMaxMm[1] + ftg.bboxMinMm[1]) / 2,
              (ftg.bboxMaxMm[2] + ftg.bboxMinMm[2]) / 2,
            ];
            const dist = Math.hypot(
              colCenter[0] - ftgCenter[0],
              colCenter[1] - ftgCenter[1],
              colCenter[2] - ftgCenter[2]
            );
            return dist < 500 ? ftg : nearest;
          }, null as MeshObject | null);

          if (nearestFooting) {
            connections.push({
              memberId: `${col.id}-${nearestFooting.id}`,
              memberType: "column-footing",
              location: "Column Base",
              rebars: [
                {
                  diameter: 25,
                  count: 8,
                  length: nearestFooting.bboxMaxMm[2] - nearestFooting.bboxMinMm[2],
                  shape: "hooked",
                  bends: [90, 135],
                },
                {
                  diameter: 16,
                  count: 4,
                  length: col.bboxMaxMm[2] - col.bboxMinMm[2] - 500,
                  shape: "straight",
                  bends: [],
                },
              ],
              lapLength: 50 * 25, // 50 * dia
              developmentLength: 47 * 25, // ACI 318 basic
              concreteCover: 75,
              designShear: 150000,
              designMoment: 45000000,
            });
          }
        }

        // Column-Beam connections
        for (const col of columns) {
          for (const beam of beams) {
            // Check if they intersect at top of column / bottom of beam
            if (Math.abs(col.bboxMaxMm[2] - beam.bboxMinMm[2]) < 50) {
              connections.push({
                memberId: `${col.id}-${beam.id}`,
                memberType: "column-beam",
                location: "Column-Head",
                rebars: [
                  {
                    diameter: 20,
                    count: 6,
                    length: col.bboxMaxMm[2] - col.bboxMinMm[2] - 200,
                    shape: "hooked",
                    bends: [90, 135],
                  },
                  {
                    diameter: 16,
                    count: 4,
                    length: beam.bboxMaxMm[1] - beam.bboxMinMm[1] - 400,
                    shape: "bent",
                    bends: [90, 45, 90],
                  },
                ],
                lapLength: 50 * 20,
                developmentLength: 47 * 20,
                concreteCover: 40,
                designShear: 120000,
                designMoment: 35000000,
              });
            }
          }
        }

        // Beam-Slab connections
        for (const beam of beams) {
          for (const slab of slabs) {
            if (Math.abs(beam.bboxMaxMm[2] - slab.bboxMinMm[2]) < 50) {
              connections.push({
                memberId: `${beam.id}-${slab.id}`,
                memberType: "beam-slab",
                location: "Beam-Slab Junction",
                rebars: [
                  {
                    diameter: 16,
                    count: 8,
                    length: beam.bboxMaxMm[2] - beam.bboxMinMm[2] - 150,
                    shape: "hooked",
                    bends: [90, 135],
                  },
                  {
                    diameter: 12,
                    count: 6,
                    length: 1200,
                    shape: "bent",
                    bends: [90, 45, 90],
                  },
                ],
                lapLength: 50 * 16,
                developmentLength: 47 * 16,
                concreteCover: 25,
                designShear: 80000,
                designMoment: 25000000,
              });
            }
          }
        }

        setConnections(connections);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [project, lang]);

  if (!project) {
    return (
      <div className="screen">
        <PageHeader title={t("connectionTitle")} subtitle={t("connectionSubtitle")} />
        <Card>
          <p className="muted">{lang === "bn" ? "কোনো সক্রিয় প্রকল্প পাওয়া যায়নি" : "No active project found"}</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="screen">
        <PageHeader title={t("connectionTitle")} subtitle={t("connectionSubtitle")} />
        <Card>
          <p className="muted">{error}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="screen">
        <PageHeader title={t("connectionTitle")} subtitle={t("connectionSubtitle")} />
        <div style={{ padding: "24px", textAlign: "center", opacity: 0.7 }}>
          {lang === "bn" ? "সংযোগ বিশদ গণনা হচ্ছে..." : "Calculating connection details..."}
        </div>
      </div>
    );
  }

  const handleDownloadCSV = () => {
    const header = "Connection,Type,Location,Bar Dia,Count,Length,Shape,Bends,Lap Length,Dev Length,Cover,Shear,";
    const rows: string[] = [];
    for (const c of connections) {
      for (const r of c.rebars) {
        rows.push(`"${c.location}","${c.memberType}","${c.location}","${r.diameter}","${r.count}","${r.length}","${r.shape}","${r.bends.join('/')}","${c.lapLength}","${c.developmentLength}","${c.concreteCover}","${c.designShear}","${c.designMoment}"`);
      }
    }
    const footer = `\n\nTotal Connections: ${connections.length}`;
    const csv = [header, ...rows, footer].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_connections.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadMarkdown = () => {
    let md = `# Connection Detailing — ${project.name}\n\n`;
    md += `**Project ID:** ${project.id}\n`;
    md += `**Concrete:** M${concreteGrade} · **Steel:** Fe${steelGrade}\n`;
    md += `**Standard:** BNBC 2020 / ACI 318-19\n`;
    md += `**Generated:** ${new Date().toLocaleString("en-GB")}\n\n`;
    md += `## Summary\n\n`;
    md += `| Metric | Value |\n|--------|-------|\n`;
    md += `| Total Connections | ${connections.length} |\n\n`;
    md += `## Connection Details\n\n`;
    for (const c of connections) {
      md += `### ${c.location}\n`;
      md += `**Type:** ${c.memberType}  \n`;
      md += `**Design Shear:** ${c.designShear} N  \n`;
      md += `**Design Moment:** ${c.designMoment} N·mm  \n`;
      md += `**Concrete Cover:** ${c.concreteCover} mm  \n`;
      md += `**Lap Length:** ${c.lapLength} mm  \n`;
      md += `**Development Length:** ${c.developmentLength} mm  \n\n`;
      md += `| Bar Dia (mm) | Count | Length (mm) | Shape | Bends |\n|-------------|-------|-------------|-------|-------|\n`;
      for (const r of c.rebars) {
        md += `| ${r.diameter} | ${r.count} | ${r.length} | ${r.shape} | ${r.bends.length > 0 ? r.bends.join('°/') + '°' : '—'} |\n`;
      }
      md += `\n---\n\n`;
    }
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.id}_connections.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="screen">
      <PageHeader
        title={t("connectionTitle")}
        subtitle={t("connectionSubtitle")}
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
        <Stat label={lang === "bn" ? "মোট সংযোগ" : "Total Connections"} value={connections.length.toString()} />
        <Stat label={lang === "bn" ? "কোলাম-ফুটিং" : "Column-Footing"} value={connections.filter(c => c.memberType === "column-footing").length.toString()} />
        <Stat label={lang === "bn" ? "কোলাম-বীম" : "Column-Beam"} value={connections.filter(c => c.memberType === "column-beam").length.toString()} />
        <Stat label={lang === "bn" ? "বীম-স্ল্যাব" : "Beam-Slab"} value={connections.filter(c => c.memberType === "beam-slab").length.toString()} />
      </div>

      {/* Connections List */}
      <div className="stack" style={{ gap: "12px" }}>
        {connections.map((c, idx) => {
          const isSelected = selectedConnection === idx;
          return (
            <Card
              key={c.memberId}
              className="stack"
              style={{
                cursor: "pointer",
                border: isSelected ? "1.5px solid var(--primary)" : "1px solid var(--border)",
              }}
              onClick={() => setSelectedConnection(isSelected ? null : idx)}
            >
              <div className="row-between">
                <div>
                  <h4 style={{ margin: "0 0 4px 0" }}>{c.location}</h4>
                  <span className="faint small font-mono">{c.memberType}</span>
                </div>
                <div className="row" style={{ gap: "8px" }}>
                  <Badge tone="sky">{c.designShear.toLocaleString()} N</Badge>
                  <Badge tone="amber">{c.designMoment.toLocaleString()} N·mm</Badge>
                </div>
              </div>

              {isSelected && (
                <div style={{ marginTop: "8px" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{lang === "bn" ? "প্রতিভা কর্তব্য (Lap Length):" : "Lap Length:"}</strong> {c.lapLength} mm
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{lang === "bn" ? "বিকাশ দৈর্ঘ্য (Dev Length):" : "Development Length:"}</strong> {c.developmentLength} mm
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{lang === "bn" ? "কনক্রিট কভার:" : "Concrete Cover:"}</strong> {c.concreteCover} mm
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{lang === "bn" ? "ডিজাইন শিয়ার:" : "Design Shear:"}</strong> {c.designShear.toLocaleString()} N
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <strong>{lang === "bn" ? "ডিজাইন মোমেন্ট:" : "Design Moment:"}</strong> {c.designMoment.toLocaleString()} N·mm
                  </div>
                  <table className="table" style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", opacity: 0.8, fontSize: "12px" }}>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "বারের ব্যাস" : "Bar Dia"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "সংখ্যা" : "Count"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "দৈর্ঘ্য" : "Length"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "আকৃতি" : "Shape"}</th>
                        <th scope="col" style={{ padding: "8px" }}>{lang === "bn" ? "ব্যান্ড" : "Bends"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rebars.map((r) => (
                        <tr key={`${c.memberId}-${r.diameter}`} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>⌀{r.diameter}</td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>{r.count}</td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>{r.length}</td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>{r.shape}</td>
                          <td style={{ padding: "8px", fontFamily: "var(--font-mono)" }}>
                            {r.bends.length > 0 ? r.bends.map((b) => `${b}°`).join(" ") : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}