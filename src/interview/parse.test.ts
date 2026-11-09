import { describe, expect, it } from "vitest";
import { getBook, questionOf, type Question } from "./flow";
import { normalize, parseAnswer } from "./parse";

const book = getBook();
const parse = (qid: string, text: string, area = "katha", length = "ft") =>
  parseAnswer(questionOf(book, qid), text, { areaDisplay: area, lengthDisplay: length });

describe("area answers convert to canonical m2", () => {
  const cases: Array<[string, number, string]> = [
    ["5 katha", 334.45, "katha"],
    ["৫ কাঠা", 334.45, "katha"],
    ["five katha", 334.45, "katha"],
    ["panch katha", 334.45, "katha"],
    ["পাঁচ কাঠা", 334.45, "katha"],
    ["1200 sqft", 111.48, "katha"],
    ["1200 sft", 111.48, "katha"],
    ["2 bigha", 2675.61, "katha"],
    ["10 shotok", 404.69, "katha"],
    ["40 gonda", 133.78, "katha"],
    ["500", 46.45, "sqft"],
    ["500", 500, "sqm"],
  ];
  it.each(cases)("%s -> %f m2", (text, value, display) => {
    const r = parse("plot-area", text, display);
    expect(r.decision).toBe("accept");
    expect(r.value).toBeCloseTo(value, 2);
    expect(["katha", "sqft", "bigha", "shotok", "gonda", "sqm"]).toContain(r.unit);
  });

  it("a bare number uses the project display unit; an explicit unit wins", () => {
    const katha = parse("plot-area", "5", "katha");
    const sqm = parse("plot-area", "5", "sqm");
    expect(katha.value).toBeCloseTo(334.45, 2);
    expect(katha.usedDisplayUnit).toBe(true);
    expect(sqm.value).toBeCloseTo(5, 2);
    expect(sqm.usedDisplayUnit).toBe(true);
    const explicit = parse("plot-area", "500 sqft", "katha");
    expect(explicit.value).toBeCloseTo(46.45, 2);
    expect(explicit.usedDisplayUnit).toBeFalsy();
  });
});

describe("units glued to the number, and units we do not know (audit)", () => {
  it.each([
    ["5katha", 334.45],
    ["5কাঠা", 334.45],
    ["1200sqft", 111.48],
    ["১২০০বর্গফুট", 111.48],
    ["1,200 sq. ft.", 111.48],
    ["1200 sq.ft", 111.48],
    ["5 Kathas", 334.45],
  ])("area %s -> %f m2, never read in the display unit", (text, value) => {
    const r = parse("plot-area", text, "katha");
    expect(r.decision).toBe("accept");
    expect(r.value).toBeCloseTo(value, 2);
    expect(r.usedDisplayUnit).toBeFalsy();
  });

  it.each([
    ["40ft", 12.192],
    ["40m", 40],
    ["40'", 12.192],
    ["12.5m", 12.5],
  ])("length %s -> %f m with the display unit set to feet", (text, value) => {
    const r = parse("plot-frontage", text, "katha", "ft");
    expect(r.decision).toBe("accept");
    expect(r.value).toBeCloseTo(value, 3);
    expect(r.usedDisplayUnit).toBeFalsy();
  });

  it.each(["5 acre", "5 acres", "30 yards", "2 kani", "5acre"])("an unknown unit is re-asked, never read as the display unit: %s", (text) => {
    expect(parse("plot-area", text, "katha")).toMatchObject({ decision: "ask_again", reason: "unknown_unit" });
  });

  it("fillers after a number are not units", () => {
    expect(parse("plot-area", "5 or so", "katha").decision).toBe("accept");
    expect(parse("plot-area", "about 5", "katha").usedDisplayUnit).toBe(true);
  });

  it("an unknown word after a count is a unit problem only on unit questions", () => {
    expect(parse("storeys-count", "4 storey").value).toBe(4);
    expect(parse("storeys-count", "৫ তলা").value).toBe(5);
  });

  it.each(["ji", "haan", "Jee"])("more Banglish yes: %s", (text) => {
    expect(parse("corner-plot", text).value).toBe(true);
  });
});

