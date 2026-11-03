/**
 * Phase planner — deterministic engineering guidance for the phase workflow.
 *
 * Replaces the former "Archie Civil AI" inference engine. Nothing here calls a model: the numbers
 * come from the project's own parameters (storeys, plot area, units per floor, chosen plan) and the
 * same formulas the BNBC/RAJUK screening uses elsewhere in the app, so a given project always
 * produces the same answer.
 */

import type { BuildingProject, PhaseItem } from "./projectState";
import { assignedTemplate } from "../data/floorplanSelection";
import { getTemplate } from "../data/floorplanLibrary";

export interface PhasePlanReply {
  replyText: string;
  metrics: Record<string, string | number>;
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

/** First number in `text` that follows `pattern`, or null. */
function numberFrom(text: string, pattern: RegExp): number | null {
  const match = text.match(pattern);
  if (!match) return null;
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined && !Number.isNaN(parseFloat(match[i]))) return parseFloat(match[i]);
  }
  return null;
}

const APPROVALS = ["approve", "next", "proceed", "yes", "done", "design", "start", "3d", "open", "অনুমোদন", "পরবর্তী", "ঠিক আছে", "হ্যাঁ"];

function isApprovalText(text: string): boolean {
  const msg = text.toLowerCase();
  return APPROVALS.some((word) => msg.includes(word));
}

function floorPlanLabel(project: BuildingProject): string | null {
  const template = assignedTemplate(project, project.unitsPerFloor || 1);
  if (template) return template.title;
  return getTemplate(project.floorplanId)?.title ?? null;
}

export function getInitialGreeting(project: BuildingProject, phase: PhaseItem, lang: "en" | "bn"): string {
  const stories = project.stories;
  const plot = `${project.plotSize} ${project.plotUnit}`;
  const plan = floorPlanLabel(project);

  if (lang === "bn") {
    switch (phase.kind) {
      case "site":
        return `আপনার ${stories} তলা ভবনের (${plot} জমি) সাইট ও খনন পর্যায় শুরু হলো। সামনের সড়কের চওড়া কত ফুট, এবং মাটি পরীক্ষার প্রতিবেদন আছে কি?`;
      case "foundation":
        return `ফাউন্ডেশন পর্যায়: ${stories} তলা ভবনের জন্য অগভীর আইসোলেটেড ফুটিং নাকি পাইলিং উপযুক্ত, তা মাটির অবস্থার ভিত্তিতে নির্ধারণ করা হবে।`;
      case "ground_floor":
        return "নিচতলার বিন্যাস: কতটি গাড়ি পার্কিং, গার্ড রুম বা রিসেপশন রাখতে চান?";
      case "floor":
        return `${phase.nameBn}: প্রতি তলায় ${project.unitsPerFloor} ইউনিট। ${plan ? `নির্বাচিত ২D প্ল্যান — ${plan}।` : ""} নিচের গ্যালারি থেকে প্ল্যান বদলাতে পারেন।`;
      case "roof":
        return "ছাদ ও সীমানা প্রাচীর: ছাদবাগান, পানির ট্যাংক ও লিফট মেশিন রুমের ব্যবস্থা রাখতে চান?";
      default:
        return "ইউটিলিটি ও সাধারণ সেবা: সেপটিক ট্যাংক, পানির পাম্প ও জেনারেটর সম্পর্কে নির্দেশনা দিন।";
    }
  }

  switch (phase.kind) {
    case "site":
      return `Starting the Site & Excavation phase for your ${stories}-storey building on a ${plot} plot. How wide is the front road, and do you have a soil investigation report?`;
    case "foundation":
      return `Foundation phase: for ${stories} storeys, isolated footings or bored piling will be chosen from the subsoil condition you describe.`;
    case "ground_floor":
      return "Ground floor: how many car parking bays, a guard room, or a reception area would you like?";
    case "floor":
      return `${phase.nameEn}: ${project.unitsPerFloor} unit(s) per floor. ${plan ? `Selected 2D plan — ${plan}.` : ""} Use the gallery below to change the plan.`;
    case "roof":
      return "Rooftop & boundary: do you want a green terrace, an overhead reservoir, and a lift machine room?";
    default:
      return "Utilities & common services: septic tank, water pump and backup generator requirements?";
  }
}

