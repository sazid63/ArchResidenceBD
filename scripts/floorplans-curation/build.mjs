// Compile the verified curation into public/assets/floorplans + manifest + image map.
// Run: node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { LINKS } from './links.mjs';

const HERE = import.meta.dirname;
const REPO = path.resolve(HERE, '../..');
const STAGE = path.join(HERE, 'staging');
const DEST = path.join(REPO, 'public/assets/floorplans');

// id -> { cat, src (staging relative), desc }
const PICKS = {
  // ---------------- 1-unit: one dwelling per floor ----------------
  'bd-1u-001': { cat: '1-unit', src: 'bd-1u-001/cand3.jpg', desc: '1561 sqft single-unit apartment, typical floor plan with furniture layout, Uttara Dhaka' },
  'bd-1u-002': { cat: '1-unit', src: 'bd-1u-002/cand2.jpg', desc: '1575 sqft single-unit flat, typical floor plan, Bashundhara K-Block' },
  'bd-1u-004': { cat: '1-unit', src: 'bd-1u-004/cand0.png', desc: 'Single-family house, ground + first floor plans with car porch' },
  'bd-1u-006': { cat: '1-unit', src: 'bd-1u-006/cand4.png', desc: '1-unit house plan on a 23x46 ft plot' },
  'bd-1u-008': { cat: '1-unit', src: 'bd-1u-008/cand0.jpg', desc: '2850 sqft 4-bed single flat, typical floor plan, Jolshiri Abashon' },
  'bd-1u-009': { cat: '1-unit', src: 'bd-1u-009/cand3.jpg', desc: '2170 sqft 4-bed single unit, 7th-8th floor plan, Bashundhara R/A' },
  'bd-1u-011': { cat: '1-unit', src: 'bd-1u-011/cand4.jpg', desc: 'Assure Tasneem 3-bed typical floor plan, Uttara' },
  'bd-1u-012': { cat: '1-unit', src: 'bd-1u-012/cand2.jpg', desc: 'Wahid Villa 2000 sqft typical floor plan, one unit per floor' },
  'bd-1u-017': { cat: '1-unit', src: 'bd-1u-017/jina0.jpg', desc: 'AutoCAD practice house-plan sheet (ground floor plan + elevation)' },
  'bd-1u-018': { cat: '1-unit', src: 'bd-1u-018/cand0.jpg', desc: 'Single-storey small house plan, 2 bed + 2 bath' },
  'bd-1u-020': { cat: '1-unit', src: 'bd-1u-020/cand4.png', desc: 'Modern single-storey house, ground floor plan' },
  'bd-1u-021': { cat: '1-unit', src: 'bd-1u-021/cand0.jpg', desc: "35'8\" x 42' ground floor plan, 4 bed, ~1499 sqft" },
  'bd-3u-017': { cat: '1-unit', src: 'bd-3u-017/cand5.jpg', desc: 'Type-A 1550 sqft typical floor plan (1st-6th floor), Aftab Nagar — recategorised from 2+ to 1-unit' },
  'bd-3u-020': { cat: '1-unit', src: 'bd-3u-020/cand1.jpg', desc: 'Single-unit ground floor plan picked from the Bangladesh house-design board — recategorised from 2+ to 1-unit' },

  // ---------------- 2-unit: two dwellings per floor ----------------
  'bd-1u-007': { cat: '2-unit', src: 'bd-1u-007/cand0.jpg', desc: 'Ground floor plan with two mirrored units (2 kitchens, 2 master bedrooms) — recategorised from 1-unit to 2-unit' },
  'bd-2u-001': { cat: '2-unit', src: 'bd-2u-001/cand1.png', desc: 'Two-unit village house, 50x40 ft, 4 bedrooms total' },
  'bd-2u-005': { cat: '2-unit', src: 'bd-2u-005/cand0.jpg', desc: "2-unit house plan, 40'1\" x 46'0\", 3 bedrooms per unit" },
  'bd-2u-008': { cat: '2-unit', src: 'bd-2u-008/cand3.jpg', desc: '2-unit apartment building, 80x75 ft typical floor plan' },
  'bd-2u-010': { cat: '2-unit', src: 'bd-2u-010/cand3.jpg', desc: 'Lucky Light House, Unit-A + Unit-B (~850 sqft each), Ibrahimpur' },
  'bd-2u-011': { cat: '2-unit', src: 'bd-2u-011/cand3.png', desc: 'Two mirrored 2-bed units with furniture layout' },
  'bd-2u-015': { cat: '2-unit', src: 'bd-2u-015/cand3.png', desc: 'Two-unit ~1700 sqft plan (firstfloorplan.com)' },
  'bd-2u-017': { cat: '2-unit', src: 'bd-2u-017/cand2.jpg', desc: 'Detailed two-unit residential plan, Unit A / Unit B' },
  'bd-2u-018': { cat: '2-unit', src: 'bd-2u-018/cand0.png', desc: '40x40 ft two-unit floor plan (clarityarchitects)' },
  'bd-2u-019': { cat: '2-unit', src: 'bd-2u-019/cand0.jpg', desc: 'North-facing double-unit 2BHK house plan, 33x58 ft plot' },
  'bd-2u-020': { cat: '2-unit', src: 'bd-2u-020/jina1.jpg', desc: 'Two-unit residential building plan (Scribd document render)' },
  'bd-3u-010': { cat: '2-unit', src: 'bd-3u-010/cand0.jpg', desc: 'Two 3BHK flats per floor (cadbull apartment layout) — recategorised from 2+ to 2-unit' },
  'bd-3u-014': { cat: '2-unit', src: 'bd-3u-014/cand4.jpg', desc: "Typical floor plan labelled 'Double Unit', 1310 sqft project — recategorised from 2+ to 2-unit" },

  // ---------------- 2+ unit: three or more dwellings per floor ----------------
  'bd-3u-002': { cat: '2+ unit', src: 'bd-3u-002/cand2.jpg', desc: '3300 sqft first & typical floor plan, Unit-A / Unit-B / Unit-C (3 units)' },
  'bd-3u-004': { cat: '2+ unit', src: 'bd-3u-004/jina0.jpg', desc: 'Three-unit floor plan with three UNIT-C labels (Scribd document render)' },
  'bd-3u-005': { cat: '2+ unit', src: 'bd-3u-005/cand1.png', desc: '3300 sqft three-unit plan, alternate colour rendering of the bd-3u-002 layout' },
  'bd-3u-006': { cat: '2+ unit', src: 'bd-3u-006/cand5.png', desc: 'Three-unit residential building layout (clarityarchitects)' },
  'bd-3u-012': { cat: '2+ unit', src: 'bd-3u-012/cand1.jpg', desc: "63' x 56' three-unit house plan (rajmistriy), high-resolution drawing" },
  'bd-3u-015': { cat: '2+ unit', src: 'bd-3u-015/cand2.png', desc: 'Three-unit plan labelled Unit-01 / Unit-02 / Unit-03' },
  'bd-3u-016': { cat: '2+ unit', src: 'bd-3u-016/cand3.jpg', desc: 'Multi-unit (four-flat) first & second floor plan, 58x77 ft' },
  'bd-3u-018': { cat: '2+ unit', src: 'bd-3u-018/cand0.jpg', desc: 'Furniture layout plan with flats A / B / C (3 units per floor)' },
};

