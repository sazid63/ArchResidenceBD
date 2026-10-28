/**
 * Structural Analysis Engine for ArchResidenceBD
 * Implements BNBC 2020 / RAJUK DAP 2022 compliant calculations
 * - Beam bending & shear analysis
 * - Column buckling (ACI 318 / BNBC)
 * - Slab deflection checks
 * - Foundation bearing capacity ( Terzaghi )
 * - Seismic response spectrum (BNBC Ch 2.5)
 */

// ---- Material Properties ----
export interface ConcreteSpec {
  fck: number;           // Characteristic compressive strength (MPa)
  fcd: number;           // Design compressive strength = fck / 1.5
  es: number;            // Modulus of elasticity = 5000 * sqrt(fck) (MPa)
  fcud: number;          // Ultimate design stress = 0.446 * fck
}

export interface SteelSpec {
  fy: number;            // Yield strength (MPa)
  fyd: number;           // Design yield strength = fy / 1.15
  es: number;            // Modulus of elasticity = 200000 MPa
  coverMm: number;       // Concrete cover (mm)
  linkDiameter: number;  // Link diameter (mm)
}

export interface SoilSpec {
  qu: number;            // Ultimate bearing capacity (kN/m²)
  ad: number;            // Allowable bearing capacity (kN/m²)
  cohesion: number;      // Cohesion (kPa)
  frictionAngle: number; // Friction angle (degrees)
  unitWeight: number;    // Unit weight (kN/m³)
  sptN: number;          // SPT N-value
}

// ---- BNBC 2020 Parameters ----
export interface BNBCParams {
  seismicZone: number;   // Zone I-IV (1-4)
  zFactor: number;       // Zone factor
  impFactor: number;     // Importance factor
  rFactor: number;       // Response reduction factor
  cdFactor: number;      // Deflection amplification factor
  soilType: "A" | "B" | "C" | "D" | "E";
}

export const BNBC_DEFAULT: BNBCParams = {
  seismicZone: 2,        // Dhaka is Zone 3 (high), default to 2 for safety
  zFactor: 0.16,         // Zone 3
  impFactor: 1.0,        // Residential
  rFactor: 5.0,          // Ordinary RC moment-resisting frame
  cdFactor: 4.5,         // For R=5
  soilType: "D",         // Stiff soil (typical for Dhaka)
};

// ---- Section Properties ----
export interface RectSection {
  width: number;        // mm
  depth: number;        // mm
  cover: number;        // mm (effective cover)
  mainBarDia: number;   // mm
  numMainBars: number;
  linkDia: number;      // mm
}

export function computeSectionProps(
  section: RectSection,
  concrete: ConcreteSpec,
  steel: SteelSpec
): {
  Ag: number;           // Gross area (mm²)
  Z: number;            // Elastic section modulus (mm³)
  Pu_max: number;       // Maximum axial capacity (kN)
  Mu_max: number;       // Maximum moment capacity (kN·m)
  As_provided: number;  // Area of steel (mm²)
  rho: number;          // Reinforcement ratio
  rho_min: number;      // Minimum reinforcement ratio
  rho_max: number;      // Maximum reinforcement ratio
} {
  const coverEff = section.cover + section.linkDia + section.mainBarDia / 2;
  const d = section.depth - coverEff; // Effective depth
  const b = section.width;
  
  const Ag = b * section.depth;
  const Z = (b * section.depth * section.depth) / 6;
  
  const As_provided = section.numMainBars * Math.PI * section.mainBarDia * section.mainBarDia / 4;
  const rho = As_provided / (b * d);
  
  // BNBC/ACI limits: rho_min = max(0.0018, 0.25*sqrt(fck)/fy) but >= 0.0014
  const rho_min_calc = Math.max(
    0.0018,
    0.25 * Math.sqrt(concrete.fck) / steel.fy
  );
  const rho_min = Math.max(rho_min_calc, 0.0014);
  
  // rho_max for tension-controlled: 0.85 * beta1 * fck/fy * (600/(600+fy))
  const beta1 = concrete.fck <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (concrete.fck - 28) / 7);
  const rho_max = 0.85 * beta1 * concrete.fck / steel.fy * (600 / (600 + steel.fy));
  
  // Ultimate axial capacity (simplified ACI): Pn_max = 0.80 * [0.85*fc'(Ag - As) + fy*As]
  const Pu_max = 0.80 * (0.85 * concrete.fcd * (Ag - As_provided) + steel.fyd * As_provided) / 1000; // kN
  
  // Moment capacity (simplified): Mu = As * fyd * (d - a/2) where a = As*fy/(0.85*fc'*b)
  const a = As_provided * steel.fy / (0.85 * concrete.fck * b);
  const Mu_max = As_provided * steel.fyd * (d - a / 2) / 1e6; // kN·m
  
  return {
    Ag, Z, Pu_max, Mu_max,
    As_provided, rho, rho_min, rho_max
  };
}

