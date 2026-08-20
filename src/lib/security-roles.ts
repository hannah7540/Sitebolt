export const SECURITY_ROLES = [
  "owner",
  "full_access",
  "super_admin",
  "project_super_admin",
  "project_admin",
  "general_worker",
] as const;

export type SecurityRole = (typeof SECURITY_ROLES)[number];

export const ACCOUNTS_ACCESS_ROLES = [
  "full_access",
  "view_only",
  "disabled",
] as const;

export type AccountsAccessRole = (typeof ACCOUNTS_ACCESS_ROLES)[number];

export const ACCOUNTS_ACCESS_ROLE_LABELS: Record<AccountsAccessRole, string> = {
  full_access: "Full Access",
  view_only: "View Only",
  disabled: "Disabled / No Access",
};

export const ACCOUNTS_ACCESS_ROLE_DESCRIPTIONS: Record<AccountsAccessRole, string> = {
  full_access:
    "Can review timesheets, approve payroll, and generate MYOB exports.",
  view_only: "Can view timesheet logs and reporting only.",
  disabled: "Hides the Accounts menu from the sidebar.",
};

export const SECURITY_ROLE_LABELS: Record<SecurityRole, string> = {
  owner: "Owner",
  full_access: "Full Access",
  super_admin: "Super Admin",
  project_super_admin: "Project Super Admin",
  project_admin: "Project Admin",
  general_worker: "General Worker",
};

export const SECURITY_ROLE_DESCRIPTIONS: Record<SecurityRole, string> = {
  owner:
    "Unrestricted access to all modules, settings, projects, accounts, pay rules, timesheets, and financial data.",
  full_access:
    "Full access to all site features, projects, financial data, and configuration settings.",
  super_admin:
    "Organisation and all projects. Accounts timesheets are read-only. No pay rules, approvals, or worker financial details.",
  project_super_admin:
    "All projects (site walks, pre-starts, toolbox talks, plant, ITCs). Blocked from Organisation and Accounts. No worker financial details.",
  project_admin:
    "Assigned projects only. Blocked from Organisation and Accounts. No worker financial details.",
  general_worker:
    "Worker dashboard only (pre-starts, tasks, leave, clock-in/out). No admin or project management routes.",
};

const LEGACY_ADMIN_ACCESS = "admin_access";

export function normalizeSecurityRole(
  role: string | null | undefined
): SecurityRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();

  if (normalized === LEGACY_ADMIN_ACCESS || normalized === "admin") {
    return "project_super_admin";
  }

  if ((SECURITY_ROLES as readonly string[]).includes(normalized)) {
    return normalized as SecurityRole;
  }

  return "general_worker";
}

export function coerceSecurityRole(role: string | null | undefined): SecurityRole {
  return normalizeSecurityRole(role);
}

export function isPrivilegedAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeSecurityRole(role);
  return (
    normalized === "owner" ||
    normalized === "full_access" ||
    normalized === "super_admin" ||
    normalized === "project_super_admin" ||
    normalized === "project_admin"
  );
}

export function hasUnrestrictedPlatformAccess(role: string | null | undefined): boolean {
  const normalized = normalizeSecurityRole(role);
  return normalized === "owner" || normalized === "super_admin";
}

export function canAccessAdminConsole(role: SecurityRole): boolean {
  return (
    role === "owner" ||
    role === "full_access" ||
    role === "super_admin" ||
    role === "project_super_admin" ||
    role === "project_admin"
  );
}

export function canViewFinancialFields(role: SecurityRole): boolean {
  return role === "owner" || role === "full_access";
}

export function canAssignPayRules(role: SecurityRole | string | null | undefined): boolean {
  const normalized = normalizeSecurityRole(role);
  return normalized === "owner" || normalized === "full_access";
}

export function canManageSecuritySettings(role: SecurityRole): boolean {
  return role === "owner" || role === "full_access";
}

/** Owner and Full Access can use the EMAIL's communication module. */
export function canAccessEmailsModule(role: SecurityRole): boolean {
  return canManageSecuritySettings(role);
}

/** Owner and Full Access can assign worker security roles from the directory. */
export function canManageWorkerSecurityRole(role: SecurityRole): boolean {
  return canManageSecuritySettings(role);
}

