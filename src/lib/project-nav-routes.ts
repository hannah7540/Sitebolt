import type { ActiveView } from "@/components/Sidebar";

/** URL segment for each project-scoped sidebar view (empty string = project root). */
const PROJECT_VIEW_SEGMENTS: Partial<Record<ActiveView, string>> = {
  dashboard: "",
  workers: "workers",
  "worker-scheduler": "worker-scheduler",
  plant: "plant",
  assets: "assets",
  itps: "itc",
  swms: "swms",
  scheduler: "scheduler",
};

const SEGMENT_TO_VIEW = Object.entries(PROJECT_VIEW_SEGMENTS).reduce<
  Record<string, ActiveView>
>((acc, [view, segment]) => {
  if (segment) acc[segment] = view as ActiveView;
  return acc;
}, {});

/** Project-scoped App Router paths used by the sidebar and deep links. */
export function getProjectItcPath(projectId: string): string {
  return `/projects/${projectId}/itc`;
}

export function getProjectItpsItcsPath(projectId: string): string {
  return `/projects/${projectId}/itps-itcs`;
}

export function getProjectViewPath(projectId: string, view: ActiveView): string {
  if (view === "itps") return getProjectItcPath(projectId);
  const segment = PROJECT_VIEW_SEGMENTS[view];
  if (segment === undefined || segment === "") {
    return `/projects/${projectId}`;
  }
  return `/projects/${projectId}/${segment}`;
}

export function extractProjectIdFromPathname(
  pathname: string | null | undefined
): string | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

export function isProjectScopedPath(pathname: string | null | undefined): boolean {
  return extractProjectIdFromPathname(pathname) !== null;
}

export function parseProjectRoute(
  pathname: string | null | undefined
): { projectId: string; view: ActiveView } | null {
  if (!pathname) return null;
  const match = pathname.match(/^\/projects\/([^/]+)(?:\/([^/]+))?/);
  if (!match) return null;

  const [, projectId, segment] = match;
  if (!segment) return { projectId, view: "dashboard" };
  if (segment === "itc" || segment === "itps-itcs") {
    return { projectId, view: "itps" };
  }

  const view = SEGMENT_TO_VIEW[segment];
  if (view) return { projectId, view };

  return { projectId, view: "dashboard" };
}

export function resolveProjectNavHref(
  item: { view?: string; href?: string },
  projectId?: string
): string | undefined {
  if (item.href) return item.href;
  if (!projectId || !item.view) return undefined;
  if (item.view in PROJECT_VIEW_SEGMENTS) {
    return getProjectViewPath(projectId, item.view as ActiveView);
  }
  return undefined;
}
