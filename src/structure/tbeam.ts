/** T-beam section properties shared by the slab thickness check (analyze.ts) and the frame stiffness (frame.ts). */

import type { BeamSection } from "./beam";

/** Second moment of area (mm4) of a T-beam: web bw x h with flange overhangs of min(h - hf, 4 hf) on each adjoining side (ACI 318 rule). */
export function tBeamInertia(bwMm: number, hMm: number, hfMm: number, sides: number): number {
  const overhang = Math.min(hMm - hfMm, 4 * hfMm);
  const bf = bwMm + sides * overhang;
  const aF = bf * hfMm;
  const aW = bwMm * (hMm - hfMm);
  const yF = hfMm / 2;
  const yW = hfMm + (hMm - hfMm) / 2;
  const yBar = (aF * yF + aW * yW) / (aF + aW);
  return (bf * hfMm ** 3) / 12 + aF * (yF - yBar) ** 2 + (bwMm * (hMm - hfMm) ** 3) / 12 + aW * (yW - yBar) ** 2;
}

/** Beam-to-slab stiffness ratio alpha_f (Sec 6.2.5.3.3): Ib / Is, with Is the slab strip bounded by the adjoining panel centrelines. */
export function alphaF(sec: BeamSection, hfMm: number, sides: number, stripWidthMm: number): number {
  return tBeamInertia(sec.bMm, sec.hMm, hfMm, sides) / ((stripWidthMm * hfMm ** 3) / 12);
}
