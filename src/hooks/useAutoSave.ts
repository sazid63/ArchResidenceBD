import { useState, useEffect, useCallback } from "react";
import { getActiveProject, saveActiveProject, BuildingProject } from "../engine/projectState";

interface AutoSaveOptions {
  debounceMs?: number;
  maxVersions?: number;
  onSave?: (project: BuildingProject) => void;
  onError?: (error: Error) => void;
}

interface AutoSaveReturn {
  isSaving: boolean;
  lastSaved: Date | null;
  error: Error | null;
  manualSave: () => void;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_OPTIONS: Required<AutoSaveOptions> = {
  debounceMs: 2000,
  maxVersions: 20,
  onSave: () => {},
  onError: () => {},
};

export function useAutoSave(options: AutoSaveOptions = {}): AutoSaveReturn {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [versionStack, setVersionStack] = useState<BuildingProject[]>([]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);

  // Load initial project and setup version stack
  useEffect(() => {
    const project = getActiveProject();
    if (project) {
      setVersionStack([project]);
      setCurrentVersionIndex(0);
      setLastSaved(new Date());
    }
  }, []);

  // Auto-save when project changes
  useEffect(() => {
    const saveTimeout = setTimeout(() => {
      manualSave();
    }, config.debounceMs);

    return () => clearTimeout(saveTimeout);
  }, [versionStack[currentVersionIndex]]);

  const manualSave = useCallback(async () => {
    const project = getActiveProject();
    if (!project) return;

    try {
      setIsSaving(true);
      setError(null);

      // Save the current version
      const updatedProject = { ...project, updatedAt: new Date().toISOString() };
      saveActiveProject(updatedProject);

      // Update version stack
      const newStack = versionStack.slice(0, currentVersionIndex + 1);
      newStack.push(updatedProject);
      
      // Keep only maxVersions
      if (newStack.length > config.maxVersions) {
        newStack.shift();
        setCurrentVersionIndex(currentVersionIndex);
      } else {
        setCurrentVersionIndex(currentVersionIndex + 1);
      }

      setVersionStack(newStack);
      setLastSaved(new Date());
      config.onSave(updatedProject);
    } catch (err) {
      const error = err as Error;
      setError(error);
      config.onError(error);
    } finally {
      setIsSaving(false);
    }
  }, [versionStack, currentVersionIndex, config]);

  const undo = useCallback(() => {
    if (currentVersionIndex > 0) {
      const previousVersion = versionStack[currentVersionIndex - 1];
      const updatedProject = { ...previousVersion, updatedAt: new Date().toISOString() };
      
      saveActiveProject(updatedProject);
      setCurrentVersionIndex(currentVersionIndex - 1);
      setLastSaved(new Date());
    }
  }, [versionStack, currentVersionIndex]);

  const redo = useCallback(() => {
    if (currentVersionIndex < versionStack.length - 1) {
      const nextVersion = versionStack[currentVersionIndex + 1];
      const updatedProject = { ...nextVersion, updatedAt: new Date().toISOString() };
      
      saveActiveProject(updatedProject);
      setCurrentVersionIndex(currentVersionIndex + 1);
      setLastSaved(new Date());
    }
  }, [versionStack, currentVersionIndex]);

  return {
    isSaving,
    lastSaved,
    error,
    manualSave,
    undo,
    redo,
  };
}

// Hook for tracking project changes with auto-save
export function useAutoSaveProject<T extends BuildingProject>(
  initialProject: T,
  options: AutoSaveOptions = {}
): {
  project: T | null;
  updateProject: (updater: (project: T) => T) => void;
  isSaving: boolean;
  lastSaved: Date | null;
  error: Error | null;
  manualSave: () => void;
  undo: () => void;
  redo: () => void;
} {
  const [project, setProject] = useState<T | null>(initialProject);
  const autoSave = useAutoSave(options);

  const updateProject = useCallback((updater: (project: T) => T) => {
    if (!project) return;
    
    const updated = updater(project);
    setProject(updated);
    // The autoSave hook will detect the change and save after debounce
  }, [project]);

  return {
    project,
    updateProject,
    isSaving: autoSave.isSaving,
    lastSaved: autoSave.lastSaved,
    error: autoSave.error,
    manualSave: autoSave.manualSave,
    undo: autoSave.undo,
    redo: autoSave.redo,
  };
}