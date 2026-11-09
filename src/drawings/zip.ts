/**
 * A minimal ZIP writer (store method, no compression) so the permit package downloads as one file
 * without a dependency. UTF-8 names (flag bit 11); the timestamp is passed in so output is deterministic.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

let table: Uint32Array | null = null;

export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** DOS date and time words for a calendar date (time 00:00); years before 1980 clamp to 1980. */
export function dosDateTime(iso: string): { date: number; time: number } {
  const [y, m, d] = iso.split("-").map(Number);
  const year = Math.max(1980, y || 1980);
  return { date: ((year - 1980) << 9) | ((m || 1) << 5) | (d || 1), time: 0 };
}

export function makeZip(entries: ZipEntry[], isoDate: string): Uint8Array {
  const enc = new TextEncoder();
  const { date, time } = dosDateTime(isoDate);
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true);

  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20);
    u16(lv, 6, 0x0800);
    u16(lv, 8, 0);
    u16(lv, 10, time);
    u16(lv, 12, date);
    u32(lv, 14, crc);
    u32(lv, 18, e.data.length);
    u32(lv, 22, e.data.length);
    u16(lv, 26, name.length);
    u16(lv, 28, 0);
    local.set(name, 30);
    parts.push(local, e.data);

    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, time);
    u16(cv, 14, date);
    u32(cv, 16, crc);
    u32(cv, 20, e.data.length);
    u32(cv, 24, e.data.length);
    u16(cv, 28, name.length);
    u32(cv, 42, offset);
    cd.set(name, 46);
    central.push(cd);
    offset += local.length + e.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, cdSize);
  u32(ev, 16, offset);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