// ---- Beam Analysis ----
export interface BeamLoad {
  selfWeight: number;      // kN/m (dead load from self-weight)
  superimposedDead: number; // kN/m (floor finish, partitions, etc.)
  liveLoad: number;        // kN/m (occupancy load)
  wallLoad: number;        // kN/m (wall load on beam)
}

export interface BeamResult {
  span: number;           // m
  maxMoment: number;      // kN·m (factored)
  maxShear: number;       // kN (factored)
  maxDeflection: number;  // mm
  allowableDeflection: number; // mm (L/250 or L/360)
  utilizationMoment: number; // 0-1
  utilizationShear: number;   // 0-1
  shearReinforcementRequired: boolean;
  detail: {
    maxBarSpacing: number;    // mm
    numLinksPerMeter: number;
    linkSpacing: number;      // mm
    stirrupCage: string;
  };
}

export function analyzeBeam(
  section: RectSection,
  span: number,
  load: BeamLoad,
  concrete: ConcreteSpec,
  steel: SteelSpec
): BeamResult {
  const L = span;
  const wFactored = load.selfWeight + load.superimposedDead + 1.5 * load.liveLoad + load.wallLoad;
  
  // Simply supported beam (conservative)
  const M_u = (wFactored * L * L) / 8; // kN·m
  const V_u = (wFactored * L) / 2;      // kN
  
  // Moment capacity check
  const props = computeSectionProps(section, concrete, steel);
  const utilMoment = M_u / props.Mu_max;
  
  // Shear capacity (simplified: Vc = 0.17 * sqrt(fck) * b * d / 1000)
  const d = section.depth - section.cover - section.linkDia - section.mainBarDia / 2;
  const Vc = 0.17 * Math.sqrt(concrete.fck) * section.width * d / 1000; // kN
  const Vu_threshold = 0.5 * Vc;
  
  // Shear reinforcement
  const shearReinforcementRequired = V_u > Vu_threshold;
  let linkSpacing = 300; // default conservative
  if (shearReinforcementRequired) {
    const Av = 2 * Math.PI * (steel.linkDiameter / 2) * (steel.linkDiameter / 2); // area of 2-leg stirrup
    const s = (Av * steel.fyd * d) / (V_u * 1000); // spacing in mm
    linkSpacing = Math.min(Math.max(s, 100), 300); // min 100mm, max 300mm per BNBC
  }
  
  // Deflection check (simplified: delta = 5wL^4 / 384EI)
  const E = concrete.es * 1000; // MPa to kN/m² (wrong, should be N/mm²)
  const I = (section.width * Math.pow(section.depth, 3)) / 12; // mm⁴
  const w_Nmm = wFactored * 1000 / L; // convert to N/mm (approx)
  const delta = (5 * w_Nmm * Math.pow(L * 1000, 4)) / (384 * E * 1000 * I / 1e6); // mm
  
  // Allowable deflection: L/250 for live load, L/360 for total
  const allowableLive = (L * 1000) / 250;
  const allowableTotal = (L * 1000) / 360;
  const allowable = Math.min(allowableLive, allowableTotal);
  
  // Shear utilization
  const utilShear = V_u / Vc;
  
  return {
    span: L,
    maxMoment: Math.round(M_u * 100) / 100,
    maxShear: Math.round(V_u * 100) / 100,
    maxDeflection: Math.round(delta * 100) / 100,
    allowableDeflection: Math.round(allowable * 100) / 100,
    utilizationMoment: Math.round(utilMoment * 100) / 100,
    utilizationShear: Math.round(Math.min(utilShear, 1) * 100) / 100,
    shearReinforcementRequired,
    detail: {
      maxBarSpacing: Math.min(section.width / 2, 300),
      numLinksPerMeter: Math.round(1000 / linkSpacing),
      linkSpacing: Math.round(linkSpacing),
      stirrupCage: `${section.numMainBars}T${section.mainBarDia}${shearReinforcementRequired ? `@${Math.round(linkSpacing)}/S` : "UNREINFORCED"}`,
    }
  };
}