describe("length, pressure and money", () => {
  it.each([
    ["40 ft", 12.192],
    ["12 ft 6 in", 3.81],
    ["12'6\"", 3.81],
    ["3 m", 3],
    ["36 inch", 0.914],
  ])("%s -> %f m", (text, value) => {
    const r = parse("plot-frontage", text);
    expect(r.decision).toBe("accept");
    expect(r.value).toBeCloseTo(value as number, 3);
  });

  it("pressure is canonical kPa with or without the unit", () => {
    expect(parse("soil-sbc", "95 kPa")).toMatchObject({ decision: "accept", value: 95 });
    const bare = parse("soil-sbc", "95");
    expect(bare.value).toBe(95);
    expect(bare.usedDisplayUnit).toBe(true);
  });

  it("a unit of the wrong dimension is re-asked, never guessed", () => {
    expect(parse("plot-area", "5 ft")).toMatchObject({ decision: "ask_again", reason: "wrong_dimension", unit: "ft" });
    expect(parse("plot-frontage", "2 katha")).toMatchObject({ decision: "ask_again", reason: "wrong_dimension" });
  });
});

describe("storeys and integers", () => {
  it.each([
    ["G+2", 3, "3 floors"],
    ["৩", 3, "3"],
    ["three", 3, "3"],
    ["tin tala", 3, "3"],
  ])("%s -> %i", (text, value, asEntered) => {
    const r = parse("storeys-count", text);
    expect(r.decision).toBe("accept");
    expect(r.value).toBe(value);
    expect(r.asEntered).toBe(asEntered);
  });

  it("range, whole-number and unit checks", () => {
    expect(parse("storeys-count", "25").reason).toBe("out_of_range");
    expect(parse("storeys-count", "2.5").reason).toBe("whole_number");
    expect(parse("storeys-count", "3 ft").reason).toBe("unexpected_unit");
  });

  it("zero, negative and several numbers are refused", () => {
    expect(parse("plot-area", "0 katha")).toMatchObject({ decision: "ask_again", reason: "out_of_range" });
    expect(parse("plot-area", "-5 katha")).toMatchObject({ decision: "ask_again", reason: "out_of_range" });
    expect(parse("plot-area", "10 by 20")).toMatchObject({ decision: "ask_again", reason: "multiple_numbers" });
  });
});

describe("fractions are expanded, never truncated", () => {
  it.each([
    ["সাড়ে ৫ কাঠা", 367.9],
    ["প্রায় সাড়ে ৫ কাঠা", 367.9],
    ["sare panch katha", 367.9],
    ["দেড় কাঠা", 100.34],
    ["dedh katha", 100.34],
    ["আড়াই কাঠা", 167.23],
    ["সোয়া ৫ কাঠা", 351.17],
    ["পৌনে ৫ কাঠা", 317.73],
    ["5 and a half katha", 367.9],
    ["five and a half katha", 367.9],
    ["half katha", 33.45],
  ])("%s -> %f m2", (text, value) => {
    const r = parse("plot-area", text);
    expect(r.decision).toBe("accept");
    expect(r.value).toBeCloseTo(value as number, 2);
  });

  it.each(["সাড়ে কাঠা", "সাড়ে"])("a fraction with no base number escalates: %s", (text) => {
    expect(parse("plot-area", text)).toMatchObject({ decision: "escalate", reason: "unparseable_fraction" });
  });
});

