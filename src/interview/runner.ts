/**
 * The interview runner (M6-1): walks one flow of the flow book, parses each free-text answer with the
 * deterministic parser, writes accepted values into the ProjectSpec with provenance, and applies the
 * authored fallback when the user does not know. Pure: every call takes a state and returns a new one;
 * the caller supplies the time and decides when to save.
 *
 * Rules (from the flow book and ADR-0010):
 *  - An accepted answer is written verbatim to its pointer, except the three declared mappings
 *    (display units, soil report yes/no, price source yes/no) and the "not sure" authority option.
 *  - "I don't know": a non-essential question applies its fallback (default / registry / area_default /
 *    derive / omit), always with an assumption entry when the book authors one. An ESSENTIAL question
 *    cannot be assumed: it stays open and its pointer joins `pendingInputs`; other work goes on.
 *  - A condition that depends on an unanswered question is never guessed: the question is skipped and logged.
 *  - Every written pointer gets a provenance entry (user / default / assumption) with the words the user
 *    typed and the time.
 */

import type { Assumption, ProvenanceEntry } from "../spec.gen";
import type { InterviewProgress, PhaseRecord, ProjectSpec } from "../model/projectSpec";
import {
  chips as chipsFor,
  conditionHolds,
  ConditionError,
  flowOf,
  getBook,
  pointerFor,
  type Bi,
  type Chip,
  type Flow,
  type FlowBook,
  type Question,
} from "./flow";
import { parseAnswer, type ParseResult } from "./parse";
import { validatePointer } from "./schema";
import { UNIT_WORDS, bnDigits, formatNumber } from "./units";

export interface Step {
  question: Question;
  storeyIndex?: number;
  pointer: string;
  /** `question-id` or `question-id@storey`. */
  key: string;
}

export interface PendingItem {
  key: string;
  pointer: string;
  kind: "derive" | "registry" | "area_default";
  reason: string;
  assumption?: Bi;
}

export interface LogEntry {
  key: string;
  outcome: "answered" | "default" | "omitted" | "open" | "pending" | "not_applicable" | "condition_unanswered";
  value?: unknown;
}

export interface InterviewState {
  spec: ProjectSpec;
  flowId: string;
  /** For a per-storey flow run for one storey only (a floor phase). */
  storey?: number;
  /** Answer values by question id (a yes/no is true/false, a choice its option value). Used by `when`. */
  values: Record<string, unknown>;
  /** Steps handled: answered, fallback applied, omitted, or skipped as not applicable. */
  done: string[];
  /** Essential steps the user did not answer; they can be answered later with `answerStep`. */
  open: string[];
  pending: PendingItem[];
  log: LogEntry[];
  current: Step | null;
}

export type TurnKind = "accept" | "fallback" | "open" | "ask_again" | "done";

export interface Turn {
  kind: TurnKind;
  key?: string;
  pointer?: string;
  value?: unknown;
  reason?: string;
  reply: Bi;
  candidates?: string[];
  chips?: Chip[];
}

const DISPLAY_UNITS: Record<string, [string, string]> = {
  metric: ["sqm", "m"],
  "feet-inch": ["sqft", "ft"],
  "bangla-land": ["katha", "ft"],
};
/** Option ids that mean "use this question's fallback". */
const FALLBACK_OPTIONS: Record<string, string[]> = { "/site/jurisdiction/authority": ["not-sure"] };

const PHASE_ID: Record<string, string> = {
  "site-excavation": "phase-site",
  foundation: "phase-foundation",
  "roof-boundary": "phase-rooftop",
  "common-services": "phase-utilities",
};
const PHASE_KIND: Record<string, PhaseRecord["kind"]> = {
  site_excavation: "site",
  foundation: "foundation",
  roof_boundary: "roof",
  common_services: "utility",
};

// --- pointers ---------------------------------------------------------------------------------

/** The phase record id a flow-book phase segment names: `floor-0` is the ground floor. */
export function phaseRecordId(segment: string): string {
  const m = /^floor-(\d+)$/.exec(segment);
  if (m) return m[1] === "0" ? "phase-ground-floor" : `phase-floor-${m[1]}`;
  return PHASE_ID[segment] ?? `phase-${segment}`;
}

function clone<T>(x: T): T {
  return structuredClone(x);
}

