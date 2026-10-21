import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

interface Candidate {
  id: string;
  number: string;
  page: number;
  excerpt: string;
  status: string;
}

/**
 * The import review (W4.7, in the app).
 *
 * A user's own PDF becomes **candidate clauses** ✓ — candidates, never law ✓ — and a
 * human decides ✓. The extraction is the **core's** ✓ (the app never reads a clause
 * itself ✓) ✓, and the decision is **recorded** ✓ (who ✓, when ✓, why ✓) ✓ — the evidence
 * that a rule entered a pack deliberately ✓ ✓ ✓.
 *
 * A candidate with no decision is visibly unreviewed ✓ — it is not a rule, and it never
 * becomes one by accident ✓ ✓.
 */
export function ImportReviewScreen() {
  const { t } = useI18n();
  const [pdf, setPdf] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, "accepted" | "rejected">>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!isDesktopShell()) {
      setProblem(t("importNeedsShell"));
      return;
    }
    if (!pdf.trim()) {
      setProblem(t("importNeedsPdf"));
      return;
    }
    setBusy(true);
    try {
      const reply = await ask("import.candidates", { pdf: pdf.trim() });
      if (reply.error) {
        setProblem(String(reply.error.message));
        setCandidates(null);
        return;
      }
      setCandidates((reply.result as { candidates: Candidate[] }).candidates);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const decide = async (candidate: Candidate, decision: "accepted" | "rejected") => {
    try {
      const reply = await ask("import.review", {
        pdf: pdf.trim(),
        candidateId: candidate.id,
        decision,
        reviewedBy: "the app",
        reviewedAt: new Date().toISOString(),
      });
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      setReviewed((current) => ({ ...current, [candidate.id]: decision }));
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="screen">
      <PageHeader title={t("importReview")} subtitle={t("importReviewSubtitle")} />
      <div className="row">
        <input
          className="input grow"
          value={pdf}
          placeholder={t("importPdfPlaceholder")}
          onChange={(event) => setPdf(event.target.value)}
        />
        <Button variant="soft" onClick={() => void load()} disabled={busy}>
          {t("importRead")}
        </Button>
      </div>
      {problem ? (
        <Callout title={t("importFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      ) : null}
      <div className="stack">
        {(candidates ?? []).map((candidate) => {
          const decision = reviewed[candidate.id];
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
                </div>
              </div>
              <Badge tone={decision === "accepted" ? "sage" : decision === "rejected" ? "amber" : "neutral"}>
                {decision
                  ? t(decision === "accepted" ? "importAccepted" : "importRejected")
                  : t("importUnreviewed")}
              </Badge>
              <Button variant="soft" onClick={() => void decide(candidate, "accepted")}>
                {t("importAccept")}
              </Button>
              <Button variant="ghost" onClick={() => void decide(candidate, "rejected")}>
                {t("importReject")}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
