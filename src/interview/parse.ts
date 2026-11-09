/**
 * Deterministic answer parser for the interview (M6-1), ported from the v0 `interview/parse.py`.
 *
 * Free text is parsed here and nowhere else: chips, numbers and choices are shortcuts, and this parser
 * handles the sloppy cases (Bangla digits, BN/EN/Banglish yes-no, unit words, "don't know", "sare panch
 * katha"). There is no model behind it (settled: no AI). Text it genuinely cannot read comes back as
 * `escalate`, which the runner turns into a plain re-ask with the chips: never a guessed value.
 *
 * A bare number on a unit question means the project's DISPLAY unit and is recorded at medium
 * confidence; the reply echoes the canonical value so a wrong unit is visible at once. An explicit
 * unit always wins. The result's `value` is always in the question's canonical unit.
 */

import { unitCode, pointerFor, type Question } from "./flow";
import { AREA_TO_M2, LENGTH_TO_M, UNIT_WORDS, areaToM2, formatNumber, lengthToM, quantize } from "./units";

export type Decision = "accept" | "skip" | "default" | "ask_again" | "escalate";

export interface ParseResult {
  decision: Decision;
  value?: unknown;
  unit?: string;
  asEntered: string;
  reason?: string;
  candidates?: string[];
  bounds?: [number, number];
  usedDisplayUnit?: boolean;
}

/** Schema-level text limits. */
const TEXT_LIMITS: Record<string, number> = { "/project/name": 120 };

/** Integer bounds per pointer (the Building Spec's own: storeys 1..20). */
const INTEGER_RANGES: Record<string, [number, number]> = {
  "/building/storeys/count": [1, 20],
  "/building/unitsPerFloor": [1, 20],
  "/phases/floor-<n>/data/unitsPerFloor": [1, 20],
  "/phases/floor-<n>/data/bedroomsPerUnit": [1, 20],
};

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Fold Bangla digits, quotes, case and whitespace: the one matching form. */
export function normalize(text: string): string {
  let v = String(text).normalize("NFKC");
  v = v.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
  v = v.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/ /g, " ");
  v = v.toLowerCase();
  v = v.replace(/\bsq\.\s*/g, "sq ");
  v = v.replace(/(?<=\d),(?=\d{3}(?!\d))/g, "");
  v = v.replace(/\s+/g, " ").trim();
  return v.replace(/^[ \t.,;:!?।]+|[ \t.,;:!?।]+$/g, "");
}

const WORD = "\\p{L}\\p{N}_\\u0980-\\u09ff";
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return new RegExp(`(?<![${WORD}])${escapeRe(needle)}(?![${WORD}])`, "u").test(haystack);
}

const normAll = (words: string[]) => words.map(normalize);

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  // Bangla
  এক: 1, দুই: 2, দুইটা: 2, তিন: 3, চার: 4, পাঁচ: 5, পাচ: 5, ছয়: 6, সাত: 7, আট: 8, নয়: 9, দশ: 10, এগারো: 11, বারো: 12,
  তেরো: 13, চৌদ্দ: 14, পনেরো: 15, ষোলো: 16, সতেরো: 17, আঠারো: 18, উনিশ: 19, বিশ: 20,
  // Banglish
  ek: 1, dui: 2, tin: 3, char: 4, panch: 5, pach: 5, choy: 6, saat: 7, aat: 8, noy: 9, dosh: 10,
};
const ALL_NUMBER_WORDS: Record<string, number> = Object.fromEntries(Object.entries(NUMBER_WORDS).map(([k, v]) => [normalize(k), v]));

const FRACTION_PREFIXES: Record<string, number> = Object.fromEntries(
  Object.entries({ সাড়ে: 0.5, sare: 0.5, sarey: 0.5, sara: 0.5, সোয়া: 0.25, sowa: 0.25, পৌনে: -0.25, poune: -0.25 }).map(([k, v]) => [normalize(k), v]),
);
const FRACTION_STANDALONE: Record<string, number> = Object.fromEntries(
  Object.entries({ দেড়: 1.5, dedh: 1.5, আড়াই: 2.5, arai: 2.5, সোয়া: 1.25, sowa: 1.25, পৌনে: 0.75, poune: 0.75 }).map(([k, v]) => [normalize(k), v]),
);
const FRACTION_HINTS = normAll(["সাড়ে", "দেড়", "আড়াই", "সোয়া", "পৌনে", "half"]);

