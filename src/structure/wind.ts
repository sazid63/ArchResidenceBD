/**
 * Wind on the lateral system, BNBC 2020 Part 6 Sec 2.4 (analytical procedure, ASCE 7 type, as adopted by the code).
 *
 * Values used (common practice where the text was not transcribed here; the owner confirms):
 * - basic wind speed for Dhaka 65.7 m/s (3 s gust, 10 m, Exposure B, 50-year), from the BNBC Table 6.2.8 / Figure 6.2.1 value
 *   quoted in published comparisons; to be checked against the owner's copy of the figure;
 * - exposure B (urban): alpha 7.0, z_g 365.76 m; K_z = 2.01 (max(z, 4.6) / z_g)^(2 / alpha);
 * - topographic factor K_zt 1.0, wind directionality K_d 0.85, importance I 1.0 (residential, Table 6.2.9 category II);
 * - gust effect G 0.85 (rigid); external Cp 0.8 windward and -0.5 leeward; internal GCpi +/-0.18 (enclosed), the sign that
 *   gives the larger force is used; velocity pressure q = 0.613 K_z K_zt K_d V^2 (Pa) at each level, q_h at the roof for suction.
 * - drift limit h / 500 under wind (common practice for residential, not cited).
 *
 * Forces are applied per storey over the tributary height and the face width perpendicular to the wind. The result is
 * compared with the seismic base shear by the caller. Units: kN, kN.m, mm, m/s.
 */

export const WIND_V_DHAKA_MS = 65.7;
export const WIND_DRIFT_DIV = 500;

export interface WindInput {
  storeys: number;
  storeyHeightMm: number;
  /** Plan dimensions along x and y, mm. */
  planXMm: number;
  planYMm: number;
  /** Storey lateral stiffness per direction, kN/mm, from the frame (index 0 = ground storey). */
  stiffnessXKnPerMm: number[];
  stiffnessYKnPerMm: number[];
  velocityMs?: number;
}

export interface WindDirection {
  /** Storey forces at each level, kN, and the storey shears (sum of forces at and above the storey). */
  forcesKn: number[];
  shearKn: number[];
  baseShearKn: number;
  overturningKnM: number;
  /** Storey drift under wind, mm, and its utilisation against h / 500 (never clamped). */
  driftMm: number[];
  driftUtil: number[];
  util: number;
}

export interface WindResult {
  velocityMs: number;
  x: WindDirection;
  y: WindDirection;
}

const G = 0.85;
const KD = 0.85;
const KZT = 1;
const CP_WINDWARD = 0.8;
const CP_LEEWARD = -0.5;
const GCPI = 0.18;
const ALPHA = 7.0;
const ZG_MM = 365760;

/** Velocity pressure exposure coefficient K_z for height `zMm` (Exposure B). */
export function kzExposureB(zMm: number): number {
  return 2.01 * (Math.max(zMm, 4600) / ZG_MM) ** (2 / ALPHA);
}

/** Velocity pressure q, kN/m2, at height `zMm`. */
export function velocityPressureKpa(zMm: number, vMs: number): number {
  return (0.613 * kzExposureB(zMm) * KZT * KD * vMs * vMs) / 1000;
}

function direction(faceWidthMm: number, h: number, n: number, vMs: number, stiffness: number[]): WindDirection {
  const hm = h / 1000;
  const forces: number[] = [];
  const qRoof = velocityPressureKpa(n * h, vMs);
  for (let i = 0; i < n; i++) {
    const z = (i + 1) * h;
    const q = velocityPressureKpa(z, vMs);
    // windward and leeward pressures with the internal pressure of the larger magnitude
    const internal = (sign: number) => sign * GCPI;
    const windward = Math.max(...[1, -1].map((s) => q * G * CP_WINDWARD - qRoof * G * internal(s)));
    const leeward = Math.min(...[1, -1].map((s) => qRoof * G * CP_LEEWARD - qRoof * G * internal(s)));
    const faceM = faceWidthMm / 1000;
    // windward push plus leeward suction, both on the tributary area of the storey
    forces.push((windward - leeward) * faceM * hm);
  }
  const shear = forces.map((_, i) => forces.slice(i).reduce((a, b) => a + b, 0));
  const driftMm: number[] = [];
  const driftUtil: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = stiffness[i];
    const d = k > 0 ? shear[i] / k : Infinity;
    driftMm.push(d);
    driftUtil.push(d / (h / WIND_DRIFT_DIV));
  }
  const overturningKnM = forces.reduce((a, f, i) => a + f * ((i + 0.5) * hm + 0), 0);
  return {
    forcesKn: forces,
    shearKn: shear,
    baseShearKn: shear[0] ?? 0,
    overturningKnM,
    driftMm,
    driftUtil,
    util: Math.max(0, ...driftUtil),
  };
}

export function analyseWind(inp: WindInput): WindResult {
  const v = inp.velocityMs ?? WIND_V_DHAKA_MS;
  return {
    velocityMs: v,
    // wind along x meets the face perpendicular to x, whose width is the plan extent along y
    x: direction(inp.planYMm, inp.storeyHeightMm, inp.storeys, v, inp.stiffnessXKnPerMm),
    y: direction(inp.planXMm, inp.storeyHeightMm, inp.storeys, v, inp.stiffnessYKnPerMm),
  };
}
