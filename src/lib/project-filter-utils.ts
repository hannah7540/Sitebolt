import type { DbProject } from "./project-resolver";

export function expandProjectFilterIds(
  projectIds: string[],
  projects: DbProject[]
): Set<string> {
  const expanded = new Set<string>();
  for (const id of projectIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    expanded.add(trimmed);
    const match = projects.find(
      (project) => project.id === trimmed || project.slug === trimmed
    );
    if (match) {
      expanded.add(match.id);
      if (match.slug) expanded.add(match.slug);
    }
  }
  return expanded;
}

export function matchesProjectFilter(
  projectRef: string | null | undefined,
  filterIds: Set<string>
): boolean {
  if (filterIds.size === 0) return true;
  if (!projectRef) return false;
  return filterIds.has(projectRef);
}
