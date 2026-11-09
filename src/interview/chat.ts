/**
 * The phase chat (M6-1 wiring): the guided interview for one phase, as pure functions on a ProjectSpec.
 * The screen only renders `chatView` and calls `chatStart` / `chatSend`; every answer is parsed by the
 * deterministic parser and written to the spec with provenance by the runner. Nothing here calls a model.
 *
 * Progress (which questions are done or left open) is saved in `spec.interview[phaseId]`, the messages in the
 * phase record, so a phase resumes exactly where it stopped. A phase that already has messages but no
 * progress (a project made by an older version or a template) is left alone.
 */

import type { InterviewProgress, PhaseRecord, ProjectSpec } from "../model/projectSpec";
import { chips as chipsFor, flowOf, getBook, pointerFor, questionOf, SKIP_CHIP, type Bi, type Chip, type Question } from "./flow";
import { answer, describeStep, displayValue, progressOf, readPointer, skip, startInterview, type InterviewState, type StepView } from "./runner";

type Lang = "en" | "bn";

/** The flow-book flow (and storey) a phase runs, or null for a phase the book has no questions for. */
export function flowForPhase(phase: Pick<PhaseRecord, "id" | "kind" | "storeyIndex">): { flowId: string; storey?: number } | null {
  switch (phase.kind) {
    case "site":
      return { flowId: "site-excavation" };
    case "foundation":
      return { flowId: "foundation" };
    case "ground_floor":
      return { flowId: "floor", storey: 0 };
    case "floor":
      return { flowId: "floor", storey: phase.storeyIndex ?? 1 };
    case "roof":
      return { flowId: "roof-boundary" };
    case "utility":
      return { flowId: "common-services" };
    default:
      return null;
  }
}

const L = (b: Partial<Bi>, lang: Lang) => b[lang] ?? b.en ?? "";

const DONE: Bi = { en: "That is everything for this phase. Check the answers on the right, then approve to continue.", bn: "এই ধাপের সব প্রশ্ন শেষ। ডানের উত্তরগুলো দেখে নিয়ে এগিয়ে যেতে অনুমোদন করুন।" };
const OPEN_NOTE: Bi = { en: "Some needed answers are still open; they are listed on the right.", bn: "কিছু জরুরি উত্তর এখনো খোলা; ডানে তালিকাভুক্ত।" };
const OPTIONS: Bi = { en: "Options:", bn: "বিকল্প:" };

const phaseOf = (spec: ProjectSpec, phaseId: string) => spec.phases.find((p) => p.id === phaseId);

/**
 * The interview state of a phase. A floor phase also sees what the other floors handled, so a
 * building-wide question ("typical floor height") is asked once, in the first floor phase it applies to.
 */
function stateFor(spec: ProjectSpec, phase: PhaseRecord): InterviewState | null {
  const f = flowForPhase(phase);
  if (!f) return null;
  let progress = spec.interview?.[phase.id];
  if (f.storey !== undefined) {
    const foreign = Object.entries(spec.interview ?? {})
      .filter(([id]) => id !== phase.id)
      .flatMap(([, pr]) => pr.log)
      .filter((l) => l.key.includes("@") && !l.key.endsWith(`@${f.storey}`));
    progress = { done: [], open: [], pending: [], ...(progress ?? {}), log: [...(progress?.log ?? []), ...foreign] };
  }
  return startInterview(spec, f.flowId, { storey: f.storey, progress });
}

/** The progress to save: only this phase's own entries (the other floors' entries are theirs to keep). */
function ownProgress(state: InterviewState): InterviewProgress {
  const pr = progressOf(state);
  if (state.storey === undefined) return pr;
  const mine = (key: string) => !key.includes("@") || key.endsWith(`@${state.storey}`);
  return { ...pr, done: pr.done.filter(mine), open: pr.open.filter(mine), pending: pr.pending.filter((x) => mine(x.key)), log: pr.log.filter((l) => mine(l.key)) };
}

/** The question as the app says it: the prompt, and below it why it is asked. */
export function questionText(view: StepView, lang: Lang): string {
  const why = L(view.why, lang);
  return why ? `${L(view.prompt, lang)}\n${why}` : L(view.prompt, lang);
}

type Msg = PhaseRecord["messages"][number];
const ai = (text: string, now: string): Msg => ({ who: "ai", text, timestamp: now });
const user = (text: string, now: string): Msg => ({ who: "user", text, timestamp: now });

function withPhase(spec: ProjectSpec, phaseId: string, fn: (p: PhaseRecord) => PhaseRecord): ProjectSpec {
  return { ...spec, phases: spec.phases.map((p) => (p.id === phaseId ? fn(p) : p)) };
}

function finishText(state: InterviewState, lang: Lang): string {
  return state.open.length ? `${L(DONE, lang)} ${L(OPEN_NOTE, lang)}` : L(DONE, lang);
}

