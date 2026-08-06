import { getProjectDisplayName, getCachedProjects } from "./project-resolver";

export const SITE_PROJECTS = [
  { slug: "project-1", name: "Project 1" },
  { slug: "project-2", name: "Project 2" },
  { slug: "project-3", name: "Project 3" },
] as const;

export type SiteProjectSlug = (typeof SITE_PROJECTS)[number]["slug"];

/** @deprecated Legacy slug — prefer DbProject.id (UUID) from fetchProjects() */
export type SiteProjectId = SiteProjectSlug;

export function getProjectName(projectId: string | null | undefined): string | null {
  if (!projectId) return null;
  const fromDb = getProjectDisplayName(projectId, getCachedProjects());
  if (fromDb) return fromDb;
  return SITE_PROJECTS.find((p) => p.slug === projectId)?.name ?? projectId;
}

export const PROJECT_COLORS: Record<string, string> = {
  "project-1": "bg-blue-600/80 border-blue-500",
  "project-2": "bg-violet-600/80 border-violet-500",
  "project-3": "bg-orange-600/80 border-orange-500",
};

export const SERVICE_TYPES = [
  "Routine Service",
  "Oil & Filters",
  "Tyre Replacement",
  "Major Service",
  "Safety Inspection",
  "Breakdown Repair",
] as const;

/** Resolve calendar block color by UUID or legacy slug */
export function getProjectColor(
  projectId: string | null | undefined,
  projects = getCachedProjects()
): string {
  if (!projectId) return "bg-slate-500/80 border-slate-400";
  const slug =
    projects.find((p) => p.id === projectId)?.slug ??
    (projectId.startsWith("project-") ? projectId : null);
  if (slug && PROJECT_COLORS[slug]) return PROJECT_COLORS[slug];
  return "bg-orange-600/80 border-orange-500";
}
