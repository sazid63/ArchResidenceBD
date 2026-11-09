import { describe, expect, it } from "vitest";
import { migrateV2 } from "../model/migrate";
import type { ProjectSpec } from "../model/projectSpec";
import { generatePhasesForStories } from "../engine/projectState";
import { BASICS_PHASE_ID, BASICS_QUESTIONS, chatSend, chatStart, chatView, flowForPhase, withBasicsPhase } from "./chat";

const NOW = "2026-11-09T10:00:00.000Z";

function spec(stories = 4): ProjectSpec {
  return migrateV2({ id: "p1", name: "Villa", plotSize: 5, plotUnit: "katha", plotSqm: 334.45, stories, unitsPerFloor: 2, createdAt: NOW, updatedAt: NOW, designStarted: false, phases: generatePhasesForStories(stories) } as never, NOW);
}

const say = (s: ProjectSpec, id: string, text: string, lang: "en" | "bn" = "en") => chatSend(s, id, { text }, lang, NOW);
const phase = (s: ProjectSpec, id: string) => s.phases.find((p) => p.id === id)!;

describe("which flow a phase runs", () => {
  it("maps every generated phase to a flow, floors to their storey", () => {
    const phases = generatePhasesForStories(4);
    const got = phases.map((p) => [p.id, flowForPhase(p)]);
    expect(got).toEqual([
      ["phase-basics", { flowId: "setup", only: BASICS_QUESTIONS }],
      ["phase-site", { flowId: "site-excavation" }],
      ["phase-foundation", { flowId: "foundation" }],
      ["phase-ground-floor", { flowId: "floor", storey: 0 }],
      ["phase-floor-1", { flowId: "floor", storey: 1 }],
      ["phase-floor-2", { flowId: "floor", storey: 2 }],
      ["phase-floor-3", { flowId: "floor", storey: 3 }],
      ["phase-rooftop", { flowId: "roof-boundary" }],
      ["phase-utilities", { flowId: "common-services" }],
    ]);
  });
});

describe("a phase conversation", () => {
  it("opens with the phase goal and the first question, and marks the phase in progress", () => {
    const s = chatStart(spec(), "phase-foundation", "en", NOW);
    const p = phase(s, "phase-foundation");
    expect(p.status).toBe("in_progress");
    expect(p.messages.length).toBe(2);
    expect(p.messages[0].who).toBe("ai");
    expect(p.messages[1].text).toMatch(/foundation|piles|raft/i);
    expect(s.interview?.["phase-foundation"]).toBeDefined();
    // starting again changes nothing
    expect(chatStart(s, "phase-foundation", "en", NOW)).toBe(s);
  });

  it("answers are parsed, written to the phase data with provenance, and the next question follows", () => {
    let s = chatStart(spec(), "phase-foundation", "en", NOW);
    const first = chatView(s, "phase-foundation", "en").step!;
    expect(first.key).toBe("foundation-system");
    s = say(s, "phase-foundation", "pile");
    const p = phase(s, "phase-foundation");
    expect(p.data.foundationSystem).toBe("pile");
    expect(s.provenance["/phases/foundation/data/foundationSystem"]).toMatchObject({ source: "user", at: NOW });
    expect(p.messages.map((m) => m.who)).toEqual(["ai", "ai", "user", "ai", "ai"]);
    expect(p.messages[2].text).toBe("pile");
    // the pile preference question applies now
    expect(chatView(s, "phase-foundation", "en").step?.key).toBe("pile-preference");
  });

  it("a don't-know uses the fallback and says so; a bad answer asks again without moving on", () => {
    let s = chatStart(spec(), "phase-foundation", "en", NOW);
    const bad = say(s, "phase-foundation", "purple");
    expect(chatView(bad, "phase-foundation", "en").step?.key).toBe("foundation-system");
    expect(phase(bad, "phase-foundation").messages.at(-1)?.text).toMatch(/could not read/i);
    expect(phase(bad, "phase-foundation").data.foundationSystem).toBeUndefined();
    s = chatSend(s, "phase-foundation", { skip: true }, "en", NOW);
    const row = chatView(s, "phase-foundation", "en").answers[0];
    expect(row.source).toBe("default");
    expect(phase(s, "phase-foundation").data.foundationSystem).toBeDefined();
  });

  it("running every question to the end completes the phase and saves the progress", () => {
    let s = chatStart(spec(), "phase-rooftop", "en", NOW);
    for (let i = 0; i < 20 && chatView(s, "phase-rooftop", "en").step; i++) s = chatSend(s, "phase-rooftop", { skip: true }, "en", NOW);
    const v = chatView(s, "phase-rooftop", "en");
    expect(v.done).toBe(true);
    expect(v.step).toBeNull();
    expect(phase(s, "phase-rooftop").status).toBe("completed");
    expect(phase(s, "phase-rooftop").messages.at(-1)?.text).toMatch(/everything for this phase/);
    expect(v.answers.length).toBeGreaterThanOrEqual(7);
  });

  it("it resumes from the saved state: a spec round-tripped through JSON continues at the same question", () => {
    let s = chatStart(spec(), "phase-foundation", "en", NOW);
    s = say(s, "phase-foundation", "raft");
    const again = JSON.parse(JSON.stringify(s)) as ProjectSpec;
    expect(chatView(again, "phase-foundation", "en").step?.key).toBe("rebar-grade"); // pile-preference not applicable for raft
    const s2 = say(again, "phase-foundation", "jani na");
    expect(chatView(s2, "phase-foundation", "en").answers.length).toBe(2);
  });

  it("works in Bangla: Bangla questions, Bangla chips, Bangla answers", () => {
    let s = chatStart(spec(), "phase-foundation", "bn", NOW);
    expect(phase(s, "phase-foundation").messages[1].text).toMatch(/[ঀ-৿]/);
    const v = chatView(s, "phase-foundation", "bn");
    expect(v.chips[0].label).toBe(v.step && v.step.chips.bn[0].label);
    expect(v.chips.some((c) => c.kind === "skip" && c.label === "জানি না")).toBe(true);
    s = say(s, "phase-foundation", v.chips[0].label, "bn");
    expect(phase(s, "phase-foundation").data.foundationSystem).toBeDefined();
    expect(chatView(s, "phase-foundation", "bn").answers[0].question).toMatch(/[ঀ-৿]/);
  });

  it("an empty message is ignored and changes nothing", () => {
    const s = chatStart(spec(), "phase-utilities", "en", NOW);
    expect(say(s, "phase-utilities", "   ")).toBe(s);
  });
});