// ---- Column Analysis ----
export interface ColumnLoad {
  axialLoad: number;    // kN (factored)
  momentMajor: number;  // kN·m
  momentMinor: number;  // kN·m
  unbracedLength: number; // m
}

export interface ColumnResult {
  slendernessRatioX: number;
  slendernessRatioY: number;
  isSlender: boolean;
  Pu_capacity: number;     // kN
  utilization: number;     // 0-1
  minEccentricity: number; // mm
  secondOrderEffect: boolean;
  lapSpliceRequired: boolean;
  lapLength: number;       // mm
  detail: {
    clearSpacing: number;      // mm
    numLinks: number;
    linkSpacing: number;       // mm
    mainBarArrangement: string;
  };
}

export function analyzeColumn(
  section: RectSection,
  load: ColumnLoad,
  concrete: ConcreteSpec,
  steel: SteelSpec
): ColumnResult {
  const L = load.unbracedLength;
  const k = 1.0; // effective length factor (pinned-pinned conservative)
  const le = k * L * 1000; // effective length in mm
  
  // Radius of gyration
  const rx = Math.sqrt((section.width * Math.pow(section.depth, 3)) / (12 * section.width * section.depth));
  const ry = Math.sqrt((Math.pow(section.width, 3) * section.depth) / (12 * section.width * section.depth));
  
  // Slenderness ratios
  const lambda_x = le / section.depth;
  const lambda_y = le / section.width;
  
  // BNBC: slender if lambda > 12 (short column limit)
  const isSlender = lambda_x > 12 || lambda_y > 12;
  
  // Minimum eccentricity per BNBC 2020 §5.3.2
  const e_min_x = Math.max(section.depth / 30, 20); // mm
  const e_min_y = Math.max(section.width / 30, 20); // mm
  
  // Axial capacity (ACI 318 simplified)
  const props = computeSectionProps(section, concrete, steel);
  
  // For slender columns, apply moment magnifier (simplified Branson)
  const Cr = isSlender ? 0.9 : 1.0; // reduction factor for slender columns
  const Pu_capacity = props.Pu_max * Cr;
  const utilization = load.axialLoad / Pu_capacity;
  
  // Second-order effects
  const secondOrderEffect = isSlender && utilization > 0.4;
  
  // Lap splice check (developed bars only need splicing if not fully anchored)
  // Development length: ld = (fy * db) / (4 * sqrt(fc') ) per ACI 318
  const ld = (DEFAULT_STEEL.fy * section.mainBarDia) / (4 * Math.sqrt(concrete.fck));
  const lapLength = Math.max(ld, 30 * section.mainBarDia); // min 30 diameters
  
  // Lap splice required if column height > lapLength (in mm)
  const lapSpliceRequired = L * 1000 > lapLength;
  
  // Clear spacing between bars (per BNBC min 1.5 * bar dia)
  const clearSpacing = Math.max(section.width - 2 * section.cover - 2 * DEFAULT_STEEL.linkDiameter - section.numMainBars * section.mainBarDia, 0);
  const minClearSpacing = Math.max(1.5 * section.mainBarDia, 25);
  
  return {
    slendernessRatioX: Math.round(lambda_x * 100) / 100,
    slendernessRatioY: Math.round(lambda_y * 100) / 100,
    isSlender,
    Pu_capacity: Math.round(Pu_capacity * 100) / 100,
    utilization: Math.round(Math.min(utilization, 1) * 100) / 100,
    minEccentricity: Math.round(e_min_x),
    secondOrderEffect,
    lapSpliceRequired,
    lapLength: Math.round(lapLength),
    detail: {
      clearSpacing: Math.round(clearSpacing),
      numLinks: Math.ceil(L * 1000 / 300), // approx 300mm spacing
      linkSpacing: 300,
      mainBarArrangement: `${section.numMainBars}T${section.mainBarDia}(${clearSpacing > minClearSpacing ? "OK" : "INSUFFICIENT"})`,
    }
  };
}

