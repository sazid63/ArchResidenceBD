/**
 * A tiny in-memory log of problems the user must be told about: a save that did not happen, a project changed in another tab, a damaged
 * store, entries that could not be read, an unexpected runtime error. Nothing is sent anywhere. The banner (components/HealthBanner)
 * shows these; the error report file can include them. Messages are bilingual so the log needs no i18n context.
 */

export type HealthKind = "write_failed" | "conflict" | "damaged" | "skipped" | "runtime";

export interface HealthEvent {
  id: number;
  kind: HealthKind;
  en: string;
  bn: string;
  at: string;
  /** Technical detail for the error report (never project data). */
  detail?: string;
}

let events: HealthEvent[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function reportHealth(kind: HealthKind, en: string, bn: string, detail?: string): void {
  // the same message twice in a row is one problem
  if (events.some((e) => e.kind === kind && e.en === en)) return;
  events = [...events.slice(-9), { id: nextId++, kind, en, bn, at: new Date().toISOString(), ...(detail ? { detail } : {}) }];
  emit();
}

export const getHealth = (): HealthEvent[] => events;

export function dismissHealth(id: number): void {
  events = events.filter((e) => e.id !== id);
  emit();
}

export function clearHealth(): void {
  events = [];
  emit();
}

export function subscribeHealth(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

const message = (e: unknown): string => (e instanceof Error ? e.message : typeof e === "string" ? e : "unknown error");

/** Unhandled errors and promise rejections end up in the log instead of vanishing. Call once at start-up. */
export function installGlobalErrorCapture(target: Pick<Window, "addEventListener"> = window): void {
  target.addEventListener("error", (ev) => {
    const e = ev as ErrorEvent;
    reportHealth("runtime", `Unexpected error: ${message(e.error ?? e.message)}`, `অপ্রত্যাশিত ত্রুটি: ${message(e.error ?? e.message)}`, e.error instanceof Error ? e.error.stack : undefined);
  });
  target.addEventListener("unhandledrejection", (ev) => {
    const r = (ev as PromiseRejectionEvent).reason;
    reportHealth("runtime", `Unexpected error: ${message(r)}`, `অপ্রত্যাশিত ত্রুটি: ${message(r)}`, r instanceof Error ? r.stack : undefined);
  });
}
