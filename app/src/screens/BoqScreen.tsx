import { boq, phases } from "../data/mock";
import type { BoqLine, CostType } from "../data/mock";
import { fmtBdt, fmtNum, useI18n } from "../i18n";
import type { TKey } from "../i18n";
import { phaseName } from "../labels";
import { costTone } from "../theme/tokens";
import { Badge, Card, PageHeader } from "../ui/kit";

const COST_KEY: Record<CostType, TKey> = {
  material: "costMaterial",
  labour: "costLabour",
  machinery: "costMachinery",
  subcontract: "costSubcontract",
};

export function BoqScreen() {
  const { t, lang } = useI18n();
  const groups = boq.map((g) => ({
    phaseId: g.phaseId,
    phase: phases.find((p) => p.id === g.phaseId),
    lines: g.lines,
  }));
  const sum = (lines: BoqLine[]) => lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const grand = groups.reduce((s, g) => s + sum(g.lines), 0);

  return (
    <div className="screen">
      <PageHeader title={t("boqTitle")} subtitle={t("priceNote")} />
      {groups.map((g) => (
        <Card key={g.phaseId} className="stack">
          <div className="row-between">
            <h3>{g.phase ? phaseName(g.phase, lang, t) : g.phaseId}</h3>
            <Badge tone="sage">
              {t("subtotal")}: {fmtBdt(sum(g.lines), lang)}
            </Badge>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t("item")}</th>
                <th>{t("typeCol")}</th>
                <th>{t("unitCol")}</th>
                <th className="num">{t("qty")}</th>
                <th className="num">{t("rate")}</th>
                <th className="num">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {g.lines.map((l, i) => (
                <tr key={i}>
                  <td>
                    <span className="row">
                      {l.item}
                      {l.deviation ? <Badge tone="amber">{t("deviation")}</Badge> : null}
                    </span>
                  </td>
                  <td>
                    <Badge tone={costTone[l.cost]}>{t(COST_KEY[l.cost])}</Badge>
                  </td>
                  <td className="muted">{l.unit}</td>
                  <td className="num">{fmtNum(l.qty, lang)}</td>
                  <td className="num">{fmtBdt(l.rate, lang)}</td>
                  <td className="num">{fmtBdt(l.qty * l.rate, lang)}</td>
                </tr>
              ))}
              <tr className="subtotal">
                <td colSpan={5}>
                  {t("subtotal")} · {g.phase ? phaseName(g.phase, lang, t) : ""}
                </td>
                <td className="num">{fmtBdt(sum(g.lines), lang)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      ))}
      <div className="grand">
        <span className="muted">{t("grandTotal")}</span>
        <span className="amount">{fmtBdt(grand, lang)}</span>
      </div>
    </div>
  );
}
