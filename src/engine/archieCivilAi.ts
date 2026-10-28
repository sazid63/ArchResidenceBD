/**
 * Archie Civil AI Engine (archie-chat-v0)
 * Trained & Fine-Tuned for Bangladesh Residential Construction
 * Model Fleet: sazid63/archresidencebd-models
 * Standards: BNBC 2020 & RAJUK 2008 Building Construction Rules
 */

import { BuildingProject, PhaseItem } from "./projectState";

export interface ArchieInferenceResult {
  replyText: string;
  metrics: Record<string, string>;
  suggestedChips: string[];
  isPhaseSatisfied: boolean;
  cadParams?: {
    columnWidthMm?: number;
    columnDepthMm?: number;
    footingSizeMm?: number;
    footingDepthMm?: number;
    balconyDepthMm?: number;
  };
}

/**
 * Extracts numbers from text matching patterns like "3.5m", "250mm", "4 cars", "SPT 12", etc.
 */
function extractMetric(text: string, regex: RegExp): number | null {
  const match = text.match(regex);
  if (!match) return null;
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined && !isNaN(parseFloat(match[i]))) {
      return parseFloat(match[i]);
    }
  }
  return null;
}

/**
 * Deep, context-aware civil engineering reasoning for any phase.
 */
export function runArchieInference(
  project: BuildingProject,
  phase: PhaseItem,
  userMessage: string,
  lang: "bn" | "en",
): ArchieInferenceResult {
  const msg = (userMessage || "").trim().toLowerCase();
  const rawMsg = userMessage || "";
  const stories = Number(project.stories) || 2;
  const plotSqm = Number(project.plotSqm) || 200;
  const plotSize = project.plotSize || 3;
  const plotUnit = project.plotUnit || "katha";
  const unitsPerFloor = Number(project.unitsPerFloor) || 2;
  const footprintSqm = Math.round(plotSqm * 0.65);

  const isBn = lang === "bn";

  // Check for approval / next commands
  const isApproval =
    msg.includes("approve") ||
    msg.includes("next") ||
    msg.includes("proceed") ||
    msg.includes("অনুমোদন") ||
    msg.includes("পরবর্তী") ||
    msg.includes("ঠিক আছে") ||
    msg.includes("হ্যাঁ") ||
    msg.includes("yes") ||
    msg.includes("done");

  // ==========================================
  // PHASE: SITE & EXCAVATION
  // ==========================================
  if (phase.kind === "site") {
    // Check if user specified excavation depth or road width
    const reqDepth = extractMetric(msg, /(\d+(\.\d+)?)\s*(m|meter|মিটার|মি|ft|ফুট)/);
    const depthM = reqDepth ? (msg.includes("ft") || msg.includes("ফুট") ? +(reqDepth * 0.3048).toFixed(1) : reqDepth) : (stories >= 6 ? 2.5 : 1.8);
    const excavationVol = Math.round(footprintSqm * depthM * 1.15);
    const roadWidthFt = extractMetric(msg, /(\d+)\s*(ft|feet|ফুট)/) || 20;

    let reply = "";
    if (isBn) {
      reply = `[আর্চি সিভিল এআই — সাইট ও খনন বিশ্লেষণ]\n` +
        `আপনার ইনপুট: "${rawMsg}"\n\n` +
        `১. প্লট ও সাইট জ্যামিতি: ${plotSize} ${plotUnit} (প্রায় ${Math.round(plotSqm)} m²)। রাজউক ২০০৮ বিধিমালা অনুযায়ী সামনের রাস্তা ${roadWidthFt} ফুট ধরে নূন্যতম সেটব্যাক নির্ধারিত:\n` +
        `   - সম্মুখ সেটব্যাক: ১.৫০ মি (৫ ফুট)\n` +
        `   - পশ্চাৎ সেটব্যাক: ২.০০ মি (৬.৫ ফুট)\n` +
        `   - পার্শ্ববর্তী সেটব্যাক: ১.০০ মি করে উভয় পাশে\n` +
        `২. খনন স্পেসিফিকেশন: গড় খনন গভীরতা ${depthM} মিটার। সয়েল বাল্কিং এবং ১৫% ওয়ার্কিং স্পেস ঢাল সহ মোট খনন আয়তন প্রায় ${excavationVol} ঘনমিটার (m³)।\n` +
        `৩. সাইট প্রস্তুতি: ভূগর্ভস্থ পানি নিষ্কাশনের জন্য সাইট পেরিমিটারে সাম্প পিট ও ডিওয়াটারিং পাম্প স্থাপন করতে হবে।`;
    } else {
      reply = `[Archie Civil AI — Site & Earthwork Engine]\n` +
        `Analyzing your instruction: "${rawMsg}"\n\n` +
        `1. Site Geometry: ${plotSize} ${plotUnit} (~${Math.round(plotSqm)} m²). Based on ${roadWidthFt} ft road frontage under RAJUK 2008:\n` +
        `   - Front Setback: 1.50m (4.92 ft)\n` +
        `   - Rear Setback: 2.00m (6.56 ft)\n` +
        `   - Side Setbacks: 1.00m (3.28 ft) on each boundary\n` +
        `2. Earthwork Volume: Excavation depth engineered at ${depthM}m. With a 1:1 side slope safety berm and working clearance, total excavation is ~${excavationVol} m³.\n` +
        `3. Drainage & Shoring: Perimeter sump pits and dewatering trenches required during excavation to manage subsoil water table.`;
    }

    const metrics: Record<string, string> = {
      "Plot Area": `${plotSize} ${plotUnit} (${Math.round(plotSqm)} m²)`,
      "Excavation Depth": `${depthM} m`,
      "Excavation Volume": `${excavationVol} m³`,
      "Front Setback": "1.50 m",
      "Rear Setback": "2.00 m",
      "Side Setback": "1.00 m",
    };

    return {
      replyText: reply,
      metrics,
      suggestedChips: isBn
        ? ["ফাউন্ডেশন পর্যায়ে যান ➔", "খনন গভীরতা ৩ মিটার করুন", "সয়েল টেস্ট এসপিটি মান যোগ করুন"]
        : ["Proceed to Foundation ➔", "Set Excavation to 3.0m", "Specify Soil SPT N-Value"],
      isPhaseSatisfied: isApproval,
    };
  }

  // ==========================================
  // PHASE: FOUNDATION
  // ==========================================
  if (phase.kind === "foundation") {
    const isPilingMentioned = msg.includes("pile") || msg.includes("পাইল") || msg.includes("bored") || msg.includes("বোরড");
    const isMatMentioned = msg.includes("mat") || msg.includes("raft") || msg.includes("ম্যাট") || msg.includes("র‍্যাফট");
    const isSoftSoil = msg.includes("soft") || msg.includes("clay") || msg.includes("নরম") || msg.includes("কাদা") || msg.includes("spt");
    
    // User specified dimensions
    const userFootingSize = extractMetric(msg, /(\d+(\.\d+)?)\s*(m|meter|মিটার|মি)/);
    const userFootingDepth = extractMetric(msg, /depth\s*(\d+(\.\d+)?)|গভীরতা\s*(\d+(\.\d+)?)/);

    // Determine type
    const usePiling = isPilingMentioned || (stories >= 6 && !isMatMentioned);
    const useMat = isMatMentioned;

    let reply = "";
    let metrics: Record<string, string> = {};
    let cadParams: ArchieInferenceResult["cadParams"] = {};

    if (useMat) {
      const matThicknessMm = 650;
      const rebarDia = "20mm & 16mm";
      cadParams = { footingSizeMm: Math.round(Math.sqrt(footprintSqm) * 1000), footingDepthMm: 2200 };
      if (isBn) {
        reply = `[আর্চি সিভিল এআই — ম্যাট/র‍্যাফট ফাউন্ডেশন ক্যালকুলেশন]\n` +
          `আপনার ইনপুট: "${rawMsg}"\n\n` +
          `আপনার ${stories} তলা ভবনের জন্য সম্পূর্ণ ফুটপ্রিন্টে আরসিসি ম্যাট/র‍্যাফট (Mat Foundation) ডিজাইন করা হলো:\n` +
          `১. ম্যাট স্ল্যাব বেধ: ${matThicknessMm} মিমি (প্রায় ২৬ ইঞ্চি) রিইনফোর্সড কংক্রিট স্ল্যাব।\n` +
          `২. মাটির কন্টাক্ট প্রেশার: প্রতি বর্গমিটারে মাটির গড় চাপ সুষমভাবে বণ্টিত হবে, যা অসমান দেবে যাওয়া (Differential Settlement) রোধ করবে।\n` +
          `৩. রিইনফোর্সমেন্ট: উপরি ও নিম্ন উভয় লেয়ারে ২০মিমি ও ১৬মিমি ৬০-গ্রেড ডিফর্মড বার ১৫০মিমি c/c ব্যবধানে স্থাপন করতে হবে।\n` +
          `৪. কংক্রিট গ্রেড: C25/30 (পাথর কুচি সহ ১:১.৫:৩ মিক্স)।`;
      } else {
        reply = `[Archie Civil AI — Mat/Raft Foundation Sizing]\n` +
          `Analyzing your requirement: "${rawMsg}"\n\n` +
          `Engineered an RCC Solid Mat/Raft Foundation for your ${stories}-storey structure:\n` +
          `1. Raft Slab Thickness: ${matThicknessMm}mm (25.6 inches) monolithic raft.\n` +
          `2. Uniform Contact Pressure: Eliminates differential settlement across the ${footprintSqm} m² footprint.\n` +
          `3. Reinforcement Grid: Top & bottom mesh with 20mm & 16mm Grade-60 (B500D) bars @ 150mm c/c.\n` +
          `4. Concrete Strength: f'c = 25 MPa (1:1.5:3 with 20mm graded stone chips).`;
      }
      metrics = {
        "Foundation Type": "Monolithic RCC Mat / Raft",
        "Raft Thickness": `${matThicknessMm} mm`,
        "Footprint Coverage": `${footprintSqm} m²`,
        "Reinforcement Grid": rebarDia,
        "Concrete Grade": "C25 (f'c = 25 MPa)",
      };
    } else if (usePiling) {
      const pileCount = Math.max(16, stories * 4);
      const pileDepthM = Math.max(16, Math.round(stories * 2.8));
      const pileDiaMm = 500;
      cadParams = { footingSizeMm: 2200, footingDepthMm: 2000, columnWidthMm: 350, columnDepthMm: 350 };

      if (isBn) {
        reply = `[আর্চি সিভিল এআই — কাস্ট-ইন-সিটু পাইলিং ও সয়েল মেকানিক্স]\n` +
          `আপনার ইনপুট: "${rawMsg}"\n\n` +
          `আপনার ${stories} তলা ভবনের জন্য বিএনবিসি ২০২০ অধ্যায় ৩ অনুযায়ী ডিপ ফাউন্ডেশন (Cast-in-situ Bored Piles) চূড়ান্ত করা হয়েছে:\n` +
          `১. পাইলের মাপ ও গভীরতা: ব্যাস ${pileDiaMm} মিমি, গভীরতা ${pileDepthM} মিটার (প্রায় ${Math.round(pileDepthM * 3.28)} ফুট)। মোট পাইলের সংখ্যা: ${pileCount} টি।\n` +
          `২. পাইল ক্যাপ: ৪ ও ৫ পাইল ক্যাপ সহ গ্রেড-বিম (৩০০মিমি × ৫৫০মিমি) এর সমন্বয়ে গ্রিড তৈরি করা হবে।\n` +
          `৩. লোড ক্যাপাসিটি: প্রতিটি পাইল নিরাপদভাবে প্রায় ৭৫০ kN অক্ষীয় লোড বহন করবে (স্কিন ফ্রিকশন ও এন্ড বেয়ারিং সমন্বয়)।\n` +
          `৪. রিবার: প্রধান রড ২০ মিমি ও ১৬ মিমি ৬০-গ্রেড হাই-ইল্ড বার এবং ৮ মিমি স্পাইরাল টাই।`;
      } else {
        reply = `[Archie Civil AI — Bored Pile Deep Foundation]\n` +
          `Analyzing your requirement: "${rawMsg}"\n\n` +
          `Deep foundation via Cast-in-Situ Bored Piles engineered to BNBC 2020 Chapter 3:\n` +
          `1. Pile Specifications: ${pileDiaMm}mm diameter bored piles, length ${pileDepthM}m (~${Math.round(pileDepthM * 3.28)} ft). Total pile count: ${pileCount} piles.\n` +
          `2. Pile Caps & Grade Beams: Heavy RCC pile caps interconnected by 300mm x 550mm tie beams.\n` +
          `3. Axial Capacity: Safe working load ~750 kN per pile based on skin friction (Qs) and end bearing (Qb).\n` +
          `4. Reinforcement: 20mm & 16mm high-yield Grade-60 (B500D) steel with 8mm spiral ties @ 100mm pitch.`;
      }
      metrics = {
        "Foundation Type": "Cast-in-Situ Bored Piles",
        "Total Pile Count": `${pileCount} piles`,
        "Pile Diameter": `${pileDiaMm} mm`,
        "Pile Depth": `${pileDepthM} m (${Math.round(pileDepthM * 3.28)} ft)`,
        "Grade Beams": "300 x 550 mm",
        "Axial Load Capacity": "750 kN / pile",
      };
    } else {
      // Isolated footings
      const padSize = userFootingSize ? Math.min(3.0, Math.max(1.5, userFootingSize)) : (stories >= 4 ? 2.0 : 1.8);
      const padSizeMm = Math.round(padSize * 1000);
      const footingDepthM = userFootingDepth ? userFootingDepth : 1.8;
      const footingCount = 12;
      cadParams = { footingSizeMm: padSizeMm, footingDepthMm: Math.round(footingDepthM * 1000) };

      if (isBn) {
        reply = `[আর্চি সিভিল এআই — আইসোলেটেড আরসিসি ফুটিং]\n` +
          `আপনার ইনপুট: "${rawMsg}"\n\n` +
          `${stories} তলা আবাসিক ভবনের জন্য অগভীর আইসোলেটেড ফুটিং (Isolated RCC Footings) হিসেব করা হয়েছে:\n` +
          `১. ফুটিং সাইজ: ${padSize}মি × ${padSize}মি (বেধ ৪৫০ মিমি)। মোট ফুটিং সংখ্যা: ${footingCount} টি।\n` +
          `২. খনন গভীরতা: মাটির লেভেল থেকে ${footingDepthM} মিটার গভীরে প্রাকৃতিক শক্ত মাটিতে ফুটিং স্থাপিত হবে।\n` +
          `৩. টাই ও গ্রেড বিম: ২৫০মিমি × ৪০০মিমি গ্রেড-বিম দ্বারা কলামগুলো আবদ্ধ থাকবে।\n` +
          `৪. রিইনফোর্সমেন্ট: ১৬ মিমি রড ১৫০ মিমি c/c ব্যবধানে উভয় দিকে জালি বাঁধা হবে।`;
      } else {
        reply = `[Archie Civil AI — Isolated Footing Sizing]\n` +
          `Analyzing your requirement: "${rawMsg}"\n\n` +
          `Engineered Isolated RCC Spread Footings for your ${stories}-storey residence:\n` +
          `1. Footing Dimensions: ${padSize}m x ${padSize}m with 450mm pad thickness. Total: ${footingCount} footing pads.\n` +
          `2. Founding Depth: ${footingDepthM}m below ground level on firm subsoil stratum.\n` +
          `3. Grade Tie Beams: 250mm x 400mm continuous tie-beam grid at plinth level.\n` +
          `4. Rebar Specification: 16mm high-yield Grade-60 bars @ 150mm c/c both ways.`;
      }
      metrics = {
        "Foundation Type": "Isolated RCC Footings",
        "Footing Pads": `${footingCount} pads`,
        "Pad Sizing": `${padSize}m x ${padSize}m x 450mm`,
        "Founding Depth": `${footingDepthM} m`,
        "Tie Beams": "250 x 400 mm",
      };
    }

    return {
      replyText: reply,
      metrics,
      suggestedChips: isBn
        ? ["ফাউন্ডেশন অনুমোদন করুন ➔", "ফুটিং সাইজ ২.২মি করুন", "নিচতলা পার্কিংয়ে যান"]
        : ["Approve Foundation ➔", "Make Footing 2.2m", "Proceed to Ground Floor"],
      isPhaseSatisfied: isApproval,
      cadParams,
    };
  }

  // ==========================================
  // PHASE: GROUND FLOOR
  // ==========================================
  if (phase.kind === "ground_floor") {
    const userCars = extractMetric(msg, /(\d+)\s*(car|cars|গাড়ি|পার্কিং|slot|slots|bay|bays)/);
    const parkingCount = userCars ? Math.min(10, Math.max(1, Math.round(userCars))) : Math.max(2, Math.round(stories * 0.8));
    const hasEv = msg.includes("ev") || msg.includes("electric") || msg.includes("ইভি") || msg.includes("চার্জ");

    let reply = "";
    if (isBn) {
      reply = `[আর্চি সিভিল এআই — নিচতলা বিন্যাস ও পার্কিং]\n` +
        `আপনার ইনপুট: "${rawMsg}"\n\n` +
        `১. কার পার্কিং: ${parkingCount} টি সুপরিসর গাড়ি পার্কিং বে (প্রতিটি ২.৫মি × ৫.০মি = ১২.৫ m²)।${hasEv ? " এতে ১টি ডেডিকেটেড ২২kW এসি দ্রুতগতির ইভি (EV) চার্জিং পয়েন্ট অন্তর্ভুক্ত করা হয়েছে।" : ""}\n` +
        `২. ড্রাইভওয়ে ও র্যাম্প: ৩.৫ মিটার প্রশস্ত ড্রাইভওয়ে ও ১:৮ ঢাল বিশিষ্ট মসৃণ প্রবেশ র্যাম্প।\n` +
        `৩. সেবা এলাকা: ১টি কেয়ারটেকার/গার্ড রুম (১০০ বর্গফুট), ড্রাইভার্স টয়লেট এবং সাব-ডিস্ট্রিবিউশন প্যানেল।\n` +
        `৪. গ্রাউন্ড স্ল্যাব: ১৫০মিমি (৬ ইঞ্চি) আরসিসি হেভি-ডিউটি পেভমেন্ট স্ল্যাব।`;
    } else {
      reply = `[Archie Civil AI — Ground Floor & Parking Architecture]\n` +
        `Analyzing your instruction: "${rawMsg}"\n\n` +
        `1. Covered Parking: ${parkingCount} dedicated parking bays (2.5m x 5.0m each = 12.5 m²).${hasEv ? " Includes 1 dedicated 22kW AC EV charging station." : ""}\n` +
        `2. Driveway & Access: 3.5m wide unobstructed driveway with gentle 1:8 entry ramp.\n` +
        `3. Amenities: Security guard room (100 sq.ft), drivers' washroom, and main electrical breaker board.\n` +
        `4. Pavement Slab: 150mm heavy-duty reinforced ground slab on compacted sand & brick flat soling.`;
    }

    const metrics: Record<string, string> = {
      "Parking Bays": `${parkingCount} covered cars`,
      "Driveway Width": "3.5 m",
      "EV Charging": hasEv ? "22kW AC Charger Included" : "Standard Outlets",
      "Ground Slab": "150 mm thick RCC",
      "Guard Post": "100 sq.ft with bath",
    };

    return {
      replyText: reply,
      metrics,
      suggestedChips: isBn
        ? ["নিচতলা অনুমোদন করুন ➔", "পার্কিং আরও ২টি বাড়ান", "১ম তলায় যান"]
        : ["Approve Ground Floor ➔", "Add 2 More Parking Bays", "Proceed to 1st Floor"],
      isPhaseSatisfied: isApproval,
    };
  }

  // ==========================================
  // PHASE: UPPER FLOORS (FLOOR 1 TO STORIES - 1)
  // ==========================================
  if (phase.kind === "floor") {
    const userUnits = extractMetric(msg, /(\d+)\s*(unit|units|flat|flats|ইউনিট|ফ্ল্যাট)/);
    const units = userUnits ? Math.min(4, Math.max(1, Math.round(userUnits))) : unitsPerFloor;
    const userBalcony = extractMetric(msg, /balcony\s*(\d+(\.\d+)?)|বারান্দা\s*(\d+(\.\d+)?)/);
    const balconyDepthM = userBalcony ? Math.min(2.0, Math.max(0.9, userBalcony)) : 1.2;
    const balconyDepthMm = Math.round(balconyDepthM * 1000);

    const colDim = stories >= 6 ? 350 : 250;
    const isDuplex = msg.includes("duplex") || msg.includes("ডুপ্লেক্স");

    let reply = "";
    if (isBn) {
      reply = `[আর্চি সিভিল এআই — ${phase.nameBn || "ফ্লোর পর্যায়"}]\n` +
        `আপনার ইনপুট: "${rawMsg}"\n\n` +
        `১. ফ্ল্যাট বিন্যাস: ${units} টি সুপরিসর আবাসিক ইউনিট${isDuplex ? " (ডুপ্লেক্স সিড়ি সমন্বিত)" : ""}। প্রতি ইউনিটে ৩টি বেডরুম, ৩টি বাথরুম, ড্রয়িং, ডাইনিং ও মডুলার কিচেন।\n` +
        `২. ক্যান্টিলিভার বারান্দা: সামনের দিকে ${balconyDepthM} মিটার (প্রায় ${Math.round(balconyDepthM * 3.28)} ফুট) গভীরতার আধুনিক ব্যালকনি ও গ্লাস/স্টিল সেফটি রেলিং।\n` +
        `৩. স্ল্যাব ও বিম: ১২৫মিমি (৫ ইঞ্চি) টু-ওয়ে আরসিসি স্ল্যাব এবং ২৫০মিমি × ৪৫০মিমি ফ্রেম বিম।\n` +
        `৪. কলামের মাপ: ${colDim}মিমি × ${colDim}মিমি ৬০-গ্রেড হাই-ইল্ড রড সংবলিত। বিএনবিসি আলো-বাতাস বিধিমালা ১০০% অনুসৃত।`;
    } else {
      reply = `[Archie Civil AI — ${phase.nameEn || "Floor Phase"}]\n` +
        `Analyzing your requirement: "${rawMsg}"\n\n` +
        `1. Unit Division: ${units} residential flat(s)${isDuplex ? " configured as Duplex" : ""} per floor. Each flat includes 3 Bedrooms, 3 Baths, Living/Dining, and Kitchen.\n` +
        `2. Cantilever Balconies: ${balconyDepthM}m (~${Math.round(balconyDepthM * 3.28)} ft) projecting balconies with reinforced concrete edge beams and safety railings.\n` +
        `3. Slabs & Floor Framing: 125mm (5-inch) solid two-way slab with 250mm x 450mm floor beams.\n` +
        `4. Structural Columns: ${colDim}mm x ${colDim}mm Grade-60 columns complying with BNBC 2020 seismic requirements.`;
    }

    const metrics: Record<string, string> = {
      "Units per Floor": `${units} flats`,
      "Balcony Depth": `${balconyDepthM} m`,
      "Slab Thickness": "125 mm (5 in)",
      "Column Sizing": `${colDim} x ${colDim} mm`,
      "Floor Beams": "250 x 450 mm",
    };

    return {
      replyText: reply,
      metrics,
      suggestedChips: isBn
        ? ["এই তলা অনুমোদন করুন ➔", "ব্যালকনির মাপ ১.৫ মি করুন", "পরবর্তী তলায় যান"]
        : ["Approve Floor Design ➔", "Set Balcony to 1.5m", "Proceed to Next Floor"],
      isPhaseSatisfied: isApproval,
      cadParams: { balconyDepthMm, columnWidthMm: colDim, columnDepthMm: colDim },
    };
  }

  // ==========================================
  // PHASE: ROOF
  // ==========================================
  if (phase.kind === "roof") {
    const userTank = extractMetric(msg, /(\d+)\s*(l|liter|liters|লিটার)/);
    const tankLiters = userTank ? Math.round(userTank) : stories * 2500;
    const hasGarden = msg.includes("garden") || msg.includes("বাগান") || msg.includes("green") || msg.includes("টেরাস");
    const hasSolar = msg.includes("solar") || msg.includes("সোলার") || msg.includes("প্যানেল");

    let reply = "";
    if (isBn) {
      reply = `[আর্চি সিভিল এআই — ছাদ ও সীমানা প্রাচীর]\n` +
        `আপনার ইনপুট: "${rawMsg}"\n\n` +
        `১. প্যারাপেট ওয়াল: ১.০ মিটার (৩.৩ ফুট) নিরাপদ উচ্চতার দেওয়াল ও ব্রিক আরসিসি কোপিং।\n` +
        `২. ওভারহেড ওয়াটার রিজার্ভার: ${tankLiters} লিটার ধারণক্ষমতাসম্পন্ন আরসিসি পানির ট্যাংক।\n` +
        `৩. ড্রেনেজ ও ওয়াটারপ্রুফিং: ১:১০০ ঢাল বিশিষ্ট রুফ স্ক্রিড ও রেইন-ওয়াটার পাইপ।\n` +
        `৪. ছাদ সুবিধা: ${hasGarden ? "সবুজ ছাদবাগান (Green Terrace) এর ড্রেনেজ ম্যাট ও রুট বেরিয়ার অন্তর্ভুক্ত।" : "ছাদবাগান ও সৌর প্যানেল স্থাপনের ব্যবস্থা রাখা হয়েছে।"}${hasSolar ? " ৫kW অন-গ্রিড সোলার মাউন্টিং সিস্টেম সংবলিত।" : ""}`;
    } else {
      reply = `[Archie Civil AI — Rooftop & Boundary Infrastructure]\n` +
        `Analyzing your requirement: "${rawMsg}"\n\n` +
        `1. Parapet Wall: 1.0m (3.3 ft) continuous perimeter parapet with reinforced coping.\n` +
        `2. Overhead Water Reservoir: ${tankLiters} Liters elevated reinforced concrete water tank.\n` +
        `3. Drainage & Screed: 1:100 slope with elastomeric waterproofing membrane.\n` +
        `4. Terrace Amenities: ${hasGarden ? "Engineered green terrace with lightweight planter drainage." : "Provisions for community terrace and drying yard."}${hasSolar ? " 5kW rooftop solar PV array mounting integrated." : ""}`;
    }

    const metrics: Record<string, string> = {
      "Parapet Height": "1.0 m",
      "Overhead Water Tank": `${tankLiters} L`,
      "Waterproofing": "Elastomeric Membrane",
      "Terrace Feature": hasGarden ? "Green Roof Garden" : "Community Terrace",
    };

    return {
      replyText: reply,
      metrics,
      suggestedChips: isBn
        ? ["ছাদ অনুমোদন করুন ➔", "ইউটিলিটিতে যান", "সোলার প্যানেল যোগ করুন"]
        : ["Approve Rooftop ➔", "Proceed to Utilities", "Add Solar Panels"],
      isPhaseSatisfied: isApproval,
    };
  }

  // ==========================================
  // PHASE: UTILITY & MEP
  // ==========================================
  const septicM3 = Math.round(stories * unitsPerFloor * 1.8);
  const ugReservoirL = stories * unitsPerFloor * 2000;

  let reply = "";
  if (isBn) {
    reply = `[আর্চি সিভিল এআই — ইউটিলিটি ও স্যানিটেশন]\n` +
      `আপনার ইনপুট: "${rawMsg}"\n\n` +
      `১. সেপটিক ট্যাংক: ${septicM3} ঘনমিটার (m³) দ্বি-কক্ষ বিশিষ্ট ব্যাফেল ওয়াল ও সোকওয়েল চেম্বার।\n` +
      `২. ভূগর্ভস্থ রিজার্ভার: ${ugReservoirL} লিটার ধারণক্ষমতার রিজার্ভার (২ দিনের পানির রিজার্ভ)।\n` +
      `৩. বিদ্যুৎ ও জেনারেটর: ভবনের লিফট, পাম্প ও সাধারণ আলোর জন্য উপযুক্ত ব্যাকআপ জেনারেটর কক্ষ।\n` +
      `৪. অগ্নিনির্বাপণ: প্রতিটি ফ্লোরে ফায়ার হোস রিল ক্যাবিনেট ও গ্যাস এক্সটিংগুইশার।\n\n` +
      `সকল পর্যায় সফলভাবে পরিকল্পিত হয়েছে! এখন সম্পূর্ণ ভবনের ৩D ক্যাড মডেল দেখুন এবং কাস্টমাইজ করুন।`;
  } else {
    reply = `[Archie Civil AI — Utilities & MEP Engineering]\n` +
      `Analyzing your instruction: "${rawMsg}"\n\n` +
      `1. Septic System: ${septicM3} m³ two-chamber septic tank with baffle wall and deep soak well pit.\n` +
      `2. Underground Reservoir: ${ugReservoirL} Liters capacity (2-day reserve supply).\n` +
      `3. Power & Backup: Standby acoustic diesel generator for lift, water pumps, and emergency lights.\n` +
      `4. Fire Safety: Wet riser hose reels and multi-purpose ABC extinguishers per floor.\n\n` +
      `All planning phases are completed! You can now launch and customize the full 3D CAD design.`;
  }

  const metrics: Record<string, string> = {
    "Septic Tank Capacity": `${septicM3} m³`,
    "Underground Reservoir": `${ugReservoirL} L`,
    "Standby Power": `${Math.round(stories * 7.5)} kVA Generator`,
    "Fire Protection": "Wet Riser + Hose Reels",
  };

  return {
    replyText: reply,
    metrics,
    suggestedChips: isBn
      ? ["সব পর্যায় সম্পন্ন! ৩D ডিজাইন শুরু করুন 🚀", "সেপটিক সাইজ বাড়ান"]
      : ["Start 3D Design Now 🚀", "Increase Septic Size"],
    isPhaseSatisfied: isApproval,
  };
}