describe("floor phases", () => {
  it("each floor asks its own storey's questions; a building-wide question is asked once, in the first floor it applies to", () => {
    let s = spec(4);
    const keysFor = (id: string) => {
      let st = chatStart(s, id, "en", NOW);
      const asked: string[] = [];
      for (let i = 0; i < 30; i++) {
        const v = chatView(st, id, "en");
        if (!v.step) break;
        asked.push(v.step.key);
        st = chatSend(st, id, { skip: true }, "en", NOW);
      }
      s = st;
      return asked;
    };
    const ground = keysFor("phase-ground-floor");
    const f1 = keysFor("phase-floor-1");
    const f2 = keysFor("phase-floor-2");
    expect(ground).toContain("ground-floor-height@0");
    expect(ground).not.toContain("typical-floor-height@0");
    expect(f1).toContain("typical-floor-height@1");
    expect(f2).not.toContain("typical-floor-height@2"); // already handled on floor 1
    expect(f1).toContain("floor-usage@1");
    expect(f2).toContain("floor-usage@2");
    // storey answers land in the right phase record
    expect(phase(s, "phase-floor-2").data.usage).toBeDefined();
    expect(phase(s, "phase-floor-1").data.usage).toBeDefined();
    // a floor's progress holds only its own keys
    expect(s.interview?.["phase-floor-2"].log.every((l) => l.key.endsWith("@2"))).toBe(true);
    // and its answer list does not show the other floors' answers
    expect(chatView(s, "phase-floor-2", "en").answers.every((a) => a.key.endsWith("@2"))).toBe(true);
  });
});

describe("old phases are left alone", () => {
  it("a phase that already has messages but no interview (an older project) is not restarted, and is read as not guided", () => {
    const s0 = spec();
    const old = { ...s0, phases: s0.phases.map((p) => (p.id === "phase-site" ? { ...p, status: "completed" as const, messages: [{ who: "ai" as const, text: "old canned message" }] } : p)) };
    expect(chatStart(old, "phase-site", "en", NOW)).toBe(old);
    const v = chatView(old, "phase-site", "en");
    expect(v).toMatchObject({ supported: true, guided: false, done: true });
  });

  it("an unknown phase id changes nothing", () => {
    const s = spec();
    expect(chatStart(s, "phase-nope", "en", NOW)).toBe(s);
    expect(chatSend(s, "phase-nope", { text: "x" }, "en", NOW)).toBe(s);
    expect(chatView(s, "phase-nope", "en").supported).toBe(false);
  });
});

