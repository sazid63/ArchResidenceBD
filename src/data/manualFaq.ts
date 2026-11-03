/**
 * Offline manual entries (v2.4.4). Everything here is derived from how the app actually behaves
 * or from facts already stated in the repo; regulatory items are labelled as repo notes and are
 * NOT verified against the official gazettes. Each answer names its source so users can check it.
 */
export interface ManualEntry {
  id: string;
  topic: string;
  question: { en: string; bn: string };
  answer: { en: string; bn: string };
  keywords: string[];
  source: string;
  sourceKind: "app" | "rule";
}

export const MANUAL_FAQ: ManualEntry[] = [
  {
    id: "start", topic: "Getting started", sourceKind: "app", source: "App behaviour",
    question: { en: "How do I start a new project?", bn: "কীভাবে নতুন প্রকল্প শুরু করব?" },
    answer: {
      en: "Choose New Project, enter the plot size, number of storeys and units per floor, and pick a typical floor plan. Then answer the phase interviews (site, foundation, floors, roof). The 3D model, BOQ and reports update from your answers.",
      bn: "নতুন প্রকল্প বেছে প্লটের আকার, তলার সংখ্যা ও প্রতি তলায় ইউনিট দিন এবং একটি টিপিকাল ফ্লোর প্ল্যান বাছুন। এরপর ফেজ ইন্টারভিউ (সাইট, ফাউন্ডেশন, ফ্লোর, ছাদ) সম্পন্ন করুন। আপনার উত্তর অনুযায়ী ৩ডি মডেল, BOQ ও রিপোর্ট হালনাগাদ হয়।",
    },
    keywords: ["start", "new", "project", "begin", "create", "শুরু", "নতুন", "প্রকল্প"],
  },
  {
    id: "plan-use", topic: "Floor plans", sourceKind: "app", source: "App behaviour (floorplanMapping)",
    question: { en: "How is the floor plan I pick used in the 3D model?", bn: "আমার বাছাই করা ফ্লোর প্ল্যান ৩ডি মডেলে কীভাবে ব্যবহৃত হয়?" },
    answer: {
      en: "The catalogue drawings are reference images. The 3D model is built from the closest built-in layout for your number of units per floor (narrow plots use the narrow-plot layout). You can switch the layout of any floor in its phase screen; choosing it on a residential floor makes it the typical plan for floors without their own choice.",
      bn: "ক্যাটালগের ড্রয়িংগুলো রেফারেন্স ছবি। ৩ডি মডেল তৈরি হয় প্রতি তলার ইউনিট সংখ্যা অনুযায়ী সবচেয়ে কাছের বিল্ট-ইন লেআউট থেকে (সরু প্লটে সরু-প্লটের লেআউট)। যেকোনো তলার ফেজ স্ক্রিনে লেআউট বদলানো যায়; আবাসিক তলায় বাছলে সেটি নিজস্ব পছন্দ নেই এমন তলাগুলোর টিপিকাল প্ল্যান হয়।",
    },
    keywords: ["floor", "plan", "layout", "typical", "image", "ফ্লোর", "প্ল্যান", "লেআউট"],
  },
  {
    id: "sizes", topic: "Structure", sourceKind: "app", source: "App behaviour (sectionSizing)",
    question: { en: "How are column and beam sizes chosen?", bn: "কলাম ও বিমের মাপ কীভাবে নির্ধারিত হয়?" },
    answer: {
      en: "The app picks the column grid, column size and beam size that pass its screening checks (M25 concrete, Fe415 steel, column utilisation at most 0.80, beam utilisation at most 0.85, deflection L/360) for your footprint and storeys. Large plots get more column lines so beams stay at most 600 mm deep. This is a screening aid, not a structural design: a licensed engineer must design and approve the structure. If you override a column size below the screening minimum, the model shows a warning.",
      bn: "অ্যাপ আপনার ফুটপ্রিন্ট ও তলা অনুযায়ী স্ক্রিনিং শর্ত (M25 কংক্রিট, Fe415 স্টিল, কলাম ইউটিলাইজেশন ≤ ০.৮০, বিম ≤ ০.৮৫, ডিফ্লেকশন L/360) পূরণ করে এমন কলাম গ্রিড, কলাম ও বিমের মাপ বেছে নেয়। বড় প্লটে কলাম লাইন বাড়ে যাতে বিম ৬০০ মিমি-র বেশি গভীর না হয়। এটি স্ক্রিনিং সহায়তা, স্ট্রাকচারাল ডিজাইন নয়: লাইসেন্সপ্রাপ্ত প্রকৌশলীকে ডিজাইন ও অনুমোদন করতে হবে। কলাম ছোট করলে মডেলে সতর্কবার্তা দেখায়।",
    },
    keywords: ["column", "beam", "size", "structure", "grid", "footing", "কলাম", "বিম", "মাপ", "স্ট্রাকচার"],
  },
  {
    id: "boq", topic: "BOQ", sourceKind: "app", source: "App behaviour (boqGenerator)",
    question: { en: "How is the BOQ calculated and what is assumed?", bn: "BOQ কীভাবে হিসাব হয় এবং কী ধরে নেওয়া হয়?" },
    answer: {
      en: "Quantities are measured from the 3D solids: concrete in m³ (rates include formwork), brickwork and partitions as net wall area with the rate scaled by thickness, plaster and floor finishes from exposed surfaces, doors and windows by opening area, tanks as shells. Reinforcement uses assumed kg per m³ factors (footing 80, column 200, beam 150, slab 90, stair 110, tank 120) until a bar schedule exists. Rates come from the built-in 2025 Dhaka rate table. Railings are measured but unpriced because the table has no rate for them.",
      bn: "পরিমাণ ৩ডি সলিড থেকে মাপা হয়: কংক্রিট ঘনমিটারে (রেটে ফর্মওয়ার্ক অন্তর্ভুক্ত), ইটের দেয়াল ও পার্টিশন নেট দেয়াল এরিয়ায় (পুরুত্ব অনুযায়ী রেট সমন্বয়), প্লাস্টার ও মেঝের ফিনিশ উন্মুক্ত পৃষ্ঠ থেকে, দরজা-জানালা খোলা এরিয়ায়, ট্যাংক খোলস হিসেবে। বার শিডিউল না থাকা পর্যন্ত রিইনফোর্সমেন্টে ধরা kg/m³ ফ্যাক্টর (ফুটিং ৮০, কলাম ২০০, বিম ১৫০, স্ল্যাব ৯০, সিঁড়ি ১১০, ট্যাংক ১২০) ব্যবহৃত হয়। রেট বিল্ট-ইন ২০২৫ ঢাকা রেট টেবিল থেকে। রেলিংয়ের রেট টেবিলে নেই বলে পরিমাণ দেখানো হয় কিন্তু দাম ধরা হয় না।",
    },
    keywords: ["boq", "cost", "rate", "quantity", "steel", "rebar", "estimate", "price", "বিওকিউ", "খরচ", "রেট", "পরিমাণ", "রড"],
  },
  {
    id: "no3d", topic: "3D view", sourceKind: "app", source: "App behaviour",
    question: { en: "The 3D view is blank or says it could not start. What can I do?", bn: "৩ডি ভিউ ফাঁকা বা চালু হচ্ছে না। কী করব?" },
    answer: {
      en: "The 3D view needs WebGL. Update your browser, enable hardware acceleration in its settings, or try another browser or device. Drawings, the BOQ and reports work without WebGL.",
      bn: "৩ডি ভিউয়ের জন্য WebGL দরকার। ব্রাউজার আপডেট করুন, সেটিংসে হার্ডওয়্যার অ্যাক্সেলারেশন চালু করুন, অথবা অন্য ব্রাউজার/ডিভাইসে চেষ্টা করুন। ড্রয়িং, BOQ ও রিপোর্ট WebGL ছাড়াই কাজ করে।",
    },
    keywords: ["3d", "blank", "webgl", "black", "not working", "view", "ভিউ", "ফাঁকা", "চালু"],
  },
  {
    id: "saved", topic: "Your data", sourceKind: "app", source: "App behaviour (browser storage)",
    question: { en: "Where is my project saved?", bn: "আমার প্রকল্প কোথায় সংরক্ষিত থাকে?" },
    answer: {
      en: "Projects are stored in this browser on this device only (local storage). There is no cloud copy. Clearing browser data, using a private window, or switching device loses them, so export the BOQ and the FreeCAD macro regularly. Deleting a project cannot be undone.",
      bn: "প্রকল্প শুধু এই ডিভাইসের এই ব্রাউজারে (লোকাল স্টোরেজ) সংরক্ষিত থাকে, ক্লাউডে কোনো কপি নেই। ব্রাউজার ডেটা মুছলে, প্রাইভেট উইন্ডো ব্যবহার করলে বা ডিভাইস বদলালে প্রকল্প হারাবে, তাই নিয়মিত BOQ ও ফ্রিক্যাড ম্যাক্রো এক্সপোর্ট করুন। প্রকল্প মুছলে ফেরানো যায় না।",
    },
    keywords: ["save", "saved", "storage", "lose", "delete", "backup", "export", "সংরক্ষণ", "সেভ", "মুছ", "ব্যাকআপ"],
  },
  {
    id: "export", topic: "Export", sourceKind: "app", source: "App behaviour",
    question: { en: "How do I export the model or the BOQ?", bn: "মডেল বা BOQ কীভাবে এক্সপোর্ট করব?" },
    answer: {
      en: "On the 3D model screen use Export FreeCAD (.py) for a FreeCAD macro and Export IFC (.ifc) for BIM software. On the BOQ screen use Export BOQ (CSV).",
      bn: "৩ডি মডেল স্ক্রিনে ফ্রিক্যাড ম্যাক্রোর জন্য Export FreeCAD (.py) এবং BIM সফটওয়্যারের জন্য Export IFC (.ifc) ব্যবহার করুন। BOQ স্ক্রিনে Export BOQ (CSV) ব্যবহার করুন।",
    },
    keywords: ["export", "freecad", "ifc", "csv", "download", "bim", "এক্সপোর্ট", "ডাউনলোড"],
  },
  {
    id: "room-limits", topic: "Compliance", sourceKind: "app", source: "App behaviour; repo rule pack lists room minimums as a declared gap",
    question: { en: "Are the minimum room sizes in the app official BNBC values?", bn: "অ্যাপের ন্যূনতম ঘরের আকারগুলো কি অফিসিয়াল BNBC মান?" },
    answer: {
      en: "No. They are working assumptions (for example bedroom 9.5 m², kitchen 5 m²) that have not been transcribed from BNBC 2020. Warnings that use them say \"assumed limit\". Confirm every limit against BNBC 2020 Part 3 and the authority's rules before submitting drawings.",
      bn: "না। এগুলো কাজ চালানোর ধারণা-মান (যেমন বেডরুম ৯.৫ বর্গমিটার, রান্নাঘর ৫ বর্গমিটার), BNBC ২০২০ থেকে হুবহু নেওয়া নয়। এগুলো ব্যবহারকারী সতর্কবার্তায় \"ধরা সীমা\" লেখা থাকে। ড্রয়িং জমা দেওয়ার আগে প্রতিটি সীমা BNBC ২০২০ পার্ট ৩ ও কর্তৃপক্ষের বিধির সাথে মিলিয়ে নিন।",
    },
    keywords: ["bnbc", "room", "minimum", "area", "official", "limit", "compliance", "ঘর", "ন্যূনতম", "বিএনবিসি"],
  },
  {
    id: "stairs", topic: "Stairs", sourceKind: "app", source: "App behaviour (stairBuilder)",
    question: { en: "How is the staircase designed?", bn: "সিঁড়ি কীভাবে ডিজাইন হয়?" },
    answer: {
      en: "A dog-legged RCC stair with 1000 mm flights, 250 mm treads and risers of at most 175 mm (relaxed to 190 mm risers and 230 mm treads if the stair room is small). It rises exactly from floor to floor, with an opening in each slab above and a head-room on the roof. These proportions are assumptions to be confirmed against BNBC 2020 Part 3. If the stair room is still too small, the model reports it and the stair overlaps the walls.",
      bn: "১০০০ মিমি ফ্লাইটের ডগ-লেগড আরসিসি সিঁড়ি, ২৫০ মিমি ট্রেড, রাইজার সর্বোচ্চ ১৭৫ মিমি (সিঁড়িঘর ছোট হলে ১৯০ মিমি রাইজার ও ২৩০ মিমি ট্রেড পর্যন্ত শিথিল)। এটি ঠিক তলা থেকে তলায় ওঠে, প্রতিটি উপরের স্ল্যাবে খোলা থাকে এবং ছাদে হেডরুম থাকে। এই অনুপাতগুলো ধরা মান; BNBC ২০২০ পার্ট ৩ এর সাথে নিশ্চিত করুন। সিঁড়িঘর তবুও ছোট হলে মডেল তা জানায় এবং সিঁড়ি দেয়ালের সাথে মিশে যায়।",
    },
    keywords: ["stair", "staircase", "riser", "tread", "step", "সিঁড়ি", "সিড়ি", "ধাপ"],
  },
  {
    id: "setback", topic: "Setbacks", sourceKind: "rule", source: "Repo notes (RAJUK Imarat Nirman Bidhimala): not verified against the gazette",
    question: { en: "What setbacks does the app use?", bn: "অ্যাপ কোন সেটব্যাক ব্যবহার করে?" },
    answer: {
      en: "For residential plots up to 3 katha: front 1.5 m, rear 2.0 m and sides 1.0 m. Road width also changes the allowed floor-area ratio. Verify with the current RAJUK rules for your plot.",
      bn: "৩ কাঠা পর্যন্ত আবাসিক প্লটে: সামনে ১.৫ মিটার, পেছনে ২.০ মিটার ও দুই পাশে ১.০ মিটার। রাস্তার প্রস্থের উপর ফ্লোর-এরিয়া রেশিও (FAR) নির্ভর করে। আপনার প্লটের জন্য বর্তমান রাজউক বিধি যাচাই করুন।",
    },
    keywords: ["setback", "front", "rear", "side", "far", "rajuk", "plot", "সেটব্যাক", "রাজউক", "প্লট"],
  },
  {
    id: "seismic", topic: "Seismic", sourceKind: "rule", source: "Repo notes (BNBC 2020 zoning): not verified against the code text",
    question: { en: "Which seismic zone factors does the app use?", bn: "অ্যাপ কোন ভূমিকম্প জোন ফ্যাক্টর ব্যবহার করে?" },
    answer: {
      en: "The repo notes list Dhaka Z = 0.20, Chittagong Z = 0.28 and Sylhet Z = 0.36 from BNBC 2020. Confirm the value for your site with the engineer and the code.",
      bn: "রিপোজিটরির নোট অনুযায়ী (BNBC ২০২০ থেকে ঢাকা Z = ০.২০, চট্টগ্রাম Z = ০.২৮, সিলেট Z = ০.৩৬)। আপনার সাইটের মান প্রকৌশলী ও কোড থেকে নিশ্চিত করুন।",
    },
    keywords: ["seismic", "zone", "earthquake", "bnbc", "ভূমিকম্প", "জোন"],
  },
  {
    id: "katha", topic: "Units", sourceKind: "app", source: "App behaviour (land unit converter)",
    question: { en: "How big is a katha?", bn: "এক কাঠা কত বড়?" },
    answer: {
      en: "The app uses 1 katha = 66.89 m². Use the Land Units screen to convert between katha, shotok, bigha, gonda, square feet and square metres.",
      bn: "অ্যাপ ১ কাঠা = ৬৬.৮৯ বর্গমিটার ধরে। কাঠা, শতক, বিঘা, গন্ডা, বর্গফুট ও বর্গমিটারের মধ্যে রূপান্তরে জমির একক স্ক্রিন ব্যবহার করুন।",
    },
    keywords: ["katha", "shotok", "bigha", "unit", "convert", "land", "area", "কাঠা", "শতক", "বিঘা", "জমি"],
  },
];

const tokens = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}\u0980-\u09FF]+/u).filter((t) => t.length >= 2 || /[\u0980-\u09FF]/.test(t));

export interface ManualAnswer { entry: ManualEntry; score: number }

/** Deterministic keyword search over the manual. Returns [] when nothing matches (no filler answers). */
export function searchManual(query: string, limit = 5): ManualAnswer[] {
  const q = tokens(query);
  if (!q.length) return [];
  const scored = MANUAL_FAQ.map((entry) => {
    const kw = entry.keywords.map((k) => k.toLowerCase());
    const hay = (entry.question.en + " " + entry.question.bn).toLowerCase();
    const body = (entry.answer.en + " " + entry.answer.bn + " " + entry.topic).toLowerCase();
    let score = 0;
    for (const t of q) {
      if (kw.some((k) => k === t || (t.length >= 4 && k.length >= 4 && (k.includes(t) || t.includes(k))))) score += 3;
      if (t.length >= 3 && hay.includes(t)) score += 2;
      if (t.length >= 4 && body.includes(t)) score += 1;
    }
    return { entry, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
}
