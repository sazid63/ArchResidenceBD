import { describe, expect, it } from "vitest";
import { STRINGS } from "./i18n";

describe("EN and BN strings", () => {
  it("have the same keys, and no Bangla value is empty or left as the English text", () => {
    const en = STRINGS.en as Record<string, string>;
    const bn = STRINGS.bn as Record<string, string>;
    expect(Object.keys(bn).sort()).toEqual(Object.keys(en).sort());
    for (const [k, v] of Object.entries(bn)) {
      expect(v.trim().length, `bn.${k} is empty`).toBeGreaterThan(0);
      // a Bangla string holds at least one Bangla letter unless it is a brand, a unit or a symbol
      if (/[A-Za-z]{4,}/.test(v) && !/[ঀ-৿]/.test(v) && v === en[k]) {
        expect(["ArchResidenceBD", "BNBC 2020", "RAJUK 2008", "IFC", "FreeCAD", "DXF", "SVG", "CSV"].some((w) => v.includes(w)), `bn.${k} is the English text: "${v}"`).toBe(true);
      }
    }
  });
});
