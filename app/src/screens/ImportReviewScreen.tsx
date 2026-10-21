import { useState } from "react";

import { importCandidates } from "../data/mock";
import type { ImportCandidate } from "../data/mock";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader, Stat } from "../ui/kit";

type Decision = "accepted" | "rejected";

/**
 * The BYO-PDF importer's review (W4.7).
 *
 * A user's own PDF becomes **candidate clauses** - candidates, never law. The screen is
 * where a human decides: accept or reject each one, with the page it came from in front
 * of them. The decisions are recorded (who, when), and a candidate nobody has looked at
 * says so - it is not reviewed, and it never becomes a rule by accident.
 */
export function ImportReviewScreen() {
  const { t } = useI18n();
  const [decisions, setDecisions] = useState<Record<string, Decision>>(() => {
    const seed: Record<string, Decision> = {};
    for (const candidate of importCandidates) {
      if (candidate.review) seed[candidate.id] = candidate.review.decision;
    }
    return seed;
  });

  const decide = (candidate: ImportCandidate, decision: Decision) => {
    setDecisions((current) => ({ ...current, [candidate.id]: decision }));
  };

  const reviewed = Object.keys(decisions).length;
  const total = importCandidates.length;

  return (
    <div className="screen">
      <PageHeader title={t("importReview")} subtitle={t("importReviewSubtitle")} />
      <Callout title={t("importLawNote")}>
        <span className="small">{t("importReviewedLabel")}</span>
      </Callout>
      <div className="row">
        <Stat
          label={t("importCandidatesLabel")}
          value={String(total)}
        />
        <Stat
          label={t("importReviewedLabel")}
          value={t("importCounts")
            .replace("{done}", String(reviewed))
            .replace("{total}", String(total))}
        />
      </div>
      <div className="stack">
        {importCandidates.map((candidate) => {
          const decision = decisions[candidate.id];
          const tone = decision === "accepted" ? "sage" : decision === "rejected" ? "amber" : "neutral";
          return (
            <Card key={candidate.id} className="doc-row">
              <Badge tone="sky">{candidate.number}</Badge>
              <div className="grow">
                <div className="doc-desc muted">{candidate.excerpt}</div>
                <div className="faint small">
                  {t("importPage").replace("{n}", String(candidate.page))} ·{" "}
                  {decision
                    ? t(decision === "accepted" ? "importAccepted" : "importRejected")
                    : t("importUnreviewed")}
                  {candidate.review
                    ? ` · ${t("importReviewedBy").replace("{name}", candidate.review.reviewedBy)}`
                    : ""}
                </div>
              </div>
              <Badge tone={tone}>
                {decision
                  ? t(decision === "accepted" ? "importAccepted" : "importRejected")
                  : t("importUnreviewed")}
              </Badge>
              <Button variant="soft" onClick={() => decide(candidate, "accepted")}>
                {t("importAccept")}
              </Button>
              <Button variant="ghost" onClick={() => decide(candidate, "rejected")}>
                {t("importReject")}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