function findOrCreatePhase(spec: ProjectSpec, segment: string, book: FlowBook): PhaseRecord {
  const id = phaseRecordId(segment);
  let phase = spec.phases.find((p) => p.id === id);
  if (phase) return phase;
  const fm = /^floor-(\d+)$/.exec(segment);
  const flow = fm ? book.flows.find((f) => f.id === "floor") : book.flows.find((f) => f.id === segment);
  const idx = fm ? Number(fm[1]) : undefined;
  phase = {
    id,
    nameEn: fm ? (idx === 0 ? "Ground floor" : `Floor ${idx}`) : (flow?.name.en ?? segment),
    nameBn: fm ? (idx === 0 ? "নিচতলা" : `${bnDigits(String(idx))} তলা`) : (flow?.name.bn ?? segment),
    kind: fm ? (idx === 0 ? "ground_floor" : "floor") : (PHASE_KIND[flow?.phaseKind ?? ""] ?? "utility"),
    ...(idx !== undefined ? { storeyIndex: idx } : {}),
    status: "in_progress",
    data: {},
    messages: [],
  };
  spec.phases.push(phase);
  return phase;
}

/** Write `value` at a flow-book pointer on a copy of the spec. */
export function writePointer(spec: ProjectSpec, pointer: string, value: unknown, book: FlowBook = getBook()): ProjectSpec {
  const out = clone(spec);
  const parts = pointer.split("/").filter(Boolean);
  if (parts[0] === "phases") {
    // /phases/<flow-phase>/data/<key>
    const phase = findOrCreatePhase(out, parts[1], book);
    if (parts[2] !== "data" || parts.length !== 4) throw new Error(`unsupported phase pointer ${pointer}`);
    phase.data[parts[3]] = value;
    return out;
  }
  let node = out as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = node[parts[i]];
    if (next === undefined || next === null || typeof next !== "object") node[parts[i]] = {};
    node = node[parts[i]] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
  return out;
}

/** Read a flow-book pointer from the spec. */
export function readPointer(spec: ProjectSpec, pointer: string): unknown {
  const parts = pointer.split("/").filter(Boolean);
  if (parts[0] === "phases") {
    const phase = spec.phases.find((p) => p.id === phaseRecordId(parts[1]));
    return phase?.data[parts[3]];
  }
  let node: unknown = spec;
  for (const p of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[p];
  }
  return node;
}

// --- answer -> spec mapping ---------------------------------------------------------------------

type Pair = [pointer: string, value: unknown];

/** The writes an answer value makes, or null when the value means "use the fallback". */
export function answerWrites(q: Question, pointer: string, value: unknown): Pair[] | null {
  if (q.mapsTo === "/project/displayUnits/area") {
    const m = typeof value === "string" ? DISPLAY_UNITS[value] : undefined;
    if (!m) return null;
    return [["/project/displayUnits/area", m[0]], ["/project/displayUnits/length", m[1]]];
  }
  if (q.mapsTo === "/site/soil/status") {
    if (value === true) return [[pointer, "user_report"]];
    if (value === false) return null;
    return [[pointer, value]];
  }
  if (q.mapsTo === "/pricing/source") {
    if (value === true) return [[pointer, "user"]];
    if (value === false) return null;
    return [[pointer, value]];
  }
  if (q.mapsTo === "/site/address/division") return [[pointer, q.options.find((o) => o.value === value)?.label.en ?? value]];
  if (FALLBACK_OPTIONS[q.mapsTo]?.includes(String(value))) return null;
  return [[pointer, value]];
}

/** Values the state needs for `when` conditions, read back from a spec that has earlier answers. */
export function seedValues(spec: ProjectSpec, book: FlowBook = getBook()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of book.flows) {
    for (const q of f.questions) {
      if (q.mapsTo.includes("<n>")) continue;
      const stored = readPointer(spec, q.mapsTo);
      if (stored === undefined) continue;
      if (q.mapsTo === "/site/soil/status") out[q.id] = stored === "user_report";
      else if (q.mapsTo === "/pricing/source") out[q.id] = stored === "user";
      else if (q.mapsTo === "/project/displayUnits/area") continue;
      else out[q.id] = stored;
    }
  }
  return out;
}

// --- state ------------------------------------------------------------------------------------

const keyOf = (q: Question, storey?: number) => (storey === undefined ? q.id : `${q.id}@${storey}`);

