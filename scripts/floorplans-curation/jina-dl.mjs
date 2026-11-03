import fs from 'node:fs';
import path from 'node:path';
const STAGE = path.join(import.meta.dirname, 'staging');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const targets = [
  ['bd-2u-020', 'https://www.scribd.com/doc/256453102/Two-Unit-Residential-Building-Plan'],
  ['bd-3u-004', 'https://www.scribd.com/document/812491357/3-unit-floor-plan'],
  ['bd-2u-007', 'https://www.tiktok.com/@modern.house.design/video/7312121643038461186'],
  ['bd-1u-017', 'https://www.facebook.com/civiltechtime/posts/-autocad-practice-drawing-house-planthis-autocad-practice-drawing-presents-a-wel/1371782311747114/'],
  ['bd-1u-019', 'https://www.facebook.com/dwgfiles/posts/typical-apartment-floor-plan-with-1bhk-units-living-dining-and-kitchenexplore-a-/1669891424492068/'],
  ['bd-3u-003', 'https://www.facebook.com/cdz.bd/videos/3-unit-house-floor-plan-%E0%A7%A9-%E0%A6%87%E0%A6%89%E0%A6%A8%E0%A6%BF%E0%A6%9F%E0%A7%87%E0%A6%B0-%E0%A6%AC%E0%A6%BE%E0%A6%A1%E0%A6%BC%E0%A6%BF%E0%A6%B0-%E0%A6%A1%E0%A6%BF%E0%A6%9C%E0%A6%BE%E0%A6%87'],
];
for (const [id, url] of targets) {
  const dir = path.join(STAGE, id);
  fs.mkdirSync(dir, { recursive: true });
  let md = '';
  try {
    const r = await fetch('https://r.jina.ai/' + url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
    md = await r.text();
  } catch (e) { console.log(id, 'jina failed', e.message); continue; }
  const urls = [...md.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)]
    .map((m) => m[1].replace(/%2F/gi, '/'))
    .filter((u) => /\.(jpe?g|png|webp)/i.test(u) || /scribdassets|tiktokcdn|fbcdn/.test(u))
    .filter((u) => !/149x198|100x100|avatar|fallbacks/i.test(u));
  console.log(id, 'md images:', urls.length);
  let i = 0;
  for (const u of urls.slice(0, 5)) {
    try {
      const ir = await fetch(u, { headers: { 'user-agent': UA, referer: url }, signal: AbortSignal.timeout(45000) });
      if (!ir.ok) { console.log('  dl', ir.status, u.slice(0, 80)); continue; }
      const buf = Buffer.from(await ir.arrayBuffer());
      if (buf.length < 5000) continue;
      fs.writeFileSync(path.join(dir, `jina${i}.jpg`), buf);
      console.log('  saved jina' + i, Math.round(buf.length / 1024) + 'KB', u.slice(0, 70));
      i++;
    } catch (e) { console.log('  dl fail', u.slice(0, 60), e.message); }
  }
}
