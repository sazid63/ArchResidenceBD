import { describe, expect, it } from "vitest";
import { migrateV2 } from "../model/migrate";
import type { ProjectSpec } from "../model/projectSpec";
import {
  allQuestions,
  chips,
  ConditionError,
  conditionHolds,
  FlowBookError,
  flowOf,
  getBook,
  parseWhen,
  pointerFor,
  questionOf,
  SKIP_CHIP_ID,
} from "./flow";
import { quantize } from "./units";
import { schemaAt, validatePointer } from "./schema";
import { answer, answerOpen, answerWrites, describeStep, phaseRecordId, readPointer, seedValues, skip, startInterview, writePointer, type InterviewState } from "./runner";

const NOW = "2026-11-09T10:00:00.000Z";
const book = getBook();

function freshSpec(over: Record<string, unknown> = {}): ProjectSpec {
  return migrateV2({ id: "p1", name: "", plotSize: 0, plotUnit: "katha", stories: 3, unitsPerFloor: 2, createdAt: NOW, updatedAt: NOW, phases: [], ...over } as never, NOW);
}

/** Drive a flow: answer each question from the script, "jani na" otherwise. Returns the final state and every turn. */
function drive(state: InterviewState, script: Record<string, string>, max = 200) {
  const turns: Array<{ key: string; kind: string }> = [];
  let s = state;
  for (let i = 0; i < max && s.current; i++) {
    const key = s.current.key;
    const text = script[key] ?? script[s.current.question.id] ?? "jani na";
    const r = answer(s, text, NOW);
    turns.push({ key, kind: r.turn.kind });
    if (r.turn.kind === "ask_again") throw new Error(`${key} <- "${text}" was not accepted: ${r.turn.reason}`);
    s = r.state;
  }
  return { state: s, turns };
}

describe("flow book integrity", () => {
  const qs = allQuestions(book);

  it("loads every flow with unique question ids and Bangla beside English", () => {
    expect(book.flows.map((f) => f.id)).toEqual(["setup", "site-excavation", "foundation", "floor", "roof-boundary", "common-services"]);
    expect(qs.length).toBe(60);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    for (const q of qs) {
      expect(q.ask.en && q.ask.bn).toBeTruthy();
      expect(q.why.en && q.why.bn).toBeTruthy();
    }
  });

  it("every type is supported, every number has a canonical unit, every choice has options", () => {
    const types = new Set(["text", "number", "integer", "yes_no", "choice", "multi_choice", "file"]);
    for (const q of qs) {
      expect(types.has(q.type)).toBe(true);
      if (q.type === "number") expect(q.unit?.canonical, q.id).toBeTruthy();
      if (q.type === "choice" || q.type === "multi_choice") expect(q.options.length, q.id).toBeGreaterThan(1);
    }
  });

  it("an essential question has no fallback, and every fallback is a known kind", () => {
    for (const q of qs) {
      if (q.essential) expect(q.fallback, q.id).toBeUndefined();
      if (q.fallback) expect(["default", "registry", "area_default", "derive", "omit"]).toContain(q.fallback.kind);
    }
  });

  it("a registry or area_default fallback carries a bilingual assumption", () => {
    for (const q of qs) {
      if (q.fallback?.kind === "registry" || q.fallback?.kind === "area_default") expect(q.fallback.assumption?.en && q.fallback.assumption?.bn, q.id).toBeTruthy();
    }
  });

  it("every when condition parses, and its operand question is asked earlier in the book", () => {
    const order = qs.map((q) => q.id);
    for (const q of qs) {
      if (!q.when) continue;
      const [name] = parseWhen(q.when);
      if (name === "storeyIndex") continue;
      expect(order.indexOf(name), `${q.id} when ${q.when}`).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(name)).toBeLessThan(order.indexOf(q.id));
    }
  });

  it("chips are the options plus one skip chip, and an essential question has none", () => {
    const authority = questionOf(book, "authority");
    const c = chips(authority, "bn");
    expect(c.length).toBe(authority.options.length + 1);
    expect(c[c.length - 1].id).toBe(SKIP_CHIP_ID);
    expect(c[0].label).toBe(authority.options[0].label.bn);
    expect(chips(questionOf(book, "plot-area")).some((x) => x.kind === "skip")).toBe(false);
    expect(chips(questionOf(book, "project-name"))).toEqual([]);
  });

  it("conditions compare answers; an unanswered operand is never guessed", () => {
    expect(conditionHolds("soil-has-report == yes", { "soil-has-report": true })).toBe(true);
    expect(conditionHolds("soil-has-report == yes", { "soil-has-report": false })).toBe(false);
    expect(conditionHolds("foundation-system == pile", { "foundation-system": "pile" })).toBe(true);
    expect(conditionHolds("storeyIndex > 0", {}, 2)).toBe(true);
    expect(conditionHolds("storeyIndex == 0", {}, 2)).toBe(false);
    expect(() => conditionHolds("soil-has-report == yes", {})).toThrow(ConditionError);
    expect(() => conditionHolds("storeyIndex == 0", {})).toThrow(ConditionError);
    expect(() => parseWhen("not a condition")).toThrow(FlowBookError);
    expect(() => flowOf(book, "nope")).toThrow(FlowBookError);
  });

  it("per-storey pointers expand with the storey index and need one", () => {
    const q = questionOf(book, "floor-usage");
    expect(pointerFor(q, 2)).toBe("/phases/floor-2/data/usage");
    expect(() => pointerFor(q)).toThrow(FlowBookError);
    expect(pointerFor(questionOf(book, "plot-area"))).toBe("/site/plot/areaSqm");
  });
});

