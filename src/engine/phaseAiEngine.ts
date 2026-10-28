import { BuildingProject, PhaseItem } from "./projectState";
import { runArchieInference, ArchieInferenceResult } from "./archieCivilAi";

export interface AiPhaseReply {
  replyText: string;
  metrics: Record<string, string | number>;
  suggestedChips: string[];
  isPhaseSatisfied: boolean;
  cadParams?: ArchieInferenceResult["cadParams"];
}

export function getInitialGreeting(project: BuildingProject, phase: PhaseItem, lang: "en" | "bn"): string {
  const stories = project.stories;
  const plot = `${project.plotSize} ${project.plotUnit}`;

  if (lang === "bn") {
    switch (phase.kind) {
      case "site":
        return `নমস্কার! আপনার ${stories} তলা ভবনের (${plot} জমি) সাইট ও খনন পর্যায় শুরু করছি। আপনার প্লটের সামনের সড়ক কত ফুট চওড়া এবং কোনো মাটি পরীক্ষার রিপোর্ট আছে কি?`;
      case "foundation":
        return `ফাউন্ডেশন পর্যায়ে স্বাগতম। ${stories} তলা ভবনের জন্য আপনি কি অগভীর একক ফুটিং (Shallow Isolated Footings) চান, নাকি পাইলিং (Cast-in-situ Piles) প্রয়োজন? আপনার মাটির অবস্থা কেমন?`;
      case "ground_floor":
        return `নিচতলার পরিকল্পনা শুরু করা যাক। এই তলায় কয়টি গাড়ি পার্কিং, গার্ড রুম বা রিসেপশন চান? কোনো বিশেষ সুবিধা কি প্রয়োজন?`;
      case "floor":
        return `${phase.nameBn} এর পরিকল্পনা: প্রতি তলায় কয়টি ফ্ল্যাট/ইউনিট এবং কয়টি বেডরুম ও বারান্দা রাখতে চান?`;
      case "roof":
        return `ছাদ ও সীমানা প্রাচীর পরিকল্পনা: ছাদে কি বাগান (Green Roof), ওভারহেড পানির ট্যাংক ও লিফট মেশিন রুমের ব্যবস্থা রাখতে চান?`;
      case "utility":
        return `ইউটিলিটি ও সাধারণ সেবা: ভবনের সেপটিক ট্যাংক, পানির পাম্প, জেনারেটর এবং বৈদ্যুতিক সাব-স্টেশন সম্পর্কে আপনার কোনো বিশেষ নির্দেশনা আছে?`;
      default:
        return `এই পর্যায়ের প্রয়োজনীয় নির্দেশনা বা পরামর্শ প্রদান করুন।`;
    }
  }

  // English
  switch (phase.kind) {
    case "site":
      return `Welcome! Starting the Site & Excavation phase for your ${stories}-storey building on a ${plot} plot. What is your frontage road width, and do you have a soil investigation report?`;
    case "foundation":
      return `Welcome to the Foundation phase. For this ${stories}-storey structure, do you prefer shallow isolated footings or cast-in-situ bored piling? Tell me about your subsoil condition.`;
    case "ground_floor":
      return `Planning the Ground Floor: How many car parking bays, guard room, or reception area would you like to incorporate?`;
    case "floor":
      return `Planning ${phase.nameEn}: How many units per floor, and what room layout (Bedrooms, Living, Dining, Balconies) do you prefer?`;
    case "roof":
      return `Planning Rooftop & Boundary: Do you want a green terrace, overhead water reservoir sizing, and parapet wall height specifications?`;
    case "utility":
      return `Planning Utilities & Common Services: Septic tank dimensions, water reservoir, backup generator, and drainage requirements. Any preferences?`;
    default:
      return `Please provide your requirements for this phase.`;
  }
}

export function processPhaseUserMessage(
  project: BuildingProject,
  phase: PhaseItem,
  userMessage: string,
  lang: "en" | "bn",
): AiPhaseReply {
  const result = runArchieInference(project, phase, userMessage, lang);
  return {
    replyText: result.replyText,
    metrics: result.metrics,
    suggestedChips: result.suggestedChips,
    isPhaseSatisfied: result.isPhaseSatisfied,
    cadParams: result.cadParams,
  };
}

