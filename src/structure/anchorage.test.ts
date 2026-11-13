import { MATERIALS } from "./materials";
import { describe, expect, it } from "vitest";
import { bendDiameter, hookFactor, hookTail, ldCompression, ldHook, ldTension, ldTensionBasic, lapCompression, lapTension, tieHookTail } from "./anchorage";

// Every expected value is worked by hand from BNBC 2020 Part 6 Sec 8.1.2 and 8.2 with fc 20 MPa, fy 420 MPa unless stated.
const SQFC = Math.sqrt(20);

describe("development length in tension (Sec 8.2.3.2, first row of the table)", () => {
  it("bars of 19 mm and under use the divisor 2.1, 20 mm and over use 1.7", () => {
    expect(ldTension(16, { fc: 20 })).toBeCloseTo((420 / (2.1 * SQFC)) * 16, 9); // 715.5
    expect(ldTension(19, { fc: 20 })).toBeCloseTo((420 / (2.1 * SQFC)) * 19, 9);
    expect(ldTension(20, { fc: 20 })).toBeCloseTo((420 / (1.7 * SQFC)) * 20, 9); // 1104.8
    expect(ldTension(25, { fc: 20 })).toBeCloseTo((420 / (1.7 * SQFC)) * 25, 9);
  });

  it("top bars take 1.3, bottom bars 1.0, and strength enters through sqrt(fc)", () => {
    expect(ldTension(16, { topBar: true, fc: 20 })).toBeCloseTo(1.3 * ldTension(16, { fc: 20 }), 9);
    expect(ldTension(16, { fc: 30 })).toBeCloseTo((420 / (2.1 * Math.sqrt(30))) * 16, 9);
    expect(ldTension(16, { fy: 500, fc: 20 })).toBeCloseTo((500 / (2.1 * SQFC)) * 16, 9);
  });

  it("the 300 mm minimum applies to ld but not to the basic length used for splices", () => {
    expect(ldTensionBasic(6, { fc: 20 })).toBeCloseTo((420 / (2.1 * SQFC)) * 6, 9); // 268.3
    expect(ldTension(6, { fc: 20 })).toBe(300);
    expect(ldTensionBasic(19, { fc: 20 })).toBeCloseTo((420 / (2.1 * SQFC)) * 19, 9);
    expect(ldTensionBasic(20, { fc: 20 })).toBeCloseTo((420 / (1.7 * SQFC)) * 20, 9);
    expect(ldTensionBasic(16, { topBar: true, fc: 20 })).toBeCloseTo(1.3 * ldTensionBasic(16, { fc: 20 }), 9);
  });
});

describe("development length in compression (Sec 8.2.4.2)", () => {
  it("the larger of 0.24 fy db / sqrt(fc) and 0.043 fy db, never under 200 mm", () => {
    expect(ldCompression(20, 20)).toBeCloseTo((0.24 * 420 * 20) / SQFC, 9); // 450.8 governs at fc 20
    expect(ldCompression(20, 100, 420)).toBeCloseTo(0.043 * 420 * 20, 9); // 361.2 governs at fc 100
    expect(ldCompression(6, 20)).toBe(200);
    expect(ldCompression(16, 25, 500)).toBeCloseTo((0.24 * 500 * 16) / 5, 9);
  });
});