describe("pointers", () => {
  it("writes a copy: the original spec is untouched", () => {
    const spec = freshSpec();
    const before = JSON.stringify(spec);
    const out = writePointer(spec, "/site/plot/areaSqm", 123.4);
    expect(JSON.stringify(spec)).toBe(before);
    expect(out.site.plot.areaSqm).toBe(123.4);
    expect(readPointer(out, "/site/plot/areaSqm")).toBe(123.4);
  });

  it("phase pointers find or create the phase record by the v2 id", () => {
    expect(phaseRecordId("floor-0")).toBe("phase-ground-floor");
    expect(phaseRecordId("floor-3")).toBe("phase-floor-3");
    expect(phaseRecordId("site-excavation")).toBe("phase-site");
    expect(phaseRecordId("common-services")).toBe("phase-utilities");
    const out = writePointer(freshSpec(), "/phases/floor-2/data/usage", "residential");
    const phase = out.phases.find((p) => p.id === "phase-floor-2")!;
    expect(phase).toMatchObject({ kind: "floor", storeyIndex: 2, data: { usage: "residential" } });
    expect(readPointer(out, "/phases/floor-2/data/usage")).toBe("residential");
  });

  it("the three declared mappings and the not-sure option are not written verbatim", () => {
    const q = (id: string) => questionOf(book, id);
    expect(answerWrites(q("display-units"), "/project/displayUnits/area", "bangla-land")).toEqual([["/project/displayUnits/area", "katha"], ["/project/displayUnits/length", "ft"]]);
    expect(answerWrites(q("display-units"), "/project/displayUnits/area", "metric")).toEqual([["/project/displayUnits/area", "sqm"], ["/project/displayUnits/length", "m"]]);
    expect(answerWrites(q("soil-has-report"), "/site/soil/status", true)).toEqual([["/site/soil/status", "user_report"]]);
    expect(answerWrites(q("soil-has-report"), "/site/soil/status", false)).toBeNull();
    expect(answerWrites(q("material-prices"), "/pricing/source", true)).toEqual([["/pricing/source", "user"]]);
    expect(answerWrites(q("material-prices"), "/pricing/source", false)).toBeNull();
    expect(answerWrites(q("authority"), "/site/jurisdiction/authority", "not-sure")).toBeNull();
    expect(answerWrites(q("authority"), "/site/jurisdiction/authority", "rajuk")).toEqual([["/site/jurisdiction/authority", "rajuk"]]);
  });
});

