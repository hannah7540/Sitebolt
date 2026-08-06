import {
  coerceProjectUuid,
  getCachedProjects,
  resolveProjectId,
} from "./project-resolver";

export async function resolveProjectScopeValues(
  projectId: string | null | undefined
): Promise<string[]> {
  const trimmed = projectId?.trim();
  if (!trimmed) return [];

  const values = new Set<string>([trimmed]);

  const cached = getCachedProjects();
  const cachedMatch = cached.find(
    (project) => project.id === trimmed || project.slug === trimmed
  );
  if (cachedMatch) {
    values.add(cachedMatch.id);
    if (cachedMatch.slug) values.add(cachedMatch.slug);
  }

  const coerced = coerceProjectUuid(trimmed, cached);
  if (coerced) values.add(coerced);

  const { id: resolvedId } = await resolveProjectId(trimmed);
  if (resolvedId) values.add(resolvedId);

  return Array.from(values);
}

export function buildProjectScopeOrFilter(
  scopeValues: string[],
  columns: string[]
): string | null {
  if (scopeValues.length === 0 || columns.length === 0) return null;

  const parts: string[] = [];
  for (const column of columns) {
    for (const value of scopeValues) {
      parts.push(`${column}.eq.${value}`);
    }
  }
  return parts.join(",");
}

export function isMissingScopeColumnError(
  message: string,
  column: string
): boolean {
  const lower = message.toLowerCase();
  const columnLower = column.toLowerCase();
  return (
    lower.includes(columnLower) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}
