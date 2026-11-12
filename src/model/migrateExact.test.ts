import { describe, expect, it } from "vitest";
import { ProjectFormatError, migrateV2 as migrate, toProjectSpec } from "./migrate";
import type { ProjectSpec } from "./projectSpec";

/** The tests feed hand-written and deliberately damaged saves, so the migration is called with loosely typed input. */
const migrateV2 = (p: unknown, now?: string): ProjectSpec => migrate(p as never, now);

const NOW = "2026-11-08T12:00:00.000Z";
const THEN = "2026-01-02T03:04:05.000Z";

/** A complete 2.6 save, written out by hand so every output field can be checked against it. */
const full = () => ({
  id: "proj-1",
  name: "Hossain residence",
  address: "Road 5, Dhanmondi",
  stories: 4,
  plotSize: 3,
  plotUnit: "decimal",
  plotSqm: 121.4,
  unitsPerFloor: 2,
  createdAt: THEN,
  updatedAt: THEN,
  phases: [{ id: "phase-site", name: "Site" }],
  designStarted: true,
  activePhaseId: "phase-site",
  mirror: true,
  planId: "p1-4b",
  floorplanId: "legacy-template",
  floorplanAssignments: { "1": "legacy-one", "2": "legacy-two" },
  customization: { concreteGrade: 30, steelGrade: 500 },
  plot: { frontageM: 12, depthM: 22, roadWidthM: 7.3, roadSide: "south", cornerPlot: true },
});

/** The bare minimum that still counts as a v2 project. */
const bare = () => ({ id: "old", name: "", stories: 0, plotSize: 0, plotUnit: "sqft", unitsPerFloor: 0, createdAt: "", updatedAt: "", phases: [], designStarted: false });

describe("migrateV2: a complete save maps field by field", () => {
  const s = migrateV2(full(), NOW);

  it("identity, language, units and times", () => {
    expect(s.schemaVersion).toBe(3);
    expect(s.revision).toBe(1);
    expect(s.createdAt).toBe(THEN);
    expect(s.updatedAt).toBe(NOW);
    expect(s.project).toEqual({ id: "proj-1", name: "Hossain residence", language: "en", displayUnits: { length: "m", area: "shotok", currency: "BDT" } });
  });

  it("site: address, plot area and shape, soil and jurisdiction", () => {
    expect(s.site.address).toEqual({ division: "Dhaka", district: "Dhaka", addressLine: "Road 5, Dhanmondi" });
    expect(s.site.plot).toEqual({ areaSqm: 121.4, frontageM: 12, depthM: 22, roadWidthM: 7.3, roadSide: "south", cornerPlot: true });
    expect(s.site.soil).toEqual({ status: "not_provided" });
    expect(s.site.jurisdiction).toEqual({ authority: "rajuk", rulePack: "rajuk-2008" });
  });

  it("building and design", () => {
    expect(s.building).toEqual({ occupancy: "residential", structureType: "rcc_frame", storeys: { count: 4 }, unitsPerFloor: 2, groundFloorUsage: "parking" });
    expect(s.design.concreteGradeMpa).toBe(30);
    expect(s.design.steelGradeMpa).toBe(500);
    expect(s.design.mirror).toBe(true);
    // the real library plan wins for 2 units per floor; the legacy template fills nothing else because "2" was already assigned
    expect(s.design.planByUnits).toEqual({ "1": "legacy-one", "2": "p1-4b" });
  });

  it("phases, active phase, legacy copy and nothing pending", () => {
    expect(s.phases).toEqual([{ id: "phase-site", name: "Site" }]);
    expect(s.activePhaseId).toBe("phase-site");
    expect(s.pendingInputs).toEqual([]);
    expect(s.deviations).toEqual([]);
    expect(s.legacy!.v2!.floorplanId).toBe("legacy-template");
    expect(s.legacy!.v2!.phases).toBeUndefined();
  });

  it("provenance says where each value came from", () => {
    const imported = { source: "imported", detail: "migrated from a v2 save", at: NOW };
    const entered = { source: "user", detail: "entered in project setup", at: NOW };
    expect(s.provenance).toEqual({
      "/site/plot/areaSqm": imported,
      "/site/plot/frontageM": entered,
      "/site/plot/depthM": entered,
      "/site/plot/roadWidthM": entered,
      "/site/plot/roadSide": entered,
      "/building/storeys/count": imported,
      "/building/unitsPerFloor": imported,
      "/design/concreteGradeMpa": imported,
      "/design/steelGradeMpa": imported,
      "/design/planByUnits/2": { source: "user", detail: "chosen in project setup", at: NOW },
    });
  });

  it("only the region assumption is recorded when the plot shape is known", () => {
    expect(s.assumptions).toEqual([
      {
        id: "v2-region",
        subject: "Location",
        statement: "Division and district were set to Dhaka because v3 covers the RAJUK area only.",
        basis: "conservative_default",
        verifyOnSite: false,
        relatedPath: "/site/address",
      },
    ]);
  });
});