describe("the setup interview", () => {
  const script: Record<string, string> = {
    "project-name": "Green Villa",
    "display-units": "bangla land",
    division: "ঢাকা",
    district: "Dhaka",
    "plot-area": "সাড়ে ৫ কাঠা",
    "plot-frontage": "40 ft",
    "plot-depth": "60 ft",
    "road-width": "20",
    "corner-plot": "na",
    "existing-structure": "ha",
    authority: "not sure",
    "storeys-count": "G+3",
    "units-per-floor": "two",
    "ground-floor-usage": "parking",
    "soil-has-report": "no",
  };
  const run = drive(startInterview(freshSpec(), "setup"), script);
  const spec = run.state.spec;

  it("writes every answer to its pointer, in canonical units", () => {
    expect(spec.project.name).toBe("Green Villa");
    expect(spec.project.displayUnits).toMatchObject({ area: "katha", length: "ft" });
    expect(spec.site.address).toMatchObject({ division: "Dhaka", district: "Dhaka" }); // the English label, as migration writes it
    expect(spec.site.plot.areaSqm).toBeCloseTo(367.9, 2);
    expect(spec.site.plot.frontageM).toBeCloseTo(12.192, 3);
    expect(spec.site.plot.depthM).toBeCloseTo(18.288, 3);
    expect(spec.site.plot.roadWidthM).toBeCloseTo(6.096, 3); // a bare 20 means feet: the display unit
    expect(spec.site.plot.existingStructure).toBe(true);
    expect(spec.site.plot.cornerPlot).toBe(false);
    expect(spec.building.storeys.count).toBe(4);
    expect(spec.building.unitsPerFloor).toBe(2);
    expect(spec.building.groundFloorUsage).toBe("parking");
  });

  it("gives every written pointer a provenance entry with the user's words, the time and a confidence", () => {
    const area = spec.provenance["/site/plot/areaSqm"];
    expect(area).toMatchObject({ source: "user", at: NOW, confidence: "high" });
    expect(area.detail).toMatch(/interview: plot-area/);
    expect(area.detail).toMatch(/said: "সাড়ে ৫ কাঠা"; read as: 5\.5 katha/);
    // the bare "20" used the display unit: medium confidence, so a wrong unit is visible
    expect(spec.provenance["/site/plot/roadWidthM"].confidence).toBe("medium");
    expect(spec.provenance["/project/displayUnits/area"].source).toBe("user");
    expect(spec.provenance["/building/storeys/count"].detail).toMatch(/said: "G\+3"; read as: 4 floors/);
  });

  it("applies authored fallbacks with provenance source default or assumption, and records the assumptions", () => {
    // jani na on a non-essential question with a default
    expect(spec.building.storeys.hasBasement).toBe(false);
    expect(spec.provenance["/building/storeys/hasBasement"]).toMatchObject({ source: "default", confidence: "assumption" });
    // soil "no" -> area_default status, with the authored assumption
    expect(spec.site.soil.status).toBe("area_default");
    expect(spec.provenance["/site/soil/status"]).toMatchObject({ source: "assumption", confidence: "assumption" });
    const soil = spec.assumptions.find((a) => a.id === "asm-soil-has-report")!;
    expect(soil).toMatchObject({ basis: "area_default", verifyOnSite: true, relatedPath: "/site/soil/status" });
    expect(soil.statement).toMatch(/65 kPa/);
    // "not sure" authority: symbolic fallback is recorded as an assumption and left pending, not written
    expect(spec.site.jurisdiction.authority).toBe("rajuk"); // unchanged from the migrated default
    expect(spec.assumptions.some((a) => a.id === "asm-authority")).toBe(true);
    expect(run.state.pending.some((p) => p.key === "authority" && p.kind === "registry")).toBe(true);
  });

  it("skips what the soil answer rules out, and omitted questions write nothing", () => {
    const log = Object.fromEntries(run.state.log.map((l) => [l.key, l.outcome]));
    expect(log["soil-report-file"]).toBe("not_applicable");
    expect(log["soil-sbc"]).toBe("not_applicable");
    expect(log["area-name"]).toBe("omitted");
    expect(log["typical-unit-area"]).toBe("omitted");
    expect(spec.site.soil.sbcKpa).toBeUndefined();
    expect(spec.building.typicalUnitAreaSqm).toBeUndefined();
  });

  it("finishes with no current question and does not mutate the starting spec", () => {
    expect(run.state.current).toBeNull();
    expect(answer(run.state, "x", NOW).turn.kind).toBe("done");
  });

  it("answering yes to the soil report asks the three soil follow-ups", () => {
    const r = drive(startInterview(freshSpec(), "setup"), { ...script, "soil-has-report": "yes", "soil-report-file": "soil.pdf", "soil-sbc": "120 kPa", "soil-groundwater": "3 m" });
    expect(r.state.spec.site.soil).toMatchObject({ status: "user_report", reportRef: "soil.pdf", sbcKpa: 120, groundwaterDepthM: 3 });
    expect(r.state.spec.assumptions.some((a) => a.id === "asm-soil-has-report")).toBe(false);
  });
});

