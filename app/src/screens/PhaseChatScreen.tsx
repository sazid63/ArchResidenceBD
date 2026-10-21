import { useState } from "react";

import { ask, isDesktopShell } from "../ipc/core";
import { useI18n } from "../i18n";
import { phaseName, STATUS_KEY } from "../labels";
import { phases } from "../data/mock";
import { phaseTone } from "../theme/tokens";
import { Button, Card, Chip, Dot, PageHeader, StatusBadge } from "../ui/kit";

interface ChipRow {
  id: string;
  label: string;
  kind: string;
}

interface Prompt {
  done: boolean;
  questionId: string;
  flow: string;
  storeyIndex: number | null;
  pointer: string;
  type: string;
  ask: string;
  why: string;
  chips: ChipRow[];
  progress: {
    answered: number;
    fallback: number;
    omitted: number;
    skipped: number;
    open: number;
    openEssential: string[];
    pending: string[];
    assumptions: string[];
  };
}

interface Turn {
  decision: string;
  turn: {
    decision: string;
    question_id: string;
    pointer: string;
    reply: { en: string; bn: string };
    value: unknown;
    reason: string;
    chips: string[];
  };
}

interface Bubble {
  who: "ai" | "user";
  text: string;
}

/**
 * The phase chat (W5.1's last wiring).
 *
 * The conversation is the **core's** ✓ — the same interview session the demo drives ✓ and
 * the same one the app's real flow will ✓ — so the question asked is the flow book's ✓,
 * the chips are the flow book's ✓, and the answer is written to the project ✓ (the
 * interview's own engine ✓, never the app's ✓ ✓).
 *
 * In a browser (the prototype) there is no core ✓, and the screen says so ✓ — rather than
 * showing a conversation that is not happening ✓ ✓.
 */
export function PhaseChatScreen({ phaseId }: { phaseId: string }) {
  const { t, lang } = useI18n();
  const phase = phases.find((p) => p.id === phaseId) ?? phases[1];
  const statusKey = STATUS_KEY[phase.status];

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [answer, setAnswer] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Start the conversation - the core's session. */
  const start = async () => {
    if (!isDesktopShell()) {
      setProblem(t("chatNeedsShell"));
      return;
    }
    setBusy(true);
    try {
      const projects = await ask("projects.list", {});
      const rows =
        !projects.error && projects.result
          ? ((projects.result as { projects: { path: string }[] }).projects ?? [])
          : [];
      if (!rows.length) {
        setProblem(t("chatNoProject"));
        setBusy(false);
        return;
      }
      const created = await ask("session.resume", {
        root: rows[0].path,
        sessionId: "app",
      });
      if (created.error) {
        setProblem(String(created.error.message));
        setBusy(false);
        return;
      }
      const result = created.result as { sessionId: string; prompt: Prompt };
      setSessionId(result.sessionId);
      setPrompt(result.prompt);
      setBubbles(
        result.prompt?.ask
          ? [{ who: "ai", text: result.prompt.ask }]
          : [],
      );
      setProblem(null);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  /** Send the answer - the core writes it. */
  const send = async (text: string, choice?: string) => {
    if (!sessionId || !text.trim() || busy) return;
    setBusy(true);
    const said = text.trim();
    setAnswer("");
    setBubbles((current) => [...current, { who: "user", text: said }]);
    try {
      const reply = await ask("session.respond", { sessionId, text: said, choice });
      if (reply.error) {
        setProblem(String(reply.error.message));
        return;
      }
      const result = reply.result as { turn: Turn; prompt: Prompt };
      const said2 = result.turn?.turn?.reply?.[lang] ?? result.turn?.turn?.reply?.en ?? "";
      setBubbles((current) => [
        ...current,
        ...(said2 ? [{ who: "ai" as const, text: said2 }] : []),
      ]);
      setPrompt(result.prompt);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <PageHeader
        title={phaseName(phase, lang, t)}
        subtitle={t("phase")}
        actions={<StatusBadge status={phase.status} label={t(statusKey)} />}
      />
      <div className="chat-layout">
        <Card className="chat">
          {bubbles.map((bubble, index) => (
            <div key={index} className={`bubble bubble--${bubble.who}`}>
              {bubble.text}
            </div>
          ))}
          {prompt?.chips?.length ? (
            <div className="chips">
              {prompt.chips.map((chip) => (
                <Chip
                  key={chip.id}
                  tone="sky"
                  onClick={() => {
                    void send(chip.label, chip.id);
                  }}
                >
                  {chip.label}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="chat-input-row">
            <input
              className="input"
              placeholder={t("chatPlaceholder")}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void send(answer);
              }}
            />
            <Button variant="primary" onClick={() => void send(answer)}>
              {t("send")}
            </Button>
          </div>
          {!sessionId && !busy ? (
            <Button variant="soft" onClick={() => void start()}>
              {t("chatStart")}
            </Button>
          ) : null}
        </Card>
        <div className="stack">
          <Card className="stack">
            <h3>{t("phaseInfo")}</h3>
            <div className="row-between">
              <span className="row">
                <Dot tone={phaseTone[phase.kind]} />
                {phaseName(phase, lang, t)}
              </span>
              <StatusBadge status={phase.status} label={t(statusKey)} />
            </div>
            {prompt?.why ? (
              <div className="field">
                <span className="field-label">{t("chatWhy")}</span>
                <span className="faint small">{prompt.why}</span>
              </div>
            ) : null}
            {prompt?.progress ? (
              <div className="field">
                <span className="field-label">{t("chatProgress")}</span>
                <span className="faint small">
                  {t("chatProgressValue")
                    .replace("{answered}", String(prompt.progress.answered))
                    .replace("{open}", String(prompt.progress.open))}
                </span>
              </div>
            ) : null}
            <div className="field">
              <span className="field-label">{t("provenance")}</span>
              <span className="faint small">{t("provenanceNote")}</span>
            </div>
            <Button variant="primary" className="w-full">
              {t("designPhase")}
            </Button>
          </Card>
        </div>
      </div>
      {problem ? (
        <div className="faint small">{problem}</div>
      ) : null}
    </div>
  );
}