export function processPhaseUserMessage(
  project: BuildingProject,
  phase: PhaseItem,
  userMessage: string,
  lang: "en" | "bn",
): PhasePlanReply {
  const raw = (userMessage || "").trim();
  const msg = raw.toLowerCase();
  const isBn = lang === "bn";
  const stories = Math.max(1, Number(project.stories) || 2);
  const units = Math.max(1, Number(project.unitsPerFloor) || 1);
  const plotSqm = Number(project.plotSqm) || 200;
  const footprintSqm = Math.round(plotSqm * 0.65);
  const approved = isApprovalText(msg);
  const numeric = numberFrom(msg, /(\d+(?:\.\d+)?)/);

  if (phase.kind === "site") {
    const depthM = stories >= 6 ? 2.5 : 1.8;
    const volume = Math.round(footprintSqm * depthM * 1.15);
    return {
      replyText: isBn
        ? `সাইট বিশ্লেষণ: ${project.plotSize} ${project.plotUnit} প্লট (≈${Math.round(plotSqm)} m²)। রাজউক ২০০৮ অনুযায়ী সম্মুখ সেটব্যাক ১.৫০ মি, পশ্চাৎ ২.০০ মি ও পাশে ১.০০ মি। গড় খনন গভীরতা ${depthM} মি; ১৫% ওয়ার্কিং স্পেসসহ মোট খনন ≈${volume} m³।`
        : `Site analysis: ${project.plotSize} ${project.plotUnit} plot (≈${Math.round(plotSqm)} m²). RAJUK 2008 setbacks are 1.50 m front, 2.00 m rear and 1.00 m each side. Average excavation depth ${depthM} m; with 15% working space the total cut is ≈${volume} m³.`,
      metrics: {
        "Plot Area": `${project.plotSize} ${project.plotUnit} (${Math.round(plotSqm)} m²)`,
        "Excavation Depth": `${depthM} m`,
        "Excavation Volume": `${volume} m³`,
        "Front Setback": "1.50 m",
        "Rear Setback": "2.00 m",
      },
      suggestedChips: isBn
        ? ["ফাউন্ডেশন পর্যায়ে যান ➔", "খনন গভীরতা ৩ মিটার করুন"]
        : ["Proceed to Foundation ➔", "Set excavation to 3.0 m"],
      isPhaseSatisfied: approved,
    };
  }

  if (phase.kind === "foundation") {
    const wantsPile = msg.includes("pile") || msg.includes("পাইল") || stories >= 6;
    const wantsMat = msg.includes("mat") || msg.includes("raft") || msg.includes("ম্যাট");
    if (wantsMat) {
      return {
        replyText: isBn
          ? `ম্যাট/র্যাফট ফাউন্ডেশন: সম্পূর্ণ ফুটপ্রিন্ট (${footprintSqm} m²) জুড়ে ৬৫০ মিমি আরসিসি র্যাফট স্ল্যাব, C25 কংক্রিট ও ২০/১৬ মিমি ৬০-গ্রেড রড ১৫০ মিমি c/c।`
          : `Mat/raft foundation: a 650 mm RCC raft across the full ${footprintSqm} m² footprint, C25 concrete, 20/16 mm Grade-60 bars at 150 mm c/c top and bottom.`,
        metrics: {
          "Foundation Type": "Monolithic RCC Mat / Raft",
          "Raft Thickness": "650 mm",
          "Footprint": `${footprintSqm} m²`,
          "Concrete Grade": "C25",
        },
        suggestedChips: isBn ? ["ফাউন্ডেশন অনুমোদন করুন ➔", "নিচতলায় যান"] : ["Approve Foundation ➔", "Proceed to Ground Floor"],
        isPhaseSatisfied: approved,
        cadParams: { footingSizeMm: Math.round(Math.sqrt(footprintSqm) * 1000), footingDepthMm: 2200 },
      };
    }
    if (wantsPile) {
      const piles = Math.max(16, stories * 4);
      const depth = Math.max(16, Math.round(stories * 2.8));
      return {
        replyText: isBn
          ? `বোরড পাইল: ${piles} টি পাইল, ব্যাস ৫০০ মিমি, গভীরতা ${depth} মি। পাইল ক্যাপ ও ৩০০×৫৫০ মিমি গ্রেড বিম।`
          : `Bored piles: ${piles} piles at 500 mm diameter, ${depth} m deep, tied with 300×550 mm grade beams.`,
        metrics: {
          "Foundation Type": "Cast-in-situ Bored Piles",
          "Pile Count": `${piles}`,
          "Pile Diameter": "500 mm",
          "Pile Depth": `${depth} m`,
        },
        suggestedChips: isBn ? ["ফাউন্ডেশন অনুমোদন করুন ➔", "নিচতলায় যান"] : ["Approve Foundation ➔", "Proceed to Ground Floor"],
        isPhaseSatisfied: approved,
        cadParams: { footingSizeMm: 2200, footingDepthMm: 2000, columnWidthMm: 350, columnDepthMm: 350 },
      };
    }
    const pad = numeric && numeric >= 1.2 && numeric <= 3 ? numeric : stories >= 4 ? 2.0 : 1.8;
    return {
      replyText: isBn
        ? `আইসোলেটেড ফুটিং: ${pad} মি × ${pad} মি প্যাড (৪৫০ মিমি পুরু), ১.৮ মি গভীরে। ২৫০×৪০০ মিমি টাই-বিম ও ১৬ মিমি রড ১৫০ মিমি c/c।`
        : `Isolated footings: ${pad} m × ${pad} m pads, 450 mm thick at 1.8 m depth, tied by 250×400 mm grade beams with 16 mm bars at 150 mm c/c.`,
      metrics: {
        "Foundation Type": "Isolated RCC Footings",
        "Pad Size": `${pad} m × ${pad} m × 450 mm`,
        "Founding Depth": "1.8 m",
        "Tie Beams": "250 × 400 mm",
      },
      suggestedChips: isBn ? ["ফাউন্ডেশন অনুমোদন করুন ➔", "নিচতলায় যান"] : ["Approve Foundation ➔", "Proceed to Ground Floor"],
      isPhaseSatisfied: approved,
      cadParams: { footingSizeMm: Math.round(pad * 1000), footingDepthMm: 1800 },
    };
  }

  if (phase.kind === "ground_floor") {
    const cars = numeric && numeric >= 1 && numeric <= 10 ? Math.round(numeric) : Math.max(2, Math.round(stories * 0.8));
    return {
      replyText: isBn
        ? `নিচতলা: ${cars} টি পার্কিং বে (২.৫ × ৫.০ মি), ৩.৫ মি ড্রাইভওয়ে, গার্ড রুম ও ১৫০ মিমি আরসিসি পেভমেন্ট স্ল্যাব।`
        : `Ground floor: ${cars} parking bays (2.5 × 5.0 m), a 3.5 m driveway, a guard room and a 150 mm RCC pavement slab.`,
      metrics: {
        "Parking Bays": `${cars}`,
        "Driveway Width": "3.5 m",
        "Ground Slab": "150 mm RCC",
        "Guard Post": "100 sqft",
      },
      suggestedChips: isBn ? ["নিচতলা অনুমোদন করুন ➔", "১ম তলায় যান"] : ["Approve Ground Floor ➔", "Proceed to 1st Floor"],
      isPhaseSatisfied: approved,
    };
  }

  if (phase.kind === "floor") {
    const plan = assignedTemplate(project, units);
    const colDim = stories >= 6 ? 350 : 250;
    const balcony = numeric && numeric > 0 && numeric < 10 ? Math.min(2, Math.max(0.9, numeric)) : 1.2;
    const planLine = plan
      ? isBn
        ? `২D টেমপ্লেট: ${plan.title} (${plan.id}), ${plan.unitsPerFloor} ইউনিট/তলা — এই প্ল্যানটি একই ইউনিট সংখ্যার সব তলায় প্রযোজ্য।`
        : `2D template: ${plan.title} (${plan.id}), ${plan.unitsPerFloor} unit(s) per floor — this drawing applies to every floor with the same unit count.`
      : isBn
        ? "কোনো ২D টেমপ্লেট নির্বাচিত হয়নি; নিচের গ্যালারি থেকে বেছে নিন।"
        : "No 2D template selected yet — pick one from the gallery below.";
    return {
      replyText: `${planLine}\n${
        isBn
          ? `${units} ইউনিট/তলা, ১২৫ মিমি স্ল্যাব, ২৫০×৪৫০ মিমি বিম, ${colDim}×${colDim} মিমি কলাম ও ${balcony} মি বারান্দা।`
          : `${units} unit(s) per floor, 125 mm slab, 250×450 mm beams, ${colDim}×${colDim} mm columns and ${balcony} m balconies.`
      }`,
      metrics: {
        "Units per Floor": `${units}`,
        "2D Template": plan ? plan.id : "none",
        "Slab Thickness": "125 mm",
        "Column Sizing": `${colDim} × ${colDim} mm`,
        "Balcony Depth": `${balcony} m`,
      },
      suggestedChips: isBn
        ? ["এই তলা অনুমোদন করুন ➔", "পরবর্তী তলায় যান", "প্ল্যান গ্যালারি দেখুন"]
        : ["Approve Floor Plan ➔", "Proceed to Next Floor", "Open plan gallery"],
      isPhaseSatisfied: approved,
      cadParams: { balconyDepthMm: Math.round(balcony * 1000), columnWidthMm: colDim, columnDepthMm: colDim },
    };
  }

  if (phase.kind === "roof") {
    const tank = stories * 2500;
    return {
      replyText: isBn
        ? `ছাদ: ১.০ মি প্যারাপেট, ${tank} লিটার ওভারহেড ট্যাংক, ১:১০০ ঢাল ও ইলাস্টোমেরিক ওয়াটারপ্রুফিং।`
        : `Rooftop: 1.0 m parapet, a ${tank} litre overhead tank, 1:100 screed fall and elastomeric waterproofing.`,
      metrics: {
        "Parapet Height": "1.0 m",
        "Overhead Water Tank": `${tank} L`,
        "Waterproofing": "Elastomeric membrane",
      },
      suggestedChips: isBn ? ["ছাদ অনুমোদন করুন ➔", "ইউটিলিটিতে যান"] : ["Approve Rooftop ➔", "Proceed to Utilities"],
      isPhaseSatisfied: approved,
    };
  }

  const septic = Math.round(stories * units * 1.8);
  const reservoir = stories * units * 2000;
  return {
    replyText: isBn
      ? `ইউটিলিটি: ${septic} m³ দুই-কক্ষের সেপটিক ট্যাংক, ${reservoir} লিটার ভূগর্ভস্থ রিজার্ভার, ব্যাকআপ জেনারেটর ও প্রতিটি তলায় ফায়ার হোজ রিল।`
      : `Utilities: a ${septic} m³ two-chamber septic tank, a ${reservoir} litre underground reservoir, a standby generator and fire hose reels on every floor.`,
    metrics: {
      "Septic Tank": `${septic} m³`,
      "Underground Reservoir": `${reservoir} L`,
      "Standby Power": `${Math.round(stories * 7.5)} kVA`,
      "Fire Protection": "Wet riser + hose reels",
    },
    suggestedChips: isBn
      ? ["সব পর্যায় সম্পন্ন! ৩D ডিজাইন শুরু করুন 🚀"]
      : ["Start 3D Design Now 🚀"],
    isPhaseSatisfied: approved,
  };
}
