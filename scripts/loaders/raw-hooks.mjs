/**
 * Node loader hooks so plain `tsx` scripts can import files the way Vite does with `?raw`
 * (the rule packs, the flow book, the rate card and the schemas are imported as text).
 * Registered by raw.mjs; use it as `tsx --import ./scripts/loaders/raw.mjs <script>`.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith("?raw")) {
    const base = specifier.slice(0, -"?raw".length);
    const resolved = await nextResolve(base, context).catch(() => null);
    const url = resolved ? resolved.url : new URL(base, context.parentURL).href;
    return { url: `${url}?raw`, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith("?raw")) {
    const text = await readFile(fileURLToPath(url.slice(0, -"?raw".length)), "utf8");
    return { format: "module", source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
