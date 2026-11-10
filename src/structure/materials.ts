import { structurePack } from "../rules/bnbcStructure";

/**
 * Material properties, design constants and every remaining structural assumption in one place, so the Structure
 * screen can list them. Values come from BNBC 2020 Part 6 via spec/rules/bnbc-2020-structure.yaml wherever the
 * gazette gives one; what the gazette does not give is flagged in ASSUMPTIONS below.
 */

export const MATERIALS = {
  /** Cylinder strength, MPa. Assumption (the gazette sets minima by exposure, not a grade): common Dhaka residential grade. */
  fcMPa: 20,
  /** Longitudinal and stirrup yield strength, MPa: Grade 420, the grade the gazette equations are written for. */
  fyMPa: 420,
  fytMPa: 420,
  EsMPa: 200_000,
} as const;

/** BNBC Sec 5.13.2.1: Ec = 4700 sqrt(fc) for normal-density concrete (gazette page 3437). */
export const ecMPa = (fcMPa: number): number => 4700 * Math.sqrt(fcMPa);

/** Stress-block factor beta1 (ACI 318 form; the gazette equations use the same factor, value not separately transcribed). */
export const beta1 = (fcMPa: number): number => (fcMPa <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fcMPa - 28)) / 7));

/**
 * Dead-load values from BNBC 2020 Tables 6.2.1-6.2.2 (spec/rules/bnbc-2020-structure.yaml), kN/m3 unless named.
 * Reinforced concrete follows the Table 6.2.1 footnote: 22.8 kN/m3 plus 0.63 per 1 % of main steel by volume.
 */
const PACK = structurePack();
/** Assumed main-steel volume in beams and columns, percent (assumption; slabs use the Table 6.2.2 slab value). */
export const FRAME_STEEL_PERCENT = 2;
export const UNIT_WEIGHTS = {
  /** Solid slab, stone aggregate: Table 6.2.2 gives 2.360 kN/m2 per 100 mm = 23.6 kN/m3. */
  slabConcrete: PACK.constructionWeights.concreteSlabStone.per100mmKnM2 * 10,
  /** Beams and columns: 22.8 + 0.63 x 2 % = 24.06 kN/m3. */
  frameConcrete: PACK.unitWeights.concreteStoneUnreinforced + PACK.unitWeights.reinforcementAddKnM3PerPercent * FRAME_STEEL_PERCENT,
  /** Burnt-clay brick masonry excluding plaster, kN/m2 per mm of wall thickness (1.910 per 100 mm). */
  masonryKnM2PerMm: PACK.constructionWeights.brickMasonryBurntClayPer100mm / 100,
  /** Cement plaster, kN/m2 per mm (0.230 per 10 mm). */
  plasterKnM2PerMm: PACK.constructionWeights.cementPlasterPer10mm / 10,
  /** Plaster each face of a wall, mm (assumption). */
  plasterMm: 12,
  /** Cement-sand screed thickness under tiles and on roofs, mm (assumption); weighed at the cement-plaster rate. */
  screedMm: 50,
  /** Floor finish: screed + 13 mm clay tiling + 13 mm ceiling plaster, kN/m2. */
  floorFinishKnM2: PACK.constructionWeights.cementPlasterPer10mm * 5 + PACK.constructionWeights.claytiling13mm + PACK.constructionWeights.ceilingCementPlaster13mm,
  /** Roof finish: screed to falls + 5-ply felt and gravel + ceiling plaster, kN/m2. */
  roofFinishKnM2: PACK.constructionWeights.cementPlasterPer10mm * 5 + PACK.constructionWeights.bituminousFeltGravel5ply + PACK.constructionWeights.ceilingCementPlaster13mm,
} as const;

/** Strength-reduction factors (Sec 6.2.3.2), cover (Sec 8.1.7.2) and the rest of the design constants. */
export const DESIGN = {
  phiFlexure: 0.9,
  phiShear: 0.75,
  coverBeamMm: 40,
  coverSlabMm: 20,
  stirrupMm: 10,
  mainBarMm: 20,
  slabBarMm: 10,
  /** Where thickness selection starts: 125 mm is the floor of Eq 6.6.5 for slabs with beams (Sec 6.2.5.3.3). */
  minSlabThicknessMm: 125,
  /** Support width used to take design shear at d from the face. */
  supportWidthMm: 300,
  /** Time-dependent factor xi for 5 years or more, no compression steel (Sec 6.2.5.2.5, Eq 6.6.4). */
  longTermFactor: 2,
  /** Table 6.6.2: part of the deflection after partitions are attached: span/480; immediate live deflection: span/360. */
  deflectionLimitDiv: 480,
  liveDeflectionLimitDiv: 360,
} as const;

export interface Assumption {
  id: string;
  en: string;
  bn: string;
}