const CAT_ORDER = { '1-unit': 1, '2-unit': 2, '2+ unit': 3 };
const rows = [];

fs.mkdirSync(DEST, { recursive: true });

// Remove the previous naming scheme so the folder holds exactly this curation.
for (const f of fs.readdirSync(DEST)) {
  if (/^bd-\d-unit-\d+\.(jpg|jpeg|png|webp)$/i.test(f)) fs.rmSync(path.join(DEST, f));
}

for (const [id, pick] of Object.entries(PICKS)) {
  const from = path.join(STAGE, pick.src);
  if (!fs.existsSync(from)) throw new Error(`missing staged file ${pick.src}`);
  const ext = path.extname(from).toLowerCase().replace('jpeg', 'jpg');
  const to = path.join(DEST, `${id}${ext}`);
  fs.copyFileSync(from, to);
  const size = fs.statSync(to).size;
  rows.push({ id, cat: pick.cat, file: `${id}${ext}`, desc: pick.desc, bytes: size });
}

rows.sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat] || a.id.localeCompare(b.id));

const skipped = LINKS.filter((l) => !PICKS[l.id]).map((l) => l.id);

const manifest = {
  generated: new Date().toISOString(),
  source: 'FLOORPLAN_VISION_AI_HANDOFF.md (61 links, visually verified)',
  counts: rows.reduce((acc, r) => ((acc[r.cat] = (acc[r.cat] || 0) + 1), acc), {}),
  plans: rows.map((r) => ({
    id: r.id,
    category: r.cat,
    unitsPerFloor: r.cat === '1-unit' ? 1 : r.cat === '2-unit' ? 2 : 3,
    file: `/assets/floorplans/${r.file}`,
    description: r.desc,
    sourceUrl: LINKS.find((l) => l.id === r.id)?.url ?? null,
    bytes: r.bytes,
  })),
  skipped,
};
fs.writeFileSync(path.join(DEST, 'manifest.json'), JSON.stringify(manifest, null, 2));


