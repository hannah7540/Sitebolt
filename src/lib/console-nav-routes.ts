import type { ActiveView } from "@/components/Sidebar";
import {
  ADMINISTRATION_VIEWS,
  ORGANISATION_VIEWS,
  PROJECT_VIEWS,
} from "@/lib/rbac-guards";
import { getProjectViewPath, parseProjectRoute } from "@/lib/project-nav-routes";
import { ORGANISATION_NAV_ITEMS } from "@/lib/organisation-nav-routes";

export const CONSOLE_VIEW_SEARCH_PARAM = "view";
export const CONSOLE_OPEN_ADD_SEARCH_PARAM = "openAdd";

const CONSOLE_QUERY_VIEWS: readonly ActiveView[] = [
  ...ORGANISATION_VIEWS,
  ...ADMINISTRATION_VIEWS,
  "subcontractors",
  "my-profile",
];

const ALL_CONSOLE_VIEWS = new Set<ActiveView>([
  ...PROJECT_VIEWS,
  ...CONSOLE_QUERY_VIEWS,
]);

function isActiveView(value: string): value is ActiveView {
  return ALL_CONSOLE_VIEWS.has(value as ActiveView);
}

export interface ParsedConsoleRoute {
  view: ActiveView;
  projectId?: string;
}

/** Resolve the active console view from the pathname and optional search params. */
export function parseConsoleRoute(
  pathname: string | null | undefined,
  searchParams?: Pick<URLSearchParams, "get"> | null
): ParsedConsoleRoute | null {
  const projectRoute = parseProjectRoute(pathname);
  if (projectRoute) {
    return projectRoute;
  }

  const viewParam = searchParams?.get(CONSOLE_VIEW_SEARCH_PARAM)?.trim();
  if (viewParam && isActiveView(viewParam)) {
    return { view: viewParam };
  }

  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    return { view: "admin-master-dashboard" };
  }

  if (pathname === "/") {
    return { view: "dashboard" };
  }

  return null;
}

export interface ConsoleNavOptions {
  projectId?: string | null;
  openAdd?: boolean;
}

const ORGANISATION_ROUTE_BY_VIEW = new Map<ActiveView, string>(
  ORGANISATION_NAV_ITEMS.map((item) => [item.view, item.href])
);

/** Build a bookmarkable URL for sidebar / tab navigation. */
export function buildConsoleNavHref(
  view: ActiveView,
  options: ConsoleNavOptions = {}
): string {
  const dedicatedOrganisationRoute = ORGANISATION_ROUTE_BY_VIEW.get(view);
  if (dedicatedOrganisationRoute) {
    return dedicatedOrganisationRoute;
  }

  if (view === "admin-master-dashboard") {
    return "/admin/dashboard";
  }

  const projectId = options.projectId?.trim() || null;

  if (projectId && PROJECT_VIEWS.includes(view)) {
    return getProjectViewPath(projectId, view);
  }

  if (CONSOLE_QUERY_VIEWS.includes(view)) {
    const params = new URLSearchParams();
    params.set(CONSOLE_VIEW_SEARCH_PARAM, view);
    if (options.openAdd) {
      params.set(CONSOLE_OPEN_ADD_SEARCH_PARAM, "1");
    }
    return `/?${params.toString()}`;
  }

  if (projectId) {
    return getProjectViewPath(projectId, "dashboard");
  }

  return "/";
}

export function readConsoleOpenAdd(
  searchParams?: Pick<URLSearchParams, "get"> | null
): boolean {
  return searchParams?.get(CONSOLE_OPEN_ADD_SEARCH_PARAM) === "1";
}

/** Prefer `next`, then legacy `redirect_to`, for post-login return URLs. */
export function readLoginReturnPath(
  searchParams?: Pick<URLSearchParams, "get"> | null
): string | null {
  const next = searchParams?.get("next")?.trim();
  if (next?.startsWith("/")) return next;

  const redirectTo = searchParams?.get("redirect_to")?.trim();
  if (redirectTo?.startsWith("/")) return redirectTo;

  return null;
}