function stepsOf(flow: Flow, spec: ProjectSpec, only?: number): Step[] {
  const storeys = flow.repeats === "per_storey" ? Math.max(1, Math.round(spec.building.storeys.count || 1)) : 0;
  const out: Step[] = [];
  const build = (q: Question, storey?: number) => out.push({ question: q, storeyIndex: storey, pointer: pointerFor(q, storey), key: keyOf(q, storey) });
  if (flow.repeats === "per_storey") {
    for (let n = 0; n < storeys; n++) {
      if (only !== undefined && only !== n) continue;
      for (const q of flow.questions) build(q, n);
    }
  } else {
    for (const q of flow.questions) build(q);
  }
  return out;
}

const HANDLED: LogEntry["outcome"][] = ["answered", "default", "omitted", "open", "pending"];
const handledElsewhere = (s: InterviewState, step: Step) => s.log.some((l) => l.key.startsWith(`${step.question.id}@`) && l.key !== step.key && HANDLED.includes(l.outcome));

/** Skip steps that do not apply and stop at the next one to ask. */
function advance(state: InterviewState, book: FlowBook): InterviewState {
  const s: InterviewState = { ...state, done: [...state.done], log: [...state.log] };
  for (const step of stepsOf(flowOf(book, s.flowId), s.spec, s.storey)) {
    if (s.done.includes(step.key)) continue;
    // A building-wide question inside a per-storey flow (its pointer has no <n>) is asked once, at the first storey where it applies.
    if (step.storeyIndex !== undefined && !step.question.mapsTo.includes("<n>") && handledElsewhere(s, step)) {
      s.done.push(step.key);
      continue;
    }
    const when = step.question.when;
    if (when) {
      try {
        if (!conditionHolds(when, s.values, step.storeyIndex)) {
          s.done.push(step.key);
          s.log.push({ key: step.key, outcome: "not_applicable" });
          continue;
        }
      } catch (e) {
        if (!(e instanceof ConditionError)) throw e;
        s.done.push(step.key);
        s.log.push({ key: step.key, outcome: "condition_unanswered" });
        continue;
      }
    }
    return { ...s, current: step };
  }
  return { ...s, current: null };
}

export function startInterview(spec: ProjectSpec, flowId: string, opts: { book?: FlowBook; values?: Record<string, unknown>; storey?: number; progress?: InterviewProgress } = {}): InterviewState {
  const book = opts.book ?? getBook();
  flowOf(book, flowId); // throws for an unknown flow
  const p = opts.progress;
  return advance(
    { spec, flowId, ...(opts.storey !== undefined ? { storey: opts.storey } : {}), values: { ...seedValues(spec, book), ...(opts.values ?? {}) }, done: p ? [...p.done] : [], open: p ? [...p.open] : [], pending: p ? [...p.pending] : [], log: p ? [...p.log] : [], current: null },
    book,
  );
}

/** What to save so the interview can resume later. */
export function progressOf(state: InterviewState): InterviewProgress {
  return { done: [...state.done], open: [...state.open], pending: [...state.pending], log: [...state.log] };
}

// --- replies ---------------------------------------------------------------------------------

const ACCEPTED: Bi = { en: "Got it.", bn: "ঠিক আছে।" };

export function displayValue(step: Step, value: unknown, lang: "en" | "bn"): string {
  const q = step.question;
  if (typeof value === "boolean") return lang === "bn" ? (value ? "হ্যাঁ" : "না") : value ? "yes" : "no";
  if (q.type === "choice" || q.type === "multi_choice") {
    const label = (v: unknown) => q.options.find((o) => o.value === v)?.label[lang] ?? String(v);
    return Array.isArray(value) ? value.map(label).join(", ") : label(value);
  }
  if (typeof value === "number") {
    const code = q.unit?.canonical;
    const word = code ? (UNIT_WORDS[code]?.[lang === "bn" ? 1 : 0] ?? code) : "";
    const text = `${formatNumber(value, 3)} ${word}`.trim();
    return lang === "bn" ? bnDigits(text) : text;
  }
  return String(value);
}