describe("migrateV2: a bare save gets safe defaults and says so", () => {
  const s = migrateV2(bare(), NOW);

  it("defaults", () => {
    expect(s.project).toEqual({ id: "old", name: "Untitled project", language: "en", displayUnits: { length: "m", area: "sqft", currency: "BDT" } });
    expect(s.createdAt).toBe(NOW);
    expect(s.site.address).toEqual({ division: "Dhaka", district: "Dhaka" });
    expect(s.site.plot).toEqual({ areaSqm: 0 });
    expect(s.building.storeys.count).toBe(1);
    expect(s.building.unitsPerFloor).toBe(1);
    expect(s.design).toEqual({ planByUnits: {}, concreteGradeMpa: 25, steelGradeMpa: 415 });
    expect(s.activePhaseId).toBeUndefined();
  });

  it("pending inputs, in order", () => {
    expect(s.pendingInputs).toEqual(["/site/plot/areaSqm", "/site/plot/frontageM", "/site/plot/depthM", "/site/plot/roadWidthM", "/building/storeys/count", "/building/unitsPerFloor"]);
  });

  it("provenance records the defaults, and the plot-shape assumption comes first", () => {
    const defaulted = { source: "default", detail: "v2 default applied during migration", at: NOW };
    expect(s.provenance).toEqual({ "/design/concreteGradeMpa": defaulted, "/design/steelGradeMpa": defaulted });
    expect(s.assumptions.map((a: { id: string }) => a.id)).toEqual(["v2-plot-shape", "v2-region"]);
    expect(s.assumptions[0]).toEqual({
      id: "v2-plot-shape",
      subject: "Plot shape",
      statement: "Plot frontage, depth and road width were not recorded before v3. They must be entered before the building can be fitted to the plot.",
      basis: "conservative_default",
      verifyOnSite: true,
      relatedPath: "/site/plot/frontageM",
    });
  });
});

