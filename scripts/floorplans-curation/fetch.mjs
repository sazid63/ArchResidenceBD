// Scrape the 61 handoff links for floor-plan image candidates and download them.
// Usage: node fetch.mjs [--only=id1,id2] [--concurrency=4]
import fs from 'node:fs';
import path from 'node:path';
import { LINKS } from './links.mjs';

const ROOT = path.resolve(import.meta.dirname, '../..');
const STAGE = path.join(ROOT, 'scripts/floorplans-curation/staging');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
const only = args.only ? new Set(args.only.split(',')) : null;
const CONC = Number(args.concurrency || 4);

const headersFor = (url, referer) => ({
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9,bn;q=0.8',
  referer: referer || new URL(url).origin + '/',
});

async function fetchText(url, referer) {
  const res = await fetch(url, {
    headers: headersFor(url, referer),
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.text();
  return { status: res.status, finalUrl: res.url, body };
}

// ---- dimension sniffing -------------------------------------------------
function dims(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
    if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    }
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = buf.toString('ascii', 12, 16);
      if (fmt === 'VP8X') {
        return {
          w: 1 + buf.readUIntLE(24, 3),
          h: 1 + buf.readUIntLE(27, 3),
        };
      }
      if (fmt === 'VP8 ') {
        return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fmt === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
      }
    }
  } catch {}
  return { w: 0, h: 0 };
}

// ---- candidate extraction ----------------------------------------------
const BAD = /(logo|favicon|sprite|avatar|placeholder|spacer|pixel|1x1|blank\.|emoji|whatsapp|telegram|facebook\.com\/tr|google-analytics|googletagmanager|gstatic|doubleclick|analytics|badge|flag_|arrow|search-icon)/i;