const ASK_AGAIN: Record<string, Bi> = {
  schema: { en: "That value is not allowed here.", bn: "এই মানটি এখানে অনুমোদিত নয়।" },
  empty: { en: "Please type an answer, or tap a button.", bn: "একটি উত্তর লিখুন, অথবা বোতামে চাপ দিন।" },
  ambiguous_choice: { en: "That matches more than one option. Which one?", bn: "এটি একাধিক বিকল্পের সাথে মেলে। কোনটি?" },
  ambiguous_yesno: { en: "Is that a yes or a no?", bn: "এটা কি হ্যাঁ, নাকি না?" },
  out_of_range: { en: "That number is outside the allowed range.", bn: "সংখ্যাটি অনুমোদিত সীমার বাইরে।" },
  whole_number: { en: "Please give a whole number.", bn: "একটি পূর্ণসংখ্যা দিন।" },
  unexpected_unit: { en: "This answer is a count: no unit needed.", bn: "এটি একটি গণনা: কোনো একক লাগবে না।" },
  multiple_numbers: { en: "I found more than one number. Give just one.", bn: "একাধিক সংখ্যা পেয়েছি। শুধু একটি দিন।" },
  unknown_unit: { en: "I did not recognise that unit. Use katha, shotok, bigha, sqft or sqm for area; m or ft for length.", bn: "এককটি চিনতে পারিনি। ক্ষেত্রফলে কাঠা, শতক, বিঘা, বর্গফুট বা বর্গমিটার; দৈর্ঘ্যে মিটার বা ফুট ব্যবহার করুন।" },
  wrong_dimension: { en: "That unit does not fit this question (area vs length).", bn: "এই এককটি এই প্রশ্নের সাথে মেলে না (ক্ষেত্রফল বনাম দৈর্ঘ্য)।" },
  too_long: { en: "That is too long. Please shorten it.", bn: "উত্তরটি খুব বড়। ছোট করুন।" },
};
const UNREADABLE: Bi = { en: "I could not read that. Please use one of the buttons or rephrase.", bn: "বুঝতে পারিনি। বোতামগুলো ব্যবহার করুন, অথবা অন্যভাবে লিখুন।" };
const NEEDED: Bi = { en: "This one is needed and cannot be assumed. It stays open and the rest continues.", bn: "এটি জরুরি এবং অনুমান করা যায় না। এটি খোলা থাকল, বাকিটা চলবে।" };
const OMITTED: Bi = { en: "Skipped. You can add it later.", bn: "বাদ দেওয়া হলো। পরে যোগ করতে পারবেন।" };
const PENDING: Bi = { en: "Noted. This will be worked out later and flagged.", bn: "লিখে রাখলাম। এটি পরে হিসাব করে চিহ্নিত করা হবে।" };

// --- applying a parsed answer -------------------------------------------------------------------

function provenanceFor(source: ProvenanceEntry["source"], detail: string, confidence: ProvenanceEntry["confidence"], now: string): ProvenanceEntry {
  return { source, detail, at: now, confidence };
}

function commit(state: InterviewState, pairs: Pair[], prov: ProvenanceEntry, now: string, book: FlowBook): InterviewState {
  let spec = state.spec;
  const provenance = { ...spec.provenance };
  for (const [pointer, value] of pairs) {
    spec = writePointer(spec, pointer, value, book);
    provenance[pointer] = prov;
  }
  return { ...state, spec: { ...spec, provenance, updatedAt: now } };
}

function removePending(spec: ProjectSpec, pointer: string): ProjectSpec {
  return spec.pendingInputs.includes(pointer) ? { ...spec, pendingInputs: spec.pendingInputs.filter((p) => p !== pointer) } : spec;
}

function addAssumption(state: InterviewState, step: Step, fb: NonNullable<Question["fallback"]>): InterviewState {
  const statement = fb.assumption?.en?.trim();
  if (!statement) return state;
  const id = `asm-${step.key}`;
  if (state.spec.assumptions.some((a) => a.id === id)) return state;
  const basis: Assumption["basis"] = fb.kind === "registry" ? "external_source" : fb.kind === "area_default" ? "area_default" : "conservative_default";
  const entry: Assumption = { id, subject: step.question.id, statement, basis, verifyOnSite: fb.kind === "area_default" || fb.kind === "registry", relatedPath: step.pointer };
  return { ...state, spec: { ...state.spec, assumptions: [...state.spec.assumptions, entry] } };
}

function finish(state: InterviewState, step: Step, outcome: LogEntry["outcome"], book: FlowBook, value?: unknown): InterviewState {
  const done = state.done.includes(step.key) ? state.done : [...state.done, step.key];
  return advance({ ...state, done, log: [...state.log, { key: step.key, outcome, value }] }, book);
}