describe("yes / no in Bangla, English and Banglish", () => {
  it.each([
    ["yes", true],
    ["Yes", true],
    ["হ্যাঁ", true],
    ["ha", true],
    ["no", false],
    ["না", false],
    ["na", false],
    ["করব না", false],
    ["nope", false],
  ])("%s -> %s", (text, value) => {
    const r = parse("corner-plot", text);
    expect(r.decision).toBe("accept");
    expect(r.value).toBe(value);
  });

  it("ambiguity, doubt, delegation and the unreadable", () => {
    expect(parse("corner-plot", "no, yes").reason).toBe("ambiguous_yesno");
    expect(parse("corner-plot", "ha na").value).toBe(false); // a trailing negation wins
    expect(parse("corner-plot", "jani na").decision).toBe("skip");
    expect(parse("corner-plot", "you decide").decision).toBe("default");
    expect(parse("corner-plot", "maybe")).toMatchObject({ decision: "escalate", reason: "unrecognised_yesno" });
  });
});

describe("choices", () => {
  it.each([
    ["division", "Dhaka", "dhaka"],
    ["division", "ঢাকা", "dhaka"],
    ["division", "sylhet division", "sylhet"],
    ["division", "Chattogram", "chattogram"],
    ["authority", "rajuk", "rajuk"],
    ["authority", "রাজউক", "rajuk"],
    ["authority", "not sure", "not-sure"],
    ["display-units", "bangla land", "bangla-land"],
    ["display-units", "feet inch", "feet-inch"],
    ["ground-floor-usage", "parking", "parking"],
  ])("%s: %s -> %s", (qid, text, value) => {
    const r = parse(qid, text);
    expect(r.decision).toBe("accept");
    expect(r.value).toBe(value);
  });

  it("an ambiguous choice returns candidate chips", () => {
    const r = parse("authority", "Chattogram");
    expect(r).toMatchObject({ decision: "ask_again", reason: "ambiguous_choice" });
    expect(new Set(r.candidates)).toEqual(new Set(["ccc", "cda"]));
  });

  it("doubt, delegation and the unreadable", () => {
    expect(parse("division", "not sure").decision).toBe("skip");
    expect(parse("division", "আপনি ঠিক করুন").decision).toBe("default");
    expect(parse("division", "কিছু একটা").decision).toBe("escalate");
  });

  it("multi-choice splits and validates", () => {
    const q: Question = {
      id: "rooms", flowId: "test", type: "multi_choice", mapsTo: "/phases/floor-0/data/rooms", ask: { en: "Rooms", bn: "রুম" }, why: {}, essential: false,
      options: [
        { value: "east", label: { en: "East", bn: "পূর্ব" } },
        { value: "west", label: { en: "West", bn: "পশ্চিম" } },
        { value: "north", label: { en: "North", bn: "উত্তর" } },
      ],
    };
    expect(parseAnswer(q, "east and west")).toMatchObject({ decision: "accept", value: ["east", "west"] });
    expect(parseAnswer(q, "east and nowhere")).toMatchObject({ decision: "escalate", reason: "unrecognised_choice" });
  });
});

describe("text, files and empties", () => {
  it("text is trimmed and bounded", () => {
    expect(parse("project-name", "  Green Villa  ").value).toBe("Green Villa");
    expect(parse("project-name", "x".repeat(121))).toMatchObject({ decision: "ask_again", reason: "too_long" });
    expect(parse("project-name", "জানি না").decision).toBe("skip");
  });

  it("file answers are references; empty input is never accepted", () => {
    expect(parse("soil-report-file", "soil-report.pdf").value).toBe("soil-report.pdf");
    expect(parse("soil-report-file", "").reason).toBe("empty");
    for (const qid of ["project-name", "plot-area", "division"]) expect(parse(qid, "   ")).toMatchObject({ decision: "ask_again", reason: "empty" });
  });

  it("normalize folds Bengali digits, case, quotes and edge punctuation", () => {
    expect(normalize("  ৫ কাঠা  ")).toBe("5 কাঠা");
    expect(normalize("Dhaka, Bangladesh.")).toBe("dhaka, bangladesh");
    expect(normalize("don’t know")).toBe("don't know");
    expect(normalize("১,২০০")).toBe("1200");
  });
});