describe("assumptions", () => {
  it("the view lists the assumptions recorded for this phase's questions, and no others", () => {
    let s = chatStart(spec(), "phase-foundation", "en", NOW);
    s = chatSend(s, "phase-foundation", { skip: true }, "en", NOW);
    s = { ...s, assumptions: [{ id: "asm-foundation-system", statement: "Raft assumed", basis: "conservative_default", verifyOnSite: true }, { id: "asm-soil-has-report", statement: "Not this phase", basis: "area_default", verifyOnSite: true }] };
    expect(chatView(s, "phase-foundation", "en").assumptions).toEqual([{ id: "asm-foundation-system", statement: "Raft assumed", verifyOnSite: true }]);
    // plain defaults record no assumption of their own
    expect(chatView(chatSend(chatStart(spec(), "phase-utilities", "en", NOW), "phase-utilities", { skip: true }, "en", NOW), "phase-utilities", "en").assumptions).toEqual([]);
  });
});

describe("the Project basics phase", () => {
  const keysOf = (s0: ProjectSpec, script: Record<string, string>) => {
    let s = chatStart(s0, BASICS_PHASE_ID, "en", NOW);
    const asked: string[] = [];
    for (let i = 0; i < 30; i++) {
      const v = chatView(s, BASICS_PHASE_ID, "en");
      if (!v.step) break;
      asked.push(v.step.key);
      s = chatSend(s, BASICS_PHASE_ID, { text: script[v.step.key] ?? "jani na" }, "en", NOW);
    }
    return { s, asked };
  };

  it("is the first phase of a new project, and is added to an older project that lacks it", () => {
    expect(generatePhasesForStories(3)[0]).toMatchObject({ id: "phase-basics", kind: "setup" });
    const older = withBasicsPhase([{ kind: "site" }, { kind: "foundation" }]);
    expect(older.map((p) => p.kind)).toEqual(["setup", "site", "foundation"]);
    expect(withBasicsPhase(older)).toBe(older);
    const s0 = spec();
    const stripped = { ...s0, phases: s0.phases.filter((p) => p.id !== BASICS_PHASE_ID) };
    const started = chatStart(stripped, BASICS_PHASE_ID, "en", NOW);
    expect(started.phases[0].id).toBe(BASICS_PHASE_ID);
    expect(started.phases[0].messages.length).toBe(2);
  });

  it("asks only the setup questions the setup form does not ask", () => {
    const { asked } = keysOf(spec(), { "soil-has-report": "no" });
    expect(asked.length).toBeGreaterThan(5);
    for (const k of asked) expect(BASICS_QUESTIONS).toContain(k);
    for (const form of ["project-name", "plot-area", "plot-frontage", "road-width", "storeys-count", "division"]) expect(asked).not.toContain(form);
  });

  it("a soil report answer reaches the project: status, bearing and provenance, and the follow-ups are asked only on yes", () => {
    const yes = keysOf(spec(), { "soil-has-report": "yes", "soil-report-file": "soil.pdf", "soil-sbc": "120 kPa", "soil-groundwater": "3 m" });
    expect(yes.asked).toEqual(expect.arrayContaining(["soil-report-file", "soil-sbc", "soil-groundwater"]));
    expect(yes.s.site.soil).toMatchObject({ status: "user_report", sbcKpa: 120, groundwaterDepthM: 3, reportRef: "soil.pdf" });
    expect(yes.s.provenance["/site/soil/sbcKpa"]).toMatchObject({ source: "user", detail: expect.stringContaining("soil-sbc") });
    const no = keysOf(spec(), { "soil-has-report": "no" });
    expect(no.asked).not.toContain("soil-sbc");
    expect(no.s.site.soil.status).toBe("area_default");
    expect(no.s.assumptions.some((a) => a.id === "asm-soil-has-report" && a.verifyOnSite)).toBe(true);
  });

  it("the phase completes, and basement and ground-floor use land in the building", () => {
    const { s } = keysOf(spec(), { "has-basement": "no", "ground-floor-usage": "parking", authority: "rajuk" });
    expect(chatView(s, BASICS_PHASE_ID, "en").done).toBe(true);
    expect(s.phases.find((p) => p.id === BASICS_PHASE_ID)?.status).toBe("completed");
    expect(s.building.storeys.hasBasement).toBe(false);
    expect(s.building.groundFloorUsage).toBe("parking");
    expect(s.site.jurisdiction.authority).toBe("rajuk");
  });
});