describe("answers that are not accepted", () => {
  it("an unreadable or ambiguous answer asks again, changes nothing and does not advance", () => {
    const s = drive(startInterview(freshSpec(), "setup"), {}, 0).state; // at project-name
    const at = drive(s, { "project-name": "X", "display-units": "metric", division: "dhaka", district: "d", "plot-area": "5 katha", "plot-frontage": "jani na", "plot-depth": "jani na", "road-width": "6 m" }, 9).state;
    expect(at.current?.key).toBe("corner-plot");
    const r = answer(at, "maybe", NOW);
    expect(r.turn).toMatchObject({ kind: "ask_again", reason: "unrecognised_yesno" });
    expect(r.state).toBe(at);
    const nonsense = answer(startInterview(freshSpec(), "setup"), "x".repeat(121), NOW);
    expect(nonsense.turn).toMatchObject({ kind: "ask_again", reason: "too_long" });
    expect(nonsense.state.current?.key).toBe("project-name");
  });

  it("an ambiguous choice offers the candidates", () => {
    const s = drive(startInterview(freshSpec(), "setup"), { "project-name": "X", "display-units": "metric", division: "dhaka", district: "d", "plot-area": "5 katha", "plot-frontage": "jani na", "plot-depth": "jani na", "road-width": "6 m", "corner-plot": "na", "existing-structure": "na" }, 11).state;
    expect(s.current?.key).toBe("authority");
    const r = answer(s, "Chattogram", NOW);
    expect(r.turn.kind).toBe("ask_again");
    expect(new Set(r.turn.candidates)).toEqual(new Set(["ccc", "cda"]));
  });
});

describe("essential questions stay open", () => {
  it("I don't know on an essential question cannot be assumed: it joins pendingInputs and the interview goes on", () => {
    let s = startInterview(freshSpec(), "setup");
    s = answer(s, "Villa", NOW).state;
    s = answer(s, "metric", NOW).state;
    s = answer(s, "dhaka", NOW).state;
    s = answer(s, "Dhaka", NOW).state;
    s = answer(s, "jani na", NOW).state; // area-name is non-essential, omitted
    expect(s.current?.key).toBe("plot-area");
    const r = skip(s, NOW);
    expect(r.turn.kind).toBe("open");
    expect(r.state.open).toEqual(["plot-area"]);
    expect(r.state.spec.pendingInputs).toContain("/site/plot/areaSqm");
    expect(r.state.current?.key).toBe("plot-frontage"); // other work is not blocked
    expect(r.state.spec.provenance["/site/plot/areaSqm"]).toBeUndefined();
    // there is no skip chip on it either
    expect(describeStep(s.current!).chips.en.some((c) => c.kind === "skip")).toBe(false);

    // answered later
    const later = answerOpen(r.state, "plot-area", "5 katha", NOW);
    expect(later.turn.kind).toBe("accept");
    expect(later.state.open).toEqual([]);
    expect(later.state.spec.pendingInputs).not.toContain("/site/plot/areaSqm");
    expect(later.state.spec.site.plot.areaSqm).toBeCloseTo(334.45, 2);
    expect(later.state.current?.key).toBe("plot-frontage"); // the cursor did not move
    // a bad later answer leaves it open
    const bad = answerOpen(r.state, "plot-area", "maybe", NOW);
    expect(bad.turn.kind).toBe("ask_again");
    expect(bad.state.open).toEqual(["plot-area"]);
    expect(() => answerOpen(later.state, "plot-area", "5 katha", NOW)).toThrow();
  });
});

