/**
 * Design of one continuous beam line (spans between columns along a structural grid line): factored pattern-load
 * envelope, flexure at supports and mid-span, shear at d from the support face, service deflection after partitions.
 * Utilisation is never clamped. Units: kN, m, mm unless a name says otherwise.
 */

import { analyseSpans, envelope, midMoment } from "./continuousBeam";
import { beamSelfWeightKnM, wallLineLoadKnM } from "./loads";
import { DESIGN, ecMPa, MATERIALS } from "./materials";
import { beamMinAs, crackedInertia, flexure, shear, type FlexureResult, type ShearResult } from "./section";

export interface BeamSection {
  bMm: number;
  hMm: number;
}

/** Candidate sections, smallest area first. Stock-list sizing for columns follows in M4-2. */
export const BEAM_SECTIONS: BeamSection[] = (() => {
  const out: BeamSection[] = [];
  for (let h = 350; h <= 900; h += 50) out.push({ bMm: 250, hMm: h });
  for (let h = 450; h <= 900; h += 50) out.push({ bMm: 300, hMm: h });
  for (let h = 600; h <= 900; h += 50) out.push({ bMm: 350, hMm: h });
  return out.sort((a, b) => a.bMm * a.hMm - b.bMm * b.hMm);
})();

export interface BeamSpanInput {
  lengthMm: number;
  /** Slab load carried by this span as an equivalent UDL for bending and for shear, kN/m (unfactored). */
  slabDeadBend: number;
  slabDeadShear: number;
  slabLiveBend: number;
  slabLiveShear: number;
  /** Walls on this span: thickness (mm) and the share of the span they cover (0..1), or null for none. */
  wallThicknessMm: number | null;
  wallShare: number;
}

export interface BeamLineInput {
  spans: BeamSpanInput[];
  /** Storey height above the beam (wall height before taking off the beam depth), mm; roof parapets pass their own height. */
  wallHeightMm: number;
  slabThicknessMm: number;
}

export interface BeamDeflection {
  immediateLiveMm: number;
  /** Long-term growth of the dead part plus the immediate live part. */
  afterPartitionsMm: number;
  limitMm: number;
  util: number;
}

export interface BeamSpanResult {
  lengthMm: number;
  /** Design moments, kN.m (hogging as positive magnitudes). */
  mPosKnM: number;
  mNegLeftKnM: number;
  mNegRightKnM: number;
  vuKn: number;
  pos: FlexureResult;
  negLeft: FlexureResult;
  negRight: FlexureResult;
  shear: ShearResult;
  /** Stirrup spacing for 2-leg 10 mm stirrups, mm (rounded down to 25). */
  stirrupSpacingMm: number;
  deflection: BeamDeflection;
  /** Service line load used, kN/m: dead and live (bending equivalent). */
  dKnM: number;
  lKnM: number;
  util: number;
  governs: "flexure" | "shear" | "deflection";
}

export interface BeamLineResult {
  section: BeamSection;
  dMm: number;
  spans: BeamSpanResult[];
  util: number;
  ok: boolean;
}

const roundDown25 = (v: number) => Math.floor(v / 25) * 25;
const STIRRUP_AREA_MM2 = 2 * Math.PI * (DESIGN.stirrupMm / 2) ** 2;

/** Service deflection of one span under the given load, mm (ACI 318 effective-moment form with Branson Ie). */
function spanDeflection(lMm: number, mMid: number, mL: number, mR: number, sec: BeamSection, asMm2: number): number {
  if (mMid <= 0) return 0;
  const ec = ecMPa(MATERIALS.fcMPa);
  const ig = (sec.bMm * sec.hMm ** 3) / 12;
  const mcr = (0.62 * Math.sqrt(MATERIALS.fcMPa) * ig) / (sec.hMm / 2) / 1e6;
  const d = sec.hMm - DESIGN.coverBeamMm - DESIGN.stirrupMm - DESIGN.mainBarMm / 2;
  const icr = crackedInertia(sec.bMm, d, asMm2, MATERIALS.EsMPa / ec);
  const r = Math.min(mcr / mMid, 1) ** 3;
  const ie = Math.min(r * ig + (1 - r) * icr, ig);
  const eff = mMid - 0.1 * (Math.abs(mL) + Math.abs(mR));
  return ((5 * lMm * lMm) / (48 * ec * ie)) * Math.max(eff, 0) * 1e6;
}