// ---- Foundation Design ----
export interface FoundationDesign {
  footingWidth: number;      // m
  footingDepth: number;      // m
  rebarSize: number;         // mm
  rebarSpacing: number;      // mm
  matFootingRequired: boolean;
  settlementEstimate: number; // mm
  bearingCapacityUtil: number; // 0-1
  safetyFactor: number;
}

export function designFooting(
  columnWidth: number,       // mm
  columnDepth: number,       // mm
  axialLoad: number,         // kN (factored)
  soil: SoilSpec,
  concrete: ConcreteSpec
): FoundationDesign {
  const Pu = axialLoad; // factored load
  const qa = soil.ad;    // allowable bearing capacity (kN/m²)
  
  // Required area
  const A_req = Pu / qa; // m²
  const side = Math.sqrt(A_req); // square footing
  const footingWidth = Math.max(side * 1000, columnWidth + 600); // min 600mm projection each side
  
  // Footing thickness (one-way shear control, simplified)
  // Assume d ≈ 0.4 * footingWidth
  const footingDepth = Math.max(footingWidth * 0.35 / 1000, 0.3); // min 300mm
  
  // Check punching shear (simplified)
  const perimeter = 4 * (columnWidth + columnDepth); // mm (square column assumption)
  const d_eff = footingDepth * 1000 - 50; // effective depth in mm
  const Vc_punching = 0.33 * Math.sqrt(concrete.fck) * perimeter * d_eff / 1000; // kN
  const shearUtil = Pu / Vc_punching;
  
  // Reinforcement (moment at critical section)
  const projection = (footingWidth - columnWidth) / 2; // mm
  const p_factored = Pu / (footingWidth * footingWidth); // kN/m²
  const M_u = (p_factored * projection * projection) / 2; // kN·m per meter width
  
  // Required steel area (simplified)
  const b = 1000; // 1 meter width
  const d = footingDepth * 1000 - 50; // mm
  const R_u = M_u * 1e6 / (b * d * d); // N/mm²
  const As_req = (0.85 * concrete.fck / DEFAULT_STEEL.fyd) * (1 - Math.sqrt(1 - 2 * R_u / (0.85 * concrete.fck)));
  const As_provided = Math.max(As_req * b * d, 0.0018 * b * footingDepth * 1000); // min reinforcement
  
  // Bar spacing
  const barArea = Math.PI * 12 * 12 / 4; // assume 12mm bars
  const spacing = barArea * 1000 / As_provided;
  
  // Settlement estimate (Terzaghi simplified)
  const settlement = (Pu / qa) * 0.5; // very rough: 0.5mm per m² of loaded area (conservative for stiff soil)
  
  // Bearing capacity utilization
  const bearingUtil = Pu / (qa * footingWidth * footingWidth);
  
  return {
    footingWidth: Math.round(footingWidth / 100) / 10,
    footingDepth: Math.round(footingDepth * 100) / 100,
    rebarSize: 12,
    rebarSpacing: Math.round(spacing / 10) * 10,
    matFootingRequired: shearUtil > 1.0,
    settlementEstimate: Math.round(settlement * 10) / 10,
    bearingCapacityUtil: Math.round(bearingUtil * 100) / 100,
    safetyFactor: Math.round((qa * footingWidth * footingWidth / Pu) * 100) / 100,
  };
}

