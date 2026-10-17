import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "bn" | "en";

const en = {
  appName: "ArchResidenceBD",
  tagline: "Your AI civil engineer",
  projects: "Projects",
  newProject: "New Project",
  projectSetup: "Project Setup",
  phase: "Phase",
  design: "Design",
  designFinal: "Final (combined master)",
  boq: "BOQ",
  documents: "Documents",
  drawings: "Drawings",
  bbs: "BBS",
  reports: "Reports",
  engineerPack: "Engineer Pack",
  siteExcavation: "Site & Excavation",
  foundation: "Foundation",
  roofBoundary: "Roof & Boundary",
  commonServices: "Common Services",
  notStarted: "Not started",
  gatheringInfo: "Gathering info",
  drafted: "Drafted",
  designed: "Designed",
  stale: "Needs update",
  stories: "{n} stories",
  units: "{n} units/floor",
  lastUpdated: "Updated {date}",
  location: "Location",
  division: "Division",
  district: "District",
  area: "Area",
  plotSize: "Plot size",
  landUnitHint: "≈ {sqm} m² (land-unit module)",
  storiesLabel: "Stories",
  unitsLabel: "Units per floor",
  prices: "Material prices",
  pricesOptional: "Optional — skip and current prices are fetched for you",
  soil: "Soil data",
  soilAssumption: "Assumption — verify on site",
  soilDefault: "No soil report on file — using the conservative area default (SBC 65 kPa).",
  saveSetup: "Save setup",
  chatPlaceholder: "Type in Bangla or English…",
  send: "Send",
  phaseInfo: "Phase info",
  designPhase: "Design this phase",
  provenance: "Provenance",
  provenanceNote: "Rule pack rajuk@2008.1 · prices fetched 2026-10-01",
  chatAi1: "Let's start the Foundation phase. Do you know anything about the soil below your plot?",
  chipHaveReport: "I have a soil test report",
  chipDontKnow: "Don't know — use defaults",
  chipEstimate: "You estimate it",
  chatUser1: "Don't know",
  chatAi2: "Okay — using the conservative Dhaka-area assumption: SBC 65 kPa. This is an assumption — please verify on site. I'll work out the footing depth from it.",
  designTitle: "Design — combined master",
  designPreview: "3D preview · NativeCAD (prototype)",
  rebuildAll: "Rebuild all",
  lastRun: "Last run",
  modelVersion: "Model",
  phaseToggles: "Phases",
  boqTitle: "BOQ — divided by phase",
  item: "Item",
  typeCol: "Type",
  unitCol: "Unit",
  qty: "Qty",
  rate: "Rate",
  amount: "Amount",
  subtotal: "Subtotal",
  grandTotal: "Grand total",
  costMaterial: "Material",
  costLabour: "Labour",
  costMachinery: "Machinery",
  costSubcontract: "Subcontract",
  deviation: "Deviation",
  priceNote: "Prices: mixed provenance · as of 2026-10-01",
  docsTitle: "Documents",
  openFolder: "Open folder",
  exportLabel: "Export",
  engineerPending: "Engineer validation pending — Launch Plan",
  drawingsDesc: "Full set — PDF + DXF (English labels per BD industry norm)",
  bbsDesc: "Bar marks, cutting lengths, shapes — xlsx + PDF",
  reportsDesc: "Compliance audit + Deviation Register",
  engineerPackDesc: "Spec, drawings, BBS, BOQ, deviations — one handoff pack",
  docsReady: "Ready",
  docsDraft: "Draft",
  sheets: "{n} sheets",
  designPhaseStat: "Phase designs",
};