export function designBeamLine(input: BeamLineInput, sec: BeamSection): BeamLineResult {
  const { spans: sp } = input;
  const hM = sec.hMm / 1000;
  const dMm = sec.hMm - DESIGN.coverBeamMm - DESIGN.stirrupMm - DESIGN.mainBarMm / 2;
  const self = beamSelfWeightKnM(sec.bMm, sec.hMm, input.slabThicknessMm);
  const clearH = Math.max(input.wallHeightMm / 1000 - hM, 0);
  const wall = sp.map((s) => (s.wallThicknessMm ? wallLineLoadKnM(s.wallThicknessMm, clearH) * s.wallShare : 0));
  const dB = sp.map((s, i) => s.slabDeadBend + self + wall[i]);
  const dS = sp.map((s, i) => s.slabDeadShear + self + wall[i]);
  const lB = sp.map((s) => s.slabLiveBend);
  const lS = sp.map((s) => s.slabLiveShear);
  const lens = sp.map((s) => s.lengthMm / 1000);

  const envM = envelope(lens, dB, lB, 1.2, 1.6);
  const envV = envelope(lens, dS, lS, 1.2, 1.6);
  const service = analyseSpans(lens.map((L, i) => ({ lengthM: L, w: dB[i] + lB[i] })));
  const dead = analyseSpans(lens.map((L, i) => ({ lengthM: L, w: dB[i] })));

  const results: BeamSpanResult[] = sp.map((s, i) => {
    const L = lens[i];
    const wFull = Math.max(1.4 * dB[i], 1.2 * dB[i] + 1.6 * lB[i]);
    const nominalEnd = (wFull * L * L) / 24; // end support nominal restraint (assumption)
    const mPos = envM.spans[i].mPos;
    const mNegL = Math.max(-envM.spans[i].mLeft, i === 0 ? nominalEnd : 0);
    const mNegR = Math.max(-envM.spans[i].mRight, i === sp.length - 1 ? nominalEnd : 0);
    const wuShear = Math.max(1.4 * dS[i], 1.2 * dS[i] + 1.6 * lS[i]);
    const vu = Math.max(envV.spans[i].vMax - (wuShear * (DESIGN.supportWidthMm / 2 + dMm)) / 1000, 0);
    const minAs = beamMinAs(sec.bMm, dMm);
    const pos = flexure(mPos, sec.bMm, dMm, minAs);
    const negLeft = flexure(mNegL, sec.bMm, dMm, minAs);
    const negRight = flexure(mNegR, sec.bMm, dMm, minAs);
    const sh = shear(vu, sec.bMm, dMm);

    const asProv = Number.isFinite(pos.asReqMm2) ? pos.asReqMm2 : minAs;
    const mDL = midMoment({ lengthM: L, w: dB[i] + lB[i] }, service[i]);
    const mD = midMoment({ lengthM: L, w: dB[i] }, dead[i]);
    const dDL = spanDeflection(s.lengthMm, mDL, service[i].mLeft, service[i].mRight, sec, asProv);
    const dD = spanDeflection(s.lengthMm, mD, dead[i].mLeft, dead[i].mRight, sec, asProv);
    const dLive = Math.max(dDL - dD, 0);
    const after = DESIGN.longTermFactor * dD + dLive;
    const limit = s.lengthMm / DESIGN.deflectionLimitDiv;
    const defl: BeamDeflection = { immediateLiveMm: dLive, afterPartitionsMm: after, limitMm: limit, util: after / limit };

    const flexUtil = Math.max(pos.util, negLeft.util, negRight.util);
    const util = Math.max(flexUtil, sh.util, defl.util);
    const governs = util === flexUtil ? "flexure" : util === sh.util ? "shear" : "deflection";
    const sMax = Math.min(dMm / 2, 600);
    const sNeed = sh.avPerMm > 0 ? STIRRUP_AREA_MM2 / sh.avPerMm : sMax;
    return {
      lengthMm: s.lengthMm,
      mPosKnM: mPos,
      mNegLeftKnM: mNegL,
      mNegRightKnM: mNegR,
      vuKn: vu,
      pos,
      negLeft,
      negRight,
      shear: sh,
      stirrupSpacingMm: roundDown25(Math.min(sNeed, sMax)),
      deflection: defl,
      dKnM: dB[i],
      lKnM: lB[i],
      util,
      governs,
    };
  });
  const util = Math.max(...results.map((r) => r.util));
  return { section: sec, dMm, spans: results, util, ok: util <= 1 };
}

/** The smallest candidate section that passes every check, or the largest with its (failing) utilisation. */
export function sizeBeamLine(input: BeamLineInput, sections: BeamSection[] = BEAM_SECTIONS, minWidthMm = 0): BeamLineResult {
  const list = sections.filter((s) => s.bMm >= minWidthMm);
  for (const s of list) {
    const r = designBeamLine(input, s);
    if (r.ok) return r;
  }
  return designBeamLine(input, list[list.length - 1]);
}
