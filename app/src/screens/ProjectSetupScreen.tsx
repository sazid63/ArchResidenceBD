import { useState } from "react";

import { project } from "../data/mock";
import { fmtNum, useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

export function ProjectSetupScreen({ onNavigate }: { onNavigate: (id: string) => void }) {
  const { t, lang } = useI18n();
  const [stories, setStories] = useState(project.stories);
  const [units, setUnits] = useState(project.unitsPerFloor);

  return (
    <div className="screen">
      <PageHeader title={t("projectSetup")} subtitle={project.name} />
      <div className="grid-2">
        <Card className="stack">
          <h3>{t("location")}</h3>
          <div className="field">
            <label className="field-label">{t("division")}</label>
            <input className="input" defaultValue="Dhaka" />
          </div>
          <div className="field">
            <label className="field-label">{t("district")}</label>
            <input className="input" defaultValue="Dhaka" />
          </div>
          <div className="field">
            <label className="field-label">{t("area")}</label>
            <input className="input" defaultValue="Mirpur" />
          </div>
          <div className="field">
            <label className="field-label">{t("plotSize")}</label>
            <div className="row">
              <input className="input" style={{ maxWidth: 120 }} defaultValue={project.plotValue} />
              <Badge tone="amber">{project.plotUnit}</Badge>
            </div>
            <span className="faint small">
              {t("landUnitHint").replace("{sqm}", fmtNum(project.plotSqm, lang))}
            </span>
          </div>
        </Card>
        <Card className="stack">
          <h3>
            {t("storiesLabel")} · {t("unitsLabel")}
          </h3>
          <div className="row-between">
            <span className="muted">{t("storiesLabel")}</span>
            <div className="stepper">
              <button type="button" onClick={() => setStories((s) => Math.max(1, s - 1))}>
                −
              </button>
              <span className="stepper-value">{fmtNum(stories, lang)}</span>
              <button type="button" onClick={() => setStories((s) => Math.min(20, s + 1))}>
                +
              </button>
            </div>
          </div>
          <div className="row-between">
            <span className="muted">{t("unitsLabel")}</span>
            <div className="stepper">
              <button type="button" onClick={() => setUnits((u) => Math.max(1, u - 1))}>
                −
              </button>
              <span className="stepper-value">{fmtNum(units, lang)}</span>
              <button type="button" onClick={() => setUnits((u) => Math.min(8, u + 1))}>
                +
              </button>
            </div>
          </div>
          <div className="field">
            <label className="field-label">{t("prices")}</label>
            <span className="faint small">{t("pricesOptional")}</span>
          </div>
          <Callout title={t("soil")}>
            {t("soilDefault")} <Badge tone="amber">{t("soilAssumption")}</Badge>
          </Callout>
        </Card>
      </div>
      <div className="row">
        <Button variant="primary" onClick={() => onNavigate("phase:foundation")}>
          {t("saveSetup")}
        </Button>
      </div>
    </div>
  );
}