describe("the floor flow runs once per storey", () => {
  const spec = freshSpec({ stories: 3 });
  const start = startInterview({ ...spec, building: { ...spec.building, unitsPerFloor: 2 } }, "floor");
  const run = drive(start, { "ground-floor-height": "10 ft", "typical-floor-height": "10 ft", "floor-usage@0": "parking", "floor-usage@1": "residential", "floor-usage@2": "residential", "bedrooms-per-unit": "three" });
  const out = run.state.spec;

  it("asks storey-specific questions at every storey and building-wide ones once", () => {
    const asked = run.turns.map((t) => t.key);
    expect(asked.filter((k) => k.startsWith("floor-usage")).length).toBe(3);
    expect(asked.filter((k) => k.startsWith("ground-floor-height"))).toEqual(["ground-floor-height@0"]);
    expect(asked.filter((k) => k.startsWith("typical-floor-height"))).toEqual(["typical-floor-height@1"]);
    expect(out.building.storeys.groundFloorHeightM).toBeCloseTo(3.048, 3);
    expect(out.building.storeys.typicalFloorHeightM).toBeCloseTo(3.048, 3);
  });

  it("writes each storey's answers into that storey's phase record with provenance", () => {
    const usage = (id: string) => out.phases.find((p) => p.id === id)?.data.usage;
    expect(usage("phase-ground-floor")).toBe("parking");
    expect(usage("phase-floor-1")).toBe("residential");
    expect(usage("phase-floor-2")).toBe("residential");
    expect(out.provenance["/phases/floor-2/data/usage"].detail).toMatch(/storey 2/);
    expect(out.phases.find((p) => p.id === "phase-floor-1")!.data.bedroomsPerUnit).toBe(3);
  });

  it("derive: a don't-know takes the building's units per floor", () => {
    expect(out.phases.find((p) => p.id === "phase-floor-1")!.data.unitsPerFloor).toBe(2);
    expect(out.provenance["/phases/floor-1/data/unitsPerFloor"]).toMatchObject({ source: "engine", confidence: "medium" });
  });
});

describe("derive with nothing to derive from, and cross-flow conditions", () => {
  it("a derive fallback with no source value is declared pending, never invented", () => {
    const r = drive(startInterview(freshSpec(), "site-excavation"), { "excavation-depth-req": "jani na" });
    expect(r.state.pending.some((p) => p.key === "excavation-depth-req" && p.kind === "derive")).toBe(true);
    expect(readPointer(r.state.spec, "/phases/site-excavation/data/excavationDepthM")).toBeUndefined();
  });

  it("the site flow asks about an old building only when the setup answered yes (read back from the spec)", () => {
    const yes = freshSpec();
    yes.site.plot.existingStructure = true;
    expect(seedValues(yes)["existing-structure"]).toBe(true);
    expect(startInterview(yes, "site-excavation").current?.key).toBe("old-building-action");
    const no = freshSpec();
    no.site.plot.existingStructure = false;
    expect(startInterview(no, "site-excavation").current?.key).toBe("keep-boundary-wall");
    // never answered: the condition is not guessed, the question is skipped and logged
    const unknown = startInterview(freshSpec(), "site-excavation");
    expect(unknown.current?.key).toBe("keep-boundary-wall");
    expect(unknown.log.find((l) => l.key === "old-building-action")?.outcome).toBe("condition_unanswered");
  });

  it("the pile preference is asked only when the foundation system is pile", () => {
    const pile = drive(startInterview(freshSpec(), "foundation"), { "foundation-system": "pile" }, 1).state;
    expect(pile.current?.key).toBe("pile-preference");
    const raft = drive(startInterview(freshSpec(), "foundation"), { "foundation-system": "raft" }, 1).state;
    expect(raft.current?.key).toBe("rebar-grade");
    expect(raft.log.find((l) => l.key === "pile-preference")?.outcome).toBe("not_applicable");
  });

  it("every flow can be run to the end with only don't-knows, writing nothing the book does not author", () => {
    for (const f of book.flows) {
      const spec = { ...freshSpec({ stories: 2 }) };
      const s = startInterview(spec, f.id);
      let cur = s;
      for (let i = 0; i < 100 && cur.current; i++) cur = skip(cur, NOW).state;
      expect(cur.current, f.id).toBeNull();
    }
  });
});

