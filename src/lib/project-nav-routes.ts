/** Project-scoped App Router paths used by the sidebar and deep links. */
export function getProjectItpsItcsPath(projectId: string): string {
  return `/projects/${projectId}/itps-itcs`;
}

export function resolveProjectNavHref(
  item: { view?: string; href?: string },
  projectId?: string
): string | undefined {
  if (item.href) return item.href;
  if (item.view === "itps" && projectId) return getProjectItpsItcsPath(projectId);
  return undefined;
}
