import { describe, expect, it } from "vitest";
import { PLAN_LIBRARY } from "../plans/library";
import { fitRange } from "../plans/fit";
import type { BuildingProject } from "../engine/projectState";
import { isRecorded, recordDeviation, removeDeviation } from "./deviations";
import { buildReport, filterItems, type Report, type ReportItem } from "./report";

function project(over: Partial<BuildingProject> = {}): BuildingProject {
  const plan = PLAN_LIBRARY[0];
  const r = fitRange(plan);
  return {
    id: "p1", name: "T", address: "", stories: 4, plotSize: 0, plotUnit: "sqm", plotSqm: 0, unitsPerFloor: plan.unitsPerFloor,
    createdAt: "", updatedAt: "", phases: [], designStarted: false,
    plot: { frontageM: (r.widthMm.pref + 3600) / 1000, depthM: (r.depthMm.pref + 5000) / 1000, roadWidthM: 9, roadSide: "south" },
    planId: plan.id,
    ...over,
  } as BuildingProject;
}

function ready(p: BuildingProject): Extract<Report, { state: "ready" }> {
  const r = buildReport(p);
  if (r.state !== "ready") throw new Error(`report is ${r.state}`);
  return r;
}

describe("buildReport", () => {
  it("asks for a plan when the project has none", () => {
    expect(buildReport(project({ planId: undefined })).state).toBe("no_plan");
    expect(buildReport(project({ plot: undefined })).state).toBe("no_plan");
  });

  it("explains a plan that no longer fits", () => {
    const r = buildReport(project({ plot: { frontageM: 4, depthM: 6, roadWidthM: 9, roadSide: "south" } }));
    expect(r.state).toBe("no_fit");
    if (r.state === "no_fit") expect(r.reasons.en.length).toBeGreaterThan(0);
  });

  it("has RAJUK, fire and accessibility sections with a summary that adds up", () => {
    const r = ready(project());
    const sections = new Set(r.items.map((i) => i.section));
    for (const s of ["rajuk", "fire", "access"]) expect(sections.has(s as ReportItem["section"])).toBe(true);
    expect(r.summary.total).toBe(r.items.length);
    const counted = r.summary.fail + r.summary.warn + r.summary.pass + r.summary.notChecked + r.items.filter((i) => i.status === "not_applicable").length;
    expect(counted).toBe(r.items.length);
  });

  it("never reports FAR as checked without a road width, and says so", () => {
    const p = project();
    const r = ready({ ...p, plot: { ...p.plot!, roadWidthM: 4 } });
    const far = r.items.find((i) => i.id === "rajuk.far")!;
    expect(far.status).toBe("not_checked");
    expect(far.note?.en).toMatch(/6 m/);
  });

  it("requires a lift above six storeys and flags a plan without one", () => {
    const low = ready(project({ stories: 4 })).items.find((i) => i.id === "access.lift")!;
    expect(low.status).toBe("not_applicable");
    const tall = buildReport(project({ stories: 8 }));
    if (tall.state === "ready") {
      const lift = tall.items.find((i) => i.id === "access.lift")!;
      expect(["pass", "fail"]).toContain(lift.status);
    }
  });

  it("gives every RAJUK item a citation", () => {
    for (const i of ready(project()).items.filter((x) => x.section === "rajuk")) expect(i.citation?.en, i.id).toMatch(/gazette p\./);
  });

  it("keeps English citations free of Bangla script", () => {
    for (const i of ready(project()).items) if (i.citation) expect(i.citation.en, i.id).not.toMatch(/[ঀ-৿]/);
  });

  it("gives every item a unique id (deviations are keyed by it)", () => {
    const ids = ready(project()).items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is bilingual: every item has English and Bangla titles", () => {
    for (const i of ready(project()).items) {
      expect(i.title.en.length, i.id).toBeGreaterThan(0);
      expect(i.title.bn.length, i.id).toBeGreaterThan(0);
    }
  });
});

describe("filterItems", () => {
  const items = ready(project()).items;
  it("tabs partition by status", () => {
    expect(filterItems(items, "all")).toHaveLength(items.length);
    expect(filterItems(items, "passes").every((i) => i.status === "pass")).toBe(true);
    expect(filterItems(items, "not_checked").every((i) => i.status === "not_checked")).toBe(true);
    expect(filterItems(items, "fails").every((i) => i.status === "fail" || i.status === "warn")).toBe(true);
  });
});

describe("deviation register", () => {
  const failing: ReportItem = {
    id: "rajuk.setback.front", section: "rajuk", status: "fail", title: { en: "Front setback", bn: "সামনের সেটব্যাক" },
    expected: { value: 1500, unit: "mm" }, actual: { value: 500, unit: "mm" }, citation: null,
  };
  const passing: ReportItem = { ...failing, id: "rajuk.far", status: "pass" };

  it("records a failing item with its values and reason", () => {
    const list = recordDeviation(undefined, failing, " plot is irregular ", new Date("2026-11-09T00:00:00Z"));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ ruleRef: "rajuk.setback.front", expected: "1500 mm", actual: "500 mm", rationale: "plot is irregular", recordedAt: "2026-11-09T00:00:00.000Z" });
    expect(isRecorded(list, failing)).toBe(true);
  });

  it("does not record a pass, and does not record twice", () => {
    expect(recordDeviation([], passing, "x")).toHaveLength(0);
    const once = recordDeviation([], failing, "x");
    expect(recordDeviation(once, failing, "y")).toHaveLength(1);
  });

  it("removes by rule", () => {
    const once = recordDeviation([], failing, "x");
    expect(removeDeviation(once, "rajuk.setback.front")).toHaveLength(0);
  });

  it("leaves the check result itself unchanged (a deviation is a note, not a pass)", () => {
    const r = ready(project());
    const before = r.items.map((i) => i.status);
    recordDeviation([], { ...failing }, "x");
    expect(r.items.map((i) => i.status)).toEqual(before);
  });

});

describe("B5 lift size row", () => {
  it("is present with the class, the shaft and the overhead, and says the sizes are assumptions", () => {
    const row = ready(project({ stories: 8 })).items.find((i) => i.id === "access.lift-size")!;
    expect(row).toBeTruthy();
    expect(["pass", "fail"]).toContain(row.status);
    expect(String((row.expected as { value: string }).value)).toMatch(/kg, shaft [0-9]+ x [0-9]+ mm, overhead 4200 mm/);
    expect(row.note!.en).toMatch(/assumptions/);
  });
});