const YES_WORDS = normAll(["yes", "y", "yeah", "yep", "yup", "sure", "ok", "okay", "true", "ha", "haa", "han", "hyan", "hae", "ache", "ase", "ji", "jee", "haan", "hya", "korbo", "lagbe", "chai", "হ্যাঁ", "হা", "জি", "আছে", "করব", "লাগবে", "চাই", "হবে", "ঠিক আছে"]);
const NO_WORDS = normAll(["no", "n", "nope", "nah", "na", "naa", "nahi", "false", "না", "নেই", "লাগবে না", "চাই না", "করব না", "হবে না", "দরকার নেই"]);
const DONT_KNOW = normAll([
  "don't know", "dont know", "do not know", "no idea", "not sure", "unsure", "no clue", "can't say", "cannot say", "unknown", "skip", "pass", "later", "no answer",
  "জানি না", "জানা নেই", "মনে নেই", "নিশ্চিত না", "নিশ্চিত নই", "বলতে পারব না", "পারব না", "পরে বলব", "বাদ দিন", "স্কিপ",
  "jani na", "janina", "jani naa", "mone nei", "thik jani na", "nishchit na", "bolte parbo na", "pore bolbo", "skip koro",
]);
const DECIDE = normAll([
  "you decide", "you choose", "your choice", "whatever", "default", "as you like", "up to you", "your call", "recommend", "suggest",
  "আপনি ঠিক করুন", "আপনি দেখুন", "আপনার পছন্দ", "যেটা ভালো", "যা ভালো মনে হয়", "আপনি বলুন", "ডিফল্ট",
  "apni dekhen", "apni thik korun", "ja bhalo mone hoy",
]);

const anyPhrase = (norm: string, phrases: string[]) => phrases.some((p) => contains(norm, p));

/** Unit aliases -> internal unit code. Longest alias wins ("square feet" before "ft"). */
const UNIT_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries({
    "square meter": "sqm", "square meters": "sqm", "square metre": "sqm", "square metres": "sqm", "sq m": "sqm", sqm: "sqm", m2: "m2",
    বর্গমিটার: "sqm", "বর্গ মিটার": "sqm",
    "square feet": "sqft", "square foot": "sqft", "square ft": "sqft", "sq ft": "sqft", sqft: "sqft", sft: "sqft", বর্গফুট: "sqft", "বর্গ ফুট": "sqft",
    katha: "katha", kattah: "katha", কাঠা: "katha",
    shotok: "shotok", shotangsho: "shotok", decimal: "shotok", শতক: "shotok", শতাংশ: "shotok",
    bigha: "bigha", বিঘা: "bigha", gonda: "gonda", গন্ডা: "gonda", গণ্ডা: "gonda",
    kilopascal: "kPa", kilopascals: "kPa", kpa: "kPa", কিলোপ্যাসকেল: "kPa",
    m: "m", meter: "m", meters: "m", metre: "m", metres: "m", মিটার: "m",
    ft: "ft", feet: "ft", foot: "ft", ফুট: "ft", inch: "inch", inches: "inch", ইঞ্চি: "inch",
    millimeter: "mm", millimeters: "mm", millimetre: "mm", mm: "mm", মিলিমিটার: "mm",
    taka: "BDT", tk: "BDT", "৳": "BDT", টাকা: "BDT",
  }).map(([k, v]) => [normalize(k), v]),
);
const ALIASES_BY_LENGTH = Object.keys(UNIT_ALIASES).sort((a, b) => b.length - a.length);

const DIMENSION: Record<string, string> = { sqm: "area", m2: "area", sqft: "area", katha: "area", shotok: "area", bigha: "area", gonda: "area", m: "length", ft: "length", inch: "length", mm: "length", kPa: "pressure", BDT: "money" };
const CANONICAL_DIMENSION: Record<string, string> = { m: "length", m2: "area", mm: "length", kPa: "pressure", BDT: "money" };
const CANONICAL_DECIMALS: Record<string, number> = { m2: 2, m: 3, mm: 2, kPa: 2, BDT: 2 };

/** Like `contains`, but a digit may sit right before the word: "5katha", "1200sqft", "40ft". */
function containsUnit(haystack: string, needle: string): boolean {
  if (!needle) return false;
  // An English alias may take a plural s ("kathas", "feet" is its own alias).
  const plural = /[a-z]$/.test(needle) ? "s?" : "";
  return new RegExp(`(?<![\\p{L}\\p{M}_])${escapeRe(needle)}${plural}(?![${WORD}])`, "u").test(haystack);
}

