/**
 * Shared hook for project customization screens.
 * Eliminates the 300-line duplication across 5 screens that each had their own
 * identical useCustomization hook (Accessibility, Sustainability, FireSafety,
 * ValueEngineering, Construction).
 */
import { useState, useEffect, useCallback } from "react";
import { getActiveProject, saveActiveProject } from "../engine/projectState";
import type { BuildingProject } from "../engine/projectState";
import type {
  BuildingCustomization,
  AccessibilitySettings,
  SustainabilitySettings,
  FireSafetySettings,
  ValueEngineeringSettings,
  ConstructionMgmtSettings,
} from "../types/customization";
import {
  DEFAULT_ACCESSIBILITY,
  DEFAULT_SUSTAINABILITY_DHAKA,
  DEFAULT_FIRE_SAFETY,
  DEFAULT_VALUE_ENGINEERING,
  DEFAULT_CONSTRUCTION_MGMT,
} from "../types/customization";

export type AnySettings =
  | AccessibilitySettings
  | SustainabilitySettings
  | FireSafetySettings
  | ValueEngineeringSettings
  | ConstructionMgmtSettings;

export interface UseProjectCustomizationReturn<T extends AnySettings> {
  project: BuildingProject | null;
  customization: T;
  updateCustomization: (field: keyof T, value: T[keyof T]) => void;
  isLoading: boolean;
}

export type CustomizationKey =
  | "accessibility"
  | "sustainability"
  | "fireSafety"
  | "valueEngineering"
  | "constructionMgmt";

export const CUSTOMIZATION_DEFAULTS: Record<CustomizationKey, AnySettings> = {
  accessibility: DEFAULT_ACCESSIBILITY,
  sustainability: DEFAULT_SUSTAINABILITY_DHAKA,
  fireSafety: DEFAULT_FIRE_SAFETY,
  valueEngineering: DEFAULT_VALUE_ENGINEERING,
  constructionMgmt: DEFAULT_CONSTRUCTION_MGMT,
};

/**
 * Shared hook that all 5 customization screens use.
 * Replaces the duplicated 47-line useEffect + updateCustomization pattern.
 *
 * @param key - The customization category to manage
 * @param defaultSettings - Default settings to use if none exist
 */
export function useProjectCustomization<T extends AnySettings>(
  key: CustomizationKey,
  defaultSettings: T,
): UseProjectCustomizationReturn<T> {
  const [project, setProject] = useState<BuildingProject | null>(null);
  const [customization, setCustomization] = useState<T>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const active = getActiveProject();
    if (active) {
      setProject(active);
      setCustomization(
        (active.customization?.[key] as T) || defaultSettings,
      );
    }
    setIsLoading(false);
  }, [key, defaultSettings]);

  const updateCustomization = useCallback(
    (field: keyof T, value: T[keyof T]) => {
      if (!project || !customization) return;

      const updated = { ...customization, [field]: value } as T;
      setCustomization(updated);

      const updatedProject: BuildingProject = {
        ...project,
        customization: {
          ...(project.customization || {}),
          [key]: updated,
        },
        updatedAt: new Date().toISOString(),
      };
      setProject(updatedProject);
      saveActiveProject(updatedProject);
    },
    [project, customization, key],
  );

  return { project, customization, updateCustomization, isLoading };
}