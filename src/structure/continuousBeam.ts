/**
 * Continuous beam under uniform loads per span, columns as simple supports, equal EI (three-moment equation).
 * Sign convention: sagging positive, hogging negative. Units: kN, m, kN.m.
 */

export interface SpanIn {
  lengthM: number;
  /** Uniform load on this span, kN/m. */
  w: number;
}

export interface SpanOut {
  /** Support moments at the span's left and right ends (hogging negative). */
  mLeft: number;
  mRight: number;
  /** Maximum sagging moment in the span (>= 0) and where it is, m from the left. */
  mPos: number;
  xPos: number;
  /** End shears: positive up at the left end, magnitude at the right end (kN). */
  vLeft: number;
  vRight: number;
}

/** Support moments M0..Mn for the spans (ends are simple, so M0 = Mn = 0). */
export function supportMoments(spans: SpanIn[]): number[] {
  const n = spans.length;
  const m = new Array<number>(n + 1).fill(0);
  if (n < 2) return m;
  // Unknowns M1..M(n-1); row j: L(j-1) M(j-1) + 2 (L(j-1)+L(j)) M(j) + L(j) M(j+1) = -(w(j-1) L(j-1)^3 + w(j) L(j)^3) / 4
  const k = n - 1;
  const a = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let j = 1; j <= k; j++) {
    const l0 = spans[j - 1].lengthM;
    const l1 = spans[j].lengthM;
    const r = j - 1;
    a[r][r] = 2 * (l0 + l1);
    if (r > 0) a[r][r - 1] = l0;
    if (r < k - 1) a[r][r + 1] = l1;
    b[r] = -(spans[j - 1].w * l0 ** 3 + spans[j].w * l1 ** 3) / 4;
  }
  // Thomas algorithm (tridiagonal).
  for (let i = 1; i < k; i++) {
    const f = a[i][i - 1] / a[i - 1][i - 1];
    a[i][i] -= f * a[i - 1][i];
    b[i] -= f * b[i - 1];
  }
  const x = new Array<number>(k).fill(0);
  x[k - 1] = b[k - 1] / a[k - 1][k - 1];
  for (let i = k - 2; i >= 0; i--) x[i] = (b[i] - a[i][i + 1] * x[i + 1]) / a[i][i];
  for (let j = 1; j <= k; j++) m[j] = x[j - 1];
  return m;
}

export function analyseSpans(spans: SpanIn[]): SpanOut[] {
  const m = supportMoments(spans);
  return spans.map((s, i) => {
    const { lengthM: L, w } = s;
    const mLeft = m[i];
    const mRight = m[i + 1];
    const vLeft = w * L / 2 + (mRight - mLeft) / L;
    const vRight = w * L - vLeft;
    const x = w > 0 ? Math.min(Math.max(vLeft / w, 0), L) : 0;
    const mAt = mLeft + vLeft * x - (w * x * x) / 2;
    return { mLeft, mRight, mPos: Math.max(mAt, 0), xPos: x, vLeft, vRight };
  });
}

/** Moment at mid-span, kN.m (sagging positive). */
export function midMoment(s: SpanIn, o: SpanOut): number {
  return (s.w * s.lengthM ** 2) / 8 + (o.mLeft + o.mRight) / 2;
}

export interface Envelope {
  /** Per span: largest sagging, most negative left and right moments, largest shear magnitude. */
  spans: Array<{ mPos: number; mLeft: number; mRight: number; vMax: number }>;
}

/**
 * Pattern-loading envelope for factored loads. Each span has dead `d` and live `l` (kN/m, unfactored) and factors
 * gd, gl. Patterns: all loaded; live on odd spans; live on even spans; live on each adjacent pair of spans;
 * plus the dead-only case (covers the 1.4D combination where it governs).
 */
export function envelope(lengthsM: number[], d: number[], l: number[], gd: number, gl: number, deadOnlyFactor = 1.4): Envelope {
  const n = lengthsM.length;
  const patterns: boolean[][] = [new Array<boolean>(n).fill(true)];
  if (n > 1) {
    patterns.push(Array.from({ length: n }, (_, i) => i % 2 === 0));
    patterns.push(Array.from({ length: n }, (_, i) => i % 2 === 1));
    for (let j = 0; j + 1 < n; j++) patterns.push(Array.from({ length: n }, (_, i) => i === j || i === j + 1));
  }
  const out = lengthsM.map(() => ({ mPos: 0, mLeft: 0, mRight: 0, vMax: 0 }));
  const run = (w: number[]) => {
    const res = analyseSpans(lengthsM.map((L, i) => ({ lengthM: L, w: w[i] })));
    res.forEach((r, i) => {
      out[i].mPos = Math.max(out[i].mPos, r.mPos);
      out[i].mLeft = Math.min(out[i].mLeft, r.mLeft);
      out[i].mRight = Math.min(out[i].mRight, r.mRight);
      out[i].vMax = Math.max(out[i].vMax, Math.abs(r.vLeft), Math.abs(r.vRight));
    });
  };
  for (const p of patterns) run(d.map((di, i) => gd * di + (p[i] ? gl * l[i] : 0)));
  run(d.map((di) => deadOnlyFactor * di));
  return { spans: out };
}
