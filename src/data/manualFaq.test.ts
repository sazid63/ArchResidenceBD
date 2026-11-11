import { describe, expect, it } from "vitest";
import { MANUAL_FAQ, searchManual } from "./manualFaq";

describe("offline manual", () => {
  it("entries have unique ids and both languages", () => {
    const ids = MANUAL_FAQ.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of MANUAL_FAQ) {
      expect(e.answer.en.length, e.id).toBeGreaterThan(40);
      expect(e.answer.bn.length, e.id).toBeGreaterThan(40);
      expect(/[ঀ-৿]/.test(e.answer.bn), `${e.id} bn answer has Bangla`).toBe(true);
    }
  });

  it("finds the entries for the v3 features by keyword, in English and Bangla", () => {
    const top = (q: string) => searchManual(q)[0]?.entry.id;
    expect(top("backup export file")).toBe("project-files");
    expect(top("pdf")).toBe("pdf");
    expect(top("formwork pour sequence")).toBe("formwork-pour");
    expect(top("lift pit")).toBe("lift");
    expect(top("parking stall")).toBe("parking");
    expect(top("balcony torsion")).toBe("balcony");
    expect(top("লিফট")).toBe("lift");
    expect(top("পিডিএফ")).toBe("pdf");
  });
});
