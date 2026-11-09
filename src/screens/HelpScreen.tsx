import { useState } from "react";

import { useI18n } from "../i18n";
import { Badge, Button, Callout, Card, PageHeader } from "../ui/kit";
import { MANUAL_FAQ, searchManual } from "../data/manualFaq";

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
  const [queryText, setQuery] = useState("");
  const [answers, setAnswers] = useState<Answer[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const search = (override?: string) => {
    const query = override ?? queryText;
    if (!query.trim()) {
      setAnswers(null);
      return;
    }
    setAnswers(searchManual(query) as unknown as Answer[]);
    setProblem(null);
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
          value={queryText}
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
      {answers === null && !problem ? (
        <Card className="stack">
          <h2 style={{ fontSize: "1rem", margin: 0 }}>{lang === "bn" ? "যা জানতে চাইতে পারেন" : "Try asking"}</h2>
          <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
            {MANUAL_FAQ.map((e) => (
              <button
                key={e.id}
                type="button"
                className="button"
                onClick={() => {
                  setQuery(e.question[lang === "bn" ? "bn" : "en"]);
                  void search(e.question[lang === "bn" ? "bn" : "en"]);
                }}
              >
                {e.question[lang === "bn" ? "bn" : "en"]}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            {lang === "bn"
              ? "উত্তরগুলো অ্যাপের নিজস্ব ম্যানুয়াল থেকে আসে এবং প্রতিটির উৎস দেওয়া থাকে। নিয়ম-সংক্রান্ত মান অফিসিয়াল কোডের সাথে মিলিয়ে নিন।"
              : "Answers come from the app's built-in manual and each names its source. Check regulatory values against the official code."}
          </p>
        </Card>
      ) : null}
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
