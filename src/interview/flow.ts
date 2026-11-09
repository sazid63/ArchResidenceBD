/**
 * Phase Flow Book access (M6-1), ported from the v0 `interview/flow.py`.
 *
 * The flow book (`spec/flows/phase-flow-book.yaml`) is data: questions, chips, fallbacks, conditions
 * and spec pointers. This module only reads it; adding or rewording a question is a data edit.
 *
 * `when` conditions compare ANSWER values (a yes/no answer is true/false, a choice is its option value),
 * not the value stored in the spec: soil-has-report stores an enum but its condition still compares to "yes".
 * Per-storey flows resolve `/phases/floor-<n>/...` with the storey index (0 = ground floor).
 */

import { load } from "js-yaml";
import bookText from "../../spec/flows/phase-flow-book.yaml?raw";

export type Bi = { en: string; bn: string };
export type QuestionType = "text" | "number" | "integer" | "yes_no" | "choice" | "multi_choice" | "file";
export type FallbackKind = "default" | "registry" | "area_default" | "derive" | "omit";

export interface QuestionOption {
  value: string;
  label: Bi;
}

export interface Fallback {
  kind: FallbackKind;
  value?: unknown;
  assumption?: Bi;
}

export interface Question {
  id: string;
  flowId: string;
  type: QuestionType;
  mapsTo: string;
  ask: Bi;
  why: Partial<Bi>;
  unit?: { canonical?: string; display?: string[] };
  options: QuestionOption[];
  essential: boolean;
  fallback?: Fallback;
  when?: string;
  source?: string;
}

export interface Flow {
  id: string;
  name: Bi;
  goal: Bi;
  repeats: "once" | "per_storey";
  phaseKind?: string;
  questions: Question[];
}

export interface FlowBook {
  version: string;
  status: string;
  flows: Flow[];
}

export class FlowBookError extends Error {}
/** A `when` condition references a value that has not been answered (yet). */
export class ConditionError extends FlowBookError {}

export const SKIP_CHIP = { en: "I don't know", bn: "জানি না" };
export const SKIP_CHIP_ID = "@skip";

export const unitCode = (q: Question): string | undefined => q.unit?.canonical;

interface RawQuestion {
  id: string;
  type?: QuestionType;
  maps_to: string;
  ask: Bi;
  why?: Partial<Bi>;
  unit?: { canonical?: string; display?: string[] };
  options?: QuestionOption[];
  essential?: boolean;
  fallback?: Fallback;
  when?: string;
  source?: string;
}
interface RawFlow {
  id: string;
  name: Bi;
  goal: Bi;
  repeats: "once" | "per_storey";
  phaseKind?: string;
  questions?: RawQuestion[];
}

export function parseBook(text: string): FlowBook {
  const data = load(text) as { bookVersion?: unknown; status?: unknown; flows?: RawFlow[] } | null;
  if (!data || typeof data !== "object" || !Array.isArray(data.flows)) throw new FlowBookError("flow book must be a YAML mapping with flows");
  return {
    version: String(data.bookVersion),
    status: String(data.status),
    flows: data.flows.map((f) => ({
      id: f.id,
      name: f.name,
      goal: f.goal,
      repeats: f.repeats,
      phaseKind: f.phaseKind,
      questions: (f.questions ?? []).map((q) => ({
        id: q.id,
        flowId: f.id,
        type: q.type ?? "text",
        mapsTo: q.maps_to,
        ask: q.ask,
        why: q.why ?? {},
        unit: q.unit,
        options: q.options ?? [],
        essential: !!q.essential,
        fallback: q.fallback,
        when: q.when,
        source: q.source,
      })),
    })),
  };
}

let cached: FlowBook | null = null;
/** The authored book shipped with the app. */
export function getBook(): FlowBook {
  return (cached ??= parseBook(bookText));
}

export function flowOf(book: FlowBook, id: string): Flow {
  const f = book.flows.find((x) => x.id === id);
  if (!f) throw new FlowBookError(`unknown flow "${id}" (have: ${book.flows.map((x) => x.id).join(", ")})`);
  return f;
}

export function questionOf(book: FlowBook, id: string): Question {
  for (const f of book.flows) for (const q of f.questions) if (q.id === id) return q;
  throw new FlowBookError(`unknown question "${id}"`);
}

export const allQuestions = (book: FlowBook): Question[] => book.flows.flatMap((f) => f.questions);

/** The question's spec pointer, with the `floor-<n>` template expanded. */
export function pointerFor(q: Question, storeyIndex?: number): string {
  if (!q.mapsTo.includes("<n>")) return q.mapsTo;
  if (storeyIndex === undefined) throw new FlowBookError(`${q.id}: per-storey pointer ${q.mapsTo} needs a storey index`);
  return q.mapsTo.replace("<n>", String(storeyIndex));
}

export interface Chip {
  id: string;
  label: string;
  kind: "option" | "skip";
  option?: string;
}

/** Quick replies: option chips plus one "I don't know" chip. Shortcuts, never constraints. An essential question gets no skip chip. */
export function chips(q: Question, lang: "en" | "bn" = "en"): Chip[] {
  const out: Chip[] = q.options.map((o) => ({ id: o.value, label: o.label[lang], kind: "option", option: o.value }));
  if (q.fallback && !q.essential) out.push({ id: SKIP_CHIP_ID, label: SKIP_CHIP[lang], kind: "skip" });
  return out;
}

const WHEN = /^([A-Za-z0-9-]+)\s*(==|!=|>=|<=|>|<)\s*(-?\d+(?:\.\d+)?|[A-Za-z0-9-]+)$/;

export function parseWhen(condition: string): [string, string, string] {
  const m = WHEN.exec(condition.trim());
  if (!m) throw new FlowBookError(`cannot parse when condition "${condition}"`);
  return [m[1], m[2], m[3]];
}

function operand(token: string): string | number | boolean {
  const lower = token.trim().toLowerCase();
  if (lower === "yes" || lower === "true") return true;
  if (lower === "no" || lower === "false") return false;
  const n = Number(token);
  return Number.isNaN(n) ? lower : n;
}

/** Evaluate one `when` against answered values. Throws ConditionError for an unanswered operand: a condition is never guessed. */
export function conditionHolds(condition: string, values: Record<string, unknown>, storeyIndex?: number): boolean {
  const [name, op, token] = parseWhen(condition);
  let left: unknown;
  if (name === "storeyIndex") {
    if (storeyIndex === undefined) throw new ConditionError(`condition "${condition}" needs a storey index`);
    left = storeyIndex;
  } else if (name in values && values[name] !== undefined && values[name] !== null) {
    left = values[name];
  } else {
    throw new ConditionError(`condition "${condition}" references unanswered "${name}"`);
  }
  const right = operand(token);
  if (op === "==") return left === right;
  if (op === "!=") return left !== right;
  if (typeof left === "boolean" || typeof right === "boolean") throw new ConditionError(`cannot order booleans ("${op}")`);
  const a = left as number;
  const b = right as number;
  return op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b;
}