function applyFallback(state: InterviewState, step: Step, trigger: string, now: string, book: FlowBook): { state: InterviewState; turn: Turn } {
  const q = step.question;
  const fb = q.fallback;
  const base = { key: step.key, pointer: step.pointer, reason: `fallback:${trigger}` };

  if (q.essential) {
    const open = state.open.includes(step.key) ? state.open : [...state.open, step.key];
    const spec = state.spec.pendingInputs.includes(step.pointer) ? state.spec : { ...state.spec, pendingInputs: [...state.spec.pendingInputs, step.pointer] };
    const next = finish({ ...state, open, spec }, step, "open", book);
    return { state: next, turn: { kind: "open", ...base, reply: NEEDED } };
  }
  if (!fb || fb.kind === "omit") {
    return { state: finish(state, step, "omitted", book), turn: { kind: "fallback", ...base, reply: OMITTED } };
  }

  let s = state;
  const prov = provenanceFor(fb.kind === "default" ? "default" : "assumption", fb.assumption?.en ?? `flow-book ${fb.kind} fallback: ${q.id}`, "assumption", now);

  if (fb.kind === "derive") {
    const m = typeof fb.value === "string" ? /^<(.+)>$/.exec(fb.value) : null;
    const derived = m ? readPointer(s.spec, "/" + m[1].replace(/\./g, "/")) : undefined;
    if (derived !== undefined) {
      s = commit(s, [[step.pointer, derived]], provenanceFor("engine", `derived from ${m![1]}`, "medium", now), now, book);
      s = { ...s, values: { ...s.values, [q.id]: derived } };
      const displayed = displayValue(step, derived, "en");
      return { state: finish(s, step, "default", book, derived), turn: { kind: "fallback", ...base, value: derived, reply: { en: `Used ${displayed}, taken from the building settings.`, bn: `ইমারতের সেটিং থেকে ${bnDigits(displayed)} নেওয়া হলো।` } } };
    }
    const item: PendingItem = { key: step.key, pointer: step.pointer, kind: "derive", reason: "the value it derives from is not known yet" };
    s = { ...s, pending: [...s.pending, item] };
    return { state: finish(s, step, "pending", book), turn: { kind: "fallback", ...base, reply: PENDING } };
  }

  // default / registry / area_default: write the authored value when the spec can hold it.
  const value = fb.value;
  const symbolic = q.type === "choice" && value !== undefined && !q.options.some((o) => o.value === value);
  const pairs: Pair[] | null = value === undefined || symbolic ? null : (answerWrites(q, step.pointer, value) ?? [[step.pointer, value]]);
  if (pairs) {
    s = commit(s, pairs, prov, now, book);
    s = addAssumption(s, step, fb);
    s = { ...s, values: { ...s.values, [q.id]: q.mapsTo === "/site/soil/status" || q.mapsTo === "/pricing/source" ? false : value } };
    const displayed = displayValue(step, value, "en");
    const reply: Bi = fb.assumption ?? { en: `Using ${displayed} for now. You can change it later.`, bn: `আপাতত ${bnDigits(displayed)} ধরা হলো। পরে বদলাতে পারবেন।` };
    return { state: finish(s, step, "default", book, value), turn: { kind: "fallback", ...base, value, reply } };
  }
  // The value is symbolic (e.g. "derived-from-location"): the assumption is recorded, the value is worked out later.
  s = addAssumption(s, step, fb);
  s = { ...s, pending: [...s.pending, { key: step.key, pointer: step.pointer, kind: fb.kind as "registry" | "area_default", reason: "the authored fallback value is symbolic and not a spec value", assumption: fb.assumption }] };
  return { state: finish(s, step, "pending", book), turn: { kind: "fallback", ...base, reply: fb.assumption ? { en: `${fb.assumption.en} ${PENDING.en}`, bn: `${fb.assumption.bn} ${PENDING.bn}` } : PENDING } };
}

