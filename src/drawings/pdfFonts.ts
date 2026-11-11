import latinUrl from "@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url";
import bengaliUrl from "@fontsource/noto-sans-bengali/files/noto-sans-bengali-bengali-400-normal.woff?url";
import type { FontBytes } from "./pdf";

/** The PDF fonts, fetched from the app's own files (same origin, so the service worker caches them for offline use). */
export async function loadPdfFonts(): Promise<FontBytes> {
  const get = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Could not load font ${url}`);
    return new Uint8Array(await r.arrayBuffer());
  };
  const [latin, bengali] = await Promise.all([get(latinUrl), get(bengaliUrl)]);
  return { latin, bengali };
}
