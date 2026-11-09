/**
 * Material properties and every structural assumption in one place, so the Structure screen can list them.
 * BNBC 2020 Part 6 Ch 5 (reinforced concrete) and Ch 2 Tables 6.2.1-6.2.2 (unit weights) are NOT transcribed in
 * spec/rules/bnbc-2020.yaml (see its gaps); every value taken from elsewhere is flagged here as an assumption.
 */

export const MATERIALS = {
  /** Cylinder strength, MPa. Assumption: common Dhaka residential grade. */
  fcMPa: 20,
  /** Longitudinal and stirrup yield strength, MPa. Assumption: Grade 60 (420 MPa) bars. */
  fyMPa: 420,
  fytMPa: 420,
  EsMPa: 200_000,
} as const;

/** ACI 318 Ec = 4700 sqrt(fc). Assumption (BNBC Part 6 Ch 5 follows ACI 318; formula not read from the gazette). */
export const ecMPa = (fcMPa: number): number => 4700 * Math.sqrt(fcMPa);

/** ACI 318 stress-block factor beta1. */
export const beta1 = (fcMPa: number): number => (fcMPa <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fcMPa - 28)) / 7));

/** Unit weights, kN/m3 (and finishes kN/m2). Assumptions: Tables 6.2.1-6.2.2 not transcribed. */
export const UNIT_WEIGHTS = {
  reinforcedConcrete: 25,
  brickMasonry: 19,
  plaster: 20,
  /** Floor finish (screed and tiles), kN/m2. */
  floorFinishKnM2: 1.5,
  /** Roof finish (waterproofing and screed), kN/m2. */
  roofFinishKnM2: 1.5,
  /** Plaster each face, mm. */
  plasterMm: 12,
} as const;

/** Reinforcement strength-reduction and cover. Assumptions (ACI 318). */
export const DESIGN = {
  phiFlexure: 0.9,
  phiShear: 0.75,
  coverBeamMm: 40,
  coverSlabMm: 20,
  stirrupMm: 10,
  mainBarMm: 20,
  slabBarMm: 10,
  minSlabThicknessMm: 125,
  /** Support width used to take design shear at d from the face. */
  supportWidthMm: 300,
  /** Long-term deflection multiplier, no compression steel (ACI 318: xi = 2.0 at 5 years or more). */
  longTermFactor: 2,
  /** Deflection limit on the part occurring after partitions are built (ACI 318 Table 24.2.2). */
  deflectionLimitDiv: 480,
} as const;

export interface Assumption {
  id: string;
  en: string;
  bn: string;
}

export const ASSUMPTIONS: Assumption[] = [
  { id: "materials", en: "Concrete fc 20 MPa and bar fy 420 MPa (Grade 60). BNBC Part 6 Ch 5 is not transcribed.", bn: "কংক্রিট fc ২০ এমপিএ, রডের fy ৪২০ এমপিএ (গ্রেড ৬০)। বিএনবিসি পার্ট ৬ অধ্যায় ৫ লিপিবদ্ধ নয়।" },
  { id: "unit-weights", en: "Unit weights (RC 25, brick 19 kN/m3, finishes 1.5 kN/m2) are assumed: BNBC Tables 6.2.1-6.2.2 are not transcribed.", bn: "একক ওজন (আরসি ২৫, ইট ১৯ কিনি/ঘনমি, ফিনিশ ১.৫ কিনি/বর্গমি) অনুমিত: বিএনবিসি সারণি ৬.২.১-৬.২.২ লিপিবদ্ধ নয়।" },
  { id: "slab-method", en: "Slab moments: Rankine-Grashof load share between the two directions, then ACI 318 section 6.5 coefficients. The tabulated two-way coefficient table is not transcribed.", bn: "স্ল্যাবের মোমেন্ট: দুই দিকে র‍্যাঙ্কিন-গ্র্যাশফ লোড ভাগ, পরে এসিআই ৩১৮ ধারা ৬.৫ সহগ। দ্বিমুখী সহগ সারণি লিপিবদ্ধ নয়।" },
  { id: "beam-supports", en: "Beams are continuous over columns (columns as simple supports), with pattern live loading. End supports get a nominal hogging moment of wL2/24.", bn: "বিম কলামের উপর অবিচ্ছিন্ন (কলাম সরল অবলম্বন), লাইভ লোডের প্যাটার্নসহ। প্রান্তে নামমাত্র wL²/২৪ হগিং মোমেন্ট।" },
  { id: "partitions", en: "Walls on a beam line are line loads on that beam; other partitions are covered by the 1.2 kN/m2 allowance (BNBC Sec 2.3.6).", bn: "বিমের উপরের দেয়াল সেই বিমে রেখা লোড; অন্য পার্টিশন ১.২ কিনি/বর্গমি ভাতায় ধরা (বিএনবিসি ধারা ২.৩.৬)।" },
  { id: "no-reduction", en: "No live-load reduction (BNBC Sec 2.3.13 is not transcribed): conservative.", bn: "লাইভ লোড হ্রাস নেই (বিএনবিসি ধারা ২.৩.১৩ লিপিবদ্ধ নয়): নিরাপদ দিক।" },
  { id: "deflection", en: "Deflection after partitions limited to span/480 with a long-term factor of 2.0 (ACI 318 Table 24.2.2); BNBC limit not transcribed.", bn: "পার্টিশনের পরের বিচ্যুতি স্প্যান/৪৮০, দীর্ঘমেয়াদী গুণক ২.০ (এসিআই ৩১৮); বিএনবিসি সীমা লিপিবদ্ধ নয়।" },
  { id: "screening", en: "Screening, not final design: a licensed structural engineer must design and sign the structure.", bn: "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়: লাইসেন্সপ্রাপ্ত কাঠামো প্রকৌশলীকে নকশা ও স্বাক্ষর করতে হবে।" },
];
