import { useEffect, useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Badge, Button, Card, PageHeader } from "../ui/kit";

interface TemplateRow {
  id: string;
  name: string;
  path: string;
  language: string;
  floors?: number;
  occupancy?: string;
  notes: string;
}

/**
 * The project's templates (W5.7).
 *
 * A template is a **committed example spec** ✓ — the repo's own ✓ — so a new project
 * starts from something the repo holds and can be diffed against ✓ ✓.
 */
export function TemplatesScreen({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<TemplateRow[] | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    let live = true;
    ask("templates.list", {})
      .then((reply) => {
        if (!live || reply.error) return;
        setRows((reply.result as { templates: TemplateRow[] }).templates);
      })
      .catch(() => {
        /* the core is not answering - the screen stays empty */
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="screen">
      <PageHeader title={t("templatesTitle")} subtitle={t("templatesSubtitle")} />
      <div className="stack">
        {(rows ?? []).map((row) => (
          <Card key={row.id} className="doc-row">
            <Badge tone="sky">{row.occupancy || t("templatesHouse")}</Badge>
            <div className="grow">
              <div className="doc-desc muted">{row.name}</div>
              <div className="faint small">
                {row.floors
                  ? t("templatesFloors").replace("{n}", String(row.floors))
                  : t("templatesNoFloors")}
                {row.notes ? ` · ${row.notes}` : ""}
              </div>
            </div>
            <Button variant="soft" onClick={() => onPick(row.id)}>
              {t("templatesUse")}
            </Button>
          </Card>
        ))}
        {rows && rows.length === 0 ? (
          <Card>
            <span className="faint small">{t("templatesNone")}</span>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
