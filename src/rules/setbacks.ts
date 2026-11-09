/**
 * RAJUK 2008 mandatory setbacks (pack `setbackTable`, gazette pages 3043-3044) as integer-mm
 * values for the building envelope. Replaces DEFAULT_SETBACKS_MM (ticket M3-2).
 */

import type { Setbacks } from "../model/building";
import { setbackRow, type SetbackResult } from "./engine";
import { rajukPack } from "./pack";

export interface RajukSetbacks {
  setbacksMm: Setbacks;
  row: SetbackResult;
  /** Citation id in the pack's `citations` map. */
  cite: string;
}

const mm = (m: number) => Math.round(m * 1000);

/**
 * Setbacks for a plot of `plotAreaSqm` and a building of `storeys` storeys (storeys including the
 * ground floor) and `floorToFloorMm`. Both sides get the table's side value. Height is taken as
 * storeys x floor-to-floor (ASSUMPTION: parapet and roof cover do not count towards the 33 m limit).
 */
export function rajukSetbacks(plotAreaSqm: number, storeys: number, floorToFloorMm = 3000): RajukSetbacks {
  const pack = rajukPack();
  const row = setbackRow(pack.setbackTable, plotAreaSqm, { storeys, heightM: (storeys * floorToFloorMm) / 1000 });
  // The last table row is open-ended, so a row always exists for a positive area.
  if (!row) throw new Error(`No RAJUK setback row for a plot of ${plotAreaSqm} sqm.`);
  return {
    setbacksMm: { front: mm(row.frontM), rear: mm(row.rearM), left: mm(row.sideM), right: mm(row.sideM) },
    row,
    cite: pack.setbackTable.cite,
  };
}
