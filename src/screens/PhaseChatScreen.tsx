import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Badge, Button, Card, Chip, PageHeader } from "../ui/kit";
import { useActiveProject, useProject } from "../context/ProjectContext";
import { areAllPhasesCompleted } from "../engine/projectState";
import { chatSend, chatStart, chatView } from "../interview/chat";
import { PlanCard } from "../components/PlanCard";
import { PlotShapeCallout } from "../components/PlotShapeCallout";

interface Props {
  phaseId: string;
  onNavigate: (id: string) => void;
  onProjectUpdated?: () => void;
}

const SOURCE_LABEL = {
  user: { en: "you", bn: "আপনি" },
  default: { en: "default", bn: "ডিফল্ট" },
  assumption: { en: "assumption", bn: "অনুমান" },
  engine: { en: "derived", bn: "হিসাবকৃত" },
} as const;

const SOURCE_TONE = { user: "sage", default: "amber", assumption: "amber", engine: "sky" } as const;

/**
 * The phase chat: the guided interview of one phase, driven by the flow book (src/interview).
 * Answers are read by a deterministic parser, never a model, and written to the project with provenance.
 */
export function PhaseChatScreen({ phaseId, onNavigate, onProjectUpdated }: Props) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const project = useActiveProject();
  const { spec, saveSpec, saveProject, refreshProject } = useProject();

  const [inputText, setInputText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const phaseIndex = (project?.phases || []).findIndex((p) => p.id === phaseId);
  const phase = project ? project.phases[phaseIndex >= 0 ? phaseIndex : 0] ?? null : null;
  const nextPhase = project && phaseIndex >= 0 && phaseIndex < project.phases.length - 1 ? project.phases[phaseIndex + 1] : null;

  // Open the phase with its goal and first question, once.
  useEffect(() => {
    if (!spec || !phase) return;
    const next = chatStart(spec, phase.id, lang, new Date().toISOString());
    if (next !== spec) {
      saveSpec(next);
      onProjectUpdated?.();
    }
  }, [spec, phase?.id, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [phase?.messages.length]);

  const view = useMemo(() => (spec && phase ? chatView(spec, phase.id, lang) : null), [spec, phase, lang]);

  if (!project || !phase || !spec || !view) {
    return (
      <div className="screen">
        <PageHeader title={bn ? "ধাপের পরিকল্পনা" : "Phase planning"} subtitle={bn ? "কোনো সক্রিয় প্রকল্প নেই" : "No active project found"} />
        <Card>
          <Button variant="primary" onClick={() => onNavigate("setup")}>
            {bn ? "নতুন প্রকল্প" : "Create new project"}
          </Button>
        </Card>
      </div>
    );
  }

  const now = () => new Date().toISOString();

  const startDesign = () => {
    saveProject({ ...project, designStarted: true, updatedAt: now() });
    onProjectUpdated?.();
    onNavigate("design:final");
  };

  const approveAndNext = () => {
    const phases = project.phases.map((p) => (p.id === phase.id ? { ...p, status: "completed" as const } : p));
    saveProject({ ...project, phases, updatedAt: now() });
    onProjectUpdated?.();
    if (nextPhase) onNavigate(`phase:${nextPhase.id}`);
    else startDesign();
  };

  const handleDesignChip = () => {
    refreshProject();
    startDesign();
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    setInputText("");
    saveSpec(chatSend(spec, phase.id, { text }, lang, now()));
    onProjectUpdated?.();
  };

  const skip = () => {
    saveSpec(chatSend(spec, phase.id, { skip: true }, lang, now()));
    onProjectUpdated?.();
  };

  const allCompleted = areAllPhasesCompleted(project);
  const done = view.done || phase.status === "completed";

  return (
    <div className="screen">
      <PageHeader
        title={bn ? phase.nameBn : phase.nameEn}
        subtitle={`${project.name} · ${project.stories} ${bn ? "তলা" : "storeys"} (${project.plotSize} ${project.plotUnit})`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="sky">{bn ? "নির্দেশিত প্রশ্নোত্তর" : "Guided interview"}</Badge>
            <Badge tone={phase.status === "completed" ? "sage" : "amber"}>
              {phase.status === "completed" ? (bn ? "✓ সম্পন্ন" : "✓ Done") : bn ? "চলমান" : "In progress"}
            </Badge>
            {done && nextPhase ? (
              <Button variant="primary" onClick={approveAndNext}>
                {bn ? "পরবর্তী ধাপ ➔" : "Next phase ➔"}
              </Button>
            ) : null}
            {allCompleted ? (
              <Button variant="primary" onClick={handleDesignChip}>
                {bn ? "৩D ডিজাইন ➔" : "Open 3D design ➔"}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="chat-layout">
        <Card className="chat">
          <div className="chat-messages" style={{ overflowY: "auto", maxHeight: 460 }} role="log" aria-live="polite">
            {(phase.messages || []).map((msg, i) => (
              <div key={i} className={`bubble bubble--${msg.who}`}>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.text}</div>
              </div>
            ))}
            {view.supported && !view.guided && phase.messages.length > 0 ? (
              <p className="faint small" style={{ margin: "8px 0 0" }}>
                {bn ? "এই ধাপ পুরোনো সংস্করণে পূরণ করা হয়েছে, তাই এখানে আর প্রশ্ন করা হয় না।" : "This phase was filled in by an older version, so it asks no more questions."}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {phase.kind === "floor" && (
            <div style={{ marginTop: 12 }}>
              <PlotShapeCallout project={project} />
              <PlanCard project={project} switchable onChanged={() => { refreshProject(); onProjectUpdated?.(); }} />
            </div>
          )}

          <div className="chips" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {view.chips.map((chip) => (
              <Chip key={chip.id} tone={chip.kind === "skip" ? "neutral" : "sky"} onClick={() => (chip.kind === "skip" ? skip() : send(chip.label))}>
                {chip.label}
              </Chip>
            ))}
            {done && nextPhase ? (
              <Chip tone="sage" onClick={approveAndNext}>
                {bn ? "অনুমোদন করে পরবর্তী ধাপে যান ➔" : "Approve & go to the next phase ➔"}
              </Chip>
            ) : null}
            {done && !nextPhase ? (
              <Chip tone="sage" onClick={handleDesignChip}>
                {bn ? "৩D ডিজাইন শুরু করুন ➔" : "Start 3D design ➔"}
              </Chip>
            ) : null}
          </div>

          <div className="chat-input-row" style={{ marginTop: 12 }}>
            <label htmlFor="chat-input" className="visually-hidden">
              {bn ? "উত্তর লিখুন" : "Type your answer"}
            </label>
            <input
              id="chat-input"
              className="input"
              value={inputText}
              disabled={!view.guided || view.done}
              placeholder={bn ? "আপনার উত্তর" : "Your answer"}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(inputText);
                }
              }}
            />
            <Button variant="primary" onClick={() => send(inputText)} disabled={!inputText.trim() || !view.guided || view.done}>
              {bn ? "পাঠান" : "Send"}
            </Button>
          </div>
        </Card>

        <div className="stack">
          <Card className="stack">
            <h2 className="section-title">{bn ? "আপনার উত্তর" : "Your answers"}</h2>
            {view.answers.length > 0 ? (
              <div className="stack" style={{ gap: 8 }}>
                {view.answers.map((a) => (
                  <div key={a.key} style={{ fontSize: 13 }}>
                    <div className="muted">{a.question}</div>
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      {a.open ? (
                        <Badge tone="blush">{bn ? "খোলা" : "open"}</Badge>
                      ) : (
                        <>
                          <strong className="font-mono">{a.value}</strong>
                          <Badge tone={SOURCE_TONE[a.source]}>{SOURCE_LABEL[a.source][lang]}</Badge>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint small">{bn ? "এখনো কোনো উত্তর নেই।" : "No answers yet."}</p>
            )}
          </Card>

          {view.assumptions.length > 0 ? (
            <Card className="stack">
              <h2 className="section-title">{bn ? "অনুমান" : "Assumptions"}</h2>
              {view.assumptions.map((a) => (
                <p key={a.id} className="small" style={{ margin: 0 }}>
                  {a.statement}
                  {a.verifyOnSite ? <Badge tone="amber">{bn ? "সাইটে যাচাই" : "verify on site"}</Badge> : null}
                </p>
              ))}
            </Card>
          ) : null}

        </div>
      </div>
    </div>
  );
}