// Human-readable report.
const md = [];
md.push('# Floor Plan Curation — Verified Results', '');
md.push(`Generated ${new Date().toISOString().slice(0, 10)} from the 61 source links in \`FLOORPLAN_VISION_AI_HANDOFF.md\`.`);
md.push('Every kept drawing was opened and its unit count counted by eye; several intended labels were wrong and are marked as recategorised.', '');
md.push('**Files saved to** `repo/public/assets/floorplans/` as `<ID>.<ext>`. Machine-readable category data: `public/assets/floorplans/manifest.json`.', '');
for (const cat of ['1-unit', '2-unit', '2+ unit']) {
  const list = rows.filter((r) => r.cat === cat);
  md.push(`## ${cat} — ${list.length} images`, '');
  md.push('| ID | Category | Image File Saved | Description | Status |');
  md.push('|----|----------|------------------|-------------|--------|');
  for (const r of list) md.push(`| ${r.id} | ${r.cat} | ${r.file} | ${r.desc} | OK |`);
  md.push('');
}
md.push('## Skipped', '');
md.push('| ID | Reason |');
md.push('|----|--------|');
const REASONS = {
  'bd-1u-003': 'page has 3D renders plus only thumbnail-size plans',
  'bd-1u-005': '3D renders only, no floor plan drawing',
  'bd-1u-010': 'building renders only, no floor plan drawing',
  'bd-1u-013': '3D exterior renders only (product page)',
  'bd-1u-014': 'article page returned only a logo image',
  'bd-1u-015': 'same sirajtech product page as bd-1u-013, renders only',
  'bd-1u-016': 'school (classroom) plan and elevations — not residential; only site plan + facades',
  'bd-1u-019': 'Facebook login wall, only the FB logo recovered',
  'bd-2u-002': 'Facebook page (not a single plan); only logo recovered',
  'bd-2u-003': 'YouTube thumbnail only (480x360), plan legible but too low-res',
  'bd-2u-004': '3D interiors and building photos, no plan',
  'bd-2u-006': 'YouTube thumbnail only (480x360)',
  'bd-2u-007': 'TikTok video frames and a duplex render, no usable plan',
  'bd-2u-009': 'same 40x46 two-unit plan as bd-2u-005 (duplicate)',
  'bd-2u-012': 'YouTube thumbnail only (480x360)',
  'bd-2u-013': 'YouTube thumbnail only (480x360)',
  'bd-2u-014': 'heavily watermarked video grab of the plan',
  'bd-2u-016': 'designscad returned HTTP 403 (blocked)',
  'bd-3u-001': 'Facebook page URL (not a plan); only logo recovered',
  'bd-3u-003': 'Facebook video link returns HTTP 404',
  'bd-3u-007': '2560x1440 thumbnail with large text overlay covering the plan',
  'bd-3u-008': 'YouTube thumbnail only (480x360)',
  'bd-3u-009': 'tutorial/3D model screenshots, no floor plan',
  'bd-3u-011': 'YouTube thumbnail only (480x360)',
  'bd-3u-013': 'YouTube thumbnail only (480x360)',
  'bd-3u-019': 'same 35\'8"x42\' plan as bd-1u-021 (duplicate)',
};
for (const id of skipped) md.push(`| ${id} | ${REASONS[id] || 'no usable floor plan image found'} |`);
md.push('');
const c = manifest.counts;
md.push('## Final count', '');
md.push(`- 1-unit: **${c['1-unit']}**`);
md.push(`- 2-unit: **${c['2-unit']}**`);
md.push(`- 2+ unit: **${c['2+ unit']}**`);
md.push(`- **Total saved: ${rows.length}** (target was 8 per category / 24 total)`);
md.push('');
md.push('## Recategorised from the handoff table', '');
md.push('| ID | Intended | Verified | Why |');
md.push('|----|----------|----------|-----|');
md.push('| bd-1u-007 | 1-unit | 2-unit | drawing shows two mirrored flats with two kitchens |');
md.push('| bd-2u-019 | 2-unit | 2-unit | confirmed: same 2BHK repeated front and back ("double unit") |');
md.push('| bd-3u-010 | 2+ unit | 2-unit | only two flats per floor, not three |');
md.push('| bd-3u-014 | 2+ unit | 2-unit | drawing is labelled "Double Unit" |');
md.push('| bd-3u-017 | 2+ unit | 1-unit | "Type-A 1550 sqft 1st to 6th floor plan" = one flat per floor |');
md.push('| bd-3u-020 | 2+ unit | 1-unit | the picked plan is a single dwelling on the floor |');
md.push('| bd-3u-002 / bd-3u-005 | 2+ unit | 2+ unit | confirmed 3 units (Unit-A/B/C), two different renderings of one plan |');
md.push('');
fs.writeFileSync(path.join(REPO, 'FLOORPLAN_CURATION_RESULTS.md'), md.join('\n'));

console.log('saved', rows.length, 'files;', JSON.stringify(manifest.counts));
console.log('skipped', skipped.length);
