import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load as yamlLoad } from "js-yaml";
import { ROOM_RULES, ROOM_RULE_SOURCES, liftRequired, roomRuleBasis, shaftMinimum } from "./rules";

/* eslint-disable @typescript-eslint/no-explicit-any */
const load = (p: string): any => yamlLoad(readFileSync(resolve(process.cwd(), p), "utf8"));
const pack = load("spec/rules/bnbc-2020.yaml");
const registry = load("spec/sources/registry.yaml");

const room = (id: string) => pack.roomRules.find((r: any) => r.id === id);

describe("BNBC 2020 rule pack", () => {
  const held = resolve(process.cwd(), "../_backup/sources/bnbc-2020-gazette-39201.pdf");
  it.skipIf(!existsSync(held))("the held gazette copy still matches the pinned sha256", () => {
    expect(createHash("sha256").update(readFileSync(held)).digest("hex")).toBe(pack.source.sha256);
  });

  it("has the required top-level sections and well-formed citations", () => {
    for (const k of ["packVersion", "id", "authority", "regime", "revision", "status", "source", "verification", "citations", "testVectors", "gaps"]) expect(pack[k], k).toBeDefined();
    expect(pack.id).toMatch(/^[a-z]+@\d{4}\.\d+$/);
    expect(pack.testVectors.length).toBeGreaterThanOrEqual(20);
    for (const [id, c] of Object.entries<any>(pack.citations)) {
      expect(c.gazettePage, id).toBeTruthy();
      expect(c.pdfPage, id).toBeTruthy();
      expect(["page-image", "text-layer"]).toContain(c.tier);
    }
    // every numeric value in the pack is finite
    JSON.stringify(pack, (_k, v) => {
      if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
      return v;
    });
    // ids are unique within each list
    for (const list of [pack.roomRules, pack.liveLoads.rows, pack.testVectors, pack.gaps]) {
      const ids = list.map((x: any) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("is pinned to an active registry source with a sha256 and page count", () => {
    const src = registry.sources.find((s: any) => s.id === pack.source.registryId);
    expect(src.status).toBe("active");
    expect(src.artifact.sha256).toBe(pack.source.sha256);
    expect(src.artifact.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(src.artifact.pages).toBe(pack.source.pdfPages);
  });

  it("every cite points at a defined citation", () => {
    const ids = new Set(Object.keys(pack.citations));
    const seen: string[] = [];
    JSON.stringify(pack, (k, v) => {
      if ((k === "cite" || k === "notesCite" || k === "supportCite") && typeof v === "string") seen.push(v);
      return v;
    });
    expect(seen.length).toBeGreaterThan(10);
    for (const c of seen) expect(ids.has(c), c).toBe(true);
  });

  it("keeps src/plans/rules.ts in step with the pack", () => {
    const habitable = room("habitable-room");
    for (const kind of habitable.kinds) {
      expect(ROOM_RULES[kind as keyof typeof ROOM_RULES]).toMatchObject({
        minAreaM2: habitable.minAreaM2,
        minWidthMm: Math.round(habitable.minWidthM * 1000),
      });
      expect(roomRuleBasis(kind)).toBe("cited");
    }
    expect(roomRuleBasis("dining")).toBe("assumption");
    const k = room("kitchen");
    expect(ROOM_RULES.kitchen).toMatchObject({ minAreaM2: k.minAreaM2, minWidthMm: k.minWidthM * 1000 });
    const wcOnly = pack.bathroomTable.rows.find((r: any) => r.facility === "Water closet only");
    expect(ROOM_RULES.toilet).toMatchObject({ minAreaM2: wcOnly.minAreaM2, minWidthMm: wcOnly.minWidthM * 1000 });
  });

  it("corridor minimum is 36 in = 915 mm and cited", () => {
    expect(ROOM_RULES.corridor?.minWidthMm).toBe(915);
    expect(roomRuleBasis("corridor")).toBe("cited");
    expect(Math.round(36 * 25.4)).toBe(914);
  });

  it("flags rules BNBC does not give as assumptions", () => {
    for (const kind of ["lobby", "lift"] as const) {
      expect(ROOM_RULES[kind]).toBeDefined();
      expect(ROOM_RULE_SOURCES[kind]).toBeUndefined();
      expect(roomRuleBasis(kind)).toBe("assumption");
    }
    expect(pack.gaps.map((g: any) => g.id)).toEqual(expect.arrayContaining(["gap-lift-car-size", "gap-dining"]));
  });

  it("every testVector evaluates to its expected value", () => {
    const evalVector = (v: any): unknown => {
      const g = v.given;
      switch (v.kind) {
        case "room-min": {
          const r = pack.roomRules.find((x: any) => x.kinds?.includes(g.roomKind));
          return { minAreaM2: r.minAreaM2, minWidthM: r.minWidthM };
        }
        case "bathroom-min": {
          const r = pack.bathroomTable.rows.find((x: any) => x.facility === g.facility);
          return { minAreaM2: r.minAreaM2, minWidthM: r.minWidthM };
        }
        case "shaft-min": {
          const r = shaftMinimum(g.storeys);
          return { minNetAreaM2: r.minNetAreaM2, minWidthM: r.minWidthMm / 1000 };
        }
        case "lift-required":
          return { required: liftRequired(g.storeys, g.heightM) };
        case "corridor-min": {
          const r = pack.egress.rows.find((x: any) => x.classes.includes(g.occupancy));
          return { minWidthMm: r.corridorMinWidthMm };
        }
        case "stair-min-width":
          return { minWidthMm: pack.stairs[0].byClass[g.occupancy] };
        case "travel-path": {
          const r = pack.egress.rows.find((x: any) => x.classes.includes(g.occupancy));
          return { maxM: g.sprinklered ? r.travelPathSprinkleredM : r.travelPathUnsprinkleredM };
        }
        case "live-load": {
          const r = pack.liveLoads.rows.find((x: any) => x.id === g.use);
          return Object.fromEntries(Object.keys(v.expect).map((key) => [key, r[key]]));
        }
        case "seismic-zone": {
          const r = pack.seismic.towns.find((x: any) => x.town === g.town);
          return { zone: r.zone, z: r.z };
        }
        case "load-combination":
          return { expr: pack.loadCombinations.strength.find((x: any) => x.n === g.n).expr };
        default:
          throw new Error(`unknown vector kind ${v.kind}`);
      }
    };
    for (const v of pack.testVectors) expect(evalVector(v), v.id).toEqual(v.expect);
  });

  it("zone coefficients match their zones and Dhaka is zone 2", () => {
    const z = Object.fromEntries(pack.seismic.zones.map((r: any) => [r.zone, r.z]));
    expect(z).toEqual({ 1: 0.12, 2: 0.2, 3: 0.28, 4: 0.36 });
    const dhaka = pack.seismic.towns.find((t: any) => t.town === "Dhaka");
    expect(z[dhaka.zone]).toBe(dhaka.z);
  });

  it("shaft and lift thresholds follow the Code", () => {
    expect(shaftMinimum(1).minWidthMm).toBe(1000);
    expect(shaftMinimum(4).minWidthMm).toBe(1200);
    expect(shaftMinimum(5).minNetAreaM2).toBe(4);
    expect(shaftMinimum(12).minWidthMm).toBe(2500);
    expect(liftRequired(6, 20)).toBe(false);
    expect(liftRequired(7, 18)).toBe(true);
    expect(liftRequired(5, 20.1)).toBe(true);
  });
});
