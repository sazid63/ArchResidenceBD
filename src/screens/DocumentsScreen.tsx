import { useState } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";
import { getActiveProject, saveActiveProject, BuildingProject } from "../engine/projectState";

interface DocumentsReply {
  pack: string;
  projectName: string;
  created: string;
  groups: Record<string, string[]>;
  count: number;
}

/** The engineer pack's own roles ✓ (the pack's manifest names them ✓ ✓). */
const GROUP_KEY: Record<
  string,
  | "documentsProject"
  | "documentsDrawings"
  | "documentsBbs"
  | "documentsBoq"
  | "documentsReports"
  | "documentsOutputs"
> = {
  spec: "documentsProject",
  drawing: "documentsDrawings",
  bbs: "documentsBbs",
  boq: "documentsBoq",
  compliance: "documentsReports",
  output: "documentsOutputs",
};

/**
 * Documents screen with RAJUK Permit Package Generator.
 * Generates a complete permit package ZIP for RAJUK DAP 2022 submission.
 */
export function DocumentsScreen() {
  const { t, lang } = useI18n();
  const [pack, setPack] = useState("");
  const [documents, setDocuments] = useState<DocumentsReply | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [project, setProject] = useState<BuildingProject | null>(null);
  const [generatingPermit, setGeneratingPermit] = useState(false);

  const load = async () => {
    if (!pack.trim()) {
      setProblem(t("documentsNeedsPack"));
      return;
    }
    try {
      // In web mode, we load from localStorage
      const reply = await loadPackFromStorage(pack.trim());
      setDocuments(reply);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  const loadPackFromStorage = async (packId: string): Promise<DocumentsReply> => {
    // Mock implementation for web mode
    const active = getActiveProject();
    if (!active || active.id !== packId) {
      throw new Error(t("documentsFailed"));
    }
    
    // Create mock documents reply
    return {
      pack: packId,
      projectName: active.name,
      created: active.createdAt,
      groups: {
        spec: ["project-spec.pdf"],
        drawing: ["floor-plans.pdf", "elevations.pdf", "sections.pdf"],
        bbs: ["bar-bending-schedule.pdf"],
        boq: ["bill-of-quantities.pdf"],
        compliance: ["compliance-report.pdf"],
        output: ["ifc-model.ifc", "freecad-macro.FCMacro"],
      },
      count: 8,
    };
  };

  const generatePermitPackage = async () => {
    if (!project) return;
    
    setGeneratingPermit(true);
    setProblem(null);
    
    try {
      // Create permit package using batch export logic
      const { batchExport } = await import("../../scripts/tests/batch-export");
      await batchExport({ 
        projectId: project.id,
        formats: ["ifc", "freecad", "svg", "dxf", "csv", "json", "md"],
        includeCompliance: true,
        includeDrawings: true,
      });
      
      alert(t("permitPackageGenerated"));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setGeneratingPermit(false);
    }
  };

  // Load active project on mount
  const active = getActiveProject();
  if (active) setProject(active);

  const groups = documents ? Object.entries(documents.groups) : [];

  return (
    <div className="screen">
      <PageHeader title={t("documentsTitle")} subtitle={t("documentsSubtitle")} />
      
      {/* Permit Package Generator */}
      <Card style={{ marginBottom: "24px" }}>
        <h3 style={{ marginBottom: "12px" }}>
          {lang === "bn" ? "রাজউক অনুমতি প্যাকেজ" : "RAJUK Permit Package Generator"}
        </h3>
        <p style={{ marginBottom: "16px", opacity: 0.7, fontSize: "14px" }}>
          {lang === "bn"
            ? "RAJUK DAP 2022 অনুমতির জন্য সম্পূর্ণ প্যাকেজ তৈরি করুন। সব ড্রয়িং, BOQ, কমপ্লায়েন্স রিপোর্ট এবং 3D মডেল অন্তর্ভুক্ত থাকবে।"
            : "Generate complete permit package for RAJUK DAP 2022 submission. Includes all drawings, BOQ, compliance reports, and 3D models."}
        </p>
        <Button 
          variant="primary" 
          onClick={generatePermitPackage}
          disabled={generatingPermit || !project}
          style={{ minWidth: "280px" }}
        >
          {generatingPermit
            ? lang === "bn" ? "তৈরি হচ্ছে..." : "Generating..."
            : lang === "bn" ? "অনুমতি প্যাকেজ তৈরি করুন" : "Generate Permit Package"}
        </Button>
        {problem && (
          <div style={{ marginTop: "16px" }}>
            <Callout title={t("documentsFailed")}>
              <span className="small">{problem}</span>
            </Callout>
          </div>
        )}
      </Card>

      {/* Existing Documents Pack Browser */}
      <div className="row" style={{ marginBottom: "16px" }}>
        <label htmlFor="documents-pack-input" className="visually-hidden">
          {t("documentsPackPlaceholder")}
        </label>
        <input
          className="input grow"
           id="documents-pack-input"
          value={pack}
          placeholder={t("documentsPackPlaceholder")}
          onChange={(event) => setPack(event.target.value)}
        />
        <Button variant="soft" onClick={() => void load()}>
          {t("documentsOpen")}
        </Button>
      </div>
      {problem && !generatingPermit && (
        <Callout title={t("documentsFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      )}
      {documents ? (
        <div className="row">
          <Badge tone="sky">{documents.projectName}</Badge>
          <Badge tone="lavender">
            {t("documentsCount").replace("{n}", String(documents.count))}
          </Badge>
        </div>
      ) : null}
      {groups.map(([group, files]) => (
        <Card key={group} className="stack">
          <div className="row-between">
            <h3>{t(GROUP_KEY[group] ?? "documentsOutputs")}</h3>
            <Badge tone="neutral">{files.length}</Badge>
          </div>
          <div className="row">
            {files.map((file) => (
              <Badge key={file} tone="neutral">
                {file.split("/").pop()}
              </Badge>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
