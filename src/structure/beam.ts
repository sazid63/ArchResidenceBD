/**
 * Design of one continuous beam line (spans between columns along a structural grid line): factored pattern-load
 * envelope, flexure at supports and mid-span, shear at d from the support face, service deflection against both
 * Table 6.6.2 limits. Live load is reduced per Sec 2.3.13. Utilisation is never clamped.
 * Units: kN, m, mm unless a name says otherwise.
 */

import { structurePack } from "../rules/bnbcStructure";
import { analyseSpans, envelope, midMoment } from "./continuousBeam";
import { beamSelfWeightKnM, liveReductionFactor, wallLineLoadKnM } from "./loads";
import { DESIGN, ecMPa, MATERIALS } from "./materials";
import { beamMinAs, crackedInertia, flexure, shear, type FlexureResult, type ShearResult } from "./section";
import { beamMpr, beamVe } from "./capacity";

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
  /** Slab dead load on this span as a uniform line load, kN/m (unfactored, slab self-weight and finishes included). */
  slabDead: number;
  /** Slab live load on this span, kN/m: the Table 6.2.3 part (reducible) and the partition allowance (not reduced). */
  slabLiveTable: number;
  slabLivePartition: number;
  /** Largest unreduced Table 6.2.3 live load of the adjoining panels, kN/m2, and the tributary area of the span, m2. */
  liveBaseKnM2: number;
  tributaryAreaM2: number;
  /** Walls on this span: thickness (mm) and the share of the span they cover (0..1), or null for none. */
  wallThicknessMm: number | null;
  wallShare: number;
}

export interface BeamLineInput {
  spans: BeamSpanInput[];
  /** Wall height before taking off the beam depth, mm (a roof parapet passes its own height). */
  wallHeightMm: number;
  slabThicknessMm: number;
  /** Floors reduce live load (Sec 2.3.13); roof live loads are not reduced there. */
  reduceLive: boolean;
}

export interface BeamDeflection {
  immediateLiveMm: number;
  /** Long-term growth of the dead part plus the immediate live part. */
  afterPartitionsMm: number;
  /** Limits: span/360 on the immediate live part, span/480 on the part after partitions. */
  liveLimitMm: number;
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
  /** Service line loads used, kN/m: dead and (reduced) live. */
  dKnM: number;
  lKnM: number;
  /** Unreduced live line load: the Table 6.2.3 part and the partition allowance, kN/m (columns take their own reduction). */
  lTableKnM: number;
  lPartitionKnM: number;
  /** L / L0 from Sec 2.3.13 (1 when no reduction applies). */
  liveFactor: number;
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

/** Service deflection of one span under the given load, mm (Eq 6.6.1 Branson Ie at mid-span, effective-moment form). */
function spanDeflection(lMm: number, mMid: number, mL: number, mR: number, sec: BeamSection, asMm2: number): number {
  if (mMid <= 0) return 0;
  const ec = ecMPa(MATERIALS.fcMPa);
  const ig = (sec.bMm * sec.hMm ** 3) / 12;
  const mcr = (0.62 * Math.sqrt(MATERIALS.fcMPa) * ig) / (sec.hMm / 2) / 1e6; // fr = 0.62 sqrt(fc), Eq 6.6.3
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
  const kll = structurePack().liveLoadReduction.kll.interiorBeams; // interior and edge beams without cantilever slabs: 2
  const factor = sp.map((s) => (input.reduceLive ? liveReductionFactor(s.liveBaseKnM2, s.tributaryAreaM2, kll) : 1));
  const dead = sp.map((s, i) => s.slabDead + self + wall[i]);
  const live = sp.map((s, i) => s.slabLiveTable * factor[i] + s.slabLivePartition);
  const lens = sp.map((s) => s.lengthMm / 1000);

  const env = envelope(lens, dead, live, 1.2, 1.6);
  const service = analyseSpans(lens.map((L, i) => ({ lengthM: L, w: dead[i] + live[i] })));
  const deadOnly = analyseSpans(lens.map((L, i) => ({ lengthM: L, w: dead[i] })));

  const results: BeamSpanResult[] = sp.map((s, i) => {
    const L = lens[i];
    const wFull = Math.max(1.4 * dead[i], 1.2 * dead[i] + 1.6 * live[i]);
    const nominalEnd = (wFull * L * L) / 24; // Sec 6.1.4.3: exterior support is a spandrel beam, wu ln^2 / 24
    const mPos = env.spans[i].mPos;
    const mNegL = Math.max(-env.spans[i].mLeft, i === 0 ? nominalEnd : 0);
    const mNegR = Math.max(-env.spans[i].mRight, i === sp.length - 1 ? nominalEnd : 0);
    const vu = Math.max(env.spans[i].vMax - (wFull * (DESIGN.supportWidthMm / 2 + dMm)) / 1000, 0);
    const minAs = beamMinAs(sec.bMm, dMm);
    const pos = flexure(mPos, sec.bMm, dMm, minAs);
    const negLeft = flexure(mNegL, sec.bMm, dMm, minAs);
    const negRight = flexure(mNegR, sec.bMm, dMm, minAs);
    // Sec 8.3.8.1 (a): design shear of an SMF beam from the probable end moments and the factored gravity load, never below Vu
    const clearLnMm = s.lengthMm - DESIGN.supportWidthMm;
    const ve = beamVe(beamMpr(negLeft.asReqMm2, sec.bMm, dMm), beamMpr(negRight.asReqMm2, sec.bMm, dMm), clearLnMm, wFull, vu);
    const sh = shear(ve, sec.bMm, dMm);

    const asProv = Number.isFinite(pos.asReqMm2) ? pos.asReqMm2 : minAs;
    const mDL = midMoment({ lengthM: L, w: dead[i] + live[i] }, service[i]);
    const mD = midMoment({ lengthM: L, w: dead[i] }, deadOnly[i]);
    const dDL = spanDeflection(s.lengthMm, mDL, service[i].mLeft, service[i].mRight, sec, asProv);
    const dD = spanDeflection(s.lengthMm, mD, deadOnly[i].mLeft, deadOnly[i].mRight, sec, asProv);
    const dLive = Math.max(dDL - dD, 0);
    const after = DESIGN.longTermFactor * dD + dLive;
    const limit = s.lengthMm / DESIGN.deflectionLimitDiv;
    const liveLimit = s.lengthMm / DESIGN.liveDeflectionLimitDiv;
    const defl: BeamDeflection = { immediateLiveMm: dLive, afterPartitionsMm: after, liveLimitMm: liveLimit, limitMm: limit, util: Math.max(after / limit, dLive / liveLimit) };

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
      vuKn: ve,
      pos,
      negLeft,
      negRight,
      shear: sh,
      stirrupSpacingMm: roundDown25(Math.min(sNeed, sMax)),
      deflection: defl,
      dKnM: dead[i],
      lKnM: live[i],
      lTableKnM: s.slabLiveTable,
      lPartitionKnM: s.slabLivePartition,
      liveFactor: factor[i],
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