export const ASSUMPTIONS: Assumption[] = [
  { id: "materials", en: "Concrete fc 20 MPa (the gazette sets exposure minima, not a grade) and Grade 420 bars. Frame concrete 24.06 kN/m3 assumes 2 % main steel.", bn: "কংক্রিট fc ২০ এমপিএ (গেজেটে গ্রেড নেই, শুধু এক্সপোজার অনুযায়ী সর্বনিম্ন) ও গ্রেড ৪২০ রড। ফ্রেম কংক্রিট ২৪.০৬ কিনি/ঘনমি, ২% মূল রডের অনুমানে।" },
  { id: "finishes", en: "Finishes are built from BNBC Table 6.2.2 rates with assumed thicknesses: 50 mm screed, 12 mm plaster each wall face; walls are 250 mm exterior and 125 mm interior burnt-clay brick.", bn: "ফিনিশ বিএনবিসি সারণি ৬.২.২ হার ও অনুমিত পুরুত্বে: ৫০ মিমি স্ক্রিড, দেয়ালের প্রতি পাশে ১২ মিমি প্লাস্টার; বাইরের দেয়াল ২৫০ ও ভিতরের ১২৫ মিমি পোড়া ইট।" },
  { id: "slab-spans", en: "Two-way slabs use the gazette coefficient method (Tables 6.6.8-6.6.11) with centre-to-centre spans, which gives slightly larger moments than clear spans. Negative moment at a discontinuous edge is one third of the positive moment (ACI 318-63 rule; the gazette has no figure).", bn: "দ্বিমুখী স্ল্যাব গেজেটের সহগ পদ্ধতিতে (সারণি ৬.৬.৮-৬.৬.১১), কেন্দ্র থেকে কেন্দ্র স্প্যান ধরে। অবিচ্ছিন্ন নয় এমন কিনারায় ঋণাত্মক মোমেন্ট ধনাত্মকের এক-তৃতীয়াংশ (এসিআই ৩১৮-৬৩; গেজেটে মান নেই)।" },
  { id: "slab-stiffness", en: "Slab thickness for deflection uses the beam-to-slab stiffness ratio of the beams actually sized (T-beam flanges per ACI 318 overhang rule); the gazette does not define the flange width.", bn: "ডিফ্লেকশনের জন্য স্ল্যাবের পুরুত্ব নির্ধারিত বিমের কঠোরতা অনুপাতে (টি-বিমের ফ্ল্যাঞ্জ এসিআই ৩১৮ নিয়মে); গেজেটে ফ্ল্যাঞ্জ প্রস্থ নেই।" },
  { id: "beam-supports", en: "Beams are continuous over columns (columns as simple supports) with pattern live loading; end supports get a nominal hogging moment of wL2/24 (Sec 6.1.4.3, support is a spandrel beam).", bn: "বিম কলামের উপর অবিচ্ছিন্ন (কলাম সরল অবলম্বন), লাইভ লোডের প্যাটার্নসহ; প্রান্তে নামমাত্র wL²/২৪ হগিং মোমেন্ট (ধারা ৬.১.৪.৩)।" },
  { id: "partitions", en: "Walls on a beam line are line loads on that beam; other partitions are covered by the 1.2 kN/m2 allowance (Sec 2.3.6), which is not reduced.", bn: "বিমের উপরের দেয়াল সেই বিমে রেখা লোড; অন্য পার্টিশন ১.২ কিনি/বর্গমি ভাতায় (ধারা ২.৩.৬), যা হ্রাস করা হয় না।" },
  { id: "live-reduction", en: "Live load on beams is reduced per Sec 2.3.13 (K_LL = 2, floor 0.5 L0). Slabs and roofs are not reduced; roof reduction (Sec 2.3.14) is not transcribed.", bn: "বিমের লাইভ লোড ধারা ২.৩.১৩ অনুযায়ী হ্রাসকৃত (K_LL = ২, সর্বনিম্ন ০.৫ L0)। স্ল্যাব ও ছাদে হ্রাস নেই; ছাদের হ্রাস (ধারা ২.৩.১৪) লিপিবদ্ধ নয়।" },
  { id: "deflection", en: "Both Table 6.6.2 limits are applied to floors and roofs alike: immediate live deflection span/360 and the part after partitions span/480 (long-term factor 2.0). Flat roofs would be allowed span/180 if nothing damageable is attached.", bn: "ছাদ ও মেঝে উভয়ে সারণি ৬.৬.২-এর দুই সীমা: তাৎক্ষণিক লাইভ বিচ্যুতি স্প্যান/৩৬০ এবং পার্টিশনের পরের অংশ স্প্যান/৪৮০ (দীর্ঘমেয়াদী গুণক ২.০)।" },
  { id: "cover", en: "Cover is 20 mm in slabs and 40 mm in beams (mild environment, Sec 8.1.7.2); exposed beams with 19 mm and larger bars would need 50 mm.", bn: "স্ল্যাবে ২০ মিমি ও বিমে ৪০ মিমি কভার (মৃদু পরিবেশ, ধারা ৮.১.৭.২); উন্মুক্ত বিমে ১৯ মিমি বা বড় রডে ৫০ মিমি লাগবে।" },
  { id: "rebar-detailing", en: "Rebar: stock diameters only; bottom beam bars are not curtailed, extra top bars stop 0.25 L + max(d, 12 db) from the support, ties are 10 mm at 100 mm over the end zones, and crossties, corner bars and column splice staggering are not scheduled. Development lengths use the first row of the Sec 8.2.3.2 table (good spacing and cover).", bn: "রিবার: কেবল মজুদ ব্যাস; বিমের নিচের রড কাটা হয়নি, বাড়তি উপরের রড অবলম্বন থেকে ০.২৫ L + max(d, ১২ db) পর্যন্ত, টাই ১০ মিমি প্রান্তে ১০০ মিমি ব্যবধানে; ক্রসটাই, কোণার রড ও কলাম স্প্লাইসের স্তরবিন্যাস ধরা হয়নি। ডেভেলপমেন্ট দৈর্ঘ্য ধারা ৮.২.৩.২ সারণির প্রথম সারি (ভালো ব্যবধান ও কভার)।" },
  { id: "slab-walls", en: "A wall that stands on a slab with no beam under it is spread over its panel as an equivalent uniform load (wall weight / panel area), with door and window openings not deducted. Walls on a structural line load that beam. The 1.2 kN/m2 partition allowance is kept on top, so these panels are conservative.", bn: "বিমহীন স্ল্যাবের ওপর দেয়াল থাকলে তার ওজন প্যানেলের ওপর সমভাবে ছড়িয়ে ধরা হয়েছে (দেয়ালের ওজন ÷ প্যানেলের ক্ষেত্রফল), দরজা-জানালার ফাঁক বাদ দেওয়া হয়নি। কাঠামোগত লাইনের দেয়াল ঐ বিমের লাইন লোড। ১.২ কিলোনিউটন/মি² পার্টিশন ভাতা অতিরিক্ত রাখা হয়েছে, তাই এসব প্যানেল নিরাপদ দিকে।" },
  { id: "roof-equipment", en: "The roof carries the stair cover, the lift machine room (plus a 100 kN machine and cabin allowance) and the overhead water tank on the stair cover, full, as a uniform load over the roof panels under them. Stair flights add 3.0 kN/m2 to the stair panels. The flights and lift core themselves are not designed.", bn: "ছাদে সিঁড়িঘর, লিফট মেশিন রুম (১০০ কিলোনিউটন মেশিন ও কেবিনের ভার ধরে) এবং সিঁড়িঘরের ওপর পানির ট্যাংক (ভরা অবস্থায়) নিচের ছাদ-প্যানেলে সমভাবে ধরা হয়েছে। সিঁড়ির ধাপে স্থানীয় প্যানেলে ৩.০ কিলোনিউটন/মি² যোগ হয়। সিঁড়ির ফ্লাইট ও লিফট কোর নিজে ডিজাইন করা হয়নি।" },
  { id: "cantilever", en: "A balcony in front of the first column line is a one-way cantilever slab off the edge beam, with no tip columns: depth at least L/10 (Table 6.6.1), Mu from the Sec 2.7.5 gravity combinations, flexure and shear as for other slabs, a 1.0 kN/m railing load (assumption) and a balcony live load of 4.8 kN/m2 (the public-room row; the gazette balcony row is to be confirmed). The edge beam carries the strip reaction as a line load. Torsion of the edge beam from the cantilever moment is NOT checked, and no deflection check beyond L/10 is made.", bn: "প্রথম কলাম লাইনের সামনের বারান্দা প্রান্ত-বিম থেকে একমুখী ক্যান্টিলিভার স্ল্যাব, প্রান্তে কলাম নেই: গভীরতা কমপক্ষে L/10 (সারণি ৬.৬.১), Mu ধারা ২.৭.৫-এর গ্র্যাভিটি কম্বিনেশন থেকে, ফ্লেক্সার ও শিয়ার অন্য স্ল্যাবের মতো, রেলিংয়ের ১.০ কিনি/মি (অনুমান) ও বারান্দার লাইভ লোড ৪.৮ কিনি/মি² (পাবলিক-রুম সারি; গেজেটের বারান্দা সারি যাচাইযোগ্য)। প্রান্ত-বিম স্ট্রিপের প্রতিক্রিয়া রেখা-লোড হিসেবে বহন করে। ক্যান্টিলিভার মোমেন্ট থেকে প্রান্ত-বিমের টরশন যাচাই করা হয়নি এবং L/10-এর বাইরে বিচ্যুতি যাচাই নেই।" },
  { id: "screening", en: "Screening, not final design: a licensed structural engineer must design and sign the structure.", bn: "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়: লাইসেন্সপ্রাপ্ত কাঠামো প্রকৌশলীকে নকশা ও স্বাক্ষর করতে হবে।" },
];