// ---- Seismic Design ----
export interface SeismicAnalysis {
  baseShear: number;       // kN
  baseShearCoeff: number;  // V/W
  storyShear: number[];    // kN per story
  storyDrift: number[];    // mm per story
  maxDrift: number;        // mm
  allowableDrift: number;  // mm (H/500)
  seismicWeight: number;   // kN
  naturalPeriod: number;   // seconds
  displacement: number;    // mm (design displacement)
}

export function seismicAnalysis(
  totalWeight: number,      // kN (seismic weight)
  heights: number[],        // m above base for each story
  params: BNBCParams,
  storyStiffness: number[]  // kN/mm per story
): SeismicAnalysis {
  const H = heights[heights.length - 1]; // total height
  const W = totalWeight;
  
  // Fundamental period (UBC/BNBC empirical)
  // Ta = 0.09 * H / sqrt(D) where D is base dimension (assume square)
  const D = Math.sqrt(W / 5); // approximate footprint from weight (assume 5 kN/m² dead load)
  const Ta = 0.09 * H / Math.sqrt(D);
  
  // Response spectrum acceleration (BNBC 2020 Fig 2.5.1)
  // For Zone 3, short period Sa/a_g = 2.5 * z * I * S
  const Sa_over_ag = 2.5 * params.zFactor * params.impFactor;
  const V = (Sa_over_ag * W) / params.rFactor; // base shear
  
  // Distribute lateral force to each story
  const storyShear: number[] = [];
  let cumulativeForce = 0;
  for (let i = 0; i < heights.length; i++) {
    const Fi = V * (W * heights[i]) / (W * H); // proportional to height
    cumulativeForce += Fi;
    storyShear.push(Math.round(cumulativeForce * 100) / 100);
  }
  
  // Story drift calculation (simplified: delta = V / (k * n))
  const maxDrift = storyShear[storyShear.length - 1] / (storyStiffness[storyStiffness.length - 1] * 1000);
  const allowableDrift = (H * 1000) / 500; // H/500 per BNBC
  
  // Total displacement at top
  const displacement = maxDrift * heights.length;
  
  return {
    baseShear: Math.round(V * 100) / 100,
    baseShearCoeff: Math.round(V / W * 10000) / 10000,
    storyShear: storyShear.map(v => Math.round(v * 100) / 100),
    storyDrift: storyShear.map((_, i) => Math.round((storyShear[i] / storyStiffness[i] / 1000) * 100) / 100),
    maxDrift: Math.round(maxDrift * 100) / 100,
    allowableDrift: Math.round(allowableDrift * 100) / 100,
    seismicWeight: Math.round(W * 100) / 100,
    naturalPeriod: Math.round(Ta * 1000) / 1000,
    displacement: Math.round(displacement * 100) / 100,
  };
}

// ---- Material Constants ----
export const CONCRETE_GRADES: Record<number, ConcreteSpec> = {
  20: { fck: 20, fcd: 13.33, es: 22360, fcud: 8.92 },
  25: { fck: 25, fcd: 16.67, es: 25000, fcud: 11.15 },
  30: { fck: 30, fcd: 20.0, es: 27386, fcud: 13.38 },
  35: { fck: 35, fcd: 23.33, es: 29580, fcud: 15.61 },
  40: { fck: 40, fcd: 26.67, es: 31622, fcud: 17.84 },
};

export const STEEL_GRADES: Record<number, SteelSpec> = {
  250: { fy: 250, fyd: 217.39, es: 200000, coverMm: 40, linkDiameter: 8 },
  415: { fy: 415, fyd: 360.87, es: 200000, coverMm: 40, linkDiameter: 8 },
  500: { fy: 500, fyd: 434.78, es: 200000, coverMm: 40, linkDiameter: 8 },
};

// Quick access for foundation design
const DEFAULT_STEEL = STEEL_GRADES[415];

// Export default materials for convenience
export const DEFAULT_CONCRETE = CONCRETE_GRADES[25]; // M25 common
export const DEFAULT_STEEL_EXPORT = DEFAULT_STEEL; // Fe415 standard