const bn: typeof en = {
  appName: "ArchResidenceBD",
  tagline: "আপনার এআই সিভিল ইঞ্জিনিয়ার",
  projects: "প্রকল্পসমূহ",
  newProject: "নতুন প্রকল্প",
  projectSetup: "প্রকল্প সেটআপ",
  phase: "পর্যায়",
  design: "ডিজাইন",
  designFinal: "চূড়ান্ত (সম্মিলিত মডেল)",
  boq: "প্রাক্কলন (BOQ)",
  documents: "নথিপত্র",
  drawings: "ড্রয়িং",
  bbs: "রিবার সূচি (BBS)",
  reports: "রিপোর্ট",
  engineerPack: "ইঞ্জিনিয়ার প্যাক",
  siteExcavation: "সাইট ও খনন",
  foundation: "ফাউন্ডেশন",
  roofBoundary: "ছাদ ও সীমানা প্রাচীর",
  commonServices: "সাধারণ সেবা",
  notStarted: "শুরু হয়নি",
  gatheringInfo: "তথ্য সংগ্রহে",
  drafted: "খসড়া",
  designed: "ডিজাইনকৃত",
  stale: "হালনাগাদ দরকার",
  stories: "{n} তলা",
  units: "প্রতি তলায় {n} ইউনিট",
  lastUpdated: "হালনাগাদ: {date}",
  location: "অবস্থান",
  division: "বিভাগ",
  district: "জেলা",
  area: "এলাকা",
  plotSize: "জমির পরিমাণ",
  landUnitHint: "≈ {sqm} বর্গমিটার (ল্যান্ড-ইউনিট মডিউল)",
  storiesLabel: "তলা সংখ্যা",
  unitsLabel: "প্রতি তলায় ইউনিট",
  prices: "উপকরণের দাম",
  pricesOptional: "ঐচ্ছিক — বাদ দিলে সর্বশেষ দাম সংগ্রহ করা হবে",
  soil: "মাটির তথ্য",
  soilAssumption: "অনুমান — সাইটে যাচাই করুন",
  soilDefault: "মাটি পরীক্ষার রিপোর্ট নেই — ঢাকা অঞ্চলের রক্ষণশীল ডিফল্ট ব্যবহার হচ্ছে (SBC ৬৫ kPa)।",
  saveSetup: "সেটআপ সংরক্ষণ",
  chatPlaceholder: "বাংলা বা ইংরেজিতে লিখুন…",
  send: "পাঠান",
  phaseInfo: "পর্যায়ের তথ্য",
  designPhase: "এই পর্যায়ের ডিজাইন",
  provenance: "সূত্র",
  provenanceNote: "রুল প্যাক rajuk@2008.1 · দাম সংগ্রহ ২০২৬-১০-০১",
  chatAi1: "ফাউন্ডেশন পর্যায় শুরু করি। আপনার জমির নিচের মাটি সম্পর্কে কিছু জানা আছে কি?",
  chipHaveReport: "মাটি পরীক্ষার রিপোর্ট আছে",
  chipDontKnow: "জানা নেই — ডিফল্ট ব্যবহার করুন",
  chipEstimate: "আপনি অনুমান করে নিন",
  chatUser1: "জানা নেই",
  chatAi2: "ঠিক আছে — ঢাকা অঞ্চলের জন্য রক্ষণশীল ধরে নিচ্ছি: SBC ৬৫ kPa। এটি একটি অনুমান — সাইটে যাচাই করবেন। ফুটিং গভীরতা আমি হিসাব করে দিচ্ছি।",
  designTitle: "ডিজাইন — সম্মিলিত মাস্টার",
  designPreview: "ত্রিমাত্রিক প্রিভিউ · NativeCAD (প্রোটোটাইপ)",
  rebuildAll: "সব পুনর্নির্মাণ",
  lastRun: "শেষ রান",
  modelVersion: "মডেল",
  phaseToggles: "পর্যায়সমূহ",
  boqTitle: "প্রাক্কলন — পর্যায় অনুযায়ী",
  item: "খাত",
  typeCol: "ধরন",
  unitCol: "একক",
  qty: "পরিমাণ",
  rate: "দর",
  amount: "টাকা",
  subtotal: "উপমোট",
  grandTotal: "সর্বমোট",
  costMaterial: "উপকরণ",
  costLabour: "শ্রম",
  costMachinery: "যন্ত্রপাতি",
  costSubcontract: "সাব-কন্ট্রাক্ট",
  deviation: "ব্যতিক্রম",
  priceNote: "দাম: মিশ্র সূত্র · ২০২৬-১০-০১ অনুযায়ী",
  docsTitle: "নথিপত্র",
  openFolder: "ফোল্ডার খুলুন",
  exportLabel: "এক্সপোর্ট",
  engineerPending: "ইঞ্জিনিয়ার যাচাই বাকি — লঞ্চ প্ল্যান",
  drawingsDesc: "সম্পূর্ণ সেট — PDF + DXF",
  bbsDesc: "রিবার মার্ক, কাটিং দৈর্ঘ্য, শেপ — xlsx + PDF",
  reportsDesc: "কমপ্লায়েন্স অডিট + ডেভিয়েশন রেজিস্টার",
  engineerPackDesc: "স্পেক, ড্রয়িং, BBS, BOQ ও ব্যতিক্রম — এক হ্যান্ডঅফ প্যাক",
  docsReady: "প্রস্তুত",
  docsDraft: "খসড়া",
  sheets: "{n} শিট",
  designPhaseStat: "পর্যায় ডিজাইন",
};

export const STRINGS = { en, bn } as const;

export type TKey = keyof typeof en;
export type TFn = (key: TKey) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TFn;
  floor: (storeyIndex: number) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const BN_FLOORS = ["নিচতলা", "১ম তলা", "২য় তলা", "৩য় তলা", "৪র্থ তলা", "৫ম তলা", "৬ষ্ঠ তলা"];

export function fmtNum(value: number, lang: Lang): string {
  const formatted = new Intl.NumberFormat("en-US").format(value);
  return lang === "bn" ? formatted.replace(/\d/g, (d) => BN_DIGITS[Number(d)]) : formatted;
}

export function fmtBdt(value: number, lang: Lang): string {
  return "৳ " + fmtNum(value, lang);
}

export function floorName(storeyIndex: number, lang: Lang): string {
  if (lang === "bn") return BN_FLOORS[storeyIndex] ?? `${storeyIndex}নং তলা`;
  return storeyIndex === 0 ? "Ground Floor" : `Floor ${storeyIndex}`;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang,
      t: (key: TKey) => STRINGS[lang][key],
      floor: (storeyIndex: number) => floorName(storeyIndex, lang),
    }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
