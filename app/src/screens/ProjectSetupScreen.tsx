import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

interface TemplateRow {
  id: string;
  name: string;
  floors?: number;
  occupancy?: string;
}

/**
 * The project setup (W5.1's last wiring).
 *
 * The form is the *shortcut* ✓ — the flow asks the same questions one by one ✓ — and
 * **the project is the core's** ✓: the app names it ✓ and picks the template it starts
 * from ✓, and the core writes the spec ✓ and opens the interview ✓ ✓.
 *
 * In a browser (the prototype) there is no core ✓, and the screen says so ✓ — rather than
 * pretending the project was saved ✓ ✓.
 */
export function ProjectSetupScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("new-project");
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadTemplates = async () => {
    if (!isDesktopShell()) return;
    try {
      const reply = await ask("templates.list", {});
      if (reply.error) return;
      setTemplates((reply.result as { templates: TemplateRow[] }).templates);
    } catch {
      /* the core is not answering - the list stays empty */
    }
  };

  void loadTemplates();

  const create = async () => {
    if (!isDesktopShell()) {
      setProblem(t("setupNeedsShell"));
      return;
    }
    if (!name.trim()) {
      setProblem(t("setupNeedsName"));
      return;
    }
    setBusy(true);
    try {
      const reply = await ask("project.create", { name: name.trim(), template });
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      setProblem(null);
      onNavigate("phase:setup");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader title={t("projectSetup")} subtitle={t("setupSubtitle")} />
      <div className="grid-2">
        <Card className="stack">
          <h3>{t("setupName")}</h3>
          <div className="field">
            <label className="field-label">{t("setupNameLabel")}</label>
            <input
              className="input"
              value={name}
              placeholder={t("setupNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <h3>{t("templatesTitle")}</h3>
          <div className="field">
            <label className="field-label">{t("setupTemplate")}</label>
            <select
              className="input"
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
            >
              {(templates ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.floors ? ` · ${t("templatesFloors").replace("{n}", String(row.floors))}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("storiesLabel")}</label>
            <span className="faint small">{t("setupStoriesNote")}</span>
          </div>
        </Card>
        <Card className="stack">
          <h3>{t("setupNext")}</h3>
          <div className="faint small">{t("setupNextNote")}</div>
          <Callout title={t("soil")}>
            {t("soilDefault")} <Badge tone="amber">{t("soilAssumption")}</Badge>
          </Callout>
          {problem ? (
            <Callout title={t("setupFailed")}>
              <span className="small">{problem}</span>
            </Callout>
          ) : null}
        </Card>
      </div>
      <div className="row">
        <Button variant="primary" onClick={() => void create()} disabled={busy}>
          {t("setupCreate")}
        </Button>
        <span className="faint small">
          {t("setupAreaHint").replace("{n}", fmtNum(0, lang))}
        </span>
      </div>
    </div>
  );
}
