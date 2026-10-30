/**
 * Shared customization types for ArchResidenceBD
 * Single source of truth for all customization sub-interfaces.
 * Extracted from parametricBuildingGenerator.ts to break circular dependency
 * with projectState.ts.
 */

export interface AccessibilitySettings {
  rampSlope: number;
  rampWidthMm: number;
  doorClearWidthMm: number;
  wcClearMm: [number, number];
  tactilePathWidthMm: number;
  elevatorRequired: boolean;
  elevatorPitMm: number;
  elevatorWellMm: [number, number, number];
  grabRailHeightMm: number;
  brailleSignage: boolean;
}

export interface SustainabilitySettings {
  annualRainfallMm: number;
  tankEfficiency: number;
  roofUValue: number;
  wallUValue: number;
  windowUValue: number;
  coolingLoadFactor: number;
  windowToFloorRatioMin: number;
  daylightFactorTarget: number;
}

export interface FireSafetySettings {
  enabled: boolean;
  stairWidthMm: number;
  corridorWidthMm: number;
  travelDistanceMaxM: number;
  fireRatingHours: number;
  sprinklerSystem: boolean;
  smokeDetector: boolean;
}

export interface ValueEngineeringSettings {
  enabled: boolean;
  autoApply: boolean;
}

export interface ConstructionMgmtSettings {
  enabled: boolean;
}

export interface BuildingCustomization {
  columnWidthMm?: number;
  columnDepthMm?: number;
  footingSizeMm?: number;
  footingDepthMm?: number;
  balconyDepthMm?: number;
  concreteGrade?: 20 | 25 | 30 | 35 | 40;
  steelGrade?: 250 | 415 | 500;
  accessibility?: AccessibilitySettings;
  sustainability?: SustainabilitySettings;
  fireSafety?: FireSafetySettings;
  valueEngineering?: ValueEngineeringSettings;
  constructionMgmt?: ConstructionMgmtSettings;
}

export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  rampSlope: 12,
  rampWidthMm: 1200,
  doorClearWidthMm: 900,
  wcClearMm: [1500, 1500],
  tactilePathWidthMm: 300,
  elevatorRequired: true,
  elevatorPitMm: 1200,
  elevatorWellMm: [1400, 1100, 2100],
  grabRailHeightMm: 700,
  brailleSignage: true,
};

export const DEFAULT_SUSTAINABILITY_DHAKA: SustainabilitySettings = {
  annualRainfallMm: 2000,
  tankEfficiency: 0.85,
  roofUValue: 0.8,
  wallUValue: 1.2,
  windowUValue: 3.5,
  coolingLoadFactor: 12,
  windowToFloorRatioMin: 0.15,
  daylightFactorTarget: 2.0,
};

export const DEFAULT_FIRE_SAFETY: FireSafetySettings = {
  enabled: false,
  stairWidthMm: 1000,
  corridorWidthMm: 1200,
  travelDistanceMaxM: 30,
  fireRatingHours: 2,
  sprinklerSystem: false,
  smokeDetector: true,
};

export const DEFAULT_VALUE_ENGINEERING: ValueEngineeringSettings = {
  enabled: false,
  autoApply: false,
};

export const DEFAULT_CONSTRUCTION_MGMT: ConstructionMgmtSettings = {
  enabled: false,
};