function applyParsed(state: InterviewState, step: Step, parsed: ParseResult, said: string, now: string, book: FlowBook): { state: InterviewState; turn: Turn } {
  const q = step.question;
  const base = { key: step.key, pointer: step.pointer };
  switch (parsed.decision) {
    case "skip":
      return applyFallback(state, step, "dont_know", now, book);
    case "default":
      return applyFallback(state, step, "user_delegated", now, book);
    case "ask_again": {
      const reply = ASK_AGAIN[parsed.reason ?? ""] ?? UNREADABLE;
      return { state, turn: { kind: "ask_again", ...base, reason: parsed.reason, reply, candidates: parsed.candidates, chips: chipsFor(q, "en") } };
    }
    case "escalate":
      return { state, turn: { kind: "ask_again", ...base, reason: parsed.reason, reply: UNREADABLE, chips: chipsFor(q, "en") } };
    case "accept": {
      const pairs = answerWrites(q, step.pointer, parsed.value);
      if (!pairs) return applyFallback(state, step, parsed.reason ?? "answer", now, book);
      for (const [pointer, value] of pairs) {
        const why = validatePointer(pointer, value);
        if (why) {
          return { state, turn: { kind: "ask_again", ...base, reason: "schema", reply: { en: `${ASK_AGAIN.schema.en} It ${why}.`, bn: `${ASK_AGAIN.schema.bn} (${why})` }, chips: chipsFor(q, "en") } };
        }
      }
      const readAs = parsed.asEntered && parsed.asEntered !== said ? `; read as: ${parsed.asEntered}` : "";
      const detail = `interview: ${q.id}${step.storeyIndex !== undefined ? ` (storey ${step.storeyIndex})` : ""} (said: "${said}"${readAs})`;
      let s = commit(state, pairs, provenanceFor("user", detail, parsed.usedDisplayUnit ? "medium" : "high", now), now, book);
      s = { ...s, spec: removePending(s.spec, step.pointer), open: s.open.filter((k) => k !== step.key), pending: s.pending.filter((p) => p.key !== step.key), values: { ...s.values, [q.id]: parsed.value } };
      const turn: Turn = {
        kind: "accept",
        ...base,
        value: parsed.value,
        reply: { en: `${ACCEPTED.en} ${displayValue(step, parsed.value, "en")}`, bn: `${ACCEPTED.bn} ${displayValue(step, parsed.value, "bn")}` },
      };
      return { state: finish(s, step, "answered", book, parsed.value), turn };
    }
  }
}

/** The units the parser should read a bare number in, from the project's display settings. */
function displayUnitsOf(spec: ProjectSpec): { areaDisplay: string; lengthDisplay: string } {
  return { areaDisplay: spec.project.displayUnits.area ?? "sqm", lengthDisplay: spec.project.displayUnits.length ?? "m" };
}

/** Answer the current question with free text (or a chip's option value). */
export function answer(state: InterviewState, text: string, now: string, book: FlowBook = getBook()): { state: InterviewState; turn: Turn } {
  const step = state.current;
  if (!step) return { state, turn: { kind: "done", reply: { en: "That is everything for this part.", bn: "এই অংশের সব হয়ে গেছে।" } } };
  const parsed = parseAnswer(step.question, text, displayUnitsOf(state.spec));
  return applyParsed(state, step, parsed, text, now, book);
}

/** Tap the "I don't know" chip on the current question. */
export function skip(state: InterviewState, now: string, book: FlowBook = getBook()): { state: InterviewState; turn: Turn } {
  const step = state.current;
  if (!step) return { state, turn: { kind: "done", reply: { en: "That is everything for this part.", bn: "এই অংশের সব হয়ে গেছে।" } } };
  return applyFallback(state, step, "dont_know", now, book);
}

/** Answer a question that was left open earlier. */
export function answerOpen(state: InterviewState, key: string, text: string, now: string, book: FlowBook = getBook()): { state: InterviewState; turn: Turn } {
  const step = stepsOf(flowOf(book, state.flowId), state.spec, state.storey).find((s) => s.key === key);
  if (!step || !state.open.includes(key)) throw new Error(`"${key}" is not an open question`);
  const parsed = parseAnswer(step.question, text, displayUnitsOf(state.spec));
  const out = applyParsed({ ...state, done: state.done.filter((k) => k !== key) }, step, parsed, text, now, book);
  // An unanswered attempt leaves the step open and done as before.
  if (out.turn.kind === "ask_again" || out.turn.kind === "open") return { state, turn: out.turn };
  return out;
}

export interface StepView {
  key: string;
  pointer: string;
  prompt: Bi;
  why: Partial<Bi>;
  essential: boolean;
  chips: { en: Chip[]; bn: Chip[] };
}

export function describeStep(step: Step): StepView {
  const q = step.question;
  return { key: step.key, pointer: step.pointer, prompt: q.ask, why: q.why, essential: q.essential, chips: { en: chipsFor(q, "en"), bn: chipsFor(q, "bn") } };
}
