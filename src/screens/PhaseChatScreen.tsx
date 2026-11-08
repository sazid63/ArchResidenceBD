import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Button, Card, Chip, PageHeader, Badge } from "../ui/kit";
import { useActiveProject, useProject } from "../context/ProjectContext";
import { areAllPhasesCompleted, type PhaseItem } from "../engine/projectState";
import { getInitialGreeting, processPhaseUserMessage } from "../engine/phasePlanner";
import { PlanCard } from "../components/PlanCard";
import { PlotShapeCallout } from "../components/PlotShapeCallout";

interface Props {
  phaseId: string;
  onNavigate: (id: string) => void;
  onProjectUpdated?: () => void;
}

const stamp = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function PhaseChatScreen({ phaseId, onNavigate, onProjectUpdated }: Props) {
  const { lang } = useI18n();
  const bn = lang === "bn";
  const project = useActiveProject();
  const { saveProject, refreshProject } = useProject();

  const [inputText, setInputText] = useState("");
  const [chips, setChips] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const phaseIndex = (project?.phases || []).findIndex((p) => p.id === phaseId);
  const phase: PhaseItem | null = project ? project.phases[phaseIndex >= 0 ? phaseIndex : 0] ?? null : null;
  const nextPhase =
    project && phaseIndex >= 0 && phaseIndex < project.phases.length - 1 ? project.phases[phaseIndex + 1] : null;

  // Seed the phase with its opening message exactly once.
  useEffect(() => {
    if (!project || !phase) return;
    if ((phase.messages || []).length > 0) return;
    const greeting = getInitialGreeting(project, phase, lang);
    const phases = project.phases.map((p) =>
      p.id === phase.id
        ? { ...p, status: "in_progress" as const, messages: [{ who: "ai" as const, text: greeting, timestamp: stamp() }] }
        : p,
    );
    saveProject({ ...project, phases, updatedAt: new Date().toISOString() });
    setChips(
      bn
        ? ["অনুমোদন করে পরবর্তী ধাপে যান ➔", "পরিমাপ পরিবর্তন করুন"]
        : ["Approve & Proceed to Next Phase ➔", "Adjust dimensions"],
    );
  }, [project, phase, lang, bn, saveProject]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [phase?.messages.length]);

  if (!project || !phase) {
    return (
      <div className="screen">
        <PageHeader title="Phase Planning" subtitle="No active project found" />
        <Card>
          <Button variant="primary" onClick={() => onNavigate("setup")}>
            Create New Project
          </Button>
        </Card>
      </div>
    );
  }

  const units = project.unitsPerFloor || 1;

  const startDesign = () => {
    saveProject({ ...project, designStarted: true, updatedAt: new Date().toISOString() });
    onProjectUpdated?.();
    onNavigate("design:final");
  };

  const approveAndNext = () => {
    const phases = project.phases.map((p) => (p.id === phase.id ? { ...p, status: "completed" as const } : p));
    saveProject({ ...project, phases, updatedAt: new Date().toISOString() });
    onProjectUpdated?.();
    if (nextPhase) onNavigate(`phase:${nextPhase.id}`);
    else startDesign();
  };

  // Robust handler for "Start 3D Design" chip - works even with stale closures
  const handleDesignChip = () => {
    // Force refresh project from context before saving
    refreshProject();
    startDesign();
  };

  const send = (text?: string) => {
    const message = (text ?? inputText).trim();
    if (!message) return;
    setInputText("");

    const reply = processPhaseUserMessage(project, phase, message, lang);
    setChips(reply.suggestedChips);

    const phases = project.phases.map((p) =>
      p.id === phase.id
        ? {
            ...p,
            status: reply.isPhaseSatisfied ? ("completed" as const) : ("in_progress" as const),
            data: { ...p.data, ...reply.metrics },
            messages: [
              ...(p.messages || []),
              { who: "user" as const, text: message, timestamp: stamp() },
              { who: "ai" as const, text: reply.replyText, metrics: reply.metrics, timestamp: stamp() },
            ],
          }
        : p,
    );
    saveProject({ ...project, phases, updatedAt: new Date().toISOString() });
    onProjectUpdated?.();
  };

  const metrics = phase.data && Object.keys(phase.data).length > 0 ? (phase.data as Record<string, string | number>) : null;
  const allCompleted = areAllPhasesCompleted(project);

  return (
    <div className="screen">
      <PageHeader
        title={bn ? phase.nameBn : phase.nameEn}
        subtitle={`${project.name} · ${project.stories} ${bn ? "তলা" : "storeys"} (${project.plotSize} ${project.plotUnit})`}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="sky">{bn ? "টেমপ্লেট প্ল্যানার" : "Template planner"}</Badge>
            <Badge tone={phase.status === "completed" ? "sage" : "amber"}>
              {phase.status === "completed" ? (bn ? "✓ অনুমোদিত" : "✓ Approved") : bn ? "চলমান" : "In Progress"}
            </Badge>
            {phase.status === "completed" && nextPhase ? (
              <Button variant="primary" onClick={approveAndNext}>
                {bn ? "পরবর্তী ধাপ ➔" : "Next Phase ➔"}
              </Button>
            ) : null}
            {allCompleted ? (
              <Button variant="primary" onClick={handleDesignChip}>
                {bn ? "৩D ডিজাইন ➔" : "Open 3D Design ➔"}
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
                {msg.metrics && Object.keys(msg.metrics).length > 0 ? (
                  <div
                    style={{
                      background: "var(--surface-2)",
                      padding: "8px 12px",
                      borderRadius: 6,
                      marginTop: 8,
                      fontSize: 12,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    {Object.entries(msg.metrics).map(([k, v]) => (
                      <span key={k}>
                        <strong style={{ opacity: 0.8 }}>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {phase.kind === "floor" && (
            <div style={{ marginTop: 12 }}>
              <PlotShapeCallout project={project} />
              <PlanCard project={project} switchable onChanged={() => { refreshProject(); onProjectUpdated?.(); }} />
            </div>
          )}

          <div className="chips" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {chips.map((chip, i) => {
              // "Start 3D Design Now 🚀" chip (Utilities phase) → directly open 3D design
              const isDesignChip = chip.includes("3D Design") || chip.includes("৩D ডিজাইন");
              return (
                <Chip
                  key={i}
                  tone="sky"
                  onClick={() => isDesignChip ? handleDesignChip() : send(chip)}
                >
                  {chip}
                </Chip>
              );
            })}
          </div>

          <div className="chat-input-row" style={{ marginTop: 12 }}>
            <label htmlFor="chat-input" className="visually-hidden">
              {bn ? "বার্তা লিখুন" : "Type your message"}
            </label>
            <input
              id="chat-input"
              className="input"
              value={inputText}
              placeholder={bn ? "যেমন: ফুটিং ২.২ মিটার, পার্কিং ৪টি" : "e.g. footing 2.2 m, 4 parking bays"}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button variant="primary" onClick={() => send()} disabled={!inputText.trim()}>
              {bn ? "পাঠান" : "Send"}
            </Button>
          </div>
        </Card>

        <div className="stack">
          <Card className="stack">
            <h3>{bn ? "হিসাব ও পরিমাপ" : "Calculated Metrics"}</h3>
            {metrics ? (
              <div className="stack" style={{ gap: 8 }}>
                {Object.entries(metrics).map(([k, v]) => (
                  <div key={k} className="row-between" style={{ fontSize: 13 }}>
                    <span className="muted">{k}:</span>
                    <strong className="font-mono">{String(v)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint small">{bn ? "এখনো কোনো হিসাব নেই।" : "No metrics yet."}</p>
            )}
          </Card>

          <Card className="stack">
            <h3>{bn ? "ধাপের অগ্রগতি" : "Phase Progress"}</h3>
            {project.phases.map((p) => (
              <button
                key={p.id}
                type="button"
                className="row-between"
                style={{
                  fontSize: 12,
                  padding: "4px 6px",
                  background: p.id === phase.id ? "var(--surface-active)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
                onClick={() => onNavigate(`phase:${p.id}`)}
              >
                <span className="grow">{bn ? p.nameBn : p.nameEn}</span>
                <span className="faint">{p.status === "completed" ? "✓" : p.status === "in_progress" ? "…" : "·"}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
