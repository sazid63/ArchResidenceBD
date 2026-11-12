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
  { id: "rebar-detailing", en: "Rebar: stock diameters only; bottom beam bars are not curtailed, extra top bars stop 0.25 L + max(d, 12 db) from the support. Column ties follow Sec 8.3.5.4 (see confinement): closed hoops of 10 or 12 mm with cross ties for interior bars, the zone length lo and hoop spacing so, and the Ash of eqs 6.8.7 and 6.8.8 checked. Corner bars and column splice staggering are not scheduled. Development lengths use the first row of the Sec 8.2.3.2 table (good spacing and cover).", bn: "রিবার: কেবল মজুদ ব্যাস; বিমের নিচের রড কাটা হয়নি, বাড়তি উপরের রড অবলম্বন থেকে ০.২৫ L + max(d, ১২ db) পর্যন্ত। কলাম টাই ধারা ৮.৩.৫.৪ অনুযায়ী: ১০ বা ১২ মিমি বদ্ধ হুপ, অভ্যন্তরীণ রডের জন্য ক্রসটাই, অঞ্চল lo ও ব্যবধান so, এবং সমীকরণ ৬.৮.৭ ও ৬.৮.৮ অনুযায়ী Ash যাচাই; কোণার রড ও কলাম স্প্লাইসের স্তরবিন্যাস ধরা হয়নি। ডেভেলপমেন্ট দৈর্ঘ্য ধারা ৮.২.৩.২ সারণির প্রথম সারি (ভালো ব্যবধান ও কভার)।" },
  { id: "confinement", en: "Column confinement (Sec 8.3.5.4): the zone length is the largest side, lu/6 or 450 mm; so is the least of a quarter of the smaller side, 6 db and 100 + (350 - hx)/3 (capped at 150), rounded down to 25 mm. Outside the zone the hoops use min(6 db, 150). Eq 6.8.7 uses the larger core dimension for both directions (assumption: the text read does not give the direction). The clause allowing the Ash check to be skipped when the core is strong enough is not used, so the check always applies.", bn: "কলাম সীমাবদ্ধকরণ (ধারা ৮.৩.৫.৪): অঞ্চলের দৈর্ঘ্য বৃহত্তম বাহু, lu/৬ বা ৪৫০ মিমি; so হলো ছোট বাহুর এক-চতুর্থাংশ, ৬ db ও ১০০ + (৩৫০ - hx)/৩ (১৫০-এ সীমাবদ্ধ)-এর সর্বনিম্ন, ২৫ মিমি-র ধাপে নিচের দিকে; অঞ্চলের বাইরে হুপ min(৬ db, ১৫০)। সমীকরণ ৬.৮.৭ দুই দিকে বৃহত্তর কোর মাত্রা ধরে (অনুমান: টেক্সটে দিক উল্লেখ নেই)। কোর শক্ত হলে Ash যাচাই বাদ দেওয়ার ধারা ব্যবহার করা হয়নি।" },
  { id: "slab-walls", en: "A wall that stands on a slab with no beam under it is spread over its panel as an equivalent uniform load (wall weight / panel area), with door and window openings not deducted. Walls on a structural line load that beam. The 1.2 kN/m2 partition allowance is kept on top, so these panels are conservative.", bn: "বিমহীন স্ল্যাবের ওপর দেয়াল থাকলে তার ওজন প্যানেলের ওপর সমভাবে ছড়িয়ে ধরা হয়েছে (দেয়ালের ওজন ÷ প্যানেলের ক্ষেত্রফল), দরজা-জানালার ফাঁক বাদ দেওয়া হয়নি। কাঠামোগত লাইনের দেয়াল ঐ বিমের লাইন লোড। ১.২ কিলোনিউটন/মি² পার্টিশন ভাতা অতিরিক্ত রাখা হয়েছে, তাই এসব প্যানেল নিরাপদ দিকে।" },
  { id: "roof-equipment", en: "The roof carries the stair cover, the lift machine room (plus a 100 kN machine and cabin allowance) and the overhead water tank on the stair cover, full, as a uniform load over the roof panels under them. Stair flights add 3.0 kN/m2 to the stair panels. The flights and lift core themselves are not designed.", bn: "ছাদে সিঁড়িঘর, লিফট মেশিন রুম (১০০ কিলোনিউটন মেশিন ও কেবিনের ভার ধরে) এবং সিঁড়িঘরের ওপর পানির ট্যাংক (ভরা অবস্থায়) নিচের ছাদ-প্যানেলে সমভাবে ধরা হয়েছে। সিঁড়ির ধাপে স্থানীয় প্যানেলে ৩.০ কিলোনিউটন/মি² যোগ হয়। সিঁড়ির ফ্লাইট ও লিফট কোর নিজে ডিজাইন করা হয়নি।" },
  { id: "cantilever", en: "A balcony in front of the first column line is a one-way cantilever slab off the edge beam, with no tip columns: depth at least L/10 (Table 6.6.1), Mu from the Sec 2.7.5 gravity combinations, flexure and shear as for other slabs, a 1.0 kN/m railing line load at the tip (assumption: heavier than a light steel railing, about 0.3 to 0.5 kN/m, so on the safe side; BNBC handrail load not transcribed) and the balcony live load of 4.8 kN/m2 (BNBC Table 6.2.3, row Balconies (exterior); the 2.9 kN/m2 row is for one- and two-family houses only). The edge beam carries the strip reaction as a line load. The cantilever bars run on into the back slab, so the beam twists until it cracks and the back slab takes the rest (compatibility torsion): the design torque is capped at the cracking torque, the edge beam is checked for shear plus torsion with closed stirrups (thin-walled tube method of ACI 318-08 Sec 11.5, which BNBC Part 6 follows; the BNBC torsion clauses are not transcribed, so this is an assumption), closed stirrups (spacing at most ph/8 and 300 mm) and side bars for torsion go into the bar schedule, and the moment left to the back panel is reported; that back-panel edge moment is not re-checked. No deflection check beyond L/10 is made.", bn: "প্রথম কলাম লাইনের সামনের বারান্দা প্রান্ত-বিম থেকে একমুখী ক্যান্টিলিভার স্ল্যাব, প্রান্তে কলাম নেই: গভীরতা কমপক্ষে L/10 (সারণি ৬.৬.১), Mu ধারা ২.৭.৫-এর গ্র্যাভিটি কম্বিনেশন থেকে, ফ্লেক্সার ও শিয়ার অন্য স্ল্যাবের মতো, রেলিংয়ের ১.০ কিনি/মি (অনুমান) ও বারান্দার লাইভ লোড ৪.৮ কিনি/মি² (পাবলিক-রুম সারি; গেজেটের বারান্দা সারি যাচাইযোগ্য)। প্রান্ত-বিম স্ট্রিপের প্রতিক্রিয়া রেখা-লোড হিসেবে বহন করে। ক্যান্টিলিভারের বার পেছনের স্ল্যাবে চলে যায়, তাই বিম ফাটা পর্যন্ত মোচড় নেয় ও বাকিটা পেছনের স্ল্যাব বহন করে (সামঞ্জস্য টরশন): নকশা টর্ক ফাটল-টর্কে সীমিত, প্রান্ত-বিম শিয়ার ও টরশন এবং বদ্ধ স্টিরাপের জন্য যাচাই করা হয় (ACI 318-08 ধারা ১১.৫-এর থিন-ওয়াল টিউব পদ্ধতি; বিএনবিসি টরশন ধারা অনুলিপি করা হয়নি, তাই এটি অনুমান), বদ্ধ স্টিরাপ (ব্যবধান ph/8 ও ৩০০ মিমির বেশি নয়) ও টরশনের পাশের রড রড-তালিকায় যায়, এবং পেছনের প্যানেলের জন্য বাকি মোমেন্ট দেখানো হয়; সেই প্রান্ত-মোমেন্ট পুনরায় যাচাই করা হয় না। L/10-এর বাইরে বিচ্যুতি যাচাই নেই।" },
  { id: "strong-column", en: "Strong-column check (eq 6.8.5) takes beam top bars from the bar picker, the lowest column strength over the factored axial cases at nominal P = Pu/0.65 (tension cases at Pu), and applies where a framing column has Pu above 0.1 Ag fc'. The roof joint uses the storey below only. The check flags joints; it does not upsize columns.", bn: "শক্তিশালী-কলাম (সমীকরণ ৬.৮.৫) পরীক্ষায় বিমের উপরের রড বার নির্বাচক থেকে, কলামের সর্বনিম্ন শক্তি ফ্যাক্টরড অক্ষীয় ক্ষেত্রে নামমাত্র P = Pu/০.৬৫ (টান ক্ষেত্রে Pu), এবং যেখানে সংলগ্ন কলামের Pu, ০.১ Ag fc' এর বেশি। ছাদের জয়েন্ট শুধু নিচের তলা ধরে। এই পরীক্ষা জয়েন্ট চিহ্নিত করে, কলাম বড় করে না।" },
  { id: "wind", en: "Wind (Sec 2.4 analytical method, common values): Dhaka V 65.7 m/s, Exposure B, Kzt 1, Kd 0.85, G 0.85, Cp 0.8 / -0.5, GCpi 0.18; storey drift limit h/500. The lateral design force is the larger of the seismic and the wind base shear. The Dhaka speed is taken from published comparisons and should be checked against Figure 6.2.1.", bn: "বাতাস (ধারা ২.৪ বিশ্লেষণ পদ্ধতি, প্রচলিত মান): ঢাকা V ৬৫.৭ মি/সে, এক্সপোজার B, Kzt ১, Kd ০.৮৫, G ০.৮৫, Cp ০.৮ / -০.৫, GCpi ০.১৮; তলার ড্রিফট সীমা h/৫০০। পার্শ্ব নকশা বল ভূমিকম্প ও বাতাসের বেস শিয়ারের বড়টি। ঢাকার গতি প্রকাশিত তুলনা থেকে নেওয়া, চিত্র ৬.২.১ এর সাথে মিলিয়ে নিতে হবে।" },
  { id: "torsion", en: "Torsion: rigid diaphragm with the D-method column stiffnesses, centre of mass at the plan centre, accidental eccentricity 5 % of the plan dimension, amplified by (ratio/1.2)^2 up to 3 above a drift ratio of 1.2. Soft-storey and mass irregularities are screened at 70 % / 80 % stiffness and 1.5x mass. These are flags, not a modal analysis.", bn: "টর্শন: অনমনীয় ডায়াফ্রাম, ডি-পদ্ধতির কলাম কঠোরতা, ভরকেন্দ্র প্ল্যানের মাঝে, আকস্মিক উৎকেন্দ্রতা প্ল্যান মাপের ৫%, ড্রিফট অনুপাত ১.২ এর বেশি হলে (অনুপাত/১.২)² (সর্বোচ্চ ৩) গুণ। নরম তলা ও ভরের অনিয়ম ৭০% / ৮০% কঠোরতা ও ১.৫ গুণ ভরে যাচাই। এগুলো সতর্কতা, মডাল বিশ্লেষণ নয়।" },
  { id: "core-detail", en: "Core wall: boundary elements where the edge stress exceeds 0.15 fc' (required above 0.2 fc'), full height, closed ties with a cross tie at every bar line. The lintel over each lift door is a coupling beam with diagonal bars when ln/h < 4 and Vu > 0.33 sqrt(fc) Acw; its shear is assumed (half the wall shear shared by the lintels) and capped at 0.83 sqrt(fc) Acw, the rest goes to the piers. Not a coupled-wall analysis.", bn: "কোর দেয়াল: কিনারার চাপ ০.১৫ fc' ছাড়ালে (০.২ এর বেশি হলে আবশ্যক) প্রান্ত অংশ, পুরো উচ্চতায়, প্রতি রডে ক্রস টাইসহ বদ্ধ টাই। লিফটের দরজার ওপরের লিন্টেল কাপলিং বিম: ln/h < ৪ ও Vu > ০.৩৩ √fc Acw হলে কোণাকুণি রড; এর শিয়ার অনুমিত (দেয়ালের শিয়ারের অর্ধেক, লিন্টেলগুলোর মধ্যে ভাগ) ও ০.৮৩ √fc Acw এ সীমিত, বাকিটা পাশের স্তম্ভে। সংযুক্ত দেয়াল বিশ্লেষণ নয়।" },
  { id: "stairs", en: "Stair flights are designed as a one-way waist slab (span = run + 300 mm, simply supported, live 4.0 kN/m2, finishes 1.5 kN/m2, waist 150 to 250 mm, bars at most 200 mm apart). Beam bars are kept within the crack-control spacing of ACI 318-19 24.3.2 (280 mm at fy 420, cover 40); beams deeper than 750 mm need skin steel. The roof tank, lift machine room and stair cover are loads spread on the roof panels.", bn: "সিঁড়ির ফ্লাইট এক-মুখী ওয়েস্ট স্ল্যাব হিসেবে নকশা (স্প্যান = রান + ৩০০ মিমি, সরল অবলম্বন, লাইভ ৪.০ কিনি/মি², ফিনিশ ১.৫ কিনি/মি², ওয়েস্ট ১৫০–২৫০ মিমি, রডের ফাঁক সর্বোচ্চ ২০০ মিমি)। বিমের রড এসিআই ৩১৮-১৯ ২৪.৩.২ এর ফাটল-নিয়ন্ত্রণ ব্যবধানে (fy ৪২০, কভার ৪০ এ ২৮০ মিমি); ৭৫০ মিমির বেশি গভীর বিমে পার্শ্ব রড লাগে। ছাদের ট্যাংক, লিফট মেশিন রুম ও সিঁড়ির ঢাকনা ছাদ প্যানেলে ছড়ানো লোড।" },
  { id: "foundation-practice", en: "Foundations: pad pressure from the column base moments (linear, triangular beyond B/6), service moment = factored / 1.2, tie beams at 10 % of the larger column load, overturning factor of safety 1.5, and a settlement screen at a pad pressure ratio above 1.5. Raft stiffness, the soil model, water table and pile caps are not designed.", bn: "ভিত্তি: কলামের গোড়ার মোমেন্ট থেকে প্যাডের চাপ (রৈখিক, B/৬ এর বেশি হলে ত্রিভুজাকার), সার্ভিস মোমেন্ট = ফ্যাক্টরড / ১.২, বড় কলাম লোডের ১০% এ টাই বিম, উল্টে যাওয়ার নিরাপত্তা গুণক ১.৫, প্যাডের চাপের অনুপাত ১.৫ এর বেশি হলে বসে যাওয়ার সতর্কতা। র‍্যাফটের কঠোরতা, মাটির মডেল, ভূগর্ভস্থ পানি ও পাইল ক্যাপ নকশা করা হয়নি।" },
  { id: "screening", en: "Screening, not final design: a licensed structural engineer must design and sign the structure.", bn: "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয়: লাইসেন্সপ্রাপ্ত কাঠামো প্রকৌশলীকে নকশা ও স্বাক্ষর করতে হবে।" },
];
