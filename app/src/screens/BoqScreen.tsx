import { useEffect, useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { fmtBdt, fmtNum, useI18n } from "../i18n";
import { Badge, Card, PageHeader, Stat } from "../ui/kit";

interface BoqLine {
  item: string;
  unit: string;
  quantity: number;
  rateBdt: number;
  amountBdt: number;
  cost: "material" | "labour" | "machinery" | "subcontract";
  phase: string;
  priced: boolean;
  key: string;
  deviation?: boolean;
}

interface Boq {
  lines: BoqLine[];
  totals: { amountBdt: number };
  subtotals: { byPhase: Record<string, number> };
}

interface PricedFrom {
  cardId: string;
  status: string;
  region: string;
  effectiveFrom: string;
}

const COST_TONE: Record<BoqLine["cost"], "sky" | "sage" | "amber" | "lavender"> = {
  material: "sky",
  labour: "sage",
  machinery: "amber",
  subcontract: "lavender",
};

const COST_KEY: Record<BoqLine["cost"], string> = {
  material: "costMaterial",
  labour: "costLabour",
  machinery: "costMachinery",
  subcontract: "costSubcontract",
};

/**
 * The BOQ (W5.1's last wiring).
 *
 * The money is the **core's** ✓ — the project's own spec ✓ designed ✓ and priced ✓ — and
 * the **card it is priced from is named** ✓, with its status ✓: a candidate card says so ✓
 * (the plan's money law ✓ ✓), and the app shows it rather than hiding it ✓ ✓.
 */
export function BoqScreen() {
  const { t, lang } = useI18n();
  const [boq, setBoq] = useState<Boq | null>(null);
  const [pricedFrom, setPricedFrom] = useState<PricedFrom | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktopShell()) return;
    let live = true;
    const load = async () => {
      const projects = await ask("projects.list", {});
      const rows =
        !projects.error && projects.result
          ? ((projects.result as { projects: { path: string }[] }).projects ?? [])
          : [];
      if (!rows.length) {
        if (live) setProblem(t("boqNoProject"));
        return;
      }
      const reply = await ask("boq.build", { project: rows[0].path });
      if (!live) return;
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      const result = reply.result as { boq: Boq; pricedFrom: PricedFrom };
      setBoq(result.boq);
      setPricedFrom(result.pricedFrom);
      setProblem(null);
    };
    void load();
    return () => {
      live = false;
    };
  }, [t]);

  if (!boq) {
    return (
      <div className="screen">
        <PageHeader title={t("boqTitle")} subtitle={t("priceNote")} />
        {problem ? (
          <Card>
            <span className="faint small">{problem}</span>
          </Card>
        ) : null}
      </div>
    );
  }

  const phases = Object.keys(boq.subtotals.byPhase);

  return (
    <div className="screen">
      <PageHeader title={t("boqTitle")} subtitle={t("priceNote")} />
      <div className="row">
        <Stat label={t("grandTotal")} value={fmtBdt(boq.totals.amountBdt, lang)} />
        <Stat
          label={t("boqPricedFrom")}
          value={pricedFrom ? `${pricedFrom.cardId} · ${pricedFrom.status}` : "—"}
        />
      </div>
      {pricedFrom?.status === "candidate" ? (
        <Card>
          <span className="small">{t("boqCandidateNote")}</span>
        </Card>
      ) : null}
      {phases.map((phase) => (
        <Card key={phase} className="stack">
          <div className="row-between">
            <h3>{phase}</h3>
            <Badge tone="sage">
              {t("subtotal")}: {fmtBdt(boq.subtotals.byPhase[phase] ?? 0, lang)}
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
              {boq.lines
                .filter((line) => line.phase === phase)
                .map((line) => (
                  <tr key={line.key}>
                    <td>
                      <span className="row">
                        {line.item}
                        {line.deviation ? (
                          <Badge tone="amber">{t("deviation")}</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td>
                      <Badge tone={COST_TONE[line.cost]}>{t(COST_KEY[line.cost] as never)}</Badge>
                    </td>
                    <td className="muted">{line.unit}</td>
                    <td className="num">{fmtNum(line.quantity, lang)}</td>
                    <td className="num">
                      {line.priced ? fmtBdt(line.rateBdt, lang) : "—"}
                    </td>
                    <td className="num">
                      {line.priced ? fmtBdt(line.amountBdt, lang) : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
      ))}
      <div className="grand">
        <span className="muted">{t("grandTotal")}</span>
        <span className="amount">{fmtBdt(boq.totals.amountBdt, lang)}</span>
      </div>
    </div>
  );
}
