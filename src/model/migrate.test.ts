import { describe, expect, it } from "vitest";
import { createNewProject } from "../engine/projectState";
import type { V2Project } from "./legacyV2";
import { ProjectFormatError, migrateV2, toProjectSpec } from "./migrate";
import { isProjectSpec } from "./projectSpec";

const NOW = "2026-11-08T12:00:00.000Z";

/** A real v2 project, made by the current app's own factory (no localStorage in Node, so nothing is saved). */
function realV2(overrides: Partial<Parameters<typeof createNewProject>[0]> = {}): V2Project {
  return createNewProject({
    name: "Test house",
    stories: 6,
    plotSize: 4,
    plotUnit: "katha",
    unitsPerFloor: 2,
    address: "Road 5, Dhanmondi, Dhaka",
    ...overrides,
  }) as unknown as V2Project;
}

describe("migrateV2", () => {
  it("produces a valid v3 spec from a real v2 project", () => {
    const v2 = realV2();
    const spec = migrateV2(v2, NOW);
    expect(isProjectSpec(spec)).toBe(true);
    expect(spec.project.id).toBe(v2.id);
    expect(spec.project.name).toBe("Test house");
    expect(spec.building.storeys.count).toBe(6);
    expect(spec.building.unitsPerFloor).toBe(2);
    expect(spec.site.plot.areaSqm).toBeCloseTo(v2.plotSqm, 6);
    expect(spec.site.address.addressLine).toBe("Road 5, Dhanmondi, Dhaka");
    expect(spec.project.displayUnits.area).toBe("katha");
  });

  it("asks for the plot shape and road instead of inventing them", () => {
    const spec = migrateV2(realV2(), NOW);
    expect(spec.site.plot.frontageM).toBeUndefined();
    expect(spec.site.plot.depthM).toBeUndefined();
    expect(spec.site.plot.roadWidthM).toBeUndefined();
    expect(spec.pendingInputs).toEqual(
      expect.arrayContaining(["/site/plot/frontageM", "/site/plot/depthM", "/site/plot/roadWidthM"]),
    );
    expect(spec.assumptions.map((a) => a.id)).toContain("v2-plot-shape");
  });

  it("keeps every phase and every unmapped v2 field", () => {
    const v2 = realV2();
    v2.phases[0].messages.push({ who: "user", text: "৪ কাঠা" });
    const spec = migrateV2(v2, NOW);
    expect(spec.phases.map((p) => p.id)).toEqual(v2.phases.map((p) => p.id));
    expect(spec.phases[0].messages.at(-1)?.text).toBe("৪ কাঠা");
    expect(spec.legacy?.v2?.customization).toEqual(v2.customization);
    expect(spec.legacy?.v2?.plotSize).toBe(4);
  });

  it("does not share objects with the input", () => {
    const v2 = realV2();
    const spec = migrateV2(v2, NOW);
    spec.phases[0].status = "completed";
    expect(v2.phases[0].status).toBe("not_started");
  });

  it("is deterministic for the same input and time", () => {
    const v2 = realV2();
    expect(migrateV2(v2, NOW)).toEqual(migrateV2(v2, NOW));
  });

  it("maps the v2 'decimal' unit to shotok and recomputes a missing area", () => {
    const v2 = { ...realV2({ plotSize: 10, plotUnit: "decimal" }), plotSqm: 0 };
    const spec = migrateV2(v2, NOW);
    expect(spec.project.displayUnits.area).toBe("shotok");
    expect(spec.site.plot.areaSqm).toBeCloseTo(404.686, 2);
  });

  it("flags missing or broken numbers as pending instead of guessing", () => {
    const v2 = { ...realV2(), stories: Number.NaN, unitsPerFloor: -1, plotSqm: 0, plotSize: 0 };
    const spec = migrateV2(v2, NOW);
    expect(spec.pendingInputs).toEqual(
      expect.arrayContaining(["/site/plot/areaSqm", "/building/storeys/count", "/building/unitsPerFloor"]),
    );
  });

  it("falls back to the v2 defaults for materials and records that it did", () => {
    const v2 = { ...realV2(), customization: undefined };
    const spec = migrateV2(v2, NOW);
    expect(spec.design.concreteGradeMpa).toBe(25);
    expect(spec.design.steelGradeMpa).toBe(415);
    expect(spec.provenance["/design/concreteGradeMpa"].source).toBe("default");
  });
});

describe("toProjectSpec", () => {
  it("passes a v3 spec through unchanged", () => {
    const spec = migrateV2(realV2(), NOW);
    expect(toProjectSpec(spec)).toBe(spec);
  });

  it("refuses a project from a newer app version", () => {
    const future = { ...migrateV2(realV2(), NOW), schemaVersion: 4 };
    expect(() => toProjectSpec(future)).toThrowError(ProjectFormatError);
    try {
      toProjectSpec(future);
    } catch (e) {
      expect((e as ProjectFormatError).reason).toBe("newer_version");
    }
  });

  it("refuses data that isn't a project", () => {
    for (const junk of [null, 42, "x", {}, { id: "a" }, []]) {
      expect(() => toProjectSpec(junk)).toThrowError(ProjectFormatError);
    }
  });
});
