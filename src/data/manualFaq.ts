/**
 * Offline manual entries (v3). Everything here is derived from how the app actually behaves
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
      en: "Choose New Project and enter the plot size, the plot's frontage and depth, the road width, the number of storeys and the dwellings per floor. Then pick a floor plan that fits the plot. The 3D model, Compliance, Structure, Rebar schedule, BOQ and Drawings screens all read from that one choice.",
      bn: "নতুন প্রকল্প বেছে প্লটের আকার, সামনের ও গভীরতার মাপ, রাস্তার প্রস্থ, তলার সংখ্যা ও প্রতি তলায় ইউনিট দিন। এরপর প্লটে আঁটে এমন একটি ফ্লোর প্ল্যান বাছুন। ৩ডি মডেল, কমপ্লায়েন্স, স্ট্রাকচার, রিবার শিডিউল, বিওকিউ ও ড্রয়িং সব স্ক্রিন সেই একই পছন্দ থেকে চলে।",
    },
    keywords: ["start", "new", "project", "begin", "create", "শুরু", "নতুন", "প্রকল্প"],
  },
  {
    id: "plan-use", topic: "Floor plans", sourceKind: "app", source: "App behaviour (plan library, plan fit)",
    question: { en: "How is the floor plan I pick used?", bn: "আমার বাছাই করা ফ্লোর প্ল্যান কীভাবে ব্যবহৃত হয়?" },
    answer: {
      en: "The plans are original grid plans built into the app. A plan is stretched within its allowed range to fit the plot after the RAJUK setbacks, and every other screen is derived from it, so they cannot disagree. A plan can fit the setbacks and still exceed the ground coverage limit: the Compliance screen reports that as a fail.",
      bn: "প্ল্যানগুলো অ্যাপের নিজস্ব গ্রিড প্ল্যান। রাজউকের সেটব্যাক বাদ দিয়ে প্লটে বসাতে প্ল্যানটি তার অনুমোদিত সীমার মধ্যে টানা হয়, আর বাকি সব স্ক্রিন এর থেকেই তৈরি, তাই কখনো অমিল হয় না। প্ল্যান সেটব্যাকে আঁটলেও ভূমি আচ্ছাদনের সীমা ছাড়াতে পারে: কমপ্লায়েন্স স্ক্রিন তা ব্যর্থ হিসেবে দেখায়।",
    },
    keywords: ["floor", "plan", "layout", "typical", "fit", "ফ্লোর", "প্ল্যান", "লেআউট"],
  },
  {
    id: "sizes", topic: "Structure", sourceKind: "app", source: "App behaviour (src/structure); BNBC 2020 Part 6",
    question: { en: "How are column and beam sizes chosen?", bn: "কলাম ও বিমের মাপ কীভাবে নির্ধারিত হয়?" },
    answer: {
      en: "The Structure screen sizes slabs, beams, columns and footings for the loads and seismic rules of BNBC 2020 Part 6, with concrete fc' 20 MPa and Grade 420 bars as stated assumptions. It is a screening tool, not final design: wind and dynamic analysis are not modelled, the only shear wall is the lift core (dual system at 8 storeys; boundary elements and the core footing are not designed), only balcony edge beams are checked for torsion, and a licensed structural engineer must design and sign the structure. The screen lists every assumption.",
      bn: "স্ট্রাকচার স্ক্রিন বিএনবিসি ২০২০ পার্ট ৬-এর লোড ও ভূমিকম্পের নিয়মে স্ল্যাব, বিম, কলাম ও ফুটিং-এর মাপ ঠিক করে, কংক্রিট fc' ২০ এমপিএ ও গ্রেড ৪২০ রড ধরে (ঘোষিত অনুমান)। এটি স্ক্রিনিং, চূড়ান্ত নকশা নয়: বায়ু ও ডায়নামিক বিশ্লেষণ ধরা হয়নি, একমাত্র শিয়ার ওয়াল লিফট কোর (৮ তলায় ডুয়াল সিস্টেম; বাউন্ডারি এলিমেন্ট ও কোরের ফুটিং নকশা করা হয়নি), শুধু বারান্দার প্রান্ত-বিমের টরশন যাচাই হয়; লাইসেন্সপ্রাপ্ত স্ট্রাকচারাল প্রকৌশলীকে নকশা করে স্বাক্ষর করতে হবে। সব অনুমান স্ক্রিনেই তালিকাভুক্ত।",
    },
    keywords: ["column", "beam", "size", "structure", "grid", "footing", "slab", "কলাম", "বিম", "মাপ", "স্ট্রাকচার"],
  },
  {
    id: "rebar", topic: "Rebar", sourceKind: "app", source: "App behaviour (bar bending schedule)",
    question: { en: "How is the rebar schedule made?", bn: "রিবার শিডিউল কীভাবে তৈরি হয়?" },
    answer: {
      en: "From the Structure results. Bars are stock diameters only (8, 10, 12, 16, 20, 22, 25, 28, 32 mm), no row is longer than 12 m, hook, development and lap lengths follow BNBC 2020 Part 6 Chapter 8, and the schedule can be downloaded as CSV. Bottom beam bars are not curtailed and crossties are not scheduled, so treat it as a screening schedule.",
      bn: "স্ট্রাকচারের ফলাফল থেকে। রডের ব্যাস কেবল মজুদ মাপ (৮, ১০, ১২, ১৬, ২০, ২২, ২৫, ২৮, ৩২ মিমি), কোনো সারি ১২ মিটারের বেশি নয়, হুক, ডেভেলপমেন্ট ও ল্যাপের দৈর্ঘ্য বিএনবিসি ২০২০ পার্ট ৬ অধ্যায় ৮ অনুযায়ী, আর শিডিউল সিএসভি হিসেবে নামানো যায়। বিমের নিচের রড কাটা হয়নি ও ক্রসটাই ধরা হয়নি, তাই এটি স্ক্রিনিং শিডিউল।",
    },
    keywords: ["rebar", "bar", "bending", "schedule", "steel", "bbs", "রিবার", "রড", "শিডিউল"],
  },
  {
    id: "boq", topic: "BOQ", sourceKind: "app", source: "App behaviour (src/quantities)",
    question: { en: "How is the BOQ calculated and what is assumed?", bn: "BOQ কীভাবে হিসাব হয় এবং কী ধরে নেওয়া হয়?" },
    answer: {
      en: "Concrete volume and steel weight come from the structure and the bar schedule; brickwork, plaster and screed from the walls and floors of the plan. Prices come from a rate card (the PWD Schedule of Rates 2022 candidate card, with source and date shown on the screen). The card is not yet verified. Items the SoR does not cover (tiles, paint, waterproofing, earthwork, doors, windows, the lift, helpers) use web-sourced rates, each marked ASSUMPTION on its card line. Balcony railing, septic tank and soak well, tanks, pump and drainage are still unpriced; electrical and plumbing use benchmark rates, so the total is a lower bound. The mix ratios and wall heights are listed on the screen.",
      bn: "কংক্রিটের আয়তন ও রডের ওজন স্ট্রাকচার ও রিবার শিডিউল থেকে; ইটের গাঁথুনি, প্লাস্টার ও স্ক্রিড প্ল্যানের দেয়াল ও মেঝে থেকে। দাম একটি রেট কার্ড থেকে (পিডব্লিউডি রেট শিডিউল ২০২২ ক্যান্ডিডেট কার্ড; উৎস ও তারিখ স্ক্রিনে দেখানো)। কার্ডটি এখনো যাচাই হয়নি, কার্ডে না থাকা আইটেম (পাথর, শ্রম, যন্ত্র) দামহীন থাকে, তাই মোট একটি নিম্নসীমা। মিশ্রণের অনুপাত ও দেয়ালের উচ্চতা স্ক্রিনে তালিকাভুক্ত।",
    },
    keywords: ["boq", "cost", "rate", "quantity", "estimate", "price", "বিওকিউ", "খরচ", "রেট", "পরিমাণ"],
  },
  {
    id: "drawings", topic: "Drawings", sourceKind: "app", source: "App behaviour (src/drawings)",
    question: { en: "What drawings can I download, and can I submit them to RAJUK?", bn: "কোন ড্রয়িং নামানো যায়, আর সেগুলো কি রাজউকে জমা দেওয়া যায়?" },
    answer: {
      en: "The Drawings screen gives a site plan, a plan per storey, one section and four elevations as SVG and DXF, and a permit package zip with the BOQ, bar schedule, compliance report and assumptions. They are screening drawings: the section and elevations are schematic, and RAJUK needs drawings and calculations checked and signed by licensed professionals.",
      bn: "ড্রয়িং স্ক্রিনে সাইট প্ল্যান, প্রতি তলার প্ল্যান, একটি সেকশন ও চারটি এলিভেশন এসভিজি ও ডিএক্সএফ হিসেবে পাওয়া যায়, সঙ্গে বিওকিউ, রিবার শিডিউল, কমপ্লায়েন্স রিপোর্ট ও অনুমানসহ একটি পারমিট প্যাকেজ জিপ। এগুলো প্রাথমিক নকশা: সেকশন ও এলিভেশন সরলীকৃত, আর রাজউকে জমার জন্য লাইসেন্সপ্রাপ্ত পেশাজীবীর যাচাই ও স্বাক্ষর লাগে।",
    },
    keywords: ["drawing", "drawings", "dxf", "svg", "permit", "package", "submit", "section", "elevation", "ড্রয়িং", "পারমিট", "জমা"],
  },
  {
    id: "no3d", topic: "3D view", sourceKind: "app", source: "App behaviour",
    question: { en: "The 3D view is blank or says it could not start. What can I do?", bn: "৩ডি ভিউ ফাঁকা বা চালু হচ্ছে না। কী করব?" },
    answer: {
      en: "The 3D view needs WebGL. Update your browser, enable hardware acceleration in its settings, or try another browser or device. Drawings, the BOQ and reports work without WebGL.",
      bn: "৩ডি ভিউয়ের জন্য WebGL দরকার। ব্রাউজার আপডেট করুন, সেটিংসে হার্ডওয়্যার অ্যাক্সেলারেশন চালু করুন, অথবা অন্য ব্রাউজার বা ডিভাইস চেষ্টা করুন। ড্রয়িং, বিওকিউ ও রিপোর্ট WebGL ছাড়াই চলে।",
    },
    keywords: ["3d", "blank", "webgl", "black", "not working", "view", "ভিউ", "ফাঁকা", "চালু"],
  },
  {
    id: "saved", topic: "Your data", sourceKind: "app", source: "App behaviour (browser storage)",
    question: { en: "Where is my project saved?", bn: "আমার প্রকল্প কোথায় সংরক্ষিত থাকে?" },
    answer: {
      en: "Projects are stored in this browser on this device only (local storage). There is no cloud copy. Clearing browser data, using a private window, or switching device loses them, so download the permit package and the BOQ regularly. Projects saved by older versions are converted the first time you open the app; the old copy is left untouched as a backup.",
      bn: "প্রকল্প শুধু এই ডিভাইসের এই ব্রাউজারে (লোকাল স্টোরেজ) সংরক্ষিত থাকে, ক্লাউডে কোনো কপি নেই। ব্রাউজার ডেটা মুছলে, প্রাইভেট উইন্ডো ব্যবহার করলে বা ডিভাইস বদলালে হারিয়ে যায়, তাই পারমিট প্যাকেজ ও বিওকিউ নিয়মিত নামান। পুরোনো সংস্করণে সেভ করা প্রকল্প অ্যাপ প্রথম খুললে রূপান্তরিত হয়; পুরোনো কপি ব্যাকআপ হিসেবে অক্ষত থাকে।",
    },
    keywords: ["save", "saved", "storage", "lose", "delete", "backup", "সংরক্ষণ", "সেভ", "মুছ", "ব্যাকআপ"],
  },
  {
    id: "export", topic: "Export", sourceKind: "app", source: "App behaviour",
    question: { en: "How do I export the model or the BOQ?", bn: "মডেল বা BOQ কীভাবে এক্সপোর্ট করব?" },
    answer: {
      en: "On the 3D model screen use Export FreeCAD (.py) for a FreeCAD macro and Export IFC (.ifc) for BIM software. On the BOQ screen use Download CSV, on the Rebar schedule screen Download CSV, and on the Drawings screen the SVG, DXF and permit package buttons.",
      bn: "৩ডি মডেল স্ক্রিনে ফ্রিক্যাড ম্যাক্রোর জন্য Export FreeCAD (.py) এবং BIM সফটওয়্যারের জন্য Export IFC (.ifc) ব্যবহার করুন। বিওকিউ ও রিবার শিডিউল স্ক্রিনে সিএসভি ডাউনলোড এবং ড্রয়িং স্ক্রিনে এসভিজি, ডিএক্সএফ ও পারমিট প্যাকেজ বোতাম ব্যবহার করুন।",
    },
    keywords: ["export", "freecad", "ifc", "csv", "download", "bim", "এক্সপোর্ট", "ডাউনলোড"],
  },
  {
    id: "room-limits", topic: "Compliance", sourceKind: "app", source: "App behaviour (Compliance screen)",
    question: { en: "Are the minimum room sizes in the app official BNBC values?", bn: "অ্যাপের ন্যূনতম ঘরের আকারগুলো কি অফিসিয়াল BNBC মান?" },
    answer: {
      en: "Only where the row says so. Each plan check on the Compliance screen shows its basis: a cited BNBC figure, a working assumption, or a geometry fact. Anything the app cannot cite is shown as not checked instead of being passed. Confirm every limit against BNBC 2020 and the authority's rules before you submit.",
      bn: "কেবল যেখানে সারিতে তাই লেখা। কমপ্লায়েন্স স্ক্রিনের প্রতিটি প্ল্যান যাচাইয়ে ভিত্তি দেখানো থাকে: উদ্ধৃত বিএনবিসি মান, কাজ চালানোর অনুমান, অথবা জ্যামিতিক তথ্য। অ্যাপ যা উদ্ধৃত করতে পারে না তা পাস না দেখিয়ে যাচাই হয়নি দেখায়। জমার আগে প্রতিটি সীমা বিএনবিসি ২০২০ ও কর্তৃপক্ষের নিয়মের সাথে মিলিয়ে নিন।",
    },
    keywords: ["bnbc", "room", "minimum", "area", "official", "limit", "compliance", "ঘর", "ন্যূনতম", "বিএনবিসি"],
  },
  {
    id: "stairs", topic: "Stairs", sourceKind: "app", source: "App behaviour (stairBuilder)",
    question: { en: "How is the staircase designed?", bn: "সিঁড়ি কীভাবে ডিজাইন হয়?" },
    answer: {
      en: "A dog-legged RCC stair with 1000 mm flights, 250 mm treads and risers of at most 175 mm (relaxed to 190 mm risers and 230 mm treads if the stair room is small). It rises exactly from floor to floor, with an opening in each slab above and a head-room check. Stair loads are not modelled in the Structure screen.",
      bn: "১০০০ মিমি ফ্লাইটের ডগ-লেগড আরসিসি সিঁড়ি, ২৫০ মিমি ট্রেড, রাইজার সর্বোচ্চ ১৭৫ মিমি (সিঁড়িঘর ছোট হলে ১৯০ মিমি রাইজার ও ২৩০ মিমি ট্রেড)। এটি ঠিক তলা থেকে তলায় ওঠে, উপরের প্রতিটি স্ল্যাবে খোলা অংশ ও হেডরুম যাচাইসহ। স্ট্রাকচার স্ক্রিনে সিঁড়ির লোড ধরা হয়নি।",
    },
    keywords: ["stair", "staircase", "riser", "tread", "step", "সিঁড়ি", "সিড়ি", "ধাপ"],
  },
  {
    id: "setback", topic: "Setbacks", sourceKind: "rule", source: "RAJUK Imarat Nirman Bidhimala 2008, reviewed (rule pack rajuk-2008)",
    question: { en: "What setbacks does the app use?", bn: "অ্যাপ কোন সেটব্যাক ব্যবহার করে?" },
    answer: {
      en: "The RAJUK 2008 schedule, which depends on the plot area and the building height. The values come from the gazette tables and the Compliance screen shows each required setback beside the actual one with its clause. The road-width bonus of the rules is not applied, which is the conservative direction. Verify with the current RAJUK rules for your plot.",
      bn: "রাজউক ২০০৮-এর তফসিল, যা প্লটের আয়তন ও ভবনের উচ্চতার ওপর নির্ভর করে। মান গেজেটের সারণি থেকে, আর কমপ্লায়েন্স স্ক্রিন প্রতিটি প্রয়োজনীয় সেটব্যাক বাস্তব মানের পাশে ধারাসহ দেখায়। বিধির রাস্তার প্রস্থ-ভিত্তিক সুবিধা ধরা হয়নি, যা রক্ষণশীল দিক। আপনার প্লটের জন্য বর্তমান রাজউক নিয়মের সাথে মিলিয়ে নিন।",
    },
    keywords: ["setback", "front", "rear", "side", "far", "rajuk", "plot", "সেটব্যাক", "রাজউক", "প্লট"],
  },
  {
    id: "seismic", topic: "Seismic", sourceKind: "rule", source: "BNBC 2020 Part 6 Sec 2.5 (rule pack bnbc-2020-structure, candidate)",
    question: { en: "Which seismic factors does the app use?", bn: "অ্যাপ কোন ভূমিকম্প ফ্যাক্টর ব্যবহার করে?" },
    answer: {
      en: "For Dhaka: zone factor Z = 0.20, site class SD, occupancy category II (importance 1.00), special RC moment frames (R = 8, Cd = 5.5) and soil bearing 150 kPa. These are defaults you can change on the Structure screen; the rule pack is marked candidate, so confirm with your engineer and the code text.",
      bn: "ঢাকার জন্য: জোন ফ্যাক্টর Z = ০.২০, সাইট ক্লাস SD, অকুপেন্সি ক্যাটাগরি II (গুরুত্ব ১.০০), বিশেষ আরসি মোমেন্ট ফ্রেম (R = ৮, Cd = ৫.৫) এবং মাটির বহনক্ষমতা ১৫০ কিলোপ্যাসকেল। এগুলো ডিফল্ট, স্ট্রাকচার স্ক্রিনে বদলানো যায়; রুল প্যাকটি ক্যান্ডিডেট চিহ্নিত, তাই প্রকৌশলী ও কোডের মূল পাঠের সাথে মিলিয়ে নিন।",
    },
    keywords: ["seismic", "zone", "earthquake", "bnbc", "ভূমিকম্প", "জোন"],
  },
  {
    id: "katha", topic: "Units", sourceKind: "app", source: "App behaviour (land unit converter)",
    question: { en: "How big is a katha?", bn: "এক কাঠা কত বড়?" },
    answer: {
      en: "The app uses the Dhaka standard: 1 katha = 720 sq ft = 66.89 m², 1 shotok = 435.6 sq ft, 1 bigha = 20 katha and 1 gonda = 36 sq ft. Use the Land Units screen to convert between katha, shotok, bigha, gonda, square feet and square metres.",
      bn: "অ্যাপ ঢাকার মান ধরে: ১ কাঠা = ৭২০ বর্গফুট = ৬৬.৮৯ বর্গমিটার, ১ শতক = ৪৩৫.৬ বর্গফুট, ১ বিঘা = ২০ কাঠা ও ১ গন্ডা = ৩৬ বর্গফুট। কাঠা, শতক, বিঘা, গন্ডা, বর্গফুট ও বর্গমিটারের মধ্যে রূপান্তরে জমির একক স্ক্রিন ব্যবহার করুন।",
    },
    keywords: ["katha", "shotok", "bigha", "unit", "convert", "land", "area", "কাঠা", "শতক", "বিঘা", "জমি"],
  },
  {
    id: "no-ai", topic: "About the app", sourceKind: "app", source: "App behaviour",
    question: { en: "Does the app use AI or send my project anywhere?", bn: "অ্যাপ কি এআই ব্যবহার করে বা আমার প্রকল্প কোথাও পাঠায়?" },
    answer: {
      en: "No. Every number comes from fixed rules and formulas you can read, and the interview reads your answers with plain rules, not a model. All work happens in your browser, nothing is uploaded, and this help works offline.",
      bn: "না। প্রতিটি সংখ্যা নির্দিষ্ট নিয়ম ও সূত্র থেকে আসে যা পড়ে দেখা যায়, আর ইন্টারভিউ আপনার উত্তর সাধারণ নিয়মে বোঝে, কোনো মডেল দিয়ে নয়। সব কাজ আপনার ব্রাউজারেই হয়, কিছু আপলোড হয় না, আর এই সাহায্য অফলাইনেও চলে।",
    },
    keywords: ["ai", "artificial", "intelligence", "model", "privacy", "upload", "offline", "এআই", "ডেটা", "অফলাইন", "গোপনীয়তা"],
  },
  {
    id: "project-files", topic: "Projects", sourceKind: "app", source: "App behaviour (Projects screen, .archres files)",
    question: { en: "How do I back up a project or move it to another computer?", bn: "কীভাবে প্রকল্পের ব্যাকআপ রাখব বা অন্য কম্পিউটারে নেব?" },
    answer: {
      en: "On the Projects screen choose Export on a project, or Back up all. You get a .archres file. On the other computer choose Import file (or Open file on the first screen). An import never overwrites: if the same project is already there, the imported one is added as a copy marked (imported). Projects are kept only on this computer, so back up before clearing browser data or reinstalling.",
      bn: "প্রকল্প স্ক্রিনে কোনো প্রকল্পে এক্সপোর্ট বা সব প্রকল্পের ব্যাকআপ বেছে নিন; একটি .archres ফাইল পাবেন। অন্য কম্পিউটারে ফাইল খুলুন (ইমপোর্ট) বেছে নিন। ইমপোর্ট কখনো পুরোনো কাজ মুছে ফেলে না: একই প্রকল্প থাকলে নতুনটি (imported) চিহ্নিত কপি হিসেবে যোগ হয়। প্রকল্প শুধু এই কম্পিউটারে থাকে, তাই ব্রাউজারের ডেটা মোছা বা নতুন করে ইনস্টলের আগে ব্যাকআপ রাখুন।",
    },
    keywords: ["backup", "export", "import", "file", "archres", "move", "save", "ব্যাকআপ", "এক্সপোর্ট", "ইমপোর্ট", "ফাইল"],
  },
  {
    id: "pdf", topic: "Drawings", sourceKind: "app", source: "App behaviour (Drawings screen, src/drawings/pdf.ts)",
    question: { en: "Can I get the drawings as PDF?", bn: "নকশা কি পিডিএফ আকারে পাওয়া যায়?" },
    answer: {
      en: "Yes. On the Drawings screen choose Download all sheets (PDF) for one A3 file with every sheet, each at a standard scale (the scale is printed on the sheet). The permit package zip also holds the PDF next to the DXF and SVG files. The drawings are schematic and say so: they are not for construction and must be checked and signed by licensed professionals.",
      bn: "হ্যাঁ। ড্রয়িং স্ক্রিনে সব শিট পিডিএফ বেছে নিলে প্রতিটি শিট আদর্শ স্কেলে একটি এ৩ ফাইলে পাবেন (স্কেল শিটে ছাপা থাকে)। পারমিট প্যাকেজ জিপেও ডিএক্সএফ ও এসভিজির সঙ্গে পিডিএফ থাকে। নকশা প্রাথমিক এবং সেভাবেই লেখা: নির্মাণের জন্য নয়, লাইসেন্সপ্রাপ্ত পেশাজীবীর যাচাই ও স্বাক্ষর প্রয়োজন।",
    },
    keywords: ["pdf", "drawings", "print", "sheet", "a3", "permit", "পিডিএফ", "ড্রয়িং", "প্রিন্ট", "শিট"],
  },
  {
    id: "formwork-pour", topic: "Construction", sourceKind: "app", source: "App behaviour (Formwork and Pour sequence screens)",
    question: { en: "Where do the formwork and pour sequence numbers come from?", bn: "ফর্মওয়ার্ক ও ঢালাইয়ের ক্রমের সংখ্যা কোথা থেকে আসে?" },
    answer: {
      en: "From the same designed members as the Structure, Rebar and BOQ screens, so the totals agree. Formwork is the form contact area of footings, columns, beams, slabs and the lift shaft walls, priced at the SoR steel-form rates. The pour sequence lists the foundation, each storey's columns, each level's beams and slab, and the lift walls, with volumes that add up to the BOQ concrete. The pour rate (25 m³ a day) and the waiting days are assumptions: confirm with the contractor.",
      bn: "স্ট্রাকচার, রিবার ও বিওকিউ স্ক্রিনের সেই একই নকশাকৃত সদস্য থেকে, তাই মোট সংখ্যা মেলে। ফর্মওয়ার্ক হলো ফুটিং, কলাম, বিম, স্ল্যাব ও লিফট শাফটের দেয়ালের ফর্মের সংস্পর্শ ক্ষেত্রফল, এসওআর স্টিল ফর্ম দরে। ঢালাইয়ের ক্রমে ফাউন্ডেশন, প্রতি তলার কলাম, প্রতি স্তরের বিম ও স্ল্যাব এবং লিফটের দেয়াল থাকে; আয়তনের যোগফল বিওকিউয়ের কংক্রিটের সমান। ঢালাইয়ের হার (দিনে ২৫ ঘনমিটার) ও অপেক্ষার দিন অনুমান: ঠিকাদারের সঙ্গে নিশ্চিত করুন।",
    },
    keywords: ["formwork", "shuttering", "pour", "concrete", "sequence", "cure", "ফর্মওয়ার্ক", "ঢালাই", "ক্রম", "কংক্রিট"],
  },
  {
    id: "lift", topic: "Lift", sourceKind: "rule", source: "BNBC 2020 Part 8 Sec 4.2.1; src/model/lift.ts (assumptions)",
    question: { en: "How is the lift sized?", bn: "লিফট কীভাবে নির্ধারিত হয়?" },
    answer: {
      en: "A lift is required above six storeys or 20 m (BNBC 2020 Part 8). The app counts the flats served (5 people a flat, one lift per 40 flats) and picks a 630 kg or 1000 kg car; above ten storeys or 32 m it uses a stretcher car (platform at least 1275 x 2000 mm, cited). Car and shaft sizes, the 1.5 m pit and the 4.2 m overhead are assumptions, because the rule pack has no passenger-lift tables: confirm with the supplier. The shaft is drawn and costed as 150 mm reinforced concrete with the pit slab.",
      bn: "ছয় তলা বা ২০ মিটারের বেশি হলে লিফট বাধ্যতামূলক (বিএনবিসি ২০২০ পার্ট ৮)। অ্যাপ সেবা পাওয়া ফ্ল্যাট গোনে (প্রতি ফ্ল্যাটে ৫ জন, প্রতি ৪০ ফ্ল্যাটে একটি লিফট) এবং ৬৩০ বা ১০০০ কেজির কার বাছে; দশ তলা বা ৩২ মিটারের বেশিতে স্ট্রেচার কার (প্ল্যাটফর্ম কমপক্ষে ১২৭৫ x ২০০০ মিমি, সূত্রসহ)। কার ও শাফটের মাপ, ১.৫ মিটার পিট ও ৪.২ মিটার ওভারহেড অনুমান, কারণ নিয়ম-প্যাকে যাত্রীবাহী লিফটের সারণি নেই: সরবরাহকারীর সঙ্গে নিশ্চিত করুন। শাফট ১৫০ মিমি আরসিসি ও পিট স্ল্যাব হিসেবে আঁকা ও খরচে ধরা হয়।",
    },
    keywords: ["lift", "elevator", "shaft", "pit", "overrun", "stretcher", "লিফট", "শাফট", "পিট"],
  },
  {
    id: "parking", topic: "Compliance", sourceKind: "rule", source: "RAJUK 2008 Schedule 4 and section 56; src/rules/parking.ts",
    question: { en: "How is car parking checked?", bn: "গাড়ির পার্কিং কীভাবে যাচাই হয়?" },
    answer: {
      en: "The required spaces come from Schedule 4 (flats by size). The app then lays out real stalls on the open ground floor: cars 2.40 x 4.60 m and motorcycles 1.00 x 2.00 m (section 56), with a drive aisle along the building or from a front or side setback lane, columns taken as 600 mm squares, and stalls only inside the building footprint. The Compliance row is pass or fail with the counts. Ramp, gate and clearance rules are not checked.",
      bn: "প্রয়োজনীয় জায়গা তফসিল-৪ থেকে (ফ্ল্যাটের আকার অনুযায়ী)। এরপর অ্যাপ খোলা নিচতলায় আসল স্টল সাজায়: গাড়ি ২.৪০ x ৪.৬০ মিটার, মোটরসাইকেল ১.০০ x ২.০০ মিটার (ধারা ৫৬); ভবনের পাশ দিয়ে বা সামনে/পাশের সেটব্যাক লেন থেকে ড্রাইভ আইল, কলাম ৬০০ মিমি বর্গ ধরে, স্টল কেবল ভবনের ফুটপ্রিন্টের ভিতরে। কমপ্লায়েন্সের সারিতে সংখ্যাসহ পাস বা ফেল দেখায়। র‍্যাম্প, গেট ও ক্লিয়ারেন্সের নিয়ম যাচাই হয় না।",
    },
    keywords: ["parking", "car", "stall", "motorcycle", "schedule 4", "পার্কিং", "গাড়ি", "মোটরসাইকেল", "স্টল"],
  },
  {
    id: "balcony", topic: "Structure", sourceKind: "app", source: "App behaviour (src/structure/cantilever.ts, torsion.ts); BNBC 2020 Table 6.2.3",
    question: { en: "How is a balcony designed?", bn: "বারান্দা কীভাবে নকশা হয়?" },
    answer: {
      en: "A balcony in front of the first column line is a cantilever slab with no tip columns: depth from the L/10 rule, bending and shear designed with the BNBC combinations, the balcony live load 4.8 kN/m² (Table 6.2.3, multifamily) and an assumed 1.0 kN/m railing load. The edge beam under it is checked for shear plus torsion (ACI 318-08 method, an assumption) and gets closed stirrups and torsion bars in the bar schedule; the moment left for the slab behind it is reported, not re-checked.",
      bn: "প্রথম কলাম লাইনের সামনের বারান্দা প্রান্তে কলামহীন ক্যান্টিলিভার স্ল্যাব: গভীরতা L/10 নিয়মে, বেন্ডিং ও শিয়ার বিএনবিসি কম্বিনেশনে, বারান্দার লাইভ লোড ৪.৮ কিনি/মি² (সারণি ৬.২.৩, বহু-পরিবার) এবং ধরে নেওয়া ১.০ কিনি/মি রেলিং লোড। নিচের প্রান্ত-বিম শিয়ার ও টরশনের জন্য যাচাই হয় (ACI 318-08 পদ্ধতি, অনুমান) এবং রড-তালিকায় বদ্ধ স্টিরাপ ও টরশন রড পায়; পেছনের স্ল্যাবের জন্য বাকি মোমেন্ট দেখানো হয়, পুনরায় যাচাই হয় না।",
    },
    keywords: ["balcony", "cantilever", "torsion", "railing", "verandah", "বারান্দা", "ক্যান্টিলিভার", "টরশন", "রেলিং"],
  },
  {
    id: "screening", topic: "About", sourceKind: "app", source: "App behaviour",
    question: { en: "What does screening, not final design mean?", bn: "প্রাথমিক যাচাই, চূড়ান্ত নকশা নয় বলতে কী বোঝায়?" },
    answer: {
      en: "The app gives fast, consistent first answers from fixed rules: which plans fit your plot, whether RAJUK limits are met, member sizes, steel, quantities and schematic drawings. It does not replace a licensed architect and engineer: they must design, check and sign what goes to RAJUK or to site. Anything the rules cannot decide is shown as Not checked, and every assumption is listed on the screen or in the permit package.",
      bn: "অ্যাপ নির্দিষ্ট নিয়ম থেকে দ্রুত ও সামঞ্জস্যপূর্ণ প্রথম উত্তর দেয়: কোন প্ল্যান আপনার প্লটে আঁটে, রাজউকের সীমা মানা হয়েছে কি না, সদস্যের মাপ, রড, পরিমাণ ও প্রাথমিক নকশা। এটি লাইসেন্সপ্রাপ্ত স্থপতি ও প্রকৌশলীর বিকল্প নয়: রাজউক বা সাইটে যা যাবে তা তাঁদের নকশা, যাচাই ও স্বাক্ষর করতে হবে। নিয়ম দিয়ে যা ঠিক করা যায় না তা যাচাই হয়নি হিসেবে দেখায়, এবং প্রতিটি অনুমান স্ক্রিনে বা পারমিট প্যাকেজে তালিকাভুক্ত।",
    },
    keywords: ["screening", "final", "design", "sign", "engineer", "licensed", "disclaimer", "প্রাথমিক", "চূড়ান্ত", "স্বাক্ষর", "প্রকৌশলী"],
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
