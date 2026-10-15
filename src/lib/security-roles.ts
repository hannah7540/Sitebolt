export const SECURITY_ROLES = [
  "general_worker",
  "project_team",
  "full_access",
  "master_admin",
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
  general_worker: "General Worker",
  project_team: "Project Team",
  full_access: "Full Access",
  master_admin: "Master Admin",
};

export const SECURITY_ROLE_DESCRIPTIONS: Record<SecurityRole, string> = {
  general_worker:
    "Worker dashboard and My Profile only. No Administration, Organisation, Projects, Accounts, Subcontractors, or Communication.",
  project_team:
    "Projects, Administration, Communication, and Subcontractors. Organisation documents, forms, projects, workers, tags, inductions, SWMS, plant, fleet, assets, and security settings. Accounts limited to missing timesheets and adding timesheets.",
  full_access:
    "Full access to the entire website for this organisation, including billing, payroll, and company settings.",
  master_admin:
    "Unrestricted system-wide access. Cross-company management stays with the Master Admin account.",
};

const LEGACY_ADMIN_ACCESS = "admin_access";

/** Roles that must never access Communications / SMS admin modules. */
const DISALLOWED_COMMUNICATIONS_ROLE_ALIASES = new Set([
  "worker",
  "general_worker",
  "field_worker",
  "general worker",
  "field worker",
]);

export function normalizeSecurityRole(
  role: string | null | undefined
): SecurityRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();

  if (DISALLOWED_COMMUNICATIONS_ROLE_ALIASES.has(normalized)) {
    return "general_worker";
  }

  if (
    normalized === "owner" ||
    normalized === "super_admin" ||
    normalized === "master_admin"
  ) {
    return "master_admin";
  }

  if (
    normalized === LEGACY_ADMIN_ACCESS ||
    normalized === "admin" ||
    normalized === "project_super_admin" ||
    normalized === "project_admin" ||
    normalized === "project_team"
  ) {
    return "project_team";
  }

  if ((SECURITY_ROLES as readonly string[]).includes(normalized)) {
    return normalized as SecurityRole;
  }

  return "general_worker";
}

export function coerceSecurityRole(role: string | null | undefined): SecurityRole {
  return normalizeSecurityRole(role);
}

export function isOrgWideAdminRole(role: SecurityRole): boolean {
  return role === "master_admin" || role === "full_access";
}

export function isPrivilegedAdminRole(role: string | null | undefined): boolean {
  return normalizeSecurityRole(role) !== "general_worker";
}

export function hasUnrestrictedPlatformAccess(role: string | null | undefined): boolean {
  return normalizeSecurityRole(role) === "master_admin";
}

export function canAccessAdminConsole(role: SecurityRole): boolean {
  return role !== "general_worker";
}

export function canViewFinancialFields(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

export function canAssignPayRules(role: SecurityRole | string | null | undefined): boolean {
  return isOrgWideAdminRole(normalizeSecurityRole(role));
}

export function canManageSecuritySettings(role: SecurityRole): boolean {
  return role === "project_team" || isOrgWideAdminRole(role);
}

/** True when the role is a field / general worker (no Communications access). */
export function isWorkerCommunicationsRole(
  role: SecurityRole | string | null | undefined
): boolean {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  if (DISALLOWED_COMMUNICATIONS_ROLE_ALIASES.has(normalized)) return true;
  return normalizeSecurityRole(role) === "general_worker";
}

/**
 * Communications (Emails + SMS) is for administrative roles only.
 * General / field workers are always denied.
 */
export function canAccessCommunicationsModule(
  role: SecurityRole | string | null | undefined
): boolean {
  if (isWorkerCommunicationsRole(role)) return false;
  return canAccessAdminConsole(normalizeSecurityRole(role));
}

export function canAccessEmailsModule(role: SecurityRole): boolean {
  return canAccessCommunicationsModule(role);
}

export function canAccessSmsModule(role: SecurityRole): boolean {
  return canAccessCommunicationsModule(role);
}

/** Full Access and Master Admin can assign worker security roles from the directory. */
export function canManageWorkerSecurityRole(role: SecurityRole): boolean {
  return canManageSecuritySettings(role);
}

export const DEFAULT_WORKER_SECURITY_ROLE: SecurityRole = "general_worker";

/** Global company settings / billing — not Project Team. */
export function canManageOrganisation(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

export function canManageAdministration(role: SecurityRole): boolean {
  return canAccessAdminConsole(role);
}

export function canCustomizeDashboardLayout(role: SecurityRole): boolean {
  return canAccessAdminConsole(role);
}

export function canViewAllProjects(role: SecurityRole): boolean {
  return canAccessAdminConsole(role);
}

export function canAccessProject(
  role: SecurityRole,
  projectId: string,
  assignedProjectIds: readonly string[]
): boolean {
  if (canViewAllProjects(role)) return true;
  if (role === "project_team") {
    return assignedProjectIds.includes(projectId);
  }
  return false;
}

export function canAccessPayRules(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

export function canViewAccountsTimesheets(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

export function canManageAccountsTimesheets(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

export function canAccessMissingTimesheets(role: SecurityRole): boolean {
  return role === "project_team" || isOrgWideAdminRole(role);
}

export function canAccessTimesheetReports(role: SecurityRole): boolean {
  return isOrgWideAdminRole(role);
}

/** Managers/admins who can submit and approve timesheets on behalf of workers. */
export function canAddAccountsTimesheets(
  securityRole: SecurityRole | string | null | undefined,
  accountsAccessRole?: AccountsAccessRole | string | null,
  canAccessAccounts?: boolean | null
): boolean {
  if (normalizeSecurityRole(securityRole) === "project_team") {
    return true;
  }
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

  if (securityRole === "project_team") {
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
  const securityRole = normalizeSecurityRole(options?.securityRole);

  if (isOrgWideAdminRole(securityRole)) {
    return true;
  }

  const rawSecurity = String(options?.securityRole ?? "")
    .trim()
    .toLowerCase();

  if (
    rawSecurity === "owner" ||
    rawSecurity === "admin" ||
    rawSecurity === "manager" ||
    rawSecurity === "full_access" ||
    rawSecurity === "master_admin"
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
  if (canManageAccountsTimesheets(role)) return false;
  if (role === "project_team") return false;
  return normalizeAccountsAccessRole(accountsAccessRole) === "view_only";
}