describe("hooks (Sec 8.2.6)", () => {
  it("no factor without conditions; 0.7 needs both covers; 0.8 needs ties within 3 db", () => {
    expect(hookFactor(16)).toBe(1);
    expect(hookFactor(16, { sideCoverMm: 65, extensionCoverMm: 50 })).toBe(0.7);
    expect(hookFactor(16, { sideCoverMm: 64, extensionCoverMm: 50 })).toBe(1);
    expect(hookFactor(16, { sideCoverMm: 65, extensionCoverMm: 49 })).toBe(1);
    expect(hookFactor(16, { sideCoverMm: 0, extensionCoverMm: 50 })).toBe(1);
    expect(hookFactor(16, { sideCoverMm: 65 })).toBe(1);
    expect(hookFactor(16, { tieSpacingMm: 48 })).toBe(0.8); // 3 db = 48
    expect(hookFactor(16, { tieSpacingMm: 49 })).toBe(1);
    expect(hookFactor(16, { sideCoverMm: 100, extensionCoverMm: 100, tieSpacingMm: 40 })).toBeCloseTo(0.56, 12);
  });

  it("hook development length: 0.24 fy db / sqrt(fc), not under 8 db or 150 mm", () => {
    expect(ldHook(16, 20)).toBeCloseTo((0.24 * 420 * 16) / SQFC, 9); // 360.6
    expect(ldHook(16, 20, 420, { sideCoverMm: 70, extensionCoverMm: 60 })).toBeCloseTo(0.7 * ldHook(16, 20), 9);
    expect(ldHook(6, 20)).toBe(150); // 135 mm and 8 db = 48 mm are both below 150
    expect(ldHook(25, 200, 420)).toBe(200); // 0.24 * 420 * 25 / 14.14 = 178 mm, so 8 db = 200 mm governs
  });

  it("tails: 90 degrees 12 db, 180 degrees 4 db with a 65 mm floor, closed tie 6 db with a 75 mm floor", () => {
    expect(hookTail(16, "90")).toBe(192);
    expect(hookTail(20, "180")).toBe(80);
    expect(hookTail(10, "180")).toBe(65);
    expect(tieHookTail(10)).toBe(75);
    expect(tieHookTail(16)).toBe(96);
  });
});

describe("splices and bends", () => {
  it("tension laps: class A 1.0 ld and class B 1.3 ld on the basic length, not under 300 mm; class B by default", () => {
    expect(lapTension(16, "A", { fc: 20 })).toBeCloseTo(ldTensionBasic(16, { fc: 20 }), 9);
    expect(lapTension(16, "B", { fc: 20 })).toBeCloseTo(1.3 * ldTensionBasic(16, { fc: 20 }), 9);
    expect(lapTension(16, "B", { fc: 20 })).toBeCloseTo(1.3 * ldTensionBasic(16, { fc: 20 }), 9);
    expect(lapTension(6, "A", { fc: 20 })).toBe(300); // basic 268 mm
    expect(lapTension(6, "B", { fc: 20 })).toBeCloseTo(1.3 * ldTensionBasic(6, { fc: 20 }), 9); // 348.8 mm
    expect(lapTension(16, "A", { topBar: true, fc: 20 })).toBeCloseTo(1.3 * ldTensionBasic(16, { fc: 20 }), 9);
  });

  it("compression laps: 0.071 fy db up to fy 420, (0.13 fy - 24) db above, a third longer below 21 MPa, 300 mm minimum", () => {
    expect(lapCompression(16, 25, 420)).toBeCloseTo(0.071 * 420 * 16, 9); // 477.1
    expect(lapCompression(16, 25, 500)).toBeCloseTo((0.13 * 500 - 24) * 16, 9); // 656
    expect(lapCompression(16, 20, 420)).toBeCloseTo(0.071 * 420 * 16 * (4 / 3), 6); // fc below 21
    expect(lapCompression(16, 21, 420)).toBeCloseTo(0.071 * 420 * 16, 9); // 21 is not below 21
    expect(lapCompression(8, 25, 420)).toBe(300); // 238 mm
  });

  it("bend diameters: 6 db up to 25 mm, 8 db above, 4 db for stirrups of 16 mm and under", () => {
    expect(bendDiameter(10)).toBe(60);
    expect(bendDiameter(25)).toBe(150);
    expect(bendDiameter(28)).toBe(224);
    expect(bendDiameter(16, true)).toBe(64);
    expect(bendDiameter(10, true)).toBe(40);
    expect(bendDiameter(20, true)).toBe(120); // stirrups over 16 mm follow the general rule
  });
});
