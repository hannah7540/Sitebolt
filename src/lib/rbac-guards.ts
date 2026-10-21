import type { ActiveView } from "@/components/Sidebar";
import type { DbProject } from "@/lib/project-resolver";
import { isPlantPrestartPath } from "@/lib/plant-prestart-url";
import {
  canAccessAdminConsole,
  canAccessCommunicationsModule,
  canAccessMissingTimesheets,
  canAccessPayRules,
  canAccessTimesheetReports,
  canAddAccountsTimesheets,
  canManageAdministration,
  canManageOrganisation,
  canAccessProject,
  canViewAccountsTimesheets,
  canViewAllProjects,
  isOrgWideAdminRole,
  type SecurityRole,
} from "./security-roles";

export const ORGANISATION_VIEWS: readonly ActiveView[] = [
  "org-dashboard",
  "org-company",
  "org-insurances",
  "org-documents",
  "org-forms",
  "org-projects",
  "org-workers",
  "org-bulk-onboarding",
  "org-tags",
  "org-suppliers",
  "org-inductions",
  "admin-swms",
  "org-plant",
  "org-fleet",
  "org-assets",
  "org-alerts",
  "org-security",
];

export const PROJECT_TEAM_ORGANISATION_VIEWS: readonly ActiveView[] = [
  "org-documents",
  "org-forms",
  "org-projects",
  "org-workers",
  "org-tags",
  "org-inductions",
  "admin-swms",
  "org-plant",
  "org-fleet",
  "org-assets",
  "org-security",
];

export const ADMINISTRATION_VIEWS: readonly ActiveView[] = [
  "admin-master-dashboard",
  "admin-itc",
  "admin-plant-calendar",
  "admin-worker-calendar",
  "admin-document-pack",
  "admin-reporting",
];

export const PROJECT_VIEWS: readonly ActiveView[] = [
  "dashboard",
  "workers",
  "worker-scheduler",
  "plant",
  "assets",
  "itps",
  "swms",
  "scheduler",
  "forms",
];

const PROJECT_TEAM_ALLOWED_ORG_PREFIXES = [
  "/organisation/documents",
  "/organisation/forms",
  "/organisation/itcs",
  "/organisation/projects",
  "/organisation/workers",
  "/organisation/tags",
  "/organisation/plant",
  "/organisation/fleet",
  "/organisation/assets",
  "/organisation/security",
  "/admin/forms/inductions",
  "/admin/swms",
] as const;

const GENERAL_WORKER_ALLOWED_PREFIXES = [
  "/worker-dashboard",
  "/account/",
  "/settings/account",
  "/auth/",
  "/accept-invite",
  "/update-password",
  "/setyourpassword",
  "/reset-password",
  "/set-password",
  "/onboarding",
  "/subcontractor",
  "/worker/dashboard",
  "/portal/",
  "/scan/",
] as const;

export function isOrganisationView(view: ActiveView): boolean {
  return ORGANISATION_VIEWS.includes(view);
}

export function isOrganisationPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/organisation"));
}

export function isAccountsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts"));
}

export function isPayRulesPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/pay-rules"));
}

export function isTimesheetsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/timesheets"));
}

export function isMissingTimesheetsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/missing-timesheets"));
}

export function isAddTimesheetsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/add-timesheets"));
}

export function isTimesheetReportsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/timesheet-reports"));
}

export function isEmailsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/emails"));
}

export function isSmsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/sms"));
}

