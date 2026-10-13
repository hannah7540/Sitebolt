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
export const ADMIN_ITC_PATH = "/admin/itc";

const DEDICATED_CONSOLE_HREF: Partial<Record<ActiveView, string>> = {
  "admin-master-dashboard": "/admin/dashboard",
  "admin-itc": ADMIN_ITC_PATH,
  "admin-plant-calendar": "/admin/plant-calendar",
  "admin-worker-calendar": "/admin/worker-calendar",
  "admin-swms": "/admin/swms",
  "admin-document-pack": "/admin/document-pack",
  "admin-reporting": "/admin/reporting",
  subcontractors: "/dashboard/subcontractors",
};

const DEDICATED_CONSOLE_PATHS: ReadonlyArray<{
  view: ActiveView;
  path: string;
  prefix?: boolean;
}> = [
  { view: "admin-itc", path: ADMIN_ITC_PATH, prefix: true },
  { view: "admin-plant-calendar", path: "/admin/plant-calendar" },
  { view: "admin-worker-calendar", path: "/admin/worker-calendar" },
  { view: "admin-swms", path: "/admin/swms" },
  { view: "admin-document-pack", path: "/admin/document-pack" },
  { view: "admin-reporting", path: "/admin/reporting" },
  { view: "subcontractors", path: "/dashboard/subcontractors", prefix: true },
  { view: "admin-master-dashboard", path: "/admin/dashboard" },
];

function matchesDedicatedPath(
  pathname: string,
  path: string,
  prefix?: boolean
): boolean {
  if (pathname === path) return true;
  return prefix === true && pathname.startsWith(`${path}/`);
}

export function getAdminItcPath(itcId?: string | null): string {
  const id = itcId?.trim();
  return id ? `${ADMIN_ITC_PATH}/${id}` : ADMIN_ITC_PATH;
}

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

  if (pathname) {
    for (const route of DEDICATED_CONSOLE_PATHS) {
      if (matchesDedicatedPath(pathname, route.path, route.prefix)) {
        return { view: route.view };
      }
    }
  }

  const viewParam = searchParams?.get(CONSOLE_VIEW_SEARCH_PARAM)?.trim();
  if (viewParam && isActiveView(viewParam)) {
    return { view: viewParam };
  }

  if (pathname === "/admin" || pathname === "/admin/dashboard") {
    return { view: "admin-master-dashboard" };
  }

  if (pathname === "/") {
    return { view: "admin-master-dashboard" };
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

/** Bookmarkable path for administration / subcontractor views that use AdminConsoleShell. */
export function getDedicatedConsoleHref(
  view: ActiveView,
  options: ConsoleNavOptions = {}
): string | null {
  if (view === "itps") return ADMIN_ITC_PATH;
  const href = DEDICATED_CONSOLE_HREF[view];
  if (!href) return null;
  if (options.openAdd && view === "subcontractors") {
    return `${href}?${CONSOLE_OPEN_ADD_SEARCH_PARAM}=1`;
  }
  return href;
}

/** Build a bookmarkable URL for sidebar / tab navigation. */
export function buildConsoleNavHref(
  view: ActiveView,
  options: ConsoleNavOptions = {}
): string {
  const dedicatedOrganisationRoute = ORGANISATION_ROUTE_BY_VIEW.get(view);
  if (dedicatedOrganisationRoute) {
    return dedicatedOrganisationRoute;
  }

  const dedicatedHref = getDedicatedConsoleHref(view, options);
  if (dedicatedHref) {
    return dedicatedHref;
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

function asInternalReturnPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;

  try {
    const url = new URL(trimmed);
    const path = `${url.pathname}${url.search}`;
    if (path.startsWith("/") && path !== "/login") return path;
  } catch {
    return null;
  }

  return null;
}

/** Prefer `next`, then `returnTo` / `redirect` / `redirect_to`. */
export function readLoginReturnPath(
  searchParams?: Pick<URLSearchParams, "get"> | null
): string | null {
  return (
    asInternalReturnPath(searchParams?.get("next")) ??
    asInternalReturnPath(searchParams?.get("returnTo")) ??
    asInternalReturnPath(searchParams?.get("redirect")) ??
    asInternalReturnPath(searchParams?.get("redirect_to"))
  );
}