export const DEFAULT_WORKER_SECURITY_ROLE: SecurityRole = "general_worker";

export function canManageOrganisation(role: SecurityRole): boolean {
  return (
    role === "owner" ||
    role === "full_access" ||
    role === "super_admin"
  );
}

export function canManageAdministration(role: SecurityRole): boolean {
  return canAccessAdminConsole(role);
}

export function canCustomizeDashboardLayout(role: SecurityRole): boolean {
  return canAccessAdminConsole(role);
}

export function canViewAllProjects(role: SecurityRole): boolean {
  return (
    role === "owner" ||
    role === "full_access" ||
    role === "super_admin" ||
    role === "project_super_admin"
  );
}

export function canAccessProject(
  role: SecurityRole,
  projectId: string,
  assignedProjectIds: readonly string[]
): boolean {
  if (canViewAllProjects(role)) return true;
  if (role === "project_admin") {
    return assignedProjectIds.includes(projectId);
  }
  return false;
}

export function canAccessPayRules(role: SecurityRole): boolean {
  return role === "owner" || role === "full_access";
}

export function canViewAccountsTimesheets(role: SecurityRole): boolean {
  return (
    role === "owner" ||
    role === "full_access" ||
    role === "super_admin"
  );
}

export function canManageAccountsTimesheets(role: SecurityRole): boolean {
  return role === "owner" || role === "full_access";
}

/** Managers/admins who can submit and approve timesheets on behalf of workers. */
export function canAddAccountsTimesheets(
  securityRole: SecurityRole | string | null | undefined,
  accountsAccessRole?: AccountsAccessRole | string | null,
  canAccessAccounts?: boolean | null
): boolean {
  return canManageAccountsActions(accountsAccessRole, {
    securityRole,
    canAccessAccounts,
  });
}

export function normalizeAccountsAccessRole(
  role: string | null | undefined
): AccountsAccessRole {
  if (role === "full_access" || role === "view_only") return role;
  return "disabled";
}

export function canAccessAccountsModule(role: AccountsAccessRole): boolean {
  return role !== "disabled";
}

export function canAccessAccountsArea(options: {
  securityRole?: string | null;
  accountsAccessRole?: string | null;
  canAccessAccounts?: boolean | null;
}): boolean {
  const securityRole = normalizeSecurityRole(options.securityRole);

  if (canAccessPayRules(securityRole) || canViewAccountsTimesheets(securityRole)) {
    return true;
  }

  if (options.canAccessAccounts === true) {
    return canAccessAccountsModule(
      normalizeAccountsAccessRole(options.accountsAccessRole)
    );
  }

  return canAccessAccountsModule(normalizeAccountsAccessRole(options.accountsAccessRole));
}

export function canManageAccountsActions(
  accountsAccessRole: AccountsAccessRole | string | null | undefined,
  options?: {
    securityRole?: string | null;
    canAccessAccounts?: boolean | null;
  }
): boolean {
  const rawSecurity = String(options?.securityRole ?? "")
    .trim()
    .toLowerCase();

  if (
    rawSecurity === "owner" ||
    rawSecurity === "admin" ||
    rawSecurity === "manager" ||
    rawSecurity === "full_access"
  ) {
    return true;
  }

  if (rawSecurity === "accounts" || rawSecurity === "account") {
    if (normalizeAccountsAccessRole(accountsAccessRole) === "full_access") {
      return true;
    }
    if (options?.canAccessAccounts === true) {
      return true;
    }
  }

  const securityRole = normalizeSecurityRole(options?.securityRole);

  if (canManageAccountsTimesheets(securityRole)) {
    return true;
  }

  if (securityRole === "super_admin") {
    return false;
  }

  if (normalizeAccountsAccessRole(accountsAccessRole) === "full_access") {
    return true;
  }

  return false;
}

export function isAccountsTimesheetsReadOnly(
  securityRole: SecurityRole | string | null | undefined,
  accountsAccessRole?: AccountsAccessRole | string | null
): boolean {
  const role = normalizeSecurityRole(securityRole);
  if (role === "super_admin") return true;
  if (canManageAccountsTimesheets(role)) return false;
  return normalizeAccountsAccessRole(accountsAccessRole) === "view_only";
}