describe("migrateV2: single rules", () => {
  it("whole numbers: storeys and units round, never below 1, junk is pending", () => {
    const s = migrateV2({ ...full(), stories: 3.6, unitsPerFloor: 0.2 }, NOW);
    expect(s.building.storeys.count).toBe(4);
    expect(s.building.unitsPerFloor).toBe(1);
    for (const bad of [0, -3, NaN, Infinity, "4", null, undefined]) {
      const t = migrateV2({ ...full(), stories: bad }, NOW);
      expect(t.building.storeys.count).toBe(1);
      expect(t.pendingInputs).toContain("/building/storeys/count");
      expect(t.provenance["/building/storeys/count"]).toBeUndefined();
    }
  });

  it("a grade that is not in the list is a default, one that is stays", () => {
    for (const g of [20, 25, 30, 35, 40]) expect(migrateV2({ ...full(), customization: { concreteGrade: g } }, NOW).design.concreteGradeMpa).toBe(g);
    for (const g of [250, 415, 500]) expect(migrateV2({ ...full(), customization: { steelGrade: g } }, NOW).design.steelGradeMpa).toBe(g);
    const odd = migrateV2({ ...full(), customization: { concreteGrade: 27, steelGrade: 420 } }, NOW);
    expect(odd.design.concreteGradeMpa).toBe(25);
    expect(odd.design.steelGradeMpa).toBe(415);
    expect(odd.provenance["/design/concreteGradeMpa"].source).toBe("default");
    expect(odd.provenance["/design/steelGradeMpa"].source).toBe("default");
  });

  it("the legacy template fills the unit count only when nothing is assigned; a library plan overrides", () => {
    const none = { ...full(), planId: undefined, floorplanAssignments: undefined };
    expect(migrateV2(none, NOW).design.planByUnits).toEqual({ "2": "legacy-template" });
    expect(migrateV2({ ...none, floorplanAssignments: { "2": "kept" } }, NOW).design.planByUnits).toEqual({ "2": "kept" });
    expect(migrateV2({ ...none, floorplanId: undefined }, NOW).design.planByUnits).toEqual({});
    expect(migrateV2({ ...none, unitsPerFloor: 0 }, NOW).design.planByUnits).toEqual({});
    // a plan id that is not in the library is ignored, and so is a plan with no unit count
    expect(migrateV2({ ...none, planId: "no-such-plan" }, NOW).design.planByUnits).toEqual({ "2": "legacy-template" });
    const noUnits = migrateV2({ ...full(), unitsPerFloor: 0 }, NOW);
    expect(Object.keys(noUnits.provenance).some((k) => k.startsWith("/design/planByUnits"))).toBe(false);
  });

  it("the area units show in the unit the user chose, and an unknown one falls back to katha", () => {
    for (const [u, shown] of [["katha", "katha"], ["decimal", "shotok"], ["sqft", "sqft"], ["sqm", "sqm"]]) expect(migrateV2({ ...full(), plotUnit: u }, NOW).project.displayUnits.area).toBe(shown);
    expect(migrateV2({ ...full(), plotUnit: "acre" }, NOW).project.displayUnits.area).toBe("katha");
  });

  it("a plot shape needs all three numbers; a bad road side or corner flag is left out", () => {
    const base = full();
    const noRoad = migrateV2({ ...base, plot: { frontageM: 12, depthM: 22, roadWidthM: 7, roadSide: "up", cornerPlot: "yes" } }, NOW);
    expect(noRoad.site.plot).toEqual({ areaSqm: 121.4, frontageM: 12, depthM: 22, roadWidthM: 7 });
    expect(noRoad.provenance["/site/plot/roadSide"]).toBeUndefined();
    for (const k of ["frontageM", "depthM", "roadWidthM"]) {
      const p = { frontageM: 12, depthM: 22, roadWidthM: 7, [k]: 0 };
      expect(migrateV2({ ...base, plot: p }, NOW).pendingInputs).toContain(`/site/plot/${k === "frontageM" ? "frontageM" : k}`);
    }
    expect(migrateV2({ ...base, plot: "x" }, NOW).site.plot).toEqual({ areaSqm: 121.4 });
    expect(migrateV2({ ...base, plot: null }, NOW).site.plot).toEqual({ areaSqm: 121.4 });
    for (const side of ["north", "south", "east", "west"]) expect(migrateV2({ ...base, plot: { ...base.plot, roadSide: side } }, NOW).site.plot.roadSide).toBe(side);
  });

  it("the plot area comes from the stored square metres, else from size and unit", () => {
    expect(migrateV2({ ...full(), plotSqm: 150 }, NOW).site.plot.areaSqm).toBe(150);
    const fromSize = migrateV2({ ...full(), plotSqm: undefined, plotSize: 2, plotUnit: "katha" }, NOW);
    expect(fromSize.site.plot.areaSqm).toBeCloseTo(2 * 66.89, 1);
    expect(fromSize.provenance["/site/plot/areaSqm"].source).toBe("imported");
    const none = migrateV2({ ...full(), plotSqm: undefined, plotSize: 0 }, NOW);
    expect(none.site.plot.areaSqm).toBe(0);
    expect(none.pendingInputs).toContain("/site/plot/areaSqm");
    expect(none.provenance["/site/plot/areaSqm"]).toBeUndefined();
  });

  it("an empty address leaves no address line, an unmirrored plan leaves no mirror flag", () => {
    const s = migrateV2({ ...full(), address: "", mirror: false }, NOW);
    expect("addressLine" in s.site.address).toBe(false);
    expect("mirror" in s.design).toBe(false);
    expect("activePhaseId" in migrateV2({ ...full(), activePhaseId: "" }, NOW)).toBe(false);
  });

  it("phases that are not a list become an empty list", () => {
    expect(migrateV2({ ...full(), phases: "none" }, NOW).phases).toEqual([]);
  });
});

describe("toProjectSpec messages", () => {
  const messageOf = (fn: () => unknown): ProjectFormatError => {
    try {
      fn();
    } catch (e) {
      return e as ProjectFormatError;
    }
    throw new Error("expected the call to throw");
  };

  it("names the format of a newer save", () => {
    const e = messageOf(() => toProjectSpec({ schemaVersion: 9 }));
    expect(e).toBeInstanceOf(ProjectFormatError);
    expect(e.name).toBe("ProjectFormatError");
    expect(e.reason).toBe("newer_version");
    expect(e.message).toBe("This project was saved by a newer version of ArchResidenceBD (format 9). Update the app to open it.");
  });

  it("a schema version equal to or older than the current one without a valid body is just unrecognised", () => {
    for (const v of [3, 2, 0, "9", null]) {
      const e = messageOf(() => toProjectSpec({ schemaVersion: v }));
      expect(e.reason).toBe("unrecognised");
      expect(e.message).toBe("This isn't an ArchResidenceBD project, or the file is damaged.");
    }
    expect(messageOf(() => toProjectSpec(null)).reason).toBe("unrecognised");
    expect(messageOf(() => toProjectSpec("text")).reason).toBe("unrecognised");
  });

  it("values out of range are refused with the list of what is wrong", () => {
    const spec = migrateV2(full(), NOW);
    spec.building.storeys.count = -2;
    const e = messageOf(() => toProjectSpec(spec));
    expect(e.reason).toBe("invalid_values");
    expect(e.message).toMatch(/^The project has values that are not valid \(.+\)\.$/);
    // a v2 project with such values is migrated first, then checked the same way
    expect(toProjectSpec(full(), NOW).project.id).toBe("proj-1");
  });
});

