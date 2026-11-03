import fs from 'node:fs';
import path from 'node:path';
import { LINKS } from './links.mjs';
const STAGE = path.join(import.meta.dirname, 'staging');
const out = [];
for (const l of LINKS) {
  const p = path.join(STAGE, l.id, 'result.json');
  if (!fs.existsSync(p)) { out.push({ id: l.id, url: l.url, missing: true }); continue; }
  const r = JSON.parse(fs.readFileSync(p, 'utf8'));
  const ok = (r.candidates || []).filter((c) => c.ok);
  out.push({ id: l.id, url: l.url, pageStatus: r.pageStatus, note: r.note, error: r.error, title: r.title, candidates: ok.map((c) => ({ file: path.basename(c.file), w: c.w, h: c.h, bytes: c.bytes, kind: c.kind })) });
}
fs.writeFileSync(path.join(STAGE, 'combined.json'), JSON.stringify(out, null, 2));
for (const r of out) {
  const s = (r.candidates || []).map((c) => `${c.file}:${c.w}x${c.h}`).join(' ');
  console.log(r.id.padEnd(10), String(r.pageStatus ?? '-').padEnd(4), s || 'NOIMG');
}
