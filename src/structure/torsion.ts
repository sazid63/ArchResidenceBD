/**
 * Torsion of the edge beam that carries a cantilever slab (Phase B2 follow-up).
 *
 * The cantilever moment Mu per metre of strip twists the supporting beam. This is equilibrium torsion: it cannot be
 * redistributed, so it is designed for. The torque is carried to the columns on each side of a beam span, so at a support
 * Tu = Mu * L / 2 with L the longest edge-beam span under the strip (or the strip width if shorter), torsionally fixed ends.
 *
 * The cantilever top bars run on into the back slab (monolithic), so the beam twists until it cracks and the back slab takes the
 * rest of the moment (compatibility torsion, ACI 318-08 Sec 11.5.2.2): the design torque is capped at the cracking torque
 * phi 0.33 sqrt(fc) Acp^2 / pcp, and `backSlabMomentKnMPerM` is the moment per metre the back panel must resist at the beam line.
 * That back-panel edge moment is reported, not re-checked.
 *
 * Method: ACI 318-08 Sec 11.5 thin-walled tube (threshold, section limit, closed-stirrup demand) with the BNBC 2020 Part 6
 * strength reduction phi 0.75 and fc' of the project. BNBC Part 6 torsion clauses are not transcribed in
 * spec/rules/bnbc-2020-structure.yaml, so the method is an ASSUMPTION (BNBC Part 6 is based on ACI 318); the screen says so.
 * Units: N, mm in the formulas, kN and kN.m in and out.
 */

import { DESIGN, MATERIALS } from "./materials";

export interface TorsionResult {
  /** Factored torque at the support, kN.m. */
  tuKnM: number;
  /** Torque if the beam had to carry all of the moment (equilibrium torsion), kN.m. */
  equilibriumKnM: number;
  /** Cracking torque that caps the design torque, kN.m. */
  crackingKnM: number;
  /** Moment per metre of strip the back-span slab must take at the beam line, kN.m/m (0 when the beam can carry it all). */
  backSlabMomentKnMPerM: number;
  /** Torque below which torsion may be neglected, phi 0.083 sqrt(fc) Acp^2 / pcp, kN.m. */
  thresholdKnM: number;
  /** True when Tu is above the threshold: closed stirrups and extra longitudinal bars are needed. */
  needsDesign: boolean;
  /** Section-limit ratio (shear plus torsion stress over phi(Vc + 0.66 sqrt(fc))); above 1 the section is too small. */
  util: number;
  /** Closed-stirrup area per mm of beam for torsion alone, one leg, mm2/mm (0 when neglected). */
  atPerMm: number;
}

export function edgeBeamTorsion(inp: { muKnMPerM: number; stripWidthMm: number /* the loaded length L above, mm */; vuKn: number; bMm: number; hMm: number }): TorsionResult {
  const { fc, fyt } = { fc: MATERIALS.fcMPa, fyt: MATERIALS.fytMPa };
  const phi = DESIGN.phiShear;
  const b = inp.bMm;
  const h = inp.hMm;
  const eq = (inp.muKnMPerM * inp.stripWidthMm) / 2 / 1000; // kN.m
  const acp = b * h;
  const pcp = 2 * (b + h);
  const cracking = (phi * 0.33 * Math.sqrt(fc) * acp * acp) / pcp / 1e6;
  const tu = Math.min(eq, cracking);
  const back = Math.max(0, inp.muKnMPerM - (2 * 1000 * tu) / inp.stripWidthMm);
  const threshold = (phi * 0.083 * Math.sqrt(fc) * acp * acp) / pcp / 1e6;
  const cs = DESIGN.coverBeamMm + DESIGN.stirrupMm / 2;
  const x1 = b - 2 * cs;
  const y1 = h - 2 * cs;
  const aoh = x1 * y1;
  const ph = 2 * (x1 + y1);
  const d = h - DESIGN.coverBeamMm - DESIGN.stirrupMm - DESIGN.mainBarMm / 2;
  const needsDesign = tu > threshold;
  const shearStress = (inp.vuKn * 1000) / (b * d);
  const torsionStress = needsDesign ? (tu * 1e6 * ph) / (1.7 * aoh * aoh) : 0;
  const limit = phi * (0.17 * Math.sqrt(fc) + 0.66 * Math.sqrt(fc));
  const util = Math.hypot(shearStress, torsionStress) / limit;
  const atPerMm = needsDesign ? (tu * 1e6) / (2 * phi * 0.85 * aoh * fyt) : 0;
  return { tuKnM: tu, equilibriumKnM: eq, crackingKnM: cracking, backSlabMomentKnMPerM: back, thresholdKnM: threshold, needsDesign, util, atPerMm };
}