const findUnit = (norm: string): string | null => {
  for (const a of ALIASES_BY_LENGTH) if (containsUnit(norm, a)) return UNIT_ALIASES[a];
  // Prime marks: 40' is feet, 6" is inches.
  if (/\d\s*'/.test(norm)) return "ft";
  if (/\d\s*"/.test(norm)) return "inch";
  return null;
};

/** Words that may follow a number without being a unit ("5 or so", "40 only"). */
const NOT_A_UNIT = new Set(["or", "only", "approx", "approximately", "about", "around", "ish", "total", "plus", "and", "by", "x", "টা", "টি", "মত", "প্রায়", "ta", "mot"]);

/** The word right after the number when it is neither a known unit nor an ignorable filler: "5 acre", "30 yards". */
function unknownUnitWord(norm: string): string | null {
  const m = /\d(?:\.\d+)?\s*([\p{L}\p{M}]+)/u.exec(norm);
  if (!m) return null;
  const word = m[1];
  if (NOT_A_UNIT.has(word) || word in ALL_NUMBER_WORDS) return null;
  return word;
}

const numbersIn = (norm: string): number[] => (norm.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);

function numberToken(token: string): number | null {
  const t = token.replace(/^[ \t.,;:!?।]+|[ \t.,;:!?।]+$/g, "");
  if (/^\d+(?:\.\d+)?$/.test(t)) return Number(t);
  return t in ALL_NUMBER_WORDS ? ALL_NUMBER_WORDS[t] : null;
}

/** Turn BN/EN fractional phrases into decimals before extraction: "সাড়ে ৫" -> 5.5, "পৌনে পাঁচ" -> 4.75, "5 and a half" -> 5.5. A fraction with no base stays in place so the caller escalates. */
function expandFractions(input: string): string {
  let norm = input.replace(/(?<![\p{L}\p{N}_])(\d+(?:\.\d+)?|[a-z]+)\s+and\s+(?:a\s+)?half(?![\p{L}\p{N}_])/giu, (m, base: string) => {
    const b = numberToken(base.toLowerCase());
    return b === null ? m : formatNumber(b + 0.5);
  });
  for (const [word, delta] of Object.entries(FRACTION_PREFIXES).sort((a, b) => b[0].length - a[0].length)) {
    const re = new RegExp(`(?<![${WORD}])${escapeRe(word)}\\s+(\\S+)`, "gu");
    norm = norm.replace(re, (m, tok: string) => {
      const b = numberToken(tok);
      if (b === null) return m;
      const v = b + delta;
      return v <= 0 ? m : formatNumber(v);
    });
  }
  for (const [word, value] of Object.entries(FRACTION_STANDALONE).sort((a, b) => b[0].length - a[0].length)) {
    norm = norm.replace(new RegExp(`(?<![${WORD}])${escapeRe(word)}(?![${WORD}])`, "gu"), formatNumber(value));
  }
  return norm.replace(/(?<![\p{L}\p{N}_])half(?![\p{L}\p{N}_])/gu, "0.5");
}

/** Replace a leading number word: "five katha", "পাঁচ কাঠা", "panch katha". */
function leadingNumberWord(norm: string): string {
  const i = norm.indexOf(" ");
  const first = i < 0 ? norm : norm.slice(0, i);
  const rest = i < 0 ? "" : norm.slice(i + 1);
  return first in ALL_NUMBER_WORDS ? `${ALL_NUMBER_WORDS[first]} ${rest}`.trim() : norm;
}

function feetInches(norm: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:ft|feet|foot|ফুট|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|ইঞ্চি|")/u.exec(norm);
  return m ? Number(m[1]) + Number(m[2]) / 12 : null;
}

function storeyCount(norm: string): number | null {
  const m = /\bg\s*\+\s*(\d{1,2})\b/.exec(norm) ?? /\bground\s*(?:\+|plus)\s*(\d{1,2})\b/.exec(norm);
  if (m) return Number(m[1]) + 1;
  if (/\b(?:g|ground)\b/.test(norm) && numbersIn(norm).length === 0) return 1;
  return null;
}

const baseLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*/g, " ").trim();

function optionHits(q: Question, norm: string) {
  const keys = (o: Question["options"][number], full: boolean): string[] => {
    const raw = String(o.value);
    const out = new Set([normalize(raw), normalize(raw.replace(/-/g, " "))]);
    for (const lang of ["en", "bn"] as const) {
      const text = String(o.label[lang] ?? "");
      out.add(normalize(text));
      if (!full) out.add(normalize(baseLabel(text)));
    }
    return [...out].filter(Boolean);
  };
  const exact = q.options.filter((o) => keys(o, true).includes(norm));
  if (exact.length) return exact;
  const forward = q.options.filter((o) => keys(o, false).some((k) => contains(norm, k)));
  if (forward.length) return forward;
  if (norm.length >= 4) {
    const reverse = q.options.filter((o) => keys(o, true).some((k) => contains(k, norm)));
    if (reverse.length) return reverse;
  }
  return [];
}

function parseChoice(q: Question, norm: string, raw: string): ParseResult {
  const hits = optionHits(q, norm);
  if (hits.length === 1) return { decision: "accept", value: hits[0].value, asEntered: raw };
  if (hits.length > 1) return { decision: "ask_again", reason: "ambiguous_choice", candidates: hits.map((o) => o.value), asEntered: raw };
  if (anyPhrase(norm, DONT_KNOW)) return { decision: "skip", reason: "dont_know", asEntered: raw };
  if (anyPhrase(norm, DECIDE)) return { decision: "default", reason: "user_delegated", asEntered: raw };
  return { decision: "escalate", reason: "unrecognised_choice", asEntered: raw };
}

function parseMultiChoice(q: Question, norm: string, raw: string): ParseResult {
  const parts = norm.split(/[,;]|\band\b|\bএবং\b|\bআর\b/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { decision: "ask_again", reason: "empty", asEntered: raw };
  const picked: string[] = [];
  for (const part of parts) {
    const hits = optionHits(q, part);
    if (hits.length !== 1) return { decision: "escalate", reason: "unrecognised_choice", asEntered: raw };
    if (!picked.includes(hits[0].value)) picked.push(hits[0].value);
  }
  return { decision: "accept", value: picked, asEntered: raw };
}

function parseYesNo(norm: string, raw: string): ParseResult {
  if (anyPhrase(norm, DONT_KNOW)) return { decision: "skip", reason: "dont_know", asEntered: raw };
  const yes = YES_WORDS.some((w) => contains(norm, w));
  const no = NO_WORDS.some((w) => contains(norm, w));
  if (yes && no) {
    // "করব না" / "yes, no": a trailing negation settles the answer.
    if (/(?:^|\s)(না|na|no|nah|nope)$/u.test(norm)) return { decision: "accept", value: false, asEntered: raw };
    return { decision: "ask_again", reason: "ambiguous_yesno", asEntered: raw };
  }
  if (yes) return { decision: "accept", value: true, asEntered: raw };
  if (no) return { decision: "accept", value: false, asEntered: raw };
  if (anyPhrase(norm, DECIDE)) return { decision: "default", reason: "user_delegated", asEntered: raw };
  return { decision: "escalate", reason: "unrecognised_yesno", asEntered: raw };
}

function displayUnit(q: Question, areaDisplay: string, lengthDisplay: string): string | null {
  const dim = CANONICAL_DIMENSION[unitCode(q) ?? ""];
  if (dim === "area") return areaDisplay in AREA_TO_M2 ? areaDisplay : "sqm";
  if (dim === "length") return lengthDisplay in LENGTH_TO_M ? lengthDisplay : "m";
  if (dim === "pressure") return "kPa";
  if (dim === "money") return "BDT";
  return null;
}

/** A value in the question's canonical unit. */
export function canonicalValue(q: Question, value: number, unit: string): number {
  const canonical = unitCode(q);
  if (!canonical) return quantize(value, 2);
  if (canonical === "m2") return quantize(areaToM2(value, unit), 2);
  if (canonical === "m") return quantize(lengthToM(value, unit), 3);
  if (canonical === "mm") return quantize(lengthToM(value, "mm") * 1000, 2);
  return quantize(value, CANONICAL_DECIMALS[canonical] ?? 2);
}

function parseNumber(q: Question, input: string, raw: string, areaDisplay: string, lengthDisplay: string): ParseResult {
  if (anyPhrase(input, DONT_KNOW)) return { decision: "skip", reason: "dont_know", asEntered: raw };
  let norm = expandFractions(input);
  if (FRACTION_HINTS.some((h) => contains(norm, h))) return { decision: "escalate", reason: "unparseable_fraction", asEntered: raw };

  norm = leadingNumberWord(norm);
  const integer = q.type === "integer";
  const range = INTEGER_RANGES[q.mapsTo];
  if (integer && q.mapsTo === "/building/storeys/count") {
    const storeys = storeyCount(norm);
    if (storeys !== null) {
      if (range && !(range[0] <= storeys && storeys <= range[1])) return { decision: "ask_again", reason: "out_of_range", bounds: range, asEntered: raw };
      return { decision: "accept", value: storeys, asEntered: `${storeys} floors` };
    }
  }
  if (/-\s*\d/.test(norm)) return { decision: "ask_again", reason: "out_of_range", asEntered: raw };

  let value: number | null = null;
  let enteredUnit: string | null = null;
  if (unitCode(q) === "m") {
    const feet = feetInches(norm);
    if (feet !== null) {
      value = feet;
      enteredUnit = "ft";
    }
  }
  if (value === null) {
    const numbers = numbersIn(norm);
    if (!numbers.length) {
      if (anyPhrase(norm, DECIDE)) return { decision: "default", reason: "user_delegated", asEntered: raw };
      return { decision: "escalate", reason: "unparseable_number", asEntered: raw };
    }
    if (numbers.length > 1) return { decision: "ask_again", reason: "multiple_numbers", asEntered: raw };
    value = numbers[0];
  }

  const foundUnit = findUnit(norm);
  if (foundUnit !== null) enteredUnit = foundUnit;
  let usedDisplay = false;
  if (foundUnit === null && !integer && unitCode(q) && unknownUnitWord(norm)) {
    return { decision: "ask_again", reason: "unknown_unit", unit: unknownUnitWord(norm) ?? undefined, asEntered: raw };
  }
  if (enteredUnit === null) {
    enteredUnit = displayUnit(q, areaDisplay, lengthDisplay);
    usedDisplay = enteredUnit !== null;
  }

  if (integer) {
    if (enteredUnit !== null && foundUnit !== null) return { decision: "ask_again", reason: "unexpected_unit", asEntered: raw };
    if (!Number.isInteger(value)) return { decision: "ask_again", reason: "whole_number", asEntered: raw };
    if (range && !(range[0] <= value && value <= range[1])) return { decision: "ask_again", reason: "out_of_range", bounds: range, asEntered: raw };
    if (value <= 0) return { decision: "ask_again", reason: "out_of_range", asEntered: raw };
    return { decision: "accept", value, asEntered: String(value) };
  }

  const dim = CANONICAL_DIMENSION[unitCode(q) ?? ""];
  if (enteredUnit !== null && dim !== undefined && DIMENSION[enteredUnit] !== dim) {
    return { decision: "ask_again", reason: "wrong_dimension", unit: enteredUnit, asEntered: raw };
  }
  if (value <= 0) return { decision: "ask_again", reason: "out_of_range", asEntered: raw };

  const code = enteredUnit ?? unitCode(q) ?? "";
  const canonical = unitCode(q) ? canonicalValue(q, value, code) : value;
  const word = UNIT_WORDS[code]?.[0] ?? code;
  const asEntered = code ? `${formatNumber(value, 2)} ${word}`.trim() : formatNumber(value);
  return { decision: "accept", value: canonical, unit: code, asEntered, usedDisplayUnit: usedDisplay };
}

export class ParseError extends Error {}

/**
 * Parse one free-text answer against a flow-book question. Never throws on user input: the result says
 * accept, skip (don't know), default (user delegated), ask_again (clarify, with candidates or bounds) or
 * escalate (unreadable: the runner re-asks). Only an unsupported question type throws.
 */
export function parseAnswer(q: Question, text: string, opts: { areaDisplay?: string; lengthDisplay?: string } = {}): ParseResult {
  const raw = String(text).split(/\s+/).filter(Boolean).join(" ").trim();
  const norm = normalize(text);
  if (!norm) return { decision: "ask_again", reason: "empty", asEntered: "" };
  switch (q.type) {
    case "choice":
      return parseChoice(q, norm, raw);
    case "multi_choice":
      return parseMultiChoice(q, norm, raw);
    case "yes_no":
      return parseYesNo(norm, raw);
    case "number":
    case "integer":
      return parseNumber(q, norm, raw, opts.areaDisplay ?? "sqm", opts.lengthDisplay ?? "m");
    case "text":
    case "file": {
      if (anyPhrase(norm, DONT_KNOW)) return { decision: "skip", reason: "dont_know", asEntered: raw };
      const limit = TEXT_LIMITS[q.mapsTo];
      if (limit !== undefined && raw.length > limit) return { decision: "ask_again", reason: "too_long", bounds: [0, limit], asEntered: raw };
      if (q.type === "file" && raw.length > 500) return { decision: "ask_again", reason: "too_long", bounds: [0, 500], asEntered: raw };
      return { decision: "accept", value: raw, asEntered: raw };
    }
    default:
      throw new ParseError(`${q.id}: unsupported question type "${q.type}"`);
  }
}

export { pointerFor };
