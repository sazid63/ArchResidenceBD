import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";

interface Answer {
  entry: {
    id: string;
    topic: string;
    question: Record<string, string>;
    answer: Record<string, string>;
    source: string;
    sourceKind: string;
  };
  score: number;
}

/**
 * The offline help (W5.5).
 *
 * The app must be able to answer with **no network and no model** — so the answers come
 * from the **offline manual**: derived from the repo's own facts (the flow book's
 * questions and the rule packs' provisions) and searched by terms, deterministically.
 * Every answer carries its **source**, so a user can check it.
 */
export function HelpScreen() {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState("");
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) {
      setAnswers(null);
      return;
    }
    if (!isDesktopShell()) {
      setProblem(t("helpNeedsShell"));
      return;
    }
    try {
      const reply = await ask("manual.search", { query, lang });
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      setAnswers((reply.result as { answers: Answer[] }).answers);
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="screen">
      <PageHeader title={t("helpTitle")} subtitle={t("helpSubtitle")} />
      <div className="row">
        <label htmlFor="help-search-input" className="visually-hidden">
          {t("helpPlaceholder")}
        </label>
        <input
          className="input grow"
           id="help-search-input"
          value={query}
          placeholder={t("helpPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
        />
        <Button variant="soft" onClick={() => void search()}>
          {t("helpSearch")}
        </Button>
      </div>
      {problem ? (
        <Callout title={t("helpFailed")}>
          <span className="small">{problem}</span>
        </Callout>
      ) : null}
      {answers && answers.length === 0 ? (
        <Callout title={t("helpNoAnswer")}>
          <span className="small">{t("helpNoAnswerNote")}</span>
        </Callout>
      ) : null}
      <div className="stack">
        {(answers ?? []).map((row) => (
          <Card key={row.entry.id} className="doc-row">
            <Badge tone={row.entry.sourceKind === "rule" ? "lavender" : "sky"}>
              {row.entry.sourceKind === "rule" ? t("helpRule") : t("helpFlow")}
            </Badge>
            <div className="grow">
              <div className="doc-desc muted">{row.entry.question[lang] ?? row.entry.question.en}</div>
              <div className="small">{row.entry.answer[lang] ?? row.entry.answer.en}</div>
              <div className="faint small">{row.entry.source}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