function normalize(src, base) {
  if (!src) return null;
  let s = src.trim().replace(/&amp;/g, '&');
  if (s.startsWith('//')) s = 'https:' + s;
  if (s.startsWith('data:') || s.startsWith('javascript:')) return null;
  try {
    const u = new URL(s, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function largestFromSrcset(ss) {
  if (!ss) return null;
  const parts = ss.split(',').map((p) => p.trim()).filter(Boolean);
  let best = null;
  let bestW = -1;
  for (const p of parts) {
    const [u, d] = p.split(/\s+/);
    const w = d && d.endsWith('w') ? parseInt(d) : d && d.endsWith('x') ? parseFloat(d) * 1000 : 0;
    if (w > bestW) { bestW = w; best = u; }
  }
  return best;
}

function extractCandidates(html, base) {
  const out = [];
  const push = (u, kind) => {
    const n = normalize(u, base);
    if (!n) return;
    if (BAD.test(n)) return;
    out.push({ url: n, kind });
  };

  for (const m of html.matchAll(/<meta[^>]+(?:property|name)=["'](og:image(?::\w+)?|twitter:image(?::\w+)?)["'][^>]*>/gi)) {
    const c = m[0].match(/content=["']([^"']+)["']/i);
    if (c) push(c[1], 'meta');
  }
  for (const m of html.matchAll(/<link[^>]+rel=["']image_src["'][^>]*>/gi)) {
    const c = m[0].match(/href=["']([^"']+)["']/i);
    if (c) push(c[1], 'meta');
  }
  // JSON-LD image fields
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/g)) {
    const raw = m[1];
    for (const s of raw.matchAll(/"(https?:[^"]+)"/g)) push(s[1], 'jsonld');
  }
  // img tags
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const attrs = {};
    for (const a of tag.matchAll(/([a-z0-9_-]+)\s*=\s*["']([^"']*)["']/gi)) attrs[a[1].toLowerCase()] = a[2];
    const cand =
      attrs['data-original'] || attrs['data-large-file'] || attrs['data-src'] || attrs['data-lazy-src'] ||
      largestFromSrcset(attrs['srcset'] || attrs['data-srcset']) || attrs.src;
    if (cand) push(cand, 'img');
  }
  // dedupe, keep order
  const seen = new Set();
  const uniq = [];
  for (const c of out) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    uniq.push(c);
  }
  return uniq;
}

function scoreCandidate(c) {
  let s = 0;
  if (c.kind === 'meta') s += 60;
  if (c.kind === 'jsonld') s += 40;
  if (/(floor|plan|layout|map|design|drawing|apartment|unit|house|flat|bed)/i.test(c.url)) s += 25;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(c.url)) s += 10;
  if (/(thumb|small|medium|150x|300x|\/s\d{2,3}-c|_s\.)/i.test(c.url)) s -= 20;
  if (/uploads|media|photos|images/i.test(c.url)) s += 5;
  return s;
}

async function downloadImage(url, referer, destBase) {
  const res = await fetch(url, {
    headers: {
      'user-agent': UA,
      accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      referer: referer || new URL(url).origin + '/',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type') || '';
  if (!/^image\//.test(ct)) return { ok: false, status: res.status, note: 'not-image:' + ct };
  if (buf.length < 8000) return { ok: false, note: 'too-small' };
  let ext = 'jpg';
  if (/png/.test(ct)) ext = 'png';
  else if (/webp/.test(ct)) ext = 'webp';
  else if (/gif/.test(ct)) ext = 'gif';
  else if (/jpeg|jpg/.test(ct)) ext = 'jpg';
  else {
    const d = dims(buf);
    if (!d.w) return { ok: false, note: 'unknown-type:' + ct };
  }
  const file = `${destBase}.${ext}`;
  fs.writeFileSync(file, buf);
  const d = dims(buf);
  return { ok: true, file, bytes: buf.length, w: d.w, h: d.h, ext, status: res.status };
}

// ---- per-link handling --------------------------------------------------
async function htmlFor(link) {
  // Videos: use oEmbed so we at least get a poster frame.
  if (/youtube\.com|youtu\.be/.test(link.url)) {
    const oe = `https://www.youtube.com/oembed?url=${encodeURIComponent(link.url)}&format=json`;
    try {
      const r = await fetch(oe, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
      if (r.ok) {
        const j = await r.json();
        return { html: `<html><head><meta property="og:image" content="${j.thumbnail_url}"></head></html>`, status: 200, note: 'youtube-oembed', title: j.title };
      }
    } catch {}
  }
  if (/tiktok\.com/.test(link.url)) {
    try {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(link.url)}`, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const j = await r.json();
        return { html: `<html><head><meta property="og:image" content="${j.thumbnail_url}"></head></html>`, status: 200, note: 'tiktok-oembed', title: j.title };
      }
    } catch {}
  }
  try {
    const r = await fetchText(link.url);
    return { html: r.body, status: r.status, finalUrl: r.finalUrl };
  } catch (e) {
    return { html: '', status: 0, error: String(e.message || e) };
  }
}

// Fallback for pages that block plain fetches: let the Jina reader proxy render the
// page and hand us its markdown image list.
async function jinaHtml(url) {
  const res = await fetch('https://r.jina.ai/' + url, {
    headers: { 'user-agent': UA, accept: 'text/plain' },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) return null;
  const md = await res.text();
  const imgs = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) imgs.push(m[1]);
  for (const m of md.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) imgs.push(m[1]);
  if (!imgs.length) return null;
  return '<html><head>' + imgs.map((u) => `<meta property="og:image" content="${u.replace(/"/g, '%22')}">`).join('') + '</head></html>';
}

async function processLink(link) {
  const dir = path.join(STAGE, link.id);
  fs.mkdirSync(dir, { recursive: true });
  const got = await htmlFor(link);
  const rec = { id: link.id, url: link.url, pageStatus: got.status, note: got.note, error: got.error, title: got.title, candidates: [] };
  if (!got.html) {
    // Blocked (Facebook/TikTok/Scribd) — try the reader proxy before giving up.
    try {
      const jh = await jinaHtml(link.url);
      if (jh) {
        got.html = jh;
        got.note = ((got.note || '') + ' jina-fallback').trim();
      }
    } catch (e) {
      rec.note = (rec.note || '') + ' jina-failed:' + e.message;
    }
  }
  if (!got.html) {
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(rec, null, 2));
    return rec;
  }
  fs.writeFileSync(path.join(dir, 'page.html'), got.html);
  let cands = extractCandidates(got.html, got.finalUrl || link.url);
  if (!cands.length) {
    try {
      const jh = await jinaHtml(link.url);
      if (jh) {
        rec.note = (rec.note || '') + ' jina-fallback';
        cands = extractCandidates(jh, link.url).slice(0, 8);
      }
    } catch (e) {
      rec.note = (rec.note || '') + ' jina-failed:' + e.message;
    }
  }
  const ranked = cands
    .map((c) => ({ ...c, score: scoreCandidate(c) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  let i = 0;
  for (const c of ranked) {
    const r = await downloadImage(c.url, got.finalUrl || link.url, path.join(dir, `cand${i}`));
    rec.candidates.push({ ...c, ...r });
    i++;
  }
  fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(rec, null, 2));
  const best = rec.candidates.filter((c) => c.ok).sort((a, b) => b.w * b.h - a.w * a.h)[0];
  rec.best = best ? path.basename(best.file) : null;
  return rec;
}

async function main() {
  fs.mkdirSync(STAGE, { recursive: true });
  const todo = LINKS.filter((l) => !only || only.has(l.id));
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: CONC }, async () => {
    while (idx < todo.length) {
      const link = todo[idx++];
      try {
        const r = await processLink(link);
        results.push(r);
        console.log(`${link.id} status=${r.pageStatus} ok=${r.candidates.filter((c) => c.ok).length} best=${r.best || '-'}`);
      } catch (e) {
        console.log(`${link.id} FAILED ${e.message}`);
        results.push({ id: link.id, url: link.url, error: String(e.message || e) });
      }
    }
  });
  await Promise.all(workers);
  results.sort((a, b) => LINKS.findIndex((l) => l.id === a.id) - LINKS.findIndex((l) => l.id === b.id));
  fs.writeFileSync(path.join(STAGE, 'manifest.json'), JSON.stringify(results, null, 2));
  console.log('\nWrote', path.join(STAGE, 'manifest.json'), 'entries:', results.length);
}

main();
