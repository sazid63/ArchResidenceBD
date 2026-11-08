import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WCAG contrast for the theme tokens, in light and dark. Text pairs need 4.5:1 (AA, normal text);
 * coloured marks (dots, bars, focus) need 3:1 against the surfaces they sit on.
 */

const css = readFileSync(new URL("../src/theme/tokens.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TONES = ["sky", "sage", "lavender", "amber", "blush", "mint"];

const textPairs: Array<[string, string]> = [
  ["ink", "paper"],
  ["ink", "surface-2"],
  ["ink-soft", "paper"],
  ["ink-soft", "surface-2"],
  ["ink-faint", "paper"],
  ["ink-faint", "surface-2"],
  ["primary-ink", "primary-soft"],
  ["primary-ink", "paper"],
  ["on-primary", "primary"],
  ...TONES.map((t) => [`${t}-ink`, `${t}-soft`] as [string, string]),
];

const markPairs: Array<[string, string]> = [
  ["primary", "paper"],
  ["primary", "surface-2"],
  ...TONES.map((t) => [t, "paper"] as [string, string]),
  ...["phase-site", "phase-foundation", "phase-roof", "phase-utility"].map((p) => [p, "paper"] as [string, string]),
];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("%s theme contrast", (_name, vars) => {
  it.each(textPairs)("text %s on %s is at least 4.5:1", (fg, bg) => {
    expect(vars[fg], fg).toBeDefined();
    expect(vars[bg], bg).toBeDefined();
    expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(markPairs)("mark %s on %s is at least 3:1", (fg, bg) => {
    expect(vars[fg], fg).toBeDefined();
    expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(3);
  });
});
