import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

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
 * The documents (the engine pack).
 *
 * The pack is the **core's** ✓ — one bundle ✓ (ADR-0067 ✓) — and this screen shows what
 * it holds ✓: the drawings ✓, the BBS ✓, the BOQ ✓, the compliance audit ✓ and the spec
 * ✓ ✓. The user sees the handover before they hand it over ✓ ✓.
 */
export function DocumentsScreen() {
  const { t } = useI18n();
  const [pack, setPack] = useState("");
  const [documents, setDocuments] = useState<DocumentsReply | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    if (!isDesktopShell()) {
      setProblem(t("documentsNeedsShell"));
      return;
    }
    if (!pack.trim()) {
      setProblem(t("documentsNeedsPack"));
      return;
    }
    try {
      const reply = await ask("documents.list", { pack: pack.trim() });
      if (reply.error) {
        setProblem(String(reply.error.message));
        setDocuments(null);
        return;
      }
      setDocuments(reply.result as DocumentsReply);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  const groups = documents ? Object.entries(documents.groups) : [];

  return (
    <div className="screen">
      <PageHeader title={t("documentsTitle")} subtitle={t("documentsSubtitle")} />
      <div className="row">
        <input
          className="input grow"
          value={pack}
          placeholder={t("documentsPackPlaceholder")}
          onChange={(event) => setPack(event.target.value)}
        />
        <Button variant="soft" onClick={() => void load()}>
          {t("documentsOpen")}
        </Button>
      </div>
      {problem ? (
        <Callout title={t("documentsFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      ) : null}
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