/** Open a phase: the goal and the first question. Does nothing when the phase already has messages. */
export function chatStart(spec: ProjectSpec, phaseId: string, lang: Lang, now: string): ProjectSpec {
  const phase = phaseOf(spec, phaseId);
  if (!phase || phase.messages.length > 0) return spec;
  const f = flowForPhase(phase);
  const state = stateFor(spec, phase);
  if (!f || !state) return spec;
  const goal = L(flowOf(getBook(), f.flowId).goal, lang);
  const msgs: Msg[] = [ai(goal, now)];
  msgs.push(ai(state.current ? questionText(describeStep(state.current), lang) : finishText(state, lang), now));
  const next = withPhase(spec, phaseId, (p) => ({ ...p, status: state.current ? "in_progress" : "completed", messages: msgs }));
  return { ...next, interview: { ...(next.interview ?? {}), [phaseId]: ownProgress(state) } };
}

export type ChatInput = { text: string } | { skip: true };

/** One user turn: parse the answer, write it, and add the app's reply and the next question. */
export function chatSend(spec: ProjectSpec, phaseId: string, input: ChatInput, lang: Lang, now: string): ProjectSpec {
  const phase = phaseOf(spec, phaseId);
  const state = phase ? stateFor(spec, phase) : null;
  if (!phase || !state) return spec;
  const said = "text" in input ? input.text.trim() : SKIP_CHIP[lang];
  if ("text" in input && !said) return spec;

  const step = state.current;
  const result = "text" in input ? answer(state, said, now) : skip(state, now);
  const turn = result.turn;
  const msgs: Msg[] = [user(said, now)];

  if (turn.kind === "ask_again") {
    const labels = step && turn.candidates ? turn.candidates.map((c) => step.question.options.find((o) => o.value === c)?.label[lang] ?? c) : [];
    msgs.push(ai(labels.length ? `${L(turn.reply, lang)} ${L(OPTIONS, lang)} ${labels.join(", ")}` : L(turn.reply, lang), now));
    return withPhase(spec, phaseId, (p) => ({ ...p, status: "in_progress", messages: [...p.messages, ...msgs] }));
  }

  msgs.push(ai(L(turn.reply, lang), now));
  const next = result.state.current;
  msgs.push(ai(next ? questionText(describeStep(next), lang) : finishText(result.state, lang), now));

  const out = withPhase(result.state.spec, phaseId, (p) => ({ ...p, status: next ? "in_progress" : "completed", messages: [...p.messages, ...msgs] }));
  return { ...out, interview: { ...(out.interview ?? {}), [phaseId]: ownProgress(result.state) } };
}

export interface AnswerRow {
  key: string;
  question: string;
  value: string;
  source: "user" | "default" | "assumption" | "engine";
  open?: boolean;
}

export interface ChatView {
  /** The phase has a flow-book interview (false for a phase the book does not cover). */
  supported: boolean;
  /** Opened with an interview (a legacy phase with old messages is not). */
  guided: boolean;
  done: boolean;
  step: StepView | null;
  chips: Chip[];
  answers: AnswerRow[];
  /** Essential questions left open. */
  open: string[];
  assumptions: Array<{ id: string; statement: string; verifyOnSite: boolean }>;
}

function stepOfKey(key: string): { q: Question; storey?: number; pointer: string } {
  const [id, s] = key.split("@");
  const q = questionOf(getBook(), id);
  const storey = s === undefined ? undefined : Number(s);
  return { q, storey, pointer: pointerFor(q, storey) };
}

export function chatView(spec: ProjectSpec, phaseId: string, lang: Lang): ChatView {
  const phase = phaseOf(spec, phaseId);
  const empty: ChatView = { supported: false, guided: false, done: false, step: null, chips: [], answers: [], open: [], assumptions: [] };
  if (!phase) return empty;
  const f = flowForPhase(phase);
  if (!f) return empty;
  const progress: InterviewProgress | undefined = spec.interview?.[phaseId];
  if (!progress) return { ...empty, supported: true, done: phase.status === "completed" };
  const state = stateFor(spec, phase) as InterviewState;
  const answers: AnswerRow[] = [];
  for (const l of progress.log) {
    if (l.outcome !== "answered" && l.outcome !== "default") continue;
    const { q, storey, pointer } = stepOfKey(l.key);
    const stored = readPointer(spec, pointer);
    const shown = q.mapsTo === "/project/displayUnits/area" ? l.value : stored ?? l.value;
    const prov = spec.provenance[pointer];
    answers.push({ key: l.key, question: q.ask[lang], value: displayValue({ question: q, storeyIndex: storey, pointer, key: l.key }, shown, lang), source: (prov?.source === "user" || prov?.source === "default" || prov?.source === "engine" ? prov.source : "assumption") });
  }
  for (const key of progress.open) answers.push({ key, question: stepOfKey(key).q.ask[lang], value: "", source: "user", open: true });
  const step = state.current ? describeStep(state.current) : null;
  const relevant = new Set(progress.log.map((l) => `asm-${l.key}`));
  return {
    supported: true,
    guided: true,
    done: state.current === null,
    step,
    chips: step ? chipsFor(state.current!.question, lang) : [],
    answers,
    open: progress.open,
    assumptions: spec.assumptions.filter((a) => relevant.has(a.id)).map((a) => ({ id: a.id, statement: a.statement, verifyOnSite: a.verifyOnSite })),
  };
}
