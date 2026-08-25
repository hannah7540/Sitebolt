import type { ActiveView } from "@/components/Sidebar";
import type { DbProject } from "@/lib/project-resolver";
import {
  canAccessAdminConsole,
  canAccessPayRules,
  canManageAdministration,
  canManageOrganisation,
  canManageSecuritySettings,
  canAccessProject,
  canViewAllProjects,
  type SecurityRole,
} from "./security-roles";

export const ORGANISATION_VIEWS: readonly ActiveView[] = [
  "org-dashboard",
  "org-company",
  "org-insurances",
  "org-projects",
  "org-workers",
  "org-plant",
  "org-assets",
  "org-security",
];

export const ADMINISTRATION_VIEWS: readonly ActiveView[] = [
  "admin-plant-calendar",
  "admin-worker-calendar",
  "admin-swms",
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
];

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

export function isAddTimesheetsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/accounts/add-timesheets"));
}

export function isEmailsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/emails"));
}

export function isSmsPath(pathname: string | null | undefined): boolean {
  return Boolean(pathname?.startsWith("/sms"));
}

export function canAccessEmailsRoute(role: SecurityRole): boolean {
  return role === "owner" || role === "full_access";
}

export function filterProjectsForRole(
  role: SecurityRole,
  projects: DbProject[],
  assignedProjectIds: readonly string[]
): DbProject[] {
  if (canViewAllProjects(role)) return projects;
  if (role === "project_admin") {
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
    if (!canManageOrganisation(role)) return false;
    if (view === "org-security" && !canManageSecuritySettings(role)) return false;
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

  if (canAccessAdminConsole(role)) {
    return "dashboard";
  }

  return "dashboard";
}

export function canAccessOrganisationRoute(role: SecurityRole): boolean {
  return canManageOrganisation(role);
}

export function canAccessPayRulesRoute(role: SecurityRole): boolean {
  return canAccessPayRules(role);
}

export function canAccessAdminFormsRoute(role: SecurityRole): boolean {
  return canManageAdministration(role);
}