function pathStartsWithAny(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`) || pathname.startsWith(prefix)
  );
}

export function isGeneralWorkerAllowedPath(pathname: string): boolean {
  if (pathname === "/dashboard" || pathname === "/worker/dashboard") return true;
  if (isPlantPrestartPath(pathname)) return true;
  return pathStartsWithAny(pathname, GENERAL_WORKER_ALLOWED_PREFIXES);
}

export function canAccessOrganisationView(role: SecurityRole, view: ActiveView): boolean {
  if (isOrgWideAdminRole(role)) return true;
  if (role === "project_team") {
    return PROJECT_TEAM_ORGANISATION_VIEWS.includes(view);
  }
  return false;
}

export function canAccessOrganisationPath(role: SecurityRole, pathname: string): boolean {
  if (isOrgWideAdminRole(role)) return true;
  if (role !== "project_team") return false;
  if (!isOrganisationPath(pathname) && !pathname.startsWith("/admin/forms/inductions") && !pathname.startsWith("/admin/swms")) {
    return false;
  }
  if (isOrganisationPath(pathname)) {
    return PROJECT_TEAM_ALLOWED_ORG_PREFIXES.some(
      (prefix) => prefix.startsWith("/organisation") && (pathname === prefix || pathname.startsWith(`${prefix}/`))
    );
  }
  return PROJECT_TEAM_ALLOWED_ORG_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function canAccessAccountsPath(role: SecurityRole, pathname: string): boolean {
  if (!isAccountsPath(pathname)) return true;
  if (isOrgWideAdminRole(role)) return true;
  if (role !== "project_team") return false;
  return isMissingTimesheetsPath(pathname) || isAddTimesheetsPath(pathname);
}

export function isProjectTeamAllowedPath(pathname: string): boolean {
  if (isGeneralWorkerAllowedPath(pathname)) return true;
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return true;
  if (pathname.startsWith("/emails") || pathname.startsWith("/sms")) return true;
  if (pathname.startsWith("/subcontractors") || pathname.startsWith("/dashboard/subcontractors")) {
    return true;
  }
  if (isAccountsPath(pathname)) {
    return canAccessAccountsPath("project_team", pathname);
  }
  if (isOrganisationPath(pathname) || pathname.startsWith("/admin/forms/inductions") || pathname.startsWith("/admin/swms")) {
    return canAccessOrganisationPath("project_team", pathname);
  }
  return false;
}

export function resolveProjectTeamFallbackPath(pathname: string): string {
  if (isAccountsPath(pathname)) return "/accounts/missing-timesheets";
  if (isOrganisationPath(pathname)) return "/organisation/documents";
  return "/admin/dashboard";
}

export function canAccessEmailsRoute(role: SecurityRole): boolean {
  return canAccessCommunicationsModule(role);
}

export function filterProjectsForRole(
  role: SecurityRole,
  projects: DbProject[],
  assignedProjectIds: readonly string[]
): DbProject[] {
  if (canViewAllProjects(role)) return projects;
  if (role === "project_team") {
    const allowed = new Set(assignedProjectIds);
    return projects.filter((project) => allowed.has(project.id));
  }
  return [];
}

export function canNavigateToView(
  role: SecurityRole,
  view: ActiveView,
  assignedProjectIds: readonly string[],
  projectId?: string | null
): boolean {
  if (!canAccessAdminConsole(role)) return false;

  if (isOrganisationView(view)) {
    return canAccessOrganisationView(role, view);
  }

  if (view === "subcontractors") {
    return canAccessAdminConsole(role);
  }

  if (ADMINISTRATION_VIEWS.includes(view) && !canManageAdministration(role)) {
    return false;
  }

  if (PROJECT_VIEWS.includes(view) && projectId) {
    return canAccessProject(role, projectId, assignedProjectIds);
  }

  return true;
}

export function resolveAllowedView(
  role: SecurityRole,
  view: ActiveView,
  assignedProjectIds: readonly string[],
  projectId?: string | null
): ActiveView {
  if (canNavigateToView(role, view, assignedProjectIds, projectId)) {
    return view;
  }

  if (role === "project_team") {
    return "org-documents";
  }

  if (canAccessAdminConsole(role)) {
    return "dashboard";
  }

  return "dashboard";
}

export function canAccessOrganisationRoute(role: SecurityRole): boolean {
  return canManageOrganisation(role) || role === "project_team";
}

export function canAccessPayRulesRoute(role: SecurityRole): boolean {
  return canAccessPayRules(role);
}

export function canAccessAdminFormsRoute(role: SecurityRole): boolean {
  return canManageAdministration(role);
}

export function shouldShowAccountsNavItem(
  role: SecurityRole,
  href: "/accounts/timesheets" | "/accounts/missing-timesheets" | "/accounts/pay-rules" | "/accounts/add-timesheets" | "/accounts/timesheet-reports",
  options?: {
    accountsAccessRole?: string | null;
    canAccessAccounts?: boolean | null;
    sessionSecurityRoleRaw?: string | null;
  }
): boolean {
  if (href === "/accounts/timesheets") {
    return canViewAccountsTimesheets(role);
  }
  if (href === "/accounts/missing-timesheets") {
    return canAccessMissingTimesheets(role);
  }
  if (href === "/accounts/pay-rules") {
    return canAccessPayRules(role);
  }
  if (href === "/accounts/add-timesheets") {
    return canAddAccountsTimesheets(
      options?.sessionSecurityRoleRaw ?? role,
      options?.accountsAccessRole,
      options?.canAccessAccounts
    );
  }
  return canAccessTimesheetReports(role);
}
