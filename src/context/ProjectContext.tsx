/**
 * Project Context — Single source of truth for project state.
 *
 * Replaces the pattern of every screen calling getActiveProject() from localStorage
 * directly. This fixes the prop-drilling of projectVersion and ensures proper
 * React render cycles when project state changes.
 */
import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import {
  getActiveProject,
  getActiveSpec,
  saveActiveProject,
  saveActiveSpec,
  type BuildingProject,
} from "../engine/projectState";
import type { ProjectSpec } from "../model/projectSpec";
import type { BuildingCustomization } from "../types/customization";

export interface ProjectContextValue {
  project: BuildingProject | null;
  /** The same project as the v3 spec: what the guided interview reads and writes. */
  spec: ProjectSpec | null;
  saveSpec: (spec: ProjectSpec) => void;
  projectVersion: number;
  refreshProject: () => void;
  saveCustomization: (customization: Partial<BuildingCustomization>) => void;
  saveProject: (project: BuildingProject) => void;
  activeCustomization: BuildingCustomization | undefined;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<BuildingProject | null>(() => getActiveProject());
  const [spec, setSpec] = useState<ProjectSpec | null>(() => getActiveSpec());
  const [projectVersion, setProjectVersion] = useState(0);

  const refreshProject = useCallback(() => {
    setProject(getActiveProject());
    setSpec(getActiveSpec());
    setProjectVersion((v) => v + 1);
  }, []);

  const saveCustomization = useCallback((patch: Partial<BuildingCustomization>) => {
    if (!project) return;
    const updatedProject: BuildingProject = {
      ...project,
      customization: {
        ...(project.customization || {}),
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    };
    saveActiveProject(updatedProject);
    setProject(updatedProject);
    setSpec(getActiveSpec());
    setProjectVersion((v) => v + 1);
  }, [project]);

  const saveProject = useCallback((updatedProject: BuildingProject) => {
    saveActiveProject(updatedProject);
    setProject(updatedProject);
    setSpec(getActiveSpec());
    setProjectVersion((v) => v + 1);
  }, []);

  const saveSpec = useCallback((next: ProjectSpec) => {
    saveActiveSpec(next);
    setProject(getActiveProject());
    setSpec(getActiveSpec());
    setProjectVersion((v) => v + 1);
  }, []);

  const value = useMemo<ProjectContextValue>(() => ({
    project,
    spec,
    saveSpec,
    projectVersion,
    refreshProject,
    saveCustomization,
    saveProject,
    activeCustomization: project?.customization,
  }), [project, spec, saveSpec, projectVersion, refreshProject, saveCustomization, saveProject]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return ctx;
}

export function useActiveProject(): BuildingProject | null {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useActiveProject must be used within ProjectProvider");
  }
  return ctx.project;
}

export function useProjectVersion(): number {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjectVersion must be used within ProjectProvider");
  }
  return ctx.projectVersion;
}