describe("migrateV2: the whole output, written out from the v2 input", () => {
  const imported = { source: "imported", detail: "migrated from a v2 save", at: NOW };
  const user = (detail: string) => ({ source: "user", detail, at: NOW });
  const entered = user("entered in project setup");

  it("a complete save", () => {
    const { legacy: _legacy, ...out } = migrateV2(full(), NOW);
    expect(out).toEqual({
      schemaVersion: 3,
      revision: 1,
      createdAt: THEN,
      updatedAt: NOW,
      project: { id: "proj-1", name: "Hossain residence", language: "en", displayUnits: { length: "m", area: "shotok", currency: "BDT" } },
      site: {
        address: { division: "Dhaka", district: "Dhaka", addressLine: "Road 5, Dhanmondi" },
        plot: { areaSqm: 121.4, frontageM: 12, depthM: 22, roadWidthM: 7.3, roadSide: "south", cornerPlot: true },
        soil: { status: "not_provided" },
        jurisdiction: { authority: "rajuk", rulePack: "rajuk-2008" },
      },
      building: { occupancy: "residential", structureType: "rcc_frame", storeys: { count: 4 }, unitsPerFloor: 2, groundFloorUsage: "parking" },
      // unit 1 keeps its legacy template; for 2 units a real library plan id (p1-4b) wins over the legacy template
      design: { planByUnits: { "1": "legacy-one", "2": "p1-4b" }, mirror: true, concreteGradeMpa: 30, steelGradeMpa: 500 },
      phases: [{ id: "phase-site", name: "Site" }],
      activePhaseId: "phase-site",
      assumptions: [
        { id: "v2-region", subject: "Location", statement: "Division and district were set to Dhaka because v3 covers the RAJUK area only.", basis: "conservative_default", verifyOnSite: false, relatedPath: "/site/address" },
      ],
      deviations: [],
      provenance: {
        "/site/plot/areaSqm": imported,
        "/site/plot/frontageM": entered,
        "/site/plot/depthM": entered,
        "/site/plot/roadWidthM": entered,
        "/site/plot/roadSide": entered,
        "/building/storeys/count": imported,
        "/building/unitsPerFloor": imported,
        "/design/concreteGradeMpa": imported,
        "/design/steelGradeMpa": imported,
        "/design/planByUnits/2": user("chosen in project setup"),
      },
      pendingInputs: [],
    });
  });

  it("a bare save gets the defaults, the plot-shape assumption and the pending inputs", () => {
    const { legacy: _legacy, ...out } = migrateV2(bare(), NOW);
    const defaulted = { source: "default", detail: "v2 default applied during migration", at: NOW };
    expect(out).toEqual({
      schemaVersion: 3,
      revision: 1,
      createdAt: NOW,
      updatedAt: NOW,
      project: { id: "old", name: "Untitled project", language: "en", displayUnits: { length: "m", area: "sqft", currency: "BDT" } },
      site: {
        address: { division: "Dhaka", district: "Dhaka" },
        plot: { areaSqm: 0 },
        soil: { status: "not_provided" },
        jurisdiction: { authority: "rajuk", rulePack: "rajuk-2008" },
      },
      building: { occupancy: "residential", structureType: "rcc_frame", storeys: { count: 1 }, unitsPerFloor: 1, groundFloorUsage: "parking" },
      design: { planByUnits: {}, concreteGradeMpa: 25, steelGradeMpa: 415 },
      phases: [],
      assumptions: [
        {
          id: "v2-plot-shape",
          subject: "Plot shape",
          statement: "Plot frontage, depth and road width were not recorded before v3. They must be entered before the building can be fitted to the plot.",
          basis: "conservative_default",
          verifyOnSite: true,
          relatedPath: "/site/plot/frontageM",
        },
        { id: "v2-region", subject: "Location", statement: "Division and district were set to Dhaka because v3 covers the RAJUK area only.", basis: "conservative_default", verifyOnSite: false, relatedPath: "/site/address" },
      ],
      deviations: [],
      provenance: { "/design/concreteGradeMpa": defaulted, "/design/steelGradeMpa": defaulted },
      pendingInputs: ["/site/plot/areaSqm", "/site/plot/frontageM", "/site/plot/depthM", "/site/plot/roadWidthM", "/building/storeys/count", "/building/unitsPerFloor"],
    });
  });
});
