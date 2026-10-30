import { useState, useEffect, useRef } from "react";
import { useI18n } from "../i18n";
import { Button, Card, Chip, PageHeader, Badge } from "../ui/kit";
import {
  getActiveProject,
  saveActiveProject,
  areAllPhasesCompleted,
  BuildingProject,
  PhaseItem,
} from "../engine/projectState";
import { getInitialGreeting, processPhaseUserMessage } from "../engine/phaseAiEngine";
import { FLOORPLAN_PRESETS } from "../data/floorplanPresets";

interface Props {
  phaseId: string;
  onNavigate: (id: string) => void;
  onProjectUpdated?: () => void;
}

export function PhaseChatScreen({ phaseId, onNavigate, onProjectUpdated }: Props) {
  const { lang } = useI18n();

  const [project, setProject] = useState<BuildingProject | null>(() => getActiveProject());
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [suggestedChips, setSuggestedChips] = useState<string[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Find active phase
  const phaseIndex = (project?.phases || []).findIndex((p) => p.id === phaseId);
  const currentPhase: PhaseItem | null =
    project && phaseIndex >= 0 ? project.phases[phaseIndex] : project?.phases[0] || null;

  // Next phase
  const nextPhase =
    project && phaseIndex >= 0 && phaseIndex < project.phases.length - 1
      ? project.phases[phaseIndex + 1]
      : null;

  // Initialize greeting if empty
  useEffect(() => {
    if (!project || !currentPhase) return;

    if (!currentPhase.messages || currentPhase.messages.length === 0) {
      const greeting = getInitialGreeting(project, currentPhase, lang);
      const updatedMessages = [
        {
          who: "ai" as const,
          text: greeting,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ];

      const initialChips =
        lang === "bn"
          ? ["অনুমোদন করে পরবর্তী ধাপে যান ➔", "পরিমাপ পরিবর্তন করুন", "বিএনবিসি বিধিমালা দেখুন"]
          : ["Approve & Proceed to Next Phase ➔", "Adjust Dimensions", "Verify BNBC 2020 Rules"];
      setSuggestedChips(initialChips);

      const updatedPhases = [...project.phases];
      updatedPhases[phaseIndex] = {
        ...currentPhase,
        status: "in_progress",
        messages: updatedMessages,
      };

      const updatedProject = { ...project, phases: updatedPhases };
      setProject(updatedProject);
      saveActiveProject(updatedProject);
      onProjectUpdated?.();
    }
  }, [phaseId, project, currentPhase, phaseIndex, lang, onProjectUpdated]);

  // Scroll to bottom on new message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentPhase?.messages, isTyping]);

  if (!project || !currentPhase) {
    return (
      <div className="screen">
        <PageHeader title="Phase Planning" subtitle="No active project found" />
        <Card>
          <p className="muted">Please create a new project first to start planning.</p>
          <Button variant="primary" onClick={() => onNavigate("setup")}>
            Create New Project
          </Button>
        </Card>
      </div>
    );
  }

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || isTyping) return;

    setInputText("");

    // Append user message
    const userMsg = {
      who: "user" as const,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const newMessages = [...(currentPhase.messages || []), userMsg];
    const interimPhases = [...project.phases];
    interimPhases[phaseIndex] = {
      ...currentPhase,
      status: "in_progress",
      messages: newMessages,
    };

    const interimProject = { ...project, phases: interimPhases };
    setProject(interimProject);
    saveActiveProject(interimProject);
    setIsTyping(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project,
          phase: currentPhase,
          userMessage: text,
          conversationHistory: newMessages,
          lang,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiMsg = {
          who: "ai" as const,
          text: data.replyText,
          metrics: data.metrics,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };

        if (data.suggestedChips && data.suggestedChips.length > 0) {
          setSuggestedChips(data.suggestedChips);
        }

        const isApproved =
          text.toLowerCase().includes("approve") ||
          text.includes("অনুমোদন") ||
          text.toLowerCase().includes("proceed") ||
          data.isPhaseSatisfied;

        const finalPhases = [...project.phases];
        finalPhases[phaseIndex] = {
          ...currentPhase,
          status: isApproved ? "completed" : "in_progress",
          data: {
            ...currentPhase.data,
            ...data.metrics,
          },
          messages: [...newMessages, aiMsg],
        };

        const finalProject = { ...project, phases: finalPhases };
        setProject(finalProject);
        saveActiveProject(finalProject);
        setIsTyping(false);
        onProjectUpdated?.();
        return;
      }
    } catch {
      // fallback to local civil calculator if network request fails
    }

    // AI analyzes and calculates locally
    setTimeout(() => {
      const aiReply = processPhaseUserMessage(project, currentPhase, text, lang);

      const aiMsg = {
        who: "ai" as const,
        text: aiReply.replyText,
        metrics: aiReply.metrics,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      if (aiReply.suggestedChips && aiReply.suggestedChips.length > 0) {
        setSuggestedChips(aiReply.suggestedChips);
      }

      const finalPhases = [...project.phases];
      finalPhases[phaseIndex] = {
        ...currentPhase,
        status: aiReply.isPhaseSatisfied ? "completed" : "in_progress",
        data: {
          ...currentPhase.data,
          ...aiReply.metrics,
        },
        messages: [...newMessages, aiMsg],
      };

      const finalProject = { ...project, phases: finalPhases };
      setProject(finalProject);
      saveActiveProject(finalProject);
      setIsTyping(false);
      onProjectUpdated?.();
    }, 450);
  };

  const handleApproveAndNext = () => {
    // Mark completed
    const updatedPhases = [...project.phases];
    updatedPhases[phaseIndex] = {
      ...currentPhase,
      status: "completed",
    };
    const updatedProject = { ...project, phases: updatedPhases };
    setProject(updatedProject);
    saveActiveProject(updatedProject);
    onProjectUpdated?.();

    if (nextPhase) {
      onNavigate(`phase:${nextPhase.id}`);
    } else {
      // All phases done!
      handleStartDesign();
    }
  };

  const handleStartDesign = () => {
    const updated = { ...project, designStarted: true };
    setProject(updated);
    saveActiveProject(updated);
    onProjectUpdated?.();
    // Navigate directly to design
    onNavigate("design:final");
  };

  const allCompleted = areAllPhasesCompleted(project);
  const latestAiMsg = [...(currentPhase.messages || [])].reverse().find((m) => m.who === "ai");
  const currentMetrics = currentPhase.data && Object.keys(currentPhase.data).length > 0
    ? (currentPhase.data as Record<string, string | number>)
    : latestAiMsg?.metrics || null;

  return (
    <div className="screen">
      <PageHeader
        title={lang === "bn" ? currentPhase.nameBn : currentPhase.nameEn}
        subtitle={`${project.name} · ${project.stories} ${lang === "bn" ? "তলা" : "Stories"} (${project.plotSize} ${project.plotUnit})`}
        actions={
          <div className="row" style={{ gap: "8px" }}>
            <Badge tone="primary">
              {lang === "bn" ? "আর্চি চ্যাট v0 (Hugging Face)" : "Archie Chat v0 (sazid63/archresidencebd-models)"}
            </Badge>
            <Badge tone={currentPhase.status === "completed" ? "sage" : "amber"}>
              {currentPhase.status === "completed"
                ? lang === "bn"
                  ? "✓ অনুমোদিত"
                  : "✓ Approved"
                : lang === "bn"
                  ? "পরিকল্পনা চলমান"
                  : "In Progress"}
            </Badge>
            {currentPhase.status === "completed" && nextPhase ? (
              <Button variant="primary" onClick={handleApproveAndNext}>
                {lang === "bn" ? "পরবর্তী পর্যায় ➔" : "Next Phase ➔"}
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="chat-layout">
        {/* Chat Feed */}
        <Card className="chat">
          <div className="chat-messages" style={{ overflowY: "auto", maxHeight: "500px" }} role="log" aria-live="polite" aria-label={lang === "bn" ? "চ্যাট বার্তা" : "Chat messages"}>
            {(currentPhase.messages || []).map((msg, idx) => (
              <div key={idx} className={`bubble bubble--${msg.who}`}>
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{msg.text}</div>

                {/* If AI message included calculated civil metrics, display nicely */}
                {msg.metrics && Object.keys(msg.metrics).length > 0 ? (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.06)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginTop: "8px",
                      fontSize: "12px",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                    }}
                  >
                    {Object.entries(msg.metrics).map(([k, v]) => (
                      <span key={k}>
                        <strong style={{ opacity: 0.8 }}>{k}:</strong> {String(v)}
                      </span>
                    ))}
                  </div>
                ) : null}

                {msg.timestamp ? (
                  <div
                    style={{
                      fontSize: "10px",
                      opacity: 0.6,
                      marginTop: "4px",
                      textAlign: msg.who === "user" ? "right" : "left",
                    }}
                  >
                    {msg.timestamp}
                  </div>
                ) : null}
              </div>
            ))}

            {isTyping ? (
              <div className="bubble bubble--ai" style={{ fontStyle: "italic", opacity: 0.8 }}>
                {lang === "bn"
                  ? "আর্চি সিভিল এআই হিসাব করছে..."
                  : "Archie Civil AI is calculating structural parameters..."}
              </div>
            ) : null}
            <div ref={chatBottomRef} />
          </div>

          {/* Interactive Architectural Floor Plan Presets Selection */}
          {(currentPhase.kind === "floor" || currentPhase.kind === "ground_floor") && (
            <div
              style={{
                marginTop: "12px",
                padding: "12px",
                background: "var(--surface-2)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "13px", fontWeight: 600 }}>
                  {lang === "bn"
                    ? "📐 এই তলার জন্য ফ্লোর প্ল্যান লেআউট নির্বাচন করুন:"
                    : "📐 Select Architectural Floor Plan Layout for this Level:"}
                </h4>
                <Badge tone="sky">BNBC 2020 Presets</Badge>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                {FLOORPLAN_PRESETS.map((preset) => {
                  const isSelected = currentPhase.data?.selectedFloorplanPreset === preset.id;
                  return (
                    <div
                      key={preset.id}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        background: isSelected ? "var(--surface-active, rgba(59,130,246,0.12))" : "var(--paper)",
                        border: isSelected ? "2px solid var(--tone-brand, #3b82f6)" : "1px solid var(--border)",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        gap: "6px",
                      }}
                      onClick={() => {
                        const selectionText =
                          lang === "bn"
                            ? `ফ্লোর প্ল্যান লেআউট নির্বাচন: ${preset.nameBn}`
                            : `Selected Floor Plan Preset: ${preset.nameEn}`;

                        const updatedPhases = [...project.phases];
                        updatedPhases[phaseIndex] = {
                          ...currentPhase,
                          data: { ...currentPhase.data, selectedFloorplanPreset: preset.id },
                        };
                        const updatedProject = { ...project, phases: updatedPhases };
                        setProject(updatedProject);
                        saveActiveProject(updatedProject);

                        handleSend(selectionText);
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "12px", color: "var(--ink)" }}>
                          {lang === "bn" ? preset.nameBn : preset.nameEn}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--ink-soft)", marginTop: "2px", lineHeight: 1.3 }}>
                          {lang === "bn" ? preset.descriptionBn : preset.descriptionEn}
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
                        <span className="small muted font-mono" style={{ fontSize: "10px" }}>{preset.suitablePlotKatha}</span>
                        <Button
                          variant={isSelected ? "primary" : "soft"}
                          style={{ padding: "3px 8px", fontSize: "10px" }}
                        >
                          {isSelected ? (lang === "bn" ? "✓ নির্বাচিত" : "✓ Selected") : (lang === "bn" ? "লেআউট বাছাই" : "Select Layout")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Interactive Prompt Chips */}
          <div className="chips" style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {(suggestedChips.length > 0
              ? suggestedChips
              : lang === "bn"
                ? ["পরিকল্পনা অনুমোদন করুন ও পরবর্তী ধাপে যান ➔", "পরিমাপ পরিবর্তন করুন", "বিএনবিসি বিধিমালা দেখুন"]
                : ["Approve & Proceed to Next Phase ➔", "Adjust Dimensions", "Verify BNBC 2020 Rules"]
            ).map((chipText, i) => (
              <Chip key={i} tone="sky" onClick={() => handleSend(chipText)}>
                {chipText}
              </Chip>
            ))}
          </div>

          {/* Input Row */}
          <div className="chat-input-row" style={{ marginTop: "12px" }}>
            <label htmlFor="chat-input" className="visually-hidden">
              {lang === "bn" ? "চ্যাট বার্তা লিখুন" : "Type your message"}
            </label>
            <input
              className="input"
               id="chat-input"
              placeholder={
                lang === "bn"
                  ? "আপনার প্রয়োজনীয়তা লিখুন (যেমন: ফুটিং কেমন হবে, ড্রাইভওয়ে মাপ...)"
                  : "Type requirements (e.g., footing preferences, driveway width, room layout...)"
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              variant="primary"
              onClick={() => handleSend()}
              disabled={isTyping || !inputText.trim()}
              aria-label={lang === "bn" ? "বার্তা পাঠান" : "Send message"}
            >
              {lang === "bn" ? "পাঠান" : "Send"}
            </Button>
          </div>
        </Card>

        {/* Right Sidebar: Engineering Calculations & Phase Progress */}
        <div className="stack">
          {/* Engineering Metrics Card */}
          <Card className="stack">
            <h3>{lang === "bn" ? "সিভিল হিসাব ও পরিমাপ" : "Calculated Engineering Metrics"}</h3>
            {currentMetrics ? (
              <div className="stack" style={{ gap: "8px" }}>
                {Object.entries(currentMetrics).map(([k, v]) => (
                  <div key={k} className="row-between" style={{ fontSize: "13px" }}>
                    <span className="muted">{k}:</span>
                    <strong className="font-mono">{String(v)}</strong>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint small">
                {lang === "bn"
                  ? "চ্যাটে প্রয়োজনীয় তথ্য লিখলে এআই স্বয়ংক্রিয়ভাবে এই হিসাব প্রস্তুত করবে।"
                  : "Provide input in chat to trigger real-time engineering calculations."}
              </p>
            )}

            <div
              style={{
                marginTop: "12px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              {nextPhase ? (
                <Button
                  variant="primary"
                  style={{ width: "100%", padding: "10px" }}
                  onClick={handleApproveAndNext}
                >
                  {lang === "bn"
                    ? `অনুমোদন করুন ও ${nextPhase.nameBn} এ যান ➔`
                    : `Approve & Go to ${nextPhase.nameEn} ➔`}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  style={{ width: "100%", padding: "12px", background: "var(--tone-sage, #10b981)" }}
                  onClick={handleStartDesign}
                >
                  {lang === "bn" ? "সব পর্যায় শেষ! ৩D ডিজাইন শুরু করুন 🚀" : "Start 3D CAD Design Now 🚀"}
                </Button>
              )}
            </div>
          </Card>

          {/* Overall Project Phases Checklist */}
          <Card className="stack">
            <h3>{lang === "bn" ? "পর্যায় অগ্রগতি" : "Overall Phase Progress"}</h3>
            <div className="stack" style={{ gap: "6px" }}>
              {project.phases.map((p, idx) => (
                <div
                  key={p.id}
                  className="row-between"
                  style={{
                    padding: "6px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    cursor: "pointer",
                    background: p.id === currentPhase.id ? "var(--surface-sunken)" : "transparent",
                  }}
                  onClick={() => onNavigate(`phase:${p.id}`)}
                >
                  <span className="ellipsis">
                    {idx + 1}. {lang === "bn" ? p.nameBn : p.nameEn}
                  </span>
                  <Badge tone={p.status === "completed" ? "sage" : p.id === currentPhase.id ? "sky" : "neutral"}>
                    {p.status === "completed"
                      ? "✓"
                      : p.status === "in_progress"
                        ? "..."
                        : "–"}
                  </Badge>
                </div>
              ))}
            </div>

            {allCompleted && (
              <Button
                variant="primary"
                style={{ marginTop: "10px", width: "100%" }}
                onClick={handleStartDesign}
              >
                {lang === "bn" ? "সম্পূর্ণ ৩D ডিজাইনে প্রবেশ করুন" : "Open 3D CAD Workspace"}
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