describe("agreement with the Building Spec schema (audit)", () => {
  const qs = allQuestions(book);
  const DECLARED = new Set(["/project/displayUnits/area", "/pricing/source", "/site/soil/status", "/site/jurisdiction/authority", "/site/address/division"]);

  it("every pointer outside the open phase payloads exists in the schema", () => {
    for (const q of qs) if (!q.mapsTo.startsWith("/phases/")) expect(schemaAt(q.mapsTo), q.id).not.toBeNull();
  });

  it("every choice option the runner writes verbatim is in the schema enum", () => {
    for (const q of qs) {
      if (q.type !== "choice" || q.mapsTo.startsWith("/phases/") || DECLARED.has(q.mapsTo)) continue;
      for (const o of q.options) expect(validatePointer(q.mapsTo, o.value), `${q.id}=${o.value}`).toBeNull();
    }
    // the declared ones go through answerWrites
    const authority = questionOf(book, "authority");
    for (const o of authority.options) {
      const w = answerWrites(authority, authority.mapsTo, o.value);
      if (w) expect(validatePointer(w[0][0], w[0][1]), o.value).toBeNull();
    }
    const display = questionOf(book, "display-units");
    for (const o of display.options) for (const [ptr, v] of answerWrites(display, display.mapsTo, o.value)!) expect(validatePointer(ptr, v), o.value).toBeNull();
  });

  it("every authored default fits the schema once mapped (what a don't-know would write)", () => {
    for (const q of qs) {
      const v = q.fallback?.value;
      if (!q.fallback || (q.fallback.kind !== "default" && q.fallback.kind !== "area_default" && q.fallback.kind !== "registry") || v === undefined) continue;
      if (q.type === "choice" && !q.options.some((o) => o.value === v)) continue; // symbolic: recorded as pending, not written
      const pairs = answerWrites(q, q.mapsTo, v) ?? [[q.mapsTo, v]];
      for (const [ptr, val] of pairs) expect(validatePointer(ptr, val), `${q.id} -> ${String(val)}`).toBeNull();
    }
  });

  it("the parser's own bounds agree with the schema's for storeys and floor heights", () => {
    // storeys 1..20 in the schema
    expect(validatePointer("/building/storeys/count", 20)).toBeNull();
    expect(validatePointer("/building/storeys/count", 21)).toMatch(/at most 20/);
    // floor heights must be more than 2 m: a "1 m" answer is re-asked, not written
    const s = startInterview(freshSpec(), "floor");
    expect(s.current?.key).toBe("ground-floor-height@0");
    const bad = answer(s, "1 m", NOW);
    expect(bad.turn).toMatchObject({ kind: "ask_again", reason: "schema" });
    expect(bad.turn.reply.en).toMatch(/greater than 2/);
    expect(bad.state).toBe(s);
    expect(answer(s, "2.4 m", NOW).turn.kind).toBe("accept");
  });

  it("the schema accepts what the setup interview writes", () => {
    for (const [ptr, v] of [["/site/plot/areaSqm", 334.45], ["/site/plot/roadWidthM", 6.096], ["/site/soil/status", "area_default"], ["/pricing/source", "fetched"], ["/building/groundFloorUsage", "parking"]] as const) {
      expect(validatePointer(ptr, v), ptr).toBeNull();
    }
    expect(validatePointer("/site/plot/areaSqm", 0)).toMatch(/greater than 0/);
    expect(validatePointer("/site/plot/areaSqm", "5")).toMatch(/must be number/);
    expect(validatePointer("/phases/floor-1/data/anything", 5)).toBeNull(); // open payload
  });
});

describe("rounding (audit): half up in decimal, not binary", () => {
  it("rounds the cases that binary multiplication gets wrong", () => {
    expect(quantize(1.005, 2)).toBe(1.01);
    expect(quantize(2.675, 2)).toBe(2.68);
    expect(quantize(334.4509, 2)).toBe(334.45);
    expect(quantize(0.9144, 3)).toBe(0.914);
    expect(quantize(-1.005, 2)).toBe(-1.01);
    expect(quantize(12, 2)).toBe(12);
    expect(quantize(1e-7, 2)).toBe(0);
  });
});
