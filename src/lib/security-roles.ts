export const SECURITY_ROLES = [
  "full_access",
  "admin_access",
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
  full_access: "Full Access",
  admin_access: "Admin Access",
  general_worker: "General Worker",
};

export const SECURITY_ROLE_DESCRIPTIONS: Record<SecurityRole, string> = {
  full_access: "Complete system access including financial data and security settings.",
  admin_access:
    "Manage projects, site forms, and worker invites. Financial fields are redacted on profiles.",
  general_worker: "Restricted to the worker dashboard shell only.",
};

export function normalizeSecurityRole(
  role: string | null | undefined
): SecurityRole {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "full_access" || normalized === "super_admin") {
    return "full_access";
  }
  if (normalized === "admin_access" || normalized === "admin") {
    return "admin_access";
  }
  return "general_worker";
}

export function isPrivilegedAdminRole(role: string | null | undefined): boolean {
  const normalized = String(role ?? "")
    .trim()
    .toLowerCase();
  return (
    normalized === "full_access" ||
    normalized === "admin_access" ||
    normalized === "admin" ||
    normalized === "super_admin"
  );
}

export function canAccessAdminConsole(role: SecurityRole): boolean {
  return role === "full_access" || role === "admin_access";
}

export function canViewFinancialFields(role: SecurityRole): boolean {
  return role === "full_access";
}

export function canManageSecuritySettings(role: SecurityRole): boolean {
  return role === "full_access";
}

export function canManageOrganisation(role: SecurityRole): boolean {
  return role === "full_access" || role === "admin_access";
}

export function canManageAdministration(role: SecurityRole): boolean {
  return canManageOrganisation(role);
}

/** Admin Access and Full Access may customize dashboard widget layouts. */
export function canCustomizeDashboardLayout(role: SecurityRole): boolean {
  return role === "full_access" || role === "admin_access";
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
  if (isPrivilegedAdminRole(options.securityRole)) {
    return true;
  }
  if (options.canAccessAccounts === true) {
    return true;
  }
  return canAccessAccountsModule(normalizeAccountsAccessRole(options.accountsAccessRole));
}

export function canManageAccountsActions(
  accountsAccessRole: AccountsAccessRole | string | null | undefined,
  options?: {
    securityRole?: string | null;
    canAccessAccounts?: boolean | null;
    /** Grant manage actions when the user already passed accounts page access checks. */
    hasPageAccess?: boolean;
  }
): boolean {
  if (options?.hasPageAccess) {
    return true;
  }
  if (isPrivilegedAdminRole(options?.securityRole)) {
    return true;
  }
  if (normalizeAccountsAccessRole(accountsAccessRole) === "full_access") {
    return true;
  }
  if (options?.canAccessAccounts === true) {
    return true;
  }
  return canAccessAccountsArea({
    securityRole: options?.securityRole,
    accountsAccessRole,
    canAccessAccounts: options?.canAccessAccounts,
  });
}
