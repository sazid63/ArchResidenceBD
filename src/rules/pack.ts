/** Loads the RAJUK 2008 rule pack (spec/rules/rajuk-2008.yaml) once; the YAML ships as raw text. */

import { load } from "js-yaml";
import packText from "../../spec/rules/rajuk-2008.yaml?raw";
import type { EnginePack, TestVector } from "./engine";

export interface Citation {
  gazettePage: string;
  pdfPage: string;
  tier: string;
  note: string;
}

export interface RajukPack extends EnginePack {
  id: string;
  status: string;
  citations: Record<string, Citation>;
  testVectors: TestVector[];
}

export function parsePack(text: string): RajukPack {
  return load(text) as RajukPack;
}

let cached: RajukPack | null = null;

export function rajukPack(): RajukPack {
  return (cached ??= parsePack(packText));
}
