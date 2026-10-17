import type { Phase } from "./data/mock";
import { floorName, type Lang, type TFn, type TKey } from "./i18n";

export const STATUS_KEY: Record<Phase["status"], TKey> = {
  not_started: "notStarted",
  gathering_info: "gatheringInfo",
  drafted: "drafted",
  designed: "designed",
  stale: "stale",
};

export function phaseName(phase: Phase, lang: Lang, t: TFn): string {
  switch (phase.kind) {
    case "site":
      return t("siteExcavation");
    case "foundation":
      return t("foundation");
    case "floor":
      return floorName(phase.storeyIndex ?? 0, lang);
    case "roof":
      return t("roofBoundary");
    case "common":
      return t("commonServices");
  }
